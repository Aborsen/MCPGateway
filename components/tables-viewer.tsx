"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCcw, Check, Table2, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type TablesResponse = {
  tables: string[] | null;
  raw: string | null;
  source: string | null;
  error?: string;
};

// Click-to-open viewer for the live list of tables a connection exposes.
// Server hits /api/connections/<id>/tables which probes the upstream and
// returns a parsed name list. Here we add a search filter and per-table
// click-to-select so the admin can quickly build a "Allowed tables"
// comma-separated list from hundreds of entries.

export function TablesViewer({
  dataSourceId,
  dataSourceName,
  initialSelected,
  onApply,
}: {
  dataSourceId: string;
  dataSourceName: string;
  /** If provided, these names will be pre-checked when the dialog opens. */
  initialSelected?: string[];
  /** If provided, an "Apply" button replaces "Copy selected" and the
   *  current selection is written back via this callback when clicked. */
  onApply?: (names: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TablesResponse | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState<"all" | "selected" | null>(null);

  async function load(refresh = false) {
    setLoading(true);
    try {
      const url = `/api/connections/${dataSourceId}/tables${refresh ? "?refresh=1" : ""}`;
      const res = await fetch(url);
      const body = await res.json().catch(() => ({}));
      setData(body);
    } catch (err) {
      setData({
        tables: null,
        raw: null,
        source: null,
        error: err instanceof Error ? err.message : "Failed to load",
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !data && !loading) void load(false);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // On open: pre-select the names that are already allowed (if any), and
  // clear search. On close: clear everything so the next open is fresh.
  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected(new Set(initialSelected ?? []));
    } else {
      setSearch("");
      setSelected(new Set());
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const all = data?.tables ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return all;
    return all.filter((t) => t.toLowerCase().includes(q));
  }, [data?.tables, search]);

  function toggle(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  async function copy(list: string[], which: "all" | "selected") {
    if (list.length === 0) return;
    await navigator.clipboard.writeText(list.join(", "));
    setCopied(which);
    setTimeout(() => setCopied(null), 1500);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Table2 className="h-3.5 w-3.5" />
          View tables
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dataSourceName} · tables</DialogTitle>
          <DialogDescription>
            {data?.source
              ? <>Discovered via <code className="font-mono text-xs">{data.source}</code> on the upstream.</>
              : "Discovering tables from the upstream MCP server…"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
          )}

          {!loading && data?.error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              {data.error}
            </div>
          )}

          {!loading && data?.tables && data.tables.length > 0 && (
            <>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${data.tables.length} tables…`}
                  className="h-9 pl-8 pr-8 font-mono text-xs"
                  autoFocus
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">
                  {filtered.length} of {data.tables.length}
                  {selected.size > 0 && (
                    <span className="ml-2 text-primary">· {selected.size} selected</span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {onApply ? (
                    <Button
                      size="sm"
                      onClick={() => {
                        onApply(Array.from(selected));
                        setOpen(false);
                      }}
                    >
                      Apply ({selected.size})
                    </Button>
                  ) : (
                    <>
                      {selected.size > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => copy(Array.from(selected), "selected")}
                        >
                          {copied === "selected" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                          Copy selected ({selected.size})
                        </Button>
                      )}
                      <Button variant="outline" size="sm" onClick={() => copy(data.tables ?? [], "all")}>
                        {copied === "all" ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Copy all
                      </Button>
                    </>
                  )}
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                {filtered.length === 0 ? (
                  <p className="p-4 text-center text-xs text-muted-foreground">
                    No tables match &quot;{search}&quot;.
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-1 p-2">
                    {filtered.map((t) => {
                      const isSelected = selected.has(t);
                      return (
                        <button
                          key={t}
                          onClick={() => toggle(t)}
                          title={t}
                          className={
                            "flex items-center gap-2 overflow-hidden rounded px-2 py-1.5 text-left font-mono text-xs transition-colors hover:bg-muted/60 " +
                            (isSelected ? "bg-primary/10" : "")
                          }
                        >
                          <span
                            className={
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors " +
                              (isSelected
                                ? "border-primary bg-primary text-primary-foreground"
                                : "border-muted-foreground/40 bg-background")
                            }
                          >
                            {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                          </span>
                          <span className="truncate">{t}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}

          {!loading && !data?.error && (!data?.tables || data.tables.length === 0) && data?.raw && (
            <>
              <p className="text-xs text-muted-foreground">
                Couldn&apos;t parse a clean table list. Raw upstream response:
              </p>
              <pre className="max-h-80 overflow-auto rounded-md border border-border bg-muted p-3 font-mono text-xs">
                {data.raw}
              </pre>
            </>
          )}

          {!loading && !data?.error && !data?.tables && !data?.raw && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No tables returned.
            </p>
          )}

          <div className="flex justify-end pt-2">
            <Button variant="ghost" size="sm" onClick={() => load(true)} disabled={loading}>
              <RefreshCcw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
