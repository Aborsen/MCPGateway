"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatDuration } from "@/lib/utils";

export type QueryEntry = {
  id: string;
  createdAt: string;
  method: string;
  toolName: string | null;
  requestJson: string;
  responseJson: string;
  status: "OK" | "ERROR";
  durationMs: number;
  errorMessage: string | null;
  user: { id: string; name: string } | null;
  dataSource: { id: string; name: string } | null;
};

function formatTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function QueryRow({ entry }: { entry: QueryEntry }) {
  const [open, setOpen] = useState(false);
  const isError = entry.status === "ERROR";

  return (
    <>
      <tr
        onClick={() => setOpen(!open)}
        className={`cursor-pointer border-t border-border hover:bg-muted/30 ${
          isError ? "bg-destructive/5" : ""
        }`}
      >
        <td className="px-6 py-3 text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            {formatTime(entry.createdAt)}
          </span>
        </td>
        <td className="px-6 py-3 font-mono text-xs">
          {entry.toolName ? entry.toolName : entry.method}
        </td>
        <td className="px-6 py-3">{entry.dataSource?.name ?? <span className="text-muted-foreground">—</span>}</td>
        <td className="px-6 py-3">{entry.user?.name ?? <span className="text-muted-foreground">—</span>}</td>
        <td className="px-6 py-3 text-right font-mono text-xs text-muted-foreground">
          {formatDuration(entry.durationMs)}
        </td>
        <td className="px-6 py-3">
          {isError ? (
            <Badge variant="destructive">Error</Badge>
          ) : (
            <Badge variant="success">OK</Badge>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-background">
          <td colSpan={6} className="px-6 py-4">
            {isError && entry.errorMessage && (
              <div className="mb-4">
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Error</div>
                <pre className="rounded-md border border-destructive/40 bg-destructive/10 p-3 font-mono text-xs text-destructive">
                  {entry.errorMessage}
                </pre>
              </div>
            )}
            <div className="grid gap-4 lg:grid-cols-2">
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Request (from LLM)
                </div>
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs">
                  {prettyJson(entry.requestJson)}
                </pre>
              </div>
              <div>
                <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
                  Response (to LLM)
                </div>
                <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs">
                  {prettyJson(entry.responseJson)}
                </pre>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
