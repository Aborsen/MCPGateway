"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, X, Check, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TablesViewer } from "@/components/tables-viewer";

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
  const [saved, setSaved] = useState(false);
  const [, startTransition] = useTransition();

  // Search + filter state for the two big lists.
  const [dsSearch, setDsSearch] = useState("");
  const [dsTypeFilter, setDsTypeFilter] = useState<string>("all");
  const [dsSelectedOnly, setDsSelectedOnly] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userSelectedOnly, setUserSelectedOnly] = useState(false);

  const dsTypes = useMemo(() => {
    const set = new Set<string>();
    for (const d of allDataSources) if (d.type) set.add(d.type);
    return Array.from(set).sort();
  }, [allDataSources]);

  const selectedDsIds = useMemo(
    () => new Set(dataSources.map((d) => d.dataSourceId)),
    [dataSources],
  );
  const selectedUserIds = useMemo(() => new Set(users.map((u) => u.userId)), [users]);

  const filteredDataSources = useMemo(() => {
    const q = dsSearch.trim().toLowerCase();
    return allDataSources.filter((ds) => {
      if (dsTypeFilter !== "all" && ds.type !== dsTypeFilter) return false;
      if (dsSelectedOnly && !selectedDsIds.has(ds.id)) return false;
      if (q && !ds.name.toLowerCase().includes(q) && !ds.type.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allDataSources, dsSearch, dsTypeFilter, dsSelectedOnly, selectedDsIds]);

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return allUsers.filter((u) => {
      if (userSelectedOnly && !selectedUserIds.has(u.id)) return false;
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allUsers, userSearch, userSelectedOnly, selectedUserIds]);

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
    setSaved(false);
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
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
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
        <CardContent className="grid items-start gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="w-name">Name</Label>
            <Input
              id="w-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="w-desc">Description</Label>
            <Input
              id="w-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional"
              className="h-9"
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
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={dsSearch}
                onChange={(e) => setDsSearch(e.target.value)}
                placeholder="Search connections…"
                className="h-9 pl-8"
              />
            </div>
            {dsTypes.length > 1 && (
              <Select value={dsTypeFilter} onValueChange={setDsTypeFilter}>
                <SelectTrigger className="h-9 w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {dsTypes.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button
              type="button"
              variant={dsSelectedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setDsSelectedOnly((v) => !v)}
            >
              Selected only ({selectedDsIds.size})
            </Button>
            <span className="text-xs text-muted-foreground">
              {filteredDataSources.length} of {allDataSources.length}
            </span>
          </div>
          <div className="max-h-[330px] space-y-3 overflow-y-auto pr-2">
            {allDataSources.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No connections yet.</p>
            )}
            {allDataSources.length > 0 && filteredDataSources.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No connections match the current filter.
              </p>
            )}
            {filteredDataSources.map((ds) => {
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
                      <TablesViewer
                        dataSourceId={ds.id}
                        dataSourceName={ds.name}
                        initialSelected={selected.allowedTables ?? []}
                        onApply={(names) => updateAllowedTables(ds.id, names.join(", "))}
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
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search users by name or email…"
                className="h-9 pl-8"
              />
            </div>
            <Button
              type="button"
              variant={userSelectedOnly ? "default" : "outline"}
              size="sm"
              onClick={() => setUserSelectedOnly((v) => !v)}
            >
              Selected only ({selectedUserIds.size})
            </Button>
            <span className="text-xs text-muted-foreground">
              {filteredUsers.length} of {allUsers.length}
            </span>
          </div>
          <div className="max-h-[330px] space-y-3 overflow-y-auto pr-2">
            {allUsers.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">No users yet.</p>
            )}
            {allUsers.length > 0 && filteredUsers.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No users match the current filter.
              </p>
            )}
            {filteredUsers.map((u) => {
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

      <div className="sticky bottom-0 -mx-6 -mb-6 flex items-center justify-end gap-3 border-t border-border bg-background/95 px-6 py-3 backdrop-blur">
        {error && (
          <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
            <X className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}
        {saved && !error && (
          <div className="flex items-center gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-1.5 text-sm text-success">
            <Check className="h-4 w-4" />
            <span>Changes saved.</span>
          </div>
        )}
        <Button onClick={onSave} disabled={pending}>
          <Save className="h-4 w-4" />
          {pending ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
