import type { McpTool, McpToolResult } from "@/lib/mcp/types";
import type { AdapterContext, UpstreamAdapter } from "./types";

// Supabase REST -> MCP adapter on top of PostgREST. The user pastes a
// project's service_role key (or anon key — read-only) in the connect
// dialog, plus the project ref under Advanced Settings. We talk to
// https://<projectRef>.supabase.co/rest/v1/ via PostgREST conventions.
//
// `query` here means "select with PostgREST query params" (e.g.
// `id=eq.123&select=*`), not raw SQL — Supabase doesn't expose a SQL
// HTTP endpoint to non-Management-API auth. For raw SQL, users should
// add a Postgres connection separately once we ship that adapter.

function apiBase(ctx: AdapterContext): string {
  const ref = ctx.cfg.extra?.projectRef;
  if (!ref) {
    throw new Error(
      "Supabase project ref is missing. Set 'Project ref' under Advanced Settings in the connect dialog.",
    );
  }
  return `https://${ref}.supabase.co/rest/v1`;
}

async function pgRest(
  ctx: AdapterContext,
  pathAndQuery: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!ctx.accessToken) throw new Error("Supabase adapter called without an API key");
  const res = await fetch(`${apiBase(ctx)}${pathAndQuery}`, {
    ...init,
    headers: {
      apikey: ctx.accessToken,
      Authorization: `Bearer ${ctx.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Supabase ${res.status}: ${text.slice(0, 300)}`);
  }
  if (!text.trim()) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function asResult(payload: unknown): McpToolResult {
  return {
    content: [
      {
        type: "text",
        text: typeof payload === "string" ? payload : JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function getString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return v;
}

const TOOLS: McpTool[] = [
  {
    name: "list_tables",
    description:
      "List tables in the public schema via PostgREST OpenAPI definitions. Requires service_role key.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "query",
    description:
      "Read rows from a table. `where` is a PostgREST query string like 'id=eq.123&select=*&limit=10'.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", minLength: 1 },
        where: {
          type: "string",
          description:
            "PostgREST query params after '?'. Example: 'status=eq.active&select=id,name&limit=20'.",
        },
      },
      required: ["table"],
      additionalProperties: false,
    },
  },
  {
    name: "insert",
    description: "Insert one or more rows into a table.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", minLength: 1 },
        rows: {
          oneOf: [
            { type: "object", additionalProperties: true },
            { type: "array", items: { type: "object", additionalProperties: true } },
          ],
        },
      },
      required: ["table", "rows"],
      additionalProperties: false,
    },
  },
  {
    name: "update",
    description:
      "Update rows matching `where`. `where` uses PostgREST filter syntax (e.g. 'id=eq.123').",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", minLength: 1 },
        where: { type: "string", minLength: 1 },
        data: { type: "object", additionalProperties: true },
      },
      required: ["table", "where", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "delete",
    description: "Delete rows matching `where`. PostgREST filter syntax.",
    inputSchema: {
      type: "object",
      properties: {
        table: { type: "string", minLength: 1 },
        where: { type: "string", minLength: 1 },
      },
      required: ["table", "where"],
      additionalProperties: false,
    },
  },
];

export const supabaseAdapter: UpstreamAdapter = {
  name: "Supabase",
  listTools: () => TOOLS,
  async callTool(ctx, toolName, args) {
    switch (toolName) {
      case "list_tables": {
        // PostgREST OpenAPI spec at the root lists every exposed table
        // under `definitions`. Return only the names.
        const spec = (await pgRest(ctx, "/")) as { definitions?: Record<string, unknown> } | null;
        const tables = spec?.definitions ? Object.keys(spec.definitions) : [];
        return asResult({ tables });
      }
      case "query": {
        const table = getString(args, "table");
        const where = typeof args.where === "string" ? args.where : "";
        const qs = where ? `?${where.replace(/^\?/, "")}` : "";
        return asResult(await pgRest(ctx, `/${encodeURIComponent(table)}${qs}`));
      }
      case "insert": {
        const table = getString(args, "table");
        const rows = args.rows;
        if (rows == null || (typeof rows !== "object" && !Array.isArray(rows))) {
          throw new Error("`rows` must be an object or an array of objects");
        }
        return asResult(
          await pgRest(ctx, `/${encodeURIComponent(table)}`, {
            method: "POST",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(rows),
          }),
        );
      }
      case "update": {
        const table = getString(args, "table");
        const where = getString(args, "where");
        const data = args.data;
        if (typeof data !== "object" || data === null) {
          throw new Error("`data` must be a non-null object");
        }
        return asResult(
          await pgRest(ctx, `/${encodeURIComponent(table)}?${where.replace(/^\?/, "")}`, {
            method: "PATCH",
            headers: { Prefer: "return=representation" },
            body: JSON.stringify(data),
          }),
        );
      }
      case "delete": {
        const table = getString(args, "table");
        const where = getString(args, "where");
        return asResult(
          await pgRest(ctx, `/${encodeURIComponent(table)}?${where.replace(/^\?/, "")}`, {
            method: "DELETE",
            headers: { Prefer: "return=representation" },
          }),
        );
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  },
};
