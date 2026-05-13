"use client";

import { useEffect, useState } from "react";
import { Copy, RefreshCcw, Check, Table2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
// Calls /api/connections/<id>/tables which probes the upstream MCP server
// for a known table-listing tool and parses the response.

export function TablesViewer({
  dataSourceId,
  dataSourceName,
}: {
  dataSourceId: string;
  dataSourceName: string;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<TablesResponse | null>(null);
  const [copied, setCopied] = useState(false);

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

  async function copyAll() {
    if (!data?.tables) return;
    await navigator.clipboard.writeText(data.tables.join(", "));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
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
            <div className="space-y-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="text-destructive">{data.error}</p>
            </div>
          )}

          {!loading && data?.tables && data.tables.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs text-muted-foreground">
                  {data.tables.length} table{data.tables.length === 1 ? "" : "s"}
                </p>
                <Button variant="outline" size="sm" onClick={copyAll}>
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy all"}
                </Button>
              </div>
              <div className="max-h-80 overflow-y-auto rounded-md border border-border">
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 p-2 text-sm">
                  {data.tables.map((t) => (
                    <code
                      key={t}
                      className="overflow-hidden truncate rounded bg-muted px-2 py-1 font-mono text-xs"
                      title={t}
                    >
                      {t}
                    </code>
                  ))}
                </div>
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
