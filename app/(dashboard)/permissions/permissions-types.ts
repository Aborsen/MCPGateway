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
