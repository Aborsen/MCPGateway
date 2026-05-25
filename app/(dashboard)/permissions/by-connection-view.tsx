"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight, Users as UsersIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { BulkBar } from "./bulk-bar";
import { InlinePermRow } from "./inline-perm-row";
import {
  getCell,
  type DataSourceRow,
  type GrantCell,
  type MatrixPayload,
  type PermissionLevel,
} from "./permissions-types";

export function ByConnectionView({
  data,
  onChange,
}: {
  data: MatrixPayload;
  onChange: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const grantsByDs = useMemo(() => {
    const map = new Map<string, GrantCell[]>();
    for (const g of data.grants) {
      const list = map.get(g.dataSourceId) ?? [];
      list.push(g);
      map.set(g.dataSourceId, list);
    }
    return map;
  }, [data.grants]);

  const types = useMemo(() => {
    return Array.from(new Set(data.dataSources.map((d) => d.type))).sort();
  }, [data.dataSources]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.dataSources.filter((d) => {
      if (s && !d.name.toLowerCase().includes(s) && !d.slug.toLowerCase().includes(s)) return false;
      if (typeFilter !== "all" && d.type !== typeFilter) return false;
      const grants = grantsByDs.get(d.id) ?? [];
      const hasUsers = grants.some((g) => g.permissions.length > 0);
      if (accessFilter === "with" && !hasUsers) return false;
      if (accessFilter === "without" && hasUsers) return false;
      return true;
    });
  }, [data.dataSources, grantsByDs, search, typeFilter, accessFilter]);

  const focused = focusedId ? data.dataSources.find((d) => d.id === focusedId) ?? null : null;

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAllVisible() {
    if (filtered.every((d) => selected.has(d.id))) {
      const next = new Set(selected);
      filtered.forEach((d) => next.delete(d.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((d) => next.add(d.id));
      setSelected(next);
    }
  }

  async function saveDirectGrant(userId: string, dataSourceId: string, perms: PermissionLevel[]) {
    if (perms.length === 0) {
      await fetch(`/api/users/${userId}/data-sources/${dataSourceId}`, { method: "DELETE" });
    } else {
      await fetch(`/api/users/${userId}/data-sources/${dataSourceId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: perms, allowedTables: null }),
      });
    }
    await onChange();
  }

  async function saveWorkspaceGrant(userId: string, workspaceId: string, perms: PermissionLevel[]) {
    const res = await fetch(`/api/workspaces/${workspaceId}/users/${userId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: perms }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `Request failed (${res.status})`);
    }
    await onChange();
  }

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[520px]">
      {/* LEFT: connection list */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-border">
        <div className="flex flex-col gap-2 border-b border-border bg-card/30 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search connections…"
              className="h-9 pl-8"
            />
          </div>
          <div className="flex gap-2">
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {types.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={accessFilter} onValueChange={setAccessFilter}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any users</SelectItem>
                <SelectItem value="with">Has users</SelectItem>
                <SelectItem value="without">No users</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={filtered.length > 0 && filtered.every((d) => selected.has(d.id))}
                onCheckedChange={toggleAllVisible}
              />
              <span>{filtered.length} shown</span>
            </label>
            {selected.size > 0 && (
              <button
                onClick={() => setSelected(new Set())}
                className="text-primary hover:underline"
              >
                Clear selection
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map((d) => (
            <DsListItem
              key={d.id}
              ds={d}
              userCount={(grantsByDs.get(d.id) ?? []).filter((g) => g.permissions.length > 0).length}
              focused={focusedId === d.id}
              checked={selected.has(d.id)}
              onCheck={() => toggleSelect(d.id)}
              onFocus={() => setFocusedId(d.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">No connections match.</div>
          )}
        </div>
      </div>

      {/* RIGHT */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected.size >= 2 ? (
          <BulkBar
            kind="dataSources"
            subjectIds={Array.from(selected)}
            subjectLabel={`${selected.size} connections`}
            dataSources={data.dataSources}
            users={data.users}
            onApplied={async () => {
              await onChange();
            }}
          />
        ) : focused ? (
          <ConnectionDetail
            ds={focused}
            users={data.users}
            grants={grantsByDs.get(focused.id) ?? []}
            onSave={(userId, perms) => saveDirectGrant(userId, focused.id, perms)}
            onSaveWorkspace={(userId, wsId, perms) => saveWorkspaceGrant(userId, wsId, perms)}
          />
        ) : (
          <EmptyHint />
        )}
      </div>
    </div>
  );
}

function DsListItem({
  ds,
  userCount,
  focused,
  checked,
  onCheck,
  onFocus,
}: {
  ds: DataSourceRow;
  userCount: number;
  focused: boolean;
  checked: boolean;
  onCheck: () => void;
  onFocus: () => void;
}) {
  return (
    <div
      onClick={onFocus}
      className={cn(
        "flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 transition-colors hover:bg-muted/40",
        focused && "bg-primary/10",
      )}
    >
      <Checkbox
        checked={checked}
        onCheckedChange={onCheck}
        onClick={(e) => e.stopPropagation()}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{ds.name}</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Badge variant="outline" className="h-4 px-1.5 text-[10px] capitalize">
            {ds.type}
          </Badge>
          <span className="truncate font-mono">{ds.slug}</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <UsersIcon className="h-3 w-3" />
          {userCount}
        </span>
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
    </div>
  );
}

function ConnectionDetail({
  ds,
  users,
  grants,
  onSave,
  onSaveWorkspace,
}: {
  ds: DataSourceRow;
  users: MatrixPayload["users"];
  grants: GrantCell[];
  onSave: (userId: string, perms: PermissionLevel[]) => void | Promise<void>;
  onSaveWorkspace: (userId: string, workspaceId: string, perms: PermissionLevel[]) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return users.filter((u) => {
      if (s && !u.name.toLowerCase().includes(s) && !u.email.toLowerCase().includes(s)) return false;
      if (hideEmpty) {
        const c = getCell(grants, u.id, ds.id);
        if (!c || c.permissions.length === 0) return false;
      }
      return true;
    });
  }, [users, grants, ds.id, search, hideEmpty]);

  return (
    <>
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/15 text-base font-semibold text-primary">
            {ds.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{ds.name}</div>
            <div className="text-xs text-muted-foreground">
              <span className="capitalize">{ds.type}</span> · <span className="font-mono">{ds.slug}</span>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-border bg-card/20 px-6 py-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter users…"
            className="h-9 pl-8"
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={hideEmpty} onCheckedChange={(v) => setHideEmpty(v === true)} />
          Hide no-access
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((u) => {
          const cell = getCell(grants, u.id, ds.id);
          return (
            <InlinePermRow
              key={u.id}
              label={u.name}
              sublabel={u.email}
              cell={cell}
              onSave={(perms) => onSave(u.id, perms)}
              onRevokeDirect={() => onSave(u.id, [])}
              onSaveWorkspace={(wsId, perms) => onSaveWorkspace(u.id, wsId, perms)}
              userLabel={u.name}
              connectionLabel={ds.name}
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No users match.</div>
        )}
      </div>
    </>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-muted-foreground">
      <div>
        <div className="text-sm">Select a connection on the left to view and edit who can access it.</div>
        <div className="mt-1 text-xs">Or select 2+ connections for bulk actions.</div>
      </div>
    </div>
  );
}
