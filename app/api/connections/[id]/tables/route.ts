import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
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
  await requireAdmin();
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

// Best-effort: try common shapes the upstream might return.
function parseTableNames(raw: string): string[] | null {
  if (!raw) return null;
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
    const fields = ["name", "Name", "TableName", "table_name", "object_name", "ObjectName", "module"];
    const out: string[] = [];
    for (const item of parsed) {
      if (item && typeof item === "object") {
        const obj = item as Record<string, unknown>;
        for (const f of fields) {
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
        return parseTableNames(JSON.stringify(inner));
      }
    }
  }

  return null;
}
