"use client";

import { useEffect, useState } from "react";
import { X, FolderTree, User as UserIcon, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { LEVELS, type GrantCell, type GrantSource, type PermissionLevel } from "./permissions-types";

export function BreakdownPanel({
  user,
  dataSource,
  grant,
  onClose,
  onSaved,
}: {
  user: { id: string; name: string; email: string };
  dataSource: { id: string; name: string };
  grant: GrantCell | undefined;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}) {
  const workspaceSources: Extract<GrantSource, { kind: "workspace" }>[] = (grant?.sources ?? []).filter(
    (s): s is Extract<GrantSource, { kind: "workspace" }> => s.kind === "workspace",
  );
  const directSource: Extract<GrantSource, { kind: "direct" }> | undefined = (grant?.sources ?? []).find(
    (s): s is Extract<GrantSource, { kind: "direct" }> => s.kind === "direct",
  );

  const [perms, setPerms] = useState<Set<PermissionLevel>>(new Set(directSource?.permissions ?? []));
  const [tablesCsv, setTablesCsv] = useState<string>(
    directSource?.allowedTables ? directSource.allowedTables.join(", ") : "",
  );
  const [tablesUnrestricted, setTablesUnrestricted] = useState<boolean>(
    !directSource || directSource.allowedTables === null,
  );
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPerms(new Set(directSource?.permissions ?? []));
    setTablesCsv(directSource?.allowedTables ? directSource.allowedTables.join(", ") : "");
    setTablesUnrestricted(!directSource || directSource.allowedTables === null);
    setError(null);
  }, [user.id, dataSource.id, directSource?.permissions?.join(","), directSource?.allowedTables?.join(",")]);

  function toggle(p: PermissionLevel) {
    const next = new Set(perms);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPerms(next);
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      const allowedTables = tablesUnrestricted
        ? null
        : tablesCsv
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean);
      const res = await fetch(`/api/users/${user.id}/data-sources/${dataSource.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: Array.from(perms), allowedTables }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  async function revokeDirect() {
    if (!confirm("Revoke this direct grant?")) return;
    setPending(true);
    try {
      const res = await fetch(`/api/users/${user.id}/data-sources/${dataSource.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed");
      await onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-[420px] flex-col border-l border-border bg-card shadow-2xl">
      <div className="flex items-start justify-between border-b border-border px-5 py-4">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">User × Connection</div>
          <div className="mt-1 flex items-center gap-2 text-sm">
            <UserIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="font-medium">{user.name}</span>
            <span className="text-muted-foreground">·</span>
            <span className="font-medium">{dataSource.name}</span>
          </div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        <section className="space-y-2">
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            Team contributions
          </div>
          {workspaceSources.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No team assignment grants access to this connection.
            </p>
          ) : (
            <ul className="space-y-2">
              {workspaceSources.map((s) => (
                <li key={s.workspaceId} className="rounded-md border border-border p-3">
                  <div className="flex items-center gap-2">
                    <FolderTree className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm font-medium">{s.workspaceName}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {s.permissions.map((p) => (
                      <Badge key={p} variant="success" className="uppercase">
                        {p}
                      </Badge>
                    ))}
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    {s.allowedTables === null
                      ? "Tables: all"
                      : `Tables: ${s.allowedTables.join(", ") || "(none)"}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">Direct grant</div>
            {directSource && (
              <button
                onClick={revokeDirect}
                disabled={pending}
                className="inline-flex items-center gap-1 text-xs text-destructive hover:underline"
              >
                <Trash2 className="h-3 w-3" />
                Revoke
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Bypasses workspaces — grant {user.name} access to {dataSource.name} directly.
          </p>
          <div className="space-y-2">
            <Label className="text-xs">Permissions</Label>
            <div className="flex gap-3">
              {LEVELS.map((p) => (
                <label
                  key={p}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm",
                    perms.has(p) && "border-primary/60 bg-primary/10",
                  )}
                >
                  <Checkbox checked={perms.has(p)} onCheckedChange={() => toggle(p)} />
                  <span className="uppercase">{p}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Allowed tables</Label>
            <label className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={tablesUnrestricted}
                onCheckedChange={(v) => setTablesUnrestricted(v === true)}
              />
              <span>All tables (no restriction)</span>
            </label>
            <Input
              value={tablesCsv}
              onChange={(e) => setTablesCsv(e.target.value)}
              disabled={tablesUnrestricted}
              placeholder="contacts, deals"
              className="font-mono text-xs"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={save} disabled={pending}>
              <Save className="h-3.5 w-3.5" />
              {pending ? "Saving…" : "Save"}
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
