import type { McpTool, McpToolResult } from "@/lib/mcp/types";
import type { AdapterContext, UpstreamAdapter } from "./types";

// Thin Zoho CRM v2 adapter — exposes a handful of common CRM operations
// as MCP tools. The OAuth token already carries the scope grant, and the
// generic route refreshes it before passing it to ctx.accessToken.
//
// Zoho returns the regional API base in the token-exchange response as
// `api_domain` (e.g. https://www.zohoapis.com / .eu / .in). We persist that
// in cfg.extra.apiDomain in the OAuth callback; if it's missing for any
// reason, we fall back to the global default.
//
// Supported module names match Zoho's API: Leads / Contacts / Accounts /
// Deals / Tasks. Custom modules can be added once we expose a way to
// configure them from the admin UI (out of scope for v1).

const DEFAULT_API_DOMAIN = "https://www.zohoapis.com";

const MODULES = ["Leads", "Contacts", "Accounts", "Deals", "Tasks"] as const;
type ZohoModule = (typeof MODULES)[number];

function apiBase(ctx: AdapterContext): string {
  const fromExtra = ctx.cfg.extra?.apiDomain;
  return (fromExtra && fromExtra.replace(/\/$/, "")) || DEFAULT_API_DOMAIN;
}

async function zohoFetch(
  ctx: AdapterContext,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!ctx.accessToken) throw new Error("Zoho adapter called without an access token");
  const res = await fetch(`${apiBase(ctx)}${path}`, {
    ...init,
    headers: {
      Authorization: `Zoho-oauthtoken ${ctx.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Zoho ${res.status}: ${text.slice(0, 300)}`);
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

const TOOLS: McpTool[] = [
  {
    name: "list_modules",
    description: "List the standard Zoho CRM modules supported by this connector.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_records",
    description:
      "List records from a Zoho CRM module. Returns up to `pageSize` records (default 50, max 200).",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        pageSize: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        page: { type: "integer", minimum: 1, default: 1 },
        fields: {
          type: "string",
          description:
            "Comma-separated field API names to include. Omit to use Zoho's default response.",
        },
      },
      required: ["module"],
      additionalProperties: false,
    },
  },
  {
    name: "get_record",
    description: "Fetch a single record by its Zoho ID.",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        id: { type: "string", minLength: 1 },
      },
      required: ["module", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_records",
    description:
      "Search records in a module using Zoho's `criteria` parameter (e.g. `(Email:equals:alice@x.com)`).",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        criteria: { type: "string", minLength: 1 },
        pageSize: { type: "integer", minimum: 1, maximum: 200, default: 50 },
      },
      required: ["module", "criteria"],
      additionalProperties: false,
    },
  },
  {
    name: "create_record",
    description: "Create a single record. `data` is a Zoho field-name -> value map.",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        data: { type: "object", additionalProperties: true },
      },
      required: ["module", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "update_record",
    description: "Update a single record by ID. `data` is the partial field map to apply.",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        id: { type: "string", minLength: 1 },
        data: { type: "object", additionalProperties: true },
      },
      required: ["module", "id", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_record",
    description: "Delete a single record by ID. Irreversible.",
    inputSchema: {
      type: "object",
      properties: {
        module: { type: "string", enum: [...MODULES] },
        id: { type: "string", minLength: 1 },
      },
      required: ["module", "id"],
      additionalProperties: false,
    },
  },
];

function getString(args: Record<string, unknown>, key: string): string {
  const v = args[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(`Missing required string argument: ${key}`);
  }
  return v;
}

function getInt(args: Record<string, unknown>, key: string, fallback: number): number {
  const v = args[key];
  if (typeof v === "number" && Number.isFinite(v)) return Math.floor(v);
  if (typeof v === "string" && v.length > 0) {
    const n = parseInt(v, 10);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function getModule(args: Record<string, unknown>): ZohoModule {
  const m = getString(args, "module");
  if (!(MODULES as readonly string[]).includes(m)) {
    throw new Error(`Unknown module '${m}'. Supported: ${MODULES.join(", ")}.`);
  }
  return m as ZohoModule;
}

export const zohoCrmAdapter: UpstreamAdapter = {
  name: "Zoho CRM",
  listTools: () => TOOLS,
  async callTool(ctx, toolName, args) {
    switch (toolName) {
      case "list_modules":
        return asResult({ modules: MODULES });
      case "list_records": {
        const module = getModule(args);
        const pageSize = getInt(args, "pageSize", 50);
        const page = getInt(args, "page", 1);
        const fields = typeof args.fields === "string" ? args.fields : undefined;
        const qs = new URLSearchParams({
          page: String(page),
          per_page: String(Math.min(Math.max(pageSize, 1), 200)),
        });
        if (fields) qs.set("fields", fields);
        return asResult(await zohoFetch(ctx, `/crm/v2/${module}?${qs}`));
      }
      case "get_record": {
        const module = getModule(args);
        const id = getString(args, "id");
        return asResult(await zohoFetch(ctx, `/crm/v2/${module}/${encodeURIComponent(id)}`));
      }
      case "search_records": {
        const module = getModule(args);
        const criteria = getString(args, "criteria");
        const pageSize = getInt(args, "pageSize", 50);
        const qs = new URLSearchParams({
          criteria,
          per_page: String(Math.min(Math.max(pageSize, 1), 200)),
        });
        return asResult(await zohoFetch(ctx, `/crm/v2/${module}/search?${qs}`));
      }
      case "create_record": {
        const module = getModule(args);
        const data = args.data;
        if (typeof data !== "object" || data === null) {
          throw new Error("`data` must be a non-null object");
        }
        return asResult(
          await zohoFetch(ctx, `/crm/v2/${module}`, {
            method: "POST",
            body: JSON.stringify({ data: [data] }),
          }),
        );
      }
      case "update_record": {
        const module = getModule(args);
        const id = getString(args, "id");
        const data = args.data;
        if (typeof data !== "object" || data === null) {
          throw new Error("`data` must be a non-null object");
        }
        return asResult(
          await zohoFetch(ctx, `/crm/v2/${module}/${encodeURIComponent(id)}`, {
            method: "PUT",
            body: JSON.stringify({ data: [data] }),
          }),
        );
      }
      case "delete_record": {
        const module = getModule(args);
        const id = getString(args, "id");
        return asResult(
          await zohoFetch(ctx, `/crm/v2/${module}/${encodeURIComponent(id)}`, {
            method: "DELETE",
          }),
        );
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  },
};
