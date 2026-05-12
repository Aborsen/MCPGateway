"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Tool = {
  name: string;
  description?: string;
  level: string;
  classifiedBy: string;
  lastSeenAt: string | null;
  isLive: boolean;
};

type Payload = {
  tools: Tool[];
  liveError: string | null;
  liveCount: number;
  storedCount: number;
};

export function ToolsEditor({ dataSourceId }: { dataSourceId: string }) {
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingTool, setSavingTool] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/connections/${dataSourceId}/tools`, { cache: "no-store" });
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [dataSourceId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeLevel(toolName: string, level: string) {
    setSavingTool(toolName);
    try {
      const res = await fetch(
        `/api/connections/${dataSourceId}/tools/${encodeURIComponent(toolName)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level }),
        },
      );
      if (!res.ok) throw new Error("Failed");
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSavingTool(null);
    }
  }

  // Fixed total height — keeps the card the same size whether Loading,
  // Empty, 1 tool, or 50 tools. Sized to show ~4 rows; overflow scrolls.
  const SHELL_HEIGHT = "h-[320px]";

  if (!data) {
    return (
      <div className={cn("flex items-center justify-center text-sm text-muted-foreground", SHELL_HEIGHT)}>
        Loading tools…
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", SHELL_HEIGHT)}>
      <div className="flex shrink-0 items-center justify-between text-xs text-muted-foreground">
        <div>
          {data.liveCount} live · {data.storedCount} stored
        </div>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className={cn("h-3 w-3", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {data.liveError && (
        <div className="flex shrink-0 items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>
            <div className="font-medium">Upstream unreachable — showing previously-discovered tools</div>
            <div className="mt-1 opacity-80">{data.liveError}</div>
          </div>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border border-border">
        <div className="flex-1 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-muted-foreground backdrop-blur">
              <tr className="text-left">
                <th className="px-3 py-2 font-medium">Tool</th>
                <th className="w-44 px-3 py-2 font-medium">Required level</th>
                <th className="w-24 px-3 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {data.tools.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-3 py-6 text-center text-muted-foreground">
                    No tools discovered yet.
                  </td>
                </tr>
              ) : (
                data.tools.map((t) => (
                  // Borders applied to TDs (not TR) for reliable rendering
                  // across browsers when border-collapse is in play.
                  <tr key={t.name}>
                    <td className="border-b border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <code className="font-mono text-xs">{t.name}</code>
                        {!t.isLive && (
                          <Badge variant="outline" className="text-[10px] opacity-70">
                            stale
                          </Badge>
                        )}
                      </div>
                      {t.description && (
                        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {t.description}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-border px-3 py-2">
                      <Select
                        value={t.level.toUpperCase()}
                        onValueChange={(v) => changeLevel(t.name, v)}
                        disabled={savingTool === t.name}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="READ">READ</SelectItem>
                          <SelectItem value="WRITE">WRITE</SelectItem>
                          <SelectItem value="DELETE">DELETE</SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="border-b border-border px-3 py-2">
                      {t.classifiedBy === "admin" ? (
                        <Badge variant="default" className="text-[10px]">
                          Override
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-[10px] opacity-70">
                          Auto
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
