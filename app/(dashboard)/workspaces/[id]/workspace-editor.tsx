"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type DataSourceOption = { id: string; name: string; type: string };
type UserOption = { id: string; name: string; email: string };

type PermLevel = "select" | "insert" | "update" | "delete" | "execute";

export type WorkspaceData = {
  id: string;
  name: string;
  description: string | null;
  dataSources: Array<{ dataSourceId: string; allowedTables: string[] | null }>;
  users: Array<{ userId: string; permissions: PermLevel[] }>;
};

const PERMS = ["select", "insert", "update", "delete", "execute"] as const;

export function WorkspaceEditor({
  workspace,
  allDataSources,
  allUsers,
}: {
  workspace: WorkspaceData;
  allDataSources: DataSourceOption[];
  allUsers: UserOption[];
}) {
  const router = useRouter();
  const [name, setName] = useState(workspace.name);
  const [description, setDescription] = useState(workspace.description ?? "");
  const [dataSources, setDataSources] = useState(workspace.dataSources);
  const [users, setUsers] = useState(workspace.users);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function toggleDataSource(dsId: string) {
    const exists = dataSources.find((d) => d.dataSourceId === dsId);
    if (exists) {
      setDataSources(dataSources.filter((d) => d.dataSourceId !== dsId));
    } else {
      setDataSources([...dataSources, { dataSourceId: dsId, allowedTables: null }]);
    }
  }

  function updateAllowedTables(dsId: string, tablesCsv: string) {
    const tables = tablesCsv
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    setDataSources(
      dataSources.map((d) =>
        d.dataSourceId === dsId
          ? { ...d, allowedTables: tables.length > 0 ? tables : null }
          : d,
      ),
    );
  }

  function toggleUser(userId: string) {
    const exists = users.find((u) => u.userId === userId);
    if (exists) {
      setUsers(users.filter((u) => u.userId !== userId));
    } else {
      setUsers([...users, { userId, permissions: ["select"] }]);
    }
  }

  function togglePermission(userId: string, perm: PermLevel) {
    setUsers(
      users.map((u) => {
        if (u.userId !== userId) return u;
        const has = u.permissions.includes(perm);
        return {
          ...u,
          permissions: has ? u.permissions.filter((p) => p !== perm) : [...u.permissions, perm],
        };
      }),
    );
  }

  async function onSave() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/workspaces/${workspace.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          dataSources,
          users,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="w-name">Name</Label>
            <Input id="w-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-desc">Description</Label>
            <Textarea
              id="w-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Data sources</CardTitle>
          <CardDescription>
            Pick which connections this workspace exposes. Optionally restrict to specific tables.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allDataSources.map((ds) => {
              const selected = dataSources.find((d) => d.dataSourceId === ds.id);
              const tablesStr = selected?.allowedTables ? selected.allowedTables.join(", ") : "";
              return (
                <div
                  key={ds.id}
                  className="flex items-center gap-4 rounded-md border border-border p-3"
                >
                  <Checkbox
                    checked={!!selected}
                    onCheckedChange={() => toggleDataSource(ds.id)}
                    id={`ds-${ds.id}`}
                  />
                  <Label htmlFor={`ds-${ds.id}`} className="min-w-32 cursor-pointer">
                    <span className="font-medium">{ds.name}</span>
                    <span className="ml-2 text-xs text-muted-foreground">({ds.type})</span>
                  </Label>
                  {selected && (
                    <div className="flex flex-1 items-center gap-2">
                      <Label className="text-xs text-muted-foreground" htmlFor={`tables-${ds.id}`}>
                        Allowed tables (blank = all):
                      </Label>
                      <Input
                        id={`tables-${ds.id}`}
                        value={tablesStr}
                        onChange={(e) => updateAllowedTables(ds.id, e.target.value)}
                        placeholder="contacts, deals"
                        className="h-8 max-w-sm flex-1 font-mono text-xs"
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Users</CardTitle>
          <CardDescription>
            Assign users to this workspace and set their permission level.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {allUsers.map((u) => {
              const selected = users.find((x) => x.userId === u.id);
              return (
                <div
                  key={u.id}
                  className="flex items-center gap-4 rounded-md border border-border p-3"
                >
                  <Checkbox
                    checked={!!selected}
                    onCheckedChange={() => toggleUser(u.id)}
                    id={`u-${u.id}`}
                  />
                  <Label htmlFor={`u-${u.id}`} className="flex-1 cursor-pointer">
                    <div className="font-medium">{u.name}</div>
                    <div className="text-xs text-muted-foreground">{u.email}</div>
                  </Label>
                  {selected && (
                    <div className="flex gap-3">
                      {PERMS.map((p) => (
                        <label key={p} className="flex items-center gap-1.5 text-xs">
                          <Checkbox
                            checked={selected.permissions.includes(p)}
                            onCheckedChange={() => togglePermission(u.id, p)}
                          />
                          <span className="uppercase">{p}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <X className="h-4 w-4" />
          {error}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onSave} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
