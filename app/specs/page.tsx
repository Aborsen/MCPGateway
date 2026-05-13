import { readFile } from "node:fs/promises";
import path from "node:path";
import { Markdown } from "./markdown";
import { SpecsTocRail } from "./toc";
import { extractToc, stripInlineToc } from "./toc-utils";

// Two-column layout: sticky left rail (logo -> /, scroll-spy TOC of h2
// headings from SPECIFICATIONS.md), right column with the rendered
// markdown. Auth + role gating handled by app/specs/layout.tsx.

export const dynamic = "force-dynamic";

export default async function SpecsPage() {
  const filePath = path.join(process.cwd(), "SPECIFICATIONS.md");
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch {
    raw = "# Specifications\n\n_SPECIFICATIONS.md is missing from the repo root._";
  }

  const toc = extractToc(raw);
  const content = stripInlineToc(raw);

  return (
    <div className="flex h-screen overflow-hidden">
      <SpecsTocRail items={toc} />
      <main className="flex-1 overflow-y-auto px-8 py-6">
        <Markdown source={content} />
      </main>
    </div>
  );
}
