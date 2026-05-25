export type PermissionLevel = "select" | "insert" | "update" | "delete" | "execute";

export type GrantSource =
  | {
      kind: "workspace";
      workspaceId: string;
      workspaceName: string;
      permissions: PermissionLevel[];
      allowedTables: string[] | null;
    }
  | {
      kind: "direct";
      permissions: PermissionLevel[];
      allowedTables: string[] | null;
    };

export type GrantCell = {
  userId: string;
  dataSourceId: string;
  permissions: PermissionLevel[];
  allowedTables: string[] | null;
  sources: GrantSource[];
};

export type UserRow = { id: string; name: string; email: string; role: string };
export type DataSourceRow = { id: string; name: string; slug: string; type: string };

export type MatrixPayload = {
  users: UserRow[];
  dataSources: DataSourceRow[];
  grants: GrantCell[];
};

export const LEVELS: PermissionLevel[] = ["select", "insert", "update", "delete", "execute"];

// Short single-letter labels used in the dense matrix pills.
export const LEVEL_SHORT: Record<PermissionLevel, string> = {
  select: "S",
  insert: "I",
  update: "U",
  delete: "D",
  execute: "E",
};

export const LEVEL_LABEL: Record<PermissionLevel, string> = {
  select: "Select",
  insert: "Insert",
  update: "Update",
  delete: "Delete",
  execute: "Execute",
};

// ── Effective levels (UI grouping) ───────────────────────────────────────
// The backend still stores the 5 SQL-level permissions above (the MCP proxy
// needs them to gate per-tool calls). The matrix UI groups them into three
// human-friendly buckets so admins don't have to think about INSERT vs
// UPDATE vs EXECUTE separately:
//
//   View   ↔ select
//   Edit   ↔ insert | update | execute   (toggled together)
//   Delete ↔ delete
//
// A user has the "Edit" level if ANY of {insert, update, execute} is set;
// toggling "Edit" on/off applies to all three.

export type EffectiveLevel = "view" | "edit" | "delete";

export const EFFECTIVE_LEVELS: EffectiveLevel[] = ["view", "edit", "delete"];

export const EFFECTIVE_LEVEL_LABEL: Record<EffectiveLevel, string> = {
  view: "View",
  edit: "Edit",
  delete: "Delete",
};

export const EFFECTIVE_LEVEL_SHORT: Record<EffectiveLevel, string> = {
  view: "V",
  edit: "E",
  delete: "D",
};

const EFFECTIVE_TO_PERMS: Record<EffectiveLevel, PermissionLevel[]> = {
  view: ["select"],
  edit: ["insert", "update", "execute"],
  delete: ["delete"],
};

/** Compute which UI-level buckets are active from a raw permission array. */
export function effectiveLevelsFor(perms: PermissionLevel[]): Set<EffectiveLevel> {
  const set = new Set<EffectiveLevel>();
  const p = new Set(perms);
  if (p.has("select")) set.add("view");
  if (p.has("insert") || p.has("update") || p.has("execute")) set.add("edit");
  if (p.has("delete")) set.add("delete");
  return set;
}

/** Apply a UI-level toggle and return the resulting raw permission array. */
export function setEffective(
  perms: PermissionLevel[],
  level: EffectiveLevel,
  on: boolean,
): PermissionLevel[] {
  const set = new Set(perms);
  for (const p of EFFECTIVE_TO_PERMS[level]) {
    if (on) set.add(p);
    else set.delete(p);
  }
  return Array.from(set);
}

/** Expand a set of UI-level buckets into the underlying perm array. */
export function expandEffectiveSet(levels: Iterable<EffectiveLevel>): PermissionLevel[] {
  const out = new Set<PermissionLevel>();
  for (const l of levels) for (const p of EFFECTIVE_TO_PERMS[l]) out.add(p);
  return Array.from(out);
}

export function getCell(
  grants: GrantCell[],
  userId: string,
  dataSourceId: string,
): GrantCell | undefined {
  return grants.find((g) => g.userId === userId && g.dataSourceId === dataSourceId);
}

export function hasDirect(cell: GrantCell | undefined): boolean {
  return !!cell?.sources.some((s) => s.kind === "direct");
}

export function hasAny(cell: GrantCell | undefined): boolean {
  return (cell?.permissions.length ?? 0) > 0;
}
