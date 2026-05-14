import type { McpTool, McpToolResult } from "@/lib/mcp/types";
import type { AdapterContext, UpstreamAdapter } from "./types";

// Salesforce REST -> MCP adapter. Salesforce is unusual in that the API
// base URL is per-org — the OAuth callback gives us instance_url (which
// looks like https://acme.my.salesforce.com), and the adapter prefixes
// every request with `${instance_url}/services/data/${apiVersion}/`.
//
// We accept apiVersion from cfg.extra (set by the connect dialog under
// Advanced Settings); defaults to v60.0 if missing.
//
// PAT support: false. Salesforce session tokens don't authenticate REST
// requests in the same way OAuth tokens do (they need to be obtained via
// SOAP login first), so we require OAuth.

const DEFAULT_API_VERSION = "v60.0";

function apiBase(ctx: AdapterContext): string {
  const instance = ctx.cfg.extra?.instanceUrl;
  if (!instance) {
    throw new Error(
      "Salesforce adapter is missing instance_url. Re-run the OAuth flow so the org's instance URL is captured.",
    );
  }
  const version = ctx.cfg.extra?.apiVersion || DEFAULT_API_VERSION;
  return `${instance.replace(/\/$/, "")}/services/data/${version}`;
}

async function sfFetch(
  ctx: AdapterContext,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!ctx.accessToken) throw new Error("Salesforce adapter called without an access token");
  const res = await fetch(`${apiBase(ctx)}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ctx.accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Salesforce ${res.status}: ${text.slice(0, 300)}`);
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
    name: "query",
    description:
      "Run a SOQL query. Raw-SQL-style — gated by table allowlists at the gateway, like any raw-query tool.",
    inputSchema: {
      type: "object",
      properties: { soql: { type: "string", minLength: 1 } },
      required: ["soql"],
      additionalProperties: false,
    },
  },
  {
    name: "list_objects",
    description: "List all SObject types in this org.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "describe_object",
    description: "Describe a single SObject — fields, types, picklist values.",
    inputSchema: {
      type: "object",
      properties: { object: { type: "string", minLength: 1 } },
      required: ["object"],
      additionalProperties: false,
    },
  },
  {
    name: "get_record",
    description: "Fetch a single record by SObject + ID.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
        fields: { type: "string", description: "Comma-separated field list. Optional." },
      },
      required: ["object", "id"],
      additionalProperties: false,
    },
  },
  {
    name: "create_record",
    description: "Create a record of the given SObject type.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string", minLength: 1 },
        data: { type: "object", additionalProperties: true },
      },
      required: ["object", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "update_record",
    description: "Update a record by SObject + ID. `data` is the partial field map to apply.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
        data: { type: "object", additionalProperties: true },
      },
      required: ["object", "id", "data"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_record",
    description: "Delete a record by SObject + ID.",
    inputSchema: {
      type: "object",
      properties: {
        object: { type: "string", minLength: 1 },
        id: { type: "string", minLength: 1 },
      },
      required: ["object", "id"],
      additionalProperties: false,
    },
  },
];

export const salesforceAdapter: UpstreamAdapter = {
  name: "Salesforce",
  listTools: () => TOOLS,
  async callTool(ctx, toolName, args) {
    switch (toolName) {
      case "query": {
        const soql = getString(args, "soql");
        const qs = new URLSearchParams({ q: soql });
        return asResult(await sfFetch(ctx, `/query/?${qs}`));
      }
      case "list_objects":
        return asResult(await sfFetch(ctx, `/sobjects/`));
      case "describe_object": {
        const obj = getString(args, "object");
        return asResult(
          await sfFetch(ctx, `/sobjects/${encodeURIComponent(obj)}/describe`),
        );
      }
      case "get_record": {
        const obj = getString(args, "object");
        const id = getString(args, "id");
        const fields = typeof args.fields === "string" ? args.fields : undefined;
        const path = `/sobjects/${encodeURIComponent(obj)}/${encodeURIComponent(id)}${
          fields ? `?fields=${encodeURIComponent(fields)}` : ""
        }`;
        return asResult(await sfFetch(ctx, path));
      }
      case "create_record": {
        const obj = getString(args, "object");
        const data = args.data;
        if (typeof data !== "object" || data === null) {
          throw new Error("`data` must be a non-null object");
        }
        return asResult(
          await sfFetch(ctx, `/sobjects/${encodeURIComponent(obj)}`, {
            method: "POST",
            body: JSON.stringify(data),
          }),
        );
      }
      case "update_record": {
        const obj = getString(args, "object");
        const id = getString(args, "id");
        const data = args.data;
        if (typeof data !== "object" || data === null) {
          throw new Error("`data` must be a non-null object");
        }
        return asResult(
          await sfFetch(ctx, `/sobjects/${encodeURIComponent(obj)}/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify(data),
          }),
        );
      }
      case "delete_record": {
        const obj = getString(args, "object");
        const id = getString(args, "id");
        return asResult(
          await sfFetch(ctx, `/sobjects/${encodeURIComponent(obj)}/${encodeURIComponent(id)}`, {
            method: "DELETE",
          }),
        );
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  },
};
