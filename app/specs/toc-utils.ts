import type { TocItem } from "./toc";

// GitHub-flavored slug for a heading line. Lowercase, strip punctuation
// other than spaces and hyphens, collapse whitespace to single hyphens.
// "1. Executive Overview" -> "1-executive-overview"
export function slugifyHeading(raw: string): string {
  return raw
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // drop punctuation
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Extract h2 headings from the markdown source. Skips fenced code blocks
// so headers inside example code don't pollute the TOC. Also skips the
// existing "## Table of Contents" section since we're showing our own
// generated TOC in the left rail.
export function extractToc(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  let inFence = false;
  for (const rawLine of markdown.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    if (line.startsWith("```")) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (!m) continue;
    const label = m[1].trim();
    if (label.toLowerCase() === "table of contents") continue;
    items.push({ id: slugifyHeading(label), label });
  }
  return items;
}

// Strip the inline "## Table of Contents" section from the markdown so it
// doesn't render in the main content (the left rail shows the live one).
export function stripInlineToc(markdown: string): string {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];
  let skipping = false;
  for (const line of lines) {
    if (/^##\s+table of contents\s*$/i.test(line)) {
      skipping = true;
      continue;
    }
    if (skipping) {
      // Stop skipping at the next h1 or h2 (the section after the TOC).
      if (/^#{1,2}\s+/.test(line)) {
        skipping = false;
      } else {
        continue;
      }
    }
    out.push(line);
  }
  return out.join("\n");
}
