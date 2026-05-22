"use client";

import { useMemo, useState } from "react";
import { Search, ChevronRight, ShieldCheck, ShieldOff } from "lucide-react";
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
import { ROLES, ROLE_LABEL, badgeVariantFor, labelFor } from "@/lib/rbac";
import { BulkBar } from "./bulk-bar";
import { InlinePermRow } from "./inline-perm-row";
import {
  getCell,
  type GrantCell,
  type MatrixPayload,
  type PermissionLevel,
  type UserRow,
} from "./permissions-types";

export function ByUserView({
  data,
  onChange,
}: {
  data: MatrixPayload;
  onChange: () => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accessFilter, setAccessFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [focusedId, setFocusedId] = useState<string | null>(null);

  const grantsByUser = useMemo(() => {
    const map = new Map<string, GrantCell[]>();
    for (const g of data.grants) {
      const list = map.get(g.userId) ?? [];
      list.push(g);
      map.set(g.userId, list);
    }
    return map;
  }, [data.grants]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.users.filter((u) => {
      if (s && !u.name.toLowerCase().includes(s) && !u.email.toLowerCase().includes(s)) return false;
      if (roleFilter !== "all" && u.role !== roleFilter) return false;
      const grants = grantsByUser.get(u.id) ?? [];
      const hasGrants = grants.some((g) => g.permissions.length > 0);
      if (accessFilter === "with" && !hasGrants) return false;
      if (accessFilter === "without" && hasGrants) return false;
      return true;
    });
  }, [data.users, grantsByUser, search, roleFilter, accessFilter]);

  const focusedUser = focusedId ? data.users.find((u) => u.id === focusedId) ?? null : null;

  function toggleSelect(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }
  function toggleAllVisible() {
    if (filtered.every((u) => selected.has(u.id))) {
      const next = new Set(selected);
      filtered.forEach((u) => next.delete(u.id));
      setSelected(next);
    } else {
      const next = new Set(selected);
      filtered.forEach((u) => next.add(u.id));
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

  return (
    <div className="flex h-[calc(100vh-140px)] min-h-[520px]">
      {/* LEFT: user list */}
      <div className="flex w-[380px] shrink-0 flex-col border-r border-border">
        <div className="flex flex-col gap-2 border-b border-border bg-card/30 px-4 py-3">
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search users…"
              className="h-9 pl-8"
            />
          </div>
          <div className="flex gap-2">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {ROLES.map((r) => (
                  <SelectItem key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={accessFilter} onValueChange={setAccessFilter}>
              <SelectTrigger className="h-8 flex-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any access</SelectItem>
                <SelectItem value="with">Has grants</SelectItem>
                <SelectItem value="without">No grants</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <label className="flex cursor-pointer items-center gap-2">
              <Checkbox
                checked={filtered.length > 0 && filtered.every((u) => selected.has(u.id))}
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
          {filtered.map((u) => (
            <UserListItem
              key={u.id}
              user={u}
              grants={grantsByUser.get(u.id) ?? []}
              focused={focusedId === u.id}
              checked={selected.has(u.id)}
              onCheck={() => toggleSelect(u.id)}
              onFocus={() => setFocusedId(u.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">No users match.</div>
          )}
        </div>
      </div>

      {/* RIGHT: detail or bulk */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {selected.size >= 2 ? (
          <BulkBar
            kind="users"
            subjectIds={Array.from(selected)}
            subjectLabel={`${selected.size} users`}
            dataSources={data.dataSources}
            users={data.users}
            onApplied={async () => {
              await onChange();
            }}
          />
        ) : focusedUser ? (
          <UserDetail
            user={focusedUser}
            dataSources={data.dataSources}
            grants={grantsByUser.get(focusedUser.id) ?? []}
            onSave={(dsId, perms) => saveDirectGrant(focusedUser.id, dsId, perms)}
          />
        ) : (
          <EmptyHint />
        )}
      </div>
    </div>
  );
}

function UserListItem({
  user,
  grants,
  focused,
  checked,
  onCheck,
  onFocus,
}: {
  user: UserRow;
  grants: GrantCell[];
  focused: boolean;
  checked: boolean;
  onCheck: () => void;
  onFocus: () => void;
}) {
  const grantCount = grants.filter((g) => g.permissions.length > 0).length;
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
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
        {user.name.charAt(0).toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm font-medium">
          <span className="truncate">{user.name}</span>
          {user.role !== "USER" && (
            <Badge variant={badgeVariantFor(user.role)} className="h-4 text-[10px]">
              {labelFor(user.role).toLowerCase()}
            </Badge>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground">{user.email}</div>
      </div>
      <div className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground">
        {grantCount > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-success">
            <ShieldCheck className="h-3 w-3" />
            {grantCount}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-muted-foreground/70">
            <ShieldOff className="h-3 w-3" />
            0
          </span>
        )}
        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />
      </div>
    </div>
  );
}

function UserDetail({
  user,
  dataSources,
  grants,
  onSave,
}: {
  user: UserRow;
  dataSources: MatrixPayload["dataSources"];
  grants: GrantCell[];
  onSave: (dataSourceId: string, perms: PermissionLevel[]) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [hideEmpty, setHideEmpty] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return dataSources.filter((d) => {
      if (s && !d.name.toLowerCase().includes(s) && !d.slug.toLowerCase().includes(s)) return false;
      if (hideEmpty) {
        const c = getCell(grants, user.id, d.id);
        if (!c || c.permissions.length === 0) return false;
      }
      return true;
    });
  }, [dataSources, grants, user.id, search, hideEmpty]);

  return (
    <>
      <div className="border-b border-border px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-base font-semibold text-primary">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="font-semibold">{user.name}</div>
            <div className="text-xs text-muted-foreground">{user.email}</div>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 border-b border-border bg-card/20 px-6 py-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter connections…"
            className="h-9 pl-8"
          />
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={hideEmpty} onCheckedChange={(v) => setHideEmpty(v === true)} />
          Hide no-access
        </label>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.map((ds) => {
          const cell = getCell(grants, user.id, ds.id);
          return (
            <InlinePermRow
              key={ds.id}
              label={ds.name}
              sublabel={ds.type}
              cell={cell}
              onSave={(perms) => onSave(ds.id, perms)}
              onRevokeDirect={() => onSave(ds.id, [])}
            />
          );
        })}
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground">No connections match.</div>
        )}
      </div>
    </>
  );
}

function EmptyHint() {
  return (
    <div className="flex flex-1 items-center justify-center px-6 text-center text-muted-foreground">
      <div>
        <div className="text-sm">Select a user on the left to view and edit their grants.</div>
        <div className="mt-1 text-xs">Or select 2+ users for bulk actions.</div>
      </div>
    </div>
  );
}
