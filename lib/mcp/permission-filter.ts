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
  // Connection-wide hard blocklist from DataSource.blockedTables. Applied
  // independently of allowedTables — even if a workspace explicitly allows
  // a table, the connection's blocklist wins. null/empty = no global block.
  blockedTables: string[] | null;
  sources: GrantSource[];
};

type MutableAccess = Omit<UserAccess, "permissions" | "allowedTables" | "blockedTables"> & {
  permissions: Set<PermissionLevel>;
  allowedTables: string[] | null;
  blockedTables: string[] | null;
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
    blockedTables?: string | null;
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
      // Connection-wide blocklist is fixed once we see the DataSource; it
      // doesn't union across sources like allowedTables does.
      blockedTables: parseAllowedTables(ds.blockedTables ?? null),
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

// Workspace-scoped access: only the grants that come from this one workspace.
// Used when a user connects via a workspace MCP URL — direct grants and other
// workspaces are NOT merged in, because the URL represents the workspace, not
// the user's full grant set.
export async function getWorkspaceMemberAccess(
  userId: string,
  workspaceId: string,
): Promise<UserAccess[]> {
  const wu = await prisma.workspaceUser.findUnique({
    where: { workspaceId_userId: { workspaceId, userId } },
    include: {
      workspace: {
        include: { dataSources: { include: { dataSource: true } } },
      },
    },
  });
  if (!wu || wu.workspace.deletedAt) return [];

  const perms = parsePermissions(wu.permissions);
  const merged = new Map<string, MutableAccess>();
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

  return Array.from(merged.values()).map((r) => ({
    dataSourceId: r.dataSourceId,
    dataSourceSlug: r.dataSourceSlug,
    dataSourceName: r.dataSourceName,
    dataSourceType: r.dataSourceType,
    upstreamUrl: r.upstreamUrl,
    configEncrypted: r.configEncrypted,
    permissions: r.permissions,
    allowedTables: r.allowedTables,
    blockedTables: r.blockedTables,
    sources: r.sources,
  }));
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
    blockedTables: r.blockedTables,
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

// Heuristic classifier for tools not explicitly recorded in ToolPermission.
// Maps tool names to SQL-flavored verbs: select | insert | update | delete | execute.
// Matches both snake_case (create_record) and PascalCase (CreateRecord, Objects).
// Admins can override per-tool via the Connection detail page (classifiedBy="admin").
export function classifyToolByName(name: string): PermissionLevel {
  const n = name.toLowerCase().replace(/[^a-z]/g, "_");

  // DELETE: destructive operations
  if (/(^|_)(delete|drop|remove|destroy|purge|truncate)(_|$)/.test(n)) return "delete";

  // EXECUTE: arbitrary code/SQL/procedure execution (Skyvia's Execute, SQL run_apex, etc.)
  if (/(^|_)(execute|run|call|invoke|exec|eval)(_|$)/.test(n)) return "execute";

  // INSERT: pure creation
  if (/(^|_)(insert|create|add|new|post)(_|$)/.test(n)) return "insert";

  // UPDATE: mutation of existing rows/records (upsert leans update; transition/assign/etc.)
  if (
    /(^|_)(update|upsert|modify|edit|patch|put|set|write|transition|assign|convert|merge|approve|reject|publish|unpublish|archive|restore)(_|$)/.test(
      n,
    )
  ) {
    return "update";
  }

  // Default: read-only inspection (list_*, get_*, search_*, describe_*, query, etc.)
  return "select";
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

// Argument keys that commonly carry a SQL / SOQL / query string. Order is
// preference order: the first match wins. SKyvia uses `sql`; vendors may
// use `query`/`statement`/`soql`/`command`.
const SQL_ARG_KEYS = ["sql", "query", "statement", "soql", "command"];

// DDL, stored-proc, and privilege keywords that can't be safely
// validated by table-name extraction. If any appear in a SQL string the
// caller submits, we refuse outright when restrictions are in effect.
const SQL_DANGEROUS_KEYWORDS =
  /\b(DROP|TRUNCATE|ALTER|CREATE|EXEC(?:UTE)?|CALL|GRANT|REVOKE|ATTACH|DETACH)\b/i;

// Wrapper keys we look inside one level deep when the SQL isn't at the
// top of the arguments object. Skyvia's MCP wraps the request payload
// under `body` (so the shape is `arguments.body.sql`); some other
// vendors use `request` or `params`. Each is checked in order; first
// match wins.
const SQL_WRAPPER_KEYS = ["body", "request", "params"];

// Pull the SQL string out of a tool's arguments. Checks the top level
// first (`arguments.sql`, `arguments.query`, …), then looks one level
// deep under common wrapper keys (`arguments.body.sql`, etc.). Returns
// null if no recognised key holds a non-empty string.
export function extractSqlFromArgs(args: Record<string, unknown>): string | null {
  for (const k of SQL_ARG_KEYS) {
    const v = args[k];
    if (typeof v === "string" && v.trim().length > 0) return v;
  }
  for (const wrapper of SQL_WRAPPER_KEYS) {
    const w = args[wrapper];
    if (!w || typeof w !== "object") continue;
    const inner = w as Record<string, unknown>;
    for (const k of SQL_ARG_KEYS) {
      const v = inner[k];
      if (typeof v === "string" && v.trim().length > 0) return v;
    }
  }
  return null;
}

// Best-effort SQL table extraction. Returns:
//   - string[] : the set of distinct table identifiers referenced via
//                FROM / JOIN / INTO / UPDATE / MERGE INTO clauses.
//   - null     : the SQL contains a dangerous keyword (DDL / proc /
//                privilege op) OR no recognisable table references at
//                all. The caller MUST treat null as "refuse, can't
//                validate" — this is the fail-closed mode for queries
//                we don't understand (JQL, stored procs, etc.).
//
// Stripping rules applied in order:
//   1. Block comments  /* ... */
//   2. Line comments   -- ... \n
//   3. String literals 'foo from bar' — replaced with empty quotes so
//      they can't hide FROM/JOIN as fake table references.
//
// Identifier normalisation: a match like `dbo."Issues"` becomes `Issues`
// (last dot-separated segment, surrounding quotes stripped).
export function extractTablesFromSql(sql: string): string[] | null {
  if (!sql || typeof sql !== "string") return null;

  const cleaned = sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ");

  if (SQL_DANGEROUS_KEYWORDS.test(cleaned)) return null;

  const noStrings = cleaned.replace(/'(?:[^'\\]|\\.|'')*'/g, "''");

  const re =
    /(?:^|[\s,(])\s*(?:FROM|JOIN|INTO|UPDATE|MERGE\s+INTO)\s+([\w$."'`[\]]+)/gi;
  const tables = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(noStrings))) {
    const raw = m[1];
    const last = raw.split(".").pop() ?? raw;
    const normalised = last.replace(/^["`[]|["`\]]$/g, "");
    if (normalised && /^[\w$]+$/.test(normalised)) {
      tables.add(normalised);
    }
  }
  if (tables.size === 0) return null;
  return Array.from(tables);
}

// True when a tool can target any table — execute-level tools (Skyvia's
// `Execute`, raw SQL `query`, `run_soql`, `run_apex`, vendor `RunReport`,
// etc.) have no observable table argument we can validate, so when any
// table restriction (allowedTables / blockedTables) is in play they must
// be refused outright. We trust the resolved level (admin override or the
// classifyToolByName heuristic) plus the hard-coded SQL_LIKE_TOOLS list
// as a backstop for names the heuristic still maps to `select` (mainly
// raw `query`).
export function isTableBypassTool(
  toolName: string,
  resolvedLevel: PermissionLevel,
): boolean {
  return resolvedLevel === "execute" || isRawQueryTool(toolName);
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

// Tool names the upstream uses to LIST tables/objects. Their text results
// get filtered server-side so users never see tables outside the allowed
// list. Add to this set when adopting new upstream MCP servers.
export const LIST_TABLES_TOOL_NAMES = new Set([
  "Objects",         // Skyvia / Devart connectors
  "list_tables",     // Postgres-style
  "list_resources",  // generic
  "list_modules",    // Zoho native
  "list_objects",    // generic
  "tables",
]);

const NAME_FIELDS = [
  "name",
  "Name",
  "TableName",
  "table_name",
  "object_name",
  "ObjectName",
  "module",
  "fullName",
];

// Filters a list-tables tool's text response down to only the allowed tables.
// Handles JSON (array of strings, array of objects with a name field,
// wrapped { objects/tables/results: [] }), Markdown pipe-tables (Skyvia's
// default `responseFormat: "Markdown"` output), and CSV (header + rows).
// Returns the original text unchanged if no shape matches — better to
// over-show than corrupt the response.
export function filterListedTablesText(raw: string, allowed: string[]): string {
  if (!raw) return raw;
  const allowedLower = new Set(allowed.map((t) => t.toLowerCase()));
  return (
    filterAsJson(raw, allowedLower, "allow") ??
    filterAsMarkdownTable(raw, allowedLower, "allow") ??
    filterAsCsv(raw, allowedLower, "allow") ??
    raw
  );
}

// Inverse — drop blocked tables from a list response. Used by the
// connection-wide blocklist when no workspace allowlist is in play.
export function dropBlockedTablesText(raw: string, blocked: string[]): string {
  if (!raw || blocked.length === 0) return raw;
  const blockedLower = new Set(blocked.map((t) => t.toLowerCase()));
  return (
    filterAsJson(raw, blockedLower, "deny") ??
    filterAsMarkdownTable(raw, blockedLower, "deny") ??
    filterAsCsv(raw, blockedLower, "deny") ??
    raw
  );
}

type Mode = "allow" | "deny";

function keep(mode: Mode, set: Set<string>, name: string): boolean {
  return mode === "allow" ? set.has(name) : !set.has(name);
}

function filterAsJson(raw: string, set: Set<string>, mode: Mode): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const filtered = filterParsedValue(parsed, set, mode);
  if (filtered === undefined) return null;
  return JSON.stringify(filtered, null, 2);
}

function filterParsedValue(value: unknown, set: Set<string>, mode: Mode): unknown {
  // Array of strings
  if (Array.isArray(value) && value.every((x) => typeof x === "string")) {
    return (value as string[]).filter((s) => keep(mode, set, s.toLowerCase()));
  }
  // Array of objects with a name field
  if (Array.isArray(value)) {
    return value.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const obj = item as Record<string, unknown>;
      for (const f of NAME_FIELDS) {
        const v = obj[f];
        if (typeof v === "string") return keep(mode, set, v.toLowerCase());
      }
      // In allow mode an unknown row stays out; in deny mode it stays in.
      return mode === "deny";
    });
  }
  // Object wrapping a list
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    for (const key of ["objects", "tables", "results", "data", "items", "rows"]) {
      if (Array.isArray(o[key])) {
        return { ...o, [key]: filterParsedValue(o[key], set, mode) };
      }
    }
  }
  return undefined;
}

function filterAsCsv(raw: string, set: Set<string>, mode: Mode): string | null {
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length < 2) return null;
  const headers = lines[0].split(",");
  if (headers.length < 2) return null;
  const nameIdx = headers.findIndex((h) => NAME_FIELDS.includes(h.trim()));
  if (nameIdx < 0) return null;

  const out: string[] = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split(",");
    const name = cells[nameIdx]?.trim();
    if (name && keep(mode, set, name.toLowerCase())) out.push(lines[i]);
  }
  return out.join("\n");
}

// Markdown pipe-table parser. Skyvia's default `responseFormat: "Markdown"`
// emits tables like:
//
//   | fullName | Description       |
//   | -------- | ----------------- |
//   | Issues   | Atlassian issues  |
//   | Projects | Project metadata  |
//
// We find the header row, locate a name column (matching NAME_FIELDS),
// preserve the header + separator rows, and filter the data rows. Lines
// that don't start with `|` are passed through unchanged (so any prose
// around the table survives).
function filterAsMarkdownTable(raw: string, set: Set<string>, mode: Mode): string | null {
  const lines = raw.split(/\r?\n/);
  // Find the first table-looking block.
  let headerIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) continue;
    // The next non-empty line must be a separator row (cells of dashes/colons).
    const next = (lines[i + 1] ?? "").trim();
    if (!next.startsWith("|")) continue;
    const sepCells = splitMdRow(next);
    if (sepCells.length === 0) continue;
    if (sepCells.every((c) => /^:?-+:?$/.test(c.trim()))) {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx < 0) return null;

  const headers = splitMdRow(lines[headerIdx]);
  const nameIdx = headers.findIndex((h) => NAME_FIELDS.includes(h.trim()));
  if (nameIdx < 0) return null;

  const sepIdx = headerIdx + 1;
  const out: string[] = lines.slice(0, sepIdx + 1); // prose + header + separator
  for (let i = sepIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    // Once we hit a non-table line, dump the rest of the document as-is
    // (Markdown often has prose after the table).
    if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) {
      out.push(...lines.slice(i));
      break;
    }
    const cells = splitMdRow(line);
    const name = cells[nameIdx]?.trim();
    if (name && keep(mode, set, name.toLowerCase())) out.push(line);
  }
  return out.join("\n");
}

// Split a Markdown pipe-table row into its cells. Strips the leading and
// trailing pipes and handles escaped pipes (`\|`) which Skyvia uses when
// a cell value itself contains a `|`.
function splitMdRow(row: string): string[] {
  const trimmed = row.trim();
  if (!trimmed.startsWith("|") || !trimmed.endsWith("|")) return [];
  const inner = trimmed.slice(1, -1);
  // Split on unescaped pipes. \| is escaped; everything else is a separator.
  const cells: string[] = [];
  let buf = "";
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "\\" && inner[i + 1] === "|") {
      buf += "|";
      i++;
      continue;
    }
    if (ch === "|") {
      cells.push(buf);
      buf = "";
      continue;
    }
    buf += ch;
  }
  cells.push(buf);
  return cells;
}
