"use client";

import { useState } from "react";
import { Layers, X, Sparkles, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LEVELS, type DataSourceRow, type PermissionLevel, type UserRow } from "./permissions-types";

type BulkBarProps = {
  kind: "users" | "dataSources";
  subjectIds: string[];
  subjectLabel: string;
  users: UserRow[];
  dataSources: DataSourceRow[];
  onApplied: () => void | Promise<void>;
};

export function BulkBar({ kind, subjectIds, subjectLabel, users, dataSources, onApplied }: BulkBarProps) {
  // When kind=users, subjectIds are user ids. We pick ONE dataSource to grant against.
  // When kind=dataSources, subjectIds are data source ids. We pick ONE user.
  const [counterpartId, setCounterpartId] = useState<string>("");
  const [perms, setPerms] = useState<Set<PermissionLevel>>(new Set(["select"]));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  function toggle(p: PermissionLevel) {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  }

  async function apply(mode: "grant" | "revoke") {
    if (!counterpartId) {
      setError(`Pick a ${kind === "users" ? "connection" : "user"} first`);
      return;
    }
    if (mode === "grant" && perms.size === 0) {
      setError("Pick at least one permission level");
      return;
    }
    setError(null);
    setPending(true);
    setResult(null);
    try {
      const pairs = subjectIds.map((subjectId) =>
        kind === "users"
          ? { userId: subjectId, dataSourceId: counterpartId }
          : { userId: counterpartId, dataSourceId: subjectId },
      );
      let ok = 0;
      let fail = 0;
      for (const p of pairs) {
        const url = `/api/users/${p.userId}/data-sources/${p.dataSourceId}`;
        const init: RequestInit =
          mode === "revoke"
            ? { method: "DELETE" }
            : {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  permissions: Array.from(perms),
                  allowedTables: null,
                }),
              };
        const res = await fetch(url, init);
        if (res.ok) ok++;
        else fail++;
      }
      setResult(`${mode === "grant" ? "Granted" : "Revoked"} on ${ok} pair${ok === 1 ? "" : "s"}${fail ? ` · ${fail} failed` : ""}`);
      await onApplied();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  const counterpartOptions =
    kind === "users"
      ? dataSources.map((d) => ({ id: d.id, label: d.name, sublabel: d.type }))
      : users.map((u) => ({ id: u.id, label: u.name, sublabel: u.email }));

  const counterpartNoun = kind === "users" ? "connection" : "user";

  return (
    <div className="flex flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-border bg-primary/10 px-6 py-4">
        <Layers className="h-4 w-4 text-primary" />
        <div className="flex-1">
          <div className="text-sm font-semibold">Bulk: {subjectLabel} selected</div>
          <div className="text-xs text-muted-foreground">
            Grants below create direct grants on the {counterpartNoun} you pick. Team assignments are unaffected.
          </div>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">
            Target {counterpartNoun}
          </Label>
          <Select value={counterpartId} onValueChange={setCounterpartId}>
            <SelectTrigger className="w-full max-w-sm">
              <SelectValue placeholder={`Pick a ${counterpartNoun}…`} />
            </SelectTrigger>
            <SelectContent>
              {counterpartOptions.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  <div>
                    <div>{o.label}</div>
                    <div className="text-[10px] text-muted-foreground">{o.sublabel}</div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label className="text-xs uppercase tracking-wide text-muted-foreground">Permissions</Label>
          <div className="flex gap-2">
            {LEVELS.map((p) => (
              <label
                key={p}
                className="flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
              >
                <Checkbox checked={perms.has(p)} onCheckedChange={() => toggle(p)} />
                <span className="uppercase">{p}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        {result && (
          <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2 text-sm text-success">
            <Check className="h-4 w-4" />
            {result}
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={() => apply("grant")} disabled={pending || !counterpartId || perms.size === 0}>
            <Sparkles className="h-3.5 w-3.5" />
            Grant direct access
          </Button>
          <Button
            variant="outline"
            onClick={() => apply("revoke")}
            disabled={pending || !counterpartId}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Revoke direct grants
          </Button>
          <p className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
            <X className="h-3 w-3" />
            Click "Clear selection" in the list to exit bulk mode
          </p>
        </div>
      </div>
    </div>
  );
}
