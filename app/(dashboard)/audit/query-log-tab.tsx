"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { QueryRow, type QueryEntry } from "./query-row";
import { downloadCsv, rowsToCsv, type CsvColumn } from "@/lib/csv";

type Option = { id: string; name: string };

export function QueryLogTab({
  users,
  dataSources,
}: {
  users: Option[];
  dataSources: Option[];
}) {
  const [days, setDays] = useState(7);
  const [userId, setUserId] = useState("all");
  const [dataSourceId, setDataSourceId] = useState("all");
  const [entries, setEntries] = useState<QueryEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days), userId, dataSourceId });
      const res = await fetch(`/api/query-log?${params.toString()}`);
      const data = await res.json();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [days, userId, dataSourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onExport() {
    const columns: CsvColumn<QueryEntry>[] = [
      { header: "Time", get: (r) => r.createdAt },
      { header: "User", get: (r) => r.user?.name ?? "" },
      { header: "Connection", get: (r) => r.dataSource?.name ?? "" },
      { header: "Method", get: (r) => r.method },
      { header: "Tool", get: (r) => r.toolName ?? "" },
      { header: "Status", get: (r) => r.status },
      { header: "Duration (ms)", get: (r) => r.durationMs },
      { header: "Error", get: (r) => r.errorMessage ?? "" },
    ];
    const csv = rowsToCsv(entries, columns);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadCsv(`query-log-${stamp}.csv`, csv);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card/30 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-days" className="text-xs uppercase tracking-wide text-muted-foreground">
                Days
              </Label>
              <Input
                id="q-days"
                type="number"
                min={1}
                max={30}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(30, Number(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">User</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All users</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                Connection
              </Label>
              <Select value={dataSourceId} onValueChange={setDataSourceId}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {dataSources.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onExport} disabled={entries.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={load} disabled={loading}>
              <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/40 text-muted-foreground">
            <tr className="text-left">
              <th className="px-6 py-3 font-medium">Time</th>
              <th className="px-6 py-3 font-medium">Method / Tool</th>
              <th className="px-6 py-3 font-medium">Connection</th>
              <th className="px-6 py-3 font-medium">User</th>
              <th className="px-6 py-3 text-right font-medium">Duration</th>
              <th className="px-6 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-muted-foreground">
                  {loading ? "Loading…" : "No MCP requests in this range."}
                </td>
              </tr>
            ) : (
              entries.map((e) => <QueryRow key={e.id} entry={e} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
