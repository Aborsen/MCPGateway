import { prisma } from "@/lib/db";
import { parseAllowedTables, parsePermissions } from "@/lib/json";
import type { PermissionLevel } from "./types";

export type UserAccess = {
  dataSourceId: string;
  dataSourceSlug: string;
  dataSourceName: string;
  dataSourceType: string;
  upstreamUrl: string;
  configEncrypted: string | null;
  permissions: Set<PermissionLevel>;
  allowedTables: string[] | null;
};

export async function getUserAccess(userId: string): Promise<UserAccess[]> {
  const workspaceUsers = await prisma.workspaceUser.findMany({
    where: { userId, workspace: { deletedAt: null } },
    include: {
      workspace: {
        include: {
          dataSources: { include: { dataSource: true } },
        },
      },
    },
  });

  const merged = new Map<string, UserAccess>();
  for (const wu of workspaceUsers) {
    const perms = new Set<PermissionLevel>(parsePermissions(wu.permissions));
    for (const wds of wu.workspace.dataSources) {
      const allowed = parseAllowedTables(wds.allowedTables);
      const ds = wds.dataSource;
      const existing = merged.get(ds.id);
      if (existing) {
        for (const p of perms) existing.permissions.add(p);
        if (existing.allowedTables === null || allowed === null) {
          existing.allowedTables = null;
        } else {
          existing.allowedTables = Array.from(new Set([...existing.allowedTables, ...allowed]));
        }
      } else {
        merged.set(ds.id, {
          dataSourceId: ds.id,
          dataSourceSlug: ds.slug,
          dataSourceName: ds.name,
          dataSourceType: ds.type,
          upstreamUrl: ds.upstreamUrl,
          configEncrypted: ds.configEncrypted,
          permissions: new Set(perms),
          allowedTables: allowed,
        });
      }
    }
  }

  return Array.from(merged.values());
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

// Heuristic classifier for tools not explicitly seeded in ToolPermission.
// Matches both snake_case (create_record) and PascalCase (CreateRecord, Objects).
//
// Ambiguous verbs (Execute, Run, Send, Trigger, Start, Stop, Cancel, Enable,
// Disable) are intentionally NOT in the WRITE list — many connectors use
// "Execute" for SELECT-style queries (Skyvia, generic SQL bridges). Admins
// can override per-tool by seeding the ToolPermission table.
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

const TABLE_ARG_KEYS = ["table_name", "table", "module", "object_name", "resource"];

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
    return { ...obj, tables: obj.tables.filter((t): t is string => typeof t === "string" && allowedTables.includes(t)) };
  }
  if (Array.isArray(obj.rows)) {
    return obj;
  }
  return obj;
}
