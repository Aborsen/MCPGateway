import { prisma } from "@/lib/db";
import { parseAllowedTables, parsePermissions } from "@/lib/json";
import type { PermissionLevel } from "./types";

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

export type UserAccess = {
  dataSourceId: string;
  dataSourceSlug: string;
  dataSourceName: string;
  dataSourceType: string;
  upstreamUrl: string;
  configEncrypted: string | null;
  permissions: Set<PermissionLevel>;
  allowedTables: string[] | null;
  sources: GrantSource[];
};

type MutableAccess = Omit<UserAccess, "permissions" | "allowedTables"> & {
  permissions: Set<PermissionLevel>;
  allowedTables: string[] | null;
  // true if any contributing source had `null` (= all tables)
  hadNullTables: boolean;
};

function ensureRow(
  map: Map<string, MutableAccess>,
  ds: {
    id: string;
    slug: string;
    name: string;
    type: string;
    upstreamUrl: string;
    configEncrypted: string | null;
  },
): MutableAccess {
  let row = map.get(ds.id);
  if (!row) {
    row = {
      dataSourceId: ds.id,
      dataSourceSlug: ds.slug,
      dataSourceName: ds.name,
      dataSourceType: ds.type,
      upstreamUrl: ds.upstreamUrl,
      configEncrypted: ds.configEncrypted,
      permissions: new Set<PermissionLevel>(),
      allowedTables: [],
      hadNullTables: false,
      sources: [],
    };
    map.set(ds.id, row);
  }
  return row;
}

function mergeTables(row: MutableAccess, incoming: string[] | null) {
  if (incoming === null) {
    row.hadNullTables = true;
    row.allowedTables = null;
    return;
  }
  if (row.hadNullTables) return; // null already wins
  const set = new Set<string>(row.allowedTables ?? []);
  for (const t of incoming) set.add(t);
  row.allowedTables = Array.from(set);
}

export async function getUserAccess(userId: string): Promise<UserAccess[]> {
  const [workspaceUsers, directGrants] = await Promise.all([
    prisma.workspaceUser.findMany({
      where: { userId, workspace: { deletedAt: null } },
      include: {
        workspace: {
          include: { dataSources: { include: { dataSource: true } } },
        },
      },
    }),
    prisma.userDataSourceAccess.findMany({
      where: { userId },
      include: { dataSource: true },
    }),
  ]);

  const merged = new Map<string, MutableAccess>();

  for (const wu of workspaceUsers) {
    const perms = parsePermissions(wu.permissions);
    for (const wds of wu.workspace.dataSources) {
      const allowed = parseAllowedTables(wds.allowedTables);
      const row = ensureRow(merged, wds.dataSource);
      for (const p of perms) row.permissions.add(p);
      mergeTables(row, allowed);
      row.sources.push({
        kind: "workspace",
        workspaceId: wu.workspace.id,
        workspaceName: wu.workspace.name,
        permissions: perms,
        allowedTables: allowed,
      });
    }
  }

  for (const g of directGrants) {
    const perms = parsePermissions(g.permissions);
    const allowed = parseAllowedTables(g.allowedTables);
    const row = ensureRow(merged, g.dataSource);
    for (const p of perms) row.permissions.add(p);
    mergeTables(row, allowed);
    row.sources.push({
      kind: "direct",
      permissions: perms,
      allowedTables: allowed,
    });
  }

  return Array.from(merged.values()).map((r) => ({
    dataSourceId: r.dataSourceId,
    dataSourceSlug: r.dataSourceSlug,
    dataSourceName: r.dataSourceName,
    dataSourceType: r.dataSourceType,
    upstreamUrl: r.upstreamUrl,
    configEncrypted: r.configEncrypted,
    permissions: r.permissions,
    allowedTables: r.allowedTables,
    sources: r.sources,
  }));
}

export async function getToolLevel(
  dataSourceId: string,
  toolName: string,
): Promise<PermissionLevel> {
  const tp = await prisma.toolPermission.findUnique({
    where: { dataSourceId_toolName: { dataSourceId, toolName } },
  });
  if (tp) return tp.level.toLowerCase() as PermissionLevel;
  return classifyToolByName(toolName);
}

// Heuristic classifier for tools not explicitly seeded/recorded in ToolPermission.
// Matches both snake_case (create_record) and PascalCase (CreateRecord, Objects).
//
// Ambiguous verbs (Execute, Run, Send, Trigger, Start, Stop, Cancel, Enable,
// Disable) are intentionally NOT in the WRITE list — many connectors use
// "Execute" for SELECT-style queries (Skyvia, generic SQL bridges). Admins
// can override per-tool by setting the ToolPermission row to classifiedBy="admin".
export function classifyToolByName(name: string): PermissionLevel {
  const n = name.toLowerCase().replace(/[^a-z]/g, "_");
  if (/(^|_)(delete|drop|remove|destroy|purge|truncate)(_|$)/.test(n)) return "delete";
  if (
    /(^|_)(create|update|upsert|insert|set|add|write|modify|transition|assign|convert|merge|patch|edit|put|post|approve|reject|publish|unpublish|archive|restore)(_|$)/.test(
      n,
    )
  ) {
    return "write";
  }
  return "read";
}

const TABLE_ARG_KEYS = ["table_name", "table", "module", "object_name", "objectName", "resource"];

export function extractTableFromArgs(args: Record<string, unknown>): string | null {
  for (const k of TABLE_ARG_KEYS) {
    const v = args[k];
    if (typeof v === "string") return v;
  }
  return null;
}

const SQL_LIKE_TOOLS = new Set(["query", "run_soql", "execute_ddl", "run_apex"]);

export function isRawQueryTool(toolName: string): boolean {
  return SQL_LIKE_TOOLS.has(toolName);
}

export function filterListedTablesPayload(
  payload: unknown,
  allowedTables: string[],
): unknown {
  if (typeof payload !== "object" || payload === null) return payload;
  const obj = payload as Record<string, unknown>;
  if (Array.isArray(obj.tables)) {
    return {
      ...obj,
      tables: obj.tables.filter((t): t is string => typeof t === "string" && allowedTables.includes(t)),
    };
  }
  if (Array.isArray(obj.rows)) {
    return obj;
  }
  return obj;
}
