"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import type { CatalogEntry } from "@/lib/connector-catalog";
import { isCatalogEntryReady } from "@/lib/connector-catalog";
import { ConnectDialog } from "./connect-dialog";

// Client wrapper that renders the catalog grid and owns the "currently
// opened" state. Clicking a card opens the ConnectDialog with that entry.
// Cards that aren't ready (coming-soon) just don't open anything.

type Item = { entry: CatalogEntry; oauthConfigured: boolean };

export function CatalogGrid({ entries }: { entries: Item[] }) {
  const [selected, setSelected] = useState<Item | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  function pick(item: Item) {
    if (!isCatalogEntryReady(item.entry)) return;
    setSelected(item);
    setDialogOpen(true);
  }

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {entries.map(({ entry, oauthConfigured }) => {
          const ready = isCatalogEntryReady(entry);
          // For OAuth entries: card is clickable even when not configured,
          // because the dialog also supports paste-a-PAT. We surface a
          // discreet "Not configured" hint inside the dialog.
          const enabled = ready;
          return (
            <button
              key={entry.slug}
              type="button"
              onClick={() => pick({ entry, oauthConfigured })}
              disabled={!enabled}
              className={
                "flex h-full flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all " +
                (enabled
                  ? "hover:border-primary/60 hover:bg-accent/30 cursor-pointer"
                  : "opacity-60 cursor-not-allowed")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <div
                  className={
                    "flex h-10 w-10 items-center justify-center rounded-md border text-sm font-semibold " +
                    entry.badge.classes
                  }
                >
                  {entry.badge.label}
                </div>
                <div className="flex flex-col items-end gap-1">
                  {!ready && (
                    <Badge variant="outline" className="text-[10px]">
                      Coming soon
                    </Badge>
                  )}
                  {ready && !oauthConfigured && entry.auth?.kind === "oauth" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] text-amber-400 border-amber-500/40"
                    >
                      PAT only
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-1">
                <div className="font-medium leading-tight">{entry.name}</div>
                <div className="text-xs text-muted-foreground">{entry.description}</div>
              </div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground/70">
                {entry.vendor}
              </div>
            </button>
          );
        })}
      </div>

      <ConnectDialog
        entry={selected?.entry ?? null}
        open={dialogOpen}
        oauthConfigured={selected?.oauthConfigured ?? false}
        onOpenChange={(v) => {
          setDialogOpen(v);
          if (!v) setSelected(null);
        }}
      />
    </>
  );
}
