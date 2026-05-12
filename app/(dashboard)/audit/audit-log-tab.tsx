"use client";

import { useEffect, useState, useCallback } from "react";
import { Download, RefreshCcw, ChevronDown, ChevronRight, LogIn, LogOut, UserPlus, UserMinus, UserCog, KeyRound, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { downloadCsv, rowsToCsv, type CsvColumn } from "@/lib/csv";

type Option = { id: string; name: string };

type EventEntry = {
  id: string;
  createdAt: string;
  eventType: string;
  targetType: string | null;
  targetId: string | null;
  targetLabel: string | null;
  detailsJson: string | null;
  actor: { id: string; name: string; email: string } | null;
  targetUser: { id: string; name: string; email: string } | null;
};

const LABELS: Record<string, { label: string; icon: React.ElementType; tone: "default" | "secondary" | "destructive" | "success" }> = {
  USER_LOGIN: { label: "User Login", icon: LogIn, tone: "success" },
  USER_LOGOUT: { label: "Sign Out", icon: LogOut, tone: "secondary" },
  USER_CREATED: { label: "User Created", icon: UserPlus, tone: "default" },
  USER_UPDATED: { label: "User Updated", icon: UserCog, tone: "secondary" },
  USER_DELETED: { label: "User Removed", icon: UserMinus, tone: "destructive" },
  USER_PASSWORD_CHANGED: { label: "Password Changed", icon: KeyRound, tone: "secondary" },
  USER_ROLE_CHANGED: { label: "Role Changed", icon: Shield, tone: "default" },
};

function eventInfo(type: string) {
  return LABELS[type] ?? { label: type, icon: Shield, tone: "secondary" as const };
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

function prettyJson(raw: string | null): string {
  if (!raw) return "(no details)";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function AuditLogTab({ users }: { users: Array<{ id: string; name: string; email?: string }> }) {
  const [days, setDays] = useState(7);
  const [eventType, setEventType] = useState("all");
  const [actorId, setActorId] = useState("all");
  const [entries, setEntries] = useState<EventEntry[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days), eventType, actorId });
      const res = await fetch(`/api/admin-events?${params.toString()}`);
      const data = await res.json();
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [days, eventType, actorId]);

  useEffect(() => {
    void load();
  }, [load]);

  function onExport() {
    const columns: CsvColumn<EventEntry>[] = [
      { header: "Time", get: (r) => r.createdAt },
      { header: "Event Type", get: (r) => r.eventType },
      { header: "Actor", get: (r) => r.actor?.name ?? "" },
      { header: "Actor Email", get: (r) => r.actor?.email ?? "" },
      { header: "Target Type", get: (r) => r.targetType ?? "" },
      { header: "Target Label", get: (r) => r.targetLabel ?? "" },
      { header: "Target User", get: (r) => r.targetUser?.name ?? "" },
      { header: "Details", get: (r) => r.detailsJson ?? "" },
    ];
    const csv = rowsToCsv(entries, columns);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    downloadCsv(`audit-log-${stamp}.csv`, csv);
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border bg-card/30 px-6 py-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="a-days" className="text-xs uppercase tracking-wide text-muted-foreground">
                Days
              </Label>
              <Input
                id="a-days"
                type="number"
                min={1}
                max={90}
                value={days}
                onChange={(e) => setDays(Math.max(1, Math.min(90, Number(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Event type</Label>
              <Select value={eventType} onValueChange={setEventType}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  {Object.entries(LABELS).map(([key, v]) => (
                    <SelectItem key={key} value={key}>
                      {v.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">Actor</Label>
              <Select value={actorId} onValueChange={setActorId}>
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
              <th className="px-6 py-3 font-medium">Event Type</th>
              <th className="px-6 py-3 font-medium">Actor</th>
              <th className="px-6 py-3 font-medium">Target</th>
            </tr>
          </thead>
          <tbody>
            {entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-6 py-12 text-center text-muted-foreground">
                  {loading ? "Loading…" : "No admin events in this range."}
                </td>
              </tr>
            ) : (
              entries.map((e) => <EventRow key={e.id} entry={e} />)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function EventRow({ entry }: { entry: EventEntry }) {
  const [open, setOpen] = useState(false);
  const info = eventInfo(entry.eventType);
  const Icon = info.icon;
  const expandable = !!entry.detailsJson || !!entry.targetLabel;

  return (
    <>
      <tr
        onClick={() => expandable && setOpen(!open)}
        className={`border-t border-border ${expandable ? "cursor-pointer hover:bg-muted/30" : ""}`}
      >
        <td className="px-6 py-3 text-muted-foreground">
          <span className="inline-flex items-center gap-2">
            {expandable && (open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />)}
            {formatTime(entry.createdAt)}
          </span>
        </td>
        <td className="px-6 py-3">
          <Badge variant={info.tone} className="inline-flex items-center gap-1.5">
            <Icon className="h-3 w-3" />
            {info.label}
          </Badge>
        </td>
        <td className="px-6 py-3">
          {entry.actor ? (
            <div>
              <div className="font-medium">{entry.actor.name}</div>
              <div className="text-xs text-muted-foreground">{entry.actor.email}</div>
            </div>
          ) : (
            <span className="text-muted-foreground">system</span>
          )}
        </td>
        <td className="px-6 py-3">
          {entry.targetUser ? (
            <div>
              <div className="font-medium">{entry.targetUser.name}</div>
              <div className="text-xs text-muted-foreground">{entry.targetUser.email}</div>
            </div>
          ) : entry.targetLabel ? (
            <span>{entry.targetLabel}</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </td>
      </tr>
      {open && (
        <tr className="border-t border-border bg-background">
          <td colSpan={4} className="px-6 py-4">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Details</div>
            <pre className="max-h-72 overflow-auto rounded-md border border-border bg-card p-3 font-mono text-xs">
              {prettyJson(entry.detailsJson)}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
}
