"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";

export type TocItem = { id: string; label: string };

// Sticky left rail for /specs. Shows the MCP Gateway logo (linking back to
// the dashboard root) and a scroll-spy list of the spec's h2 headings.
export function SpecsTocRail({ items }: { items: TocItem[] }) {
  const [activeId, setActiveId] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    // IntersectionObserver tracks which heading is currently in view. Pick
    // the topmost intersecting heading so the highlight follows the user
    // as they scroll.
    const headings = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => el !== null);
    if (headings.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, [items]);

  return (
    <aside className="flex w-72 shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground">
      <Link
        href="/"
        className="flex items-center gap-2 p-4 transition-opacity hover:opacity-80"
        title="Back to dashboard"
      >
        <Image
          src="/logo.png"
          alt="MCP Gateway"
          width={28}
          height={28}
          className="rounded"
          priority
        />
        <div className="text-sm font-semibold">MCP Gateway</div>
      </Link>

      <div className="px-4 pb-2 pt-1 text-xs uppercase tracking-wide text-sidebar-foreground/60">
        Specifications
      </div>

      <nav className="flex-1 overflow-y-auto px-2 pb-6">
        <ul className="space-y-0.5 text-sm">
          {items.map((item) => (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className={
                  "block rounded-md px-3 py-1.5 transition-colors " +
                  (activeId === item.id
                    ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground")
                }
              >
                {item.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}
