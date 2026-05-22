import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireView } from "@/lib/auth";
import { listToolsFromUpstream, callToolOnUpstream } from "@/lib/mcp/upstream-client";
import type { McpToolResult } from "@/lib/mcp/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ id: string }> };

// Priority list of tool names that act as "list tables" across the various
// upstream MCP servers we've seen. First match wins.
const LIST_TOOL_CANDIDATES = [
  "Objects",         // Skyvia / Devart connectors (Jira, Zoho via Skyvia)
  "list_tables",     // Postgres-shaped connectors
  "list_modules",    // Zoho native
  "list_objects",    // generic
  "tables",          // some implementations
];

type TablesResponse = {
  tables: string[] | null;
  raw: string | null;
  source: string | null;
  error?: string;
};

type CacheEntry = { value: TablesResponse; expiresAt: number };
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60_000;

export async function GET(request: Request, { params }: RouteCtx) {
  const auth = await requireView("connections");
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  const refresh = new URL(request.url).searchParams.get("refresh") === "1";

  if (!refresh) {
    const hit = cache.get(id);
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.value);
    }
  }

  const ds = await prisma.dataSource.findUnique({
    where: { id },
    select: { id: true, type: true, upstreamUrl: true, configEncrypted: true, name: true },
  });
  if (!ds) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }

  const connector = {
    id: ds.id,
    type: ds.type,
    upstreamUrl: ds.upstreamUrl,
    configEncrypted: ds.configEncrypted,
  };

  let tools;
  try {
    tools = await listToolsFromUpstream(connector);
  } catch (err) {
    const value: TablesResponse = {
      tables: null,
      raw: null,
      source: null,
      error: `Upstream tool list failed: ${err instanceof Error ? err.message : String(err)}`,
    };
    return NextResponse.json(value);
  }

  const toolNames = new Set(tools.map((t) => t.name));
  const match = LIST_TOOL_CANDIDATES.find((n) => toolNames.has(n));
  if (!match) {
    const value: TablesResponse = {
      tables: null,
      raw: null,
      source: null,
      error: `No table-listing tool available for this connector type (looked for: ${LIST_TOOL_CANDIDATES.join(", ")}).`,
    };
    return NextResponse.json(value);
  }

  let result: McpToolResult;
  try {
    result = await callToolOnUpstream(connector, match, {});
  } catch (err) {
    const value: TablesResponse = {
      tables: null,
      raw: null,
      source: match,
      error: `Calling '${match}' failed: ${err instanceof Error ? err.message : String(err)}`,
    };
    return NextResponse.json(value);
  }

  const raw = extractText(result);
  const tables = parseTableNames(raw);

  const value: TablesResponse = { tables, raw, source: match };
  cache.set(id, { value, expiresAt: Date.now() + TTL_MS });
  return NextResponse.json(value);
}

function extractText(result: McpToolResult): string {
  if (!result?.content || !Array.isArray(result.content)) return "";
  return result.content
    .filter((c): c is { type: "text"; text: string } => c?.type === "text" && typeof c.text === "string")
    .map((c) => c.text)
    .join("\n")
    .trim();
}

const NAME_FIELDS = ["name", "Name", "TableName", "table_name", "object_name", "ObjectName", "module", "fullName"];

// Best-effort: try JSON shapes first, then CSV. Skyvia's `Objects` tool
// returns CSV like `fullName,name,queryable\nIssues,Issues,true\n...` —
// not JSON.
function parseTableNames(raw: string): string[] | null {
  if (!raw) return null;
  return parseAsJson(raw) ?? parseAsCsv(raw);
}

function parseAsJson(raw: string): string[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  // Shape: ["table1", "table2"]
  if (Array.isArray(parsed) && parsed.every((x) => typeof x === "string")) {
    return parsed as string[];
  }

  // Shape: [{ name: "..." }, ...]
  if (Array.isArray(parsed)) {
    const out: string[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        for (const f of NAME_FIELDS) {
          if (typeof obj[f] === "string") {
            out.push(obj[f] as string);
            break;
          }
        }
      }
    }
    return out.length > 0 ? out : null;
  }

  // Shape: { objects: [...] } / { tables: [...] } / { results: [...] }
  if (parsed && typeof parsed === "object") {
    const o = parsed as Record<string, unknown>;
    for (const key of ["objects", "tables", "results", "data", "items", "rows"]) {
      const inner = o[key];
      if (Array.isArray(inner)) {
        return parseAsJson(JSON.stringify(inner));
      }
    }
  }

  return null;
}

// CSV: first line is headers, find the column that matches one of NAME_FIELDS,
// extract that column from each row. If a `queryable` column exists, drop
// rows where it's not "true" (Skyvia marks read-only/non-queryable objects).
function parseAsCsv(raw: string): string[] | null {
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return null;
  const headers = splitCsvLine(lines[0]);
  if (headers.length < 2) return null;
  const nameIdx = headers.findIndex((h) => NAME_FIELDS.includes(h.trim()));
  if (nameIdx < 0) return null;
  const queryableIdx = headers.findIndex((h) => h.trim().toLowerCase() === "queryable");

  const out: string[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    if (cells.length <= nameIdx) continue;
    if (queryableIdx >= 0 && cells[queryableIdx]?.trim().toLowerCase() !== "true") continue;
    const name = cells[nameIdx]?.trim();
    if (name) out.push(name);
  }
  if (out.length === 0) return null;
  // De-dupe while preserving order.
  const seen = new Set<string>();
  return out.filter((n) => (seen.has(n) ? false : (seen.add(n), true)));
}

function splitCsvLine(line: string): string[] {
  // Minimal CSV split. Doesn't handle embedded quotes/commas — fine for the
  // Skyvia outputs we've seen which are plain `a,b,c`.
  return line.split(",");
}
