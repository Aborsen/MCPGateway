import type { McpTool, McpToolResult } from "@/lib/mcp/types";
import type { AdapterContext, UpstreamAdapter } from "./types";

// Thin HubSpot v3 REST -> MCP adapter. Works for both OAuth access tokens
// (returned by HubSpot's OAuth flow) and Private App tokens (pasted into
// the dialog). Both formats are sent as `Authorization: Bearer <token>`
// against api.hubapi.com — the API doesn't distinguish at the wire level.
//
// Standard CRM objects only by default. cfg.extra.useCustomObjects = "true"
// future-proofs us for exposing custom object tools — not implemented yet
// since HubSpot's custom-object listing requires a schemas API call we
// haven't wired.

const API_BASE = "https://api.hubapi.com";

async function hubspotFetch(
  ctx: AdapterContext,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  if (!ctx.accessToken) throw new Error("HubSpot adapter called without an access token");
  const res = await fetch(`${API_BASE}${path}`, {
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
    throw new Error(`HubSpot ${res.status}: ${text.slice(0, 300)}`);
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

const OBJECT_PROPS: Record<string, string> = {
  contacts: "firstname,lastname,email,phone,company,lifecyclestage,createdate,lastmodifieddate",
  companies: "name,domain,industry,city,country,createdate,hs_lastmodifieddate",
  deals: "dealname,amount,dealstage,pipeline,closedate,createdate,hs_lastmodifieddate",
};

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

const TOOLS: McpTool[] = [
  {
    name: "list_contacts",
    description: "List recent HubSpot contacts.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        after: { type: "string", description: "Pagination cursor returned by a previous call." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_contact",
    description: "Fetch a single contact by its HubSpot ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1 } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_contacts",
    description:
      "Search HubSpot contacts by property value. Equivalent to a single-filter HubSpot search.",
    inputSchema: {
      type: "object",
      properties: {
        property: { type: "string", default: "email" },
        operator: {
          type: "string",
          enum: ["EQ", "NEQ", "CONTAINS_TOKEN", "GT", "LT"],
          default: "EQ",
        },
        value: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: ["value"],
      additionalProperties: false,
    },
  },
  {
    name: "create_contact",
    description: "Create a HubSpot contact. `properties` is a property -> value map.",
    inputSchema: {
      type: "object",
      properties: { properties: { type: "object", additionalProperties: true } },
      required: ["properties"],
      additionalProperties: false,
    },
  },
  {
    name: "update_contact",
    description: "Update a HubSpot contact by ID.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", minLength: 1 },
        properties: { type: "object", additionalProperties: true },
      },
      required: ["id", "properties"],
      additionalProperties: false,
    },
  },
  {
    name: "list_companies",
    description: "List recent HubSpot companies.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        after: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_deals",
    description: "List recent HubSpot deals.",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "integer", minimum: 1, maximum: 100, default: 50 },
        after: { type: "string" },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_deal",
    description: "Fetch a single deal by its HubSpot ID.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1 } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "search_deals",
    description: "Search deals by property + operator + value (single-filter).",
    inputSchema: {
      type: "object",
      properties: {
        property: { type: "string", default: "dealname" },
        operator: {
          type: "string",
          enum: ["EQ", "NEQ", "CONTAINS_TOKEN", "GT", "LT"],
          default: "CONTAINS_TOKEN",
        },
        value: { type: "string", minLength: 1 },
        limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
      },
      required: ["value"],
      additionalProperties: false,
    },
  },
];

async function search(
  ctx: AdapterContext,
  object: "contacts" | "deals",
  property: string,
  operator: string,
  value: string,
  limit: number,
): Promise<unknown> {
  return hubspotFetch(ctx, `/crm/v3/objects/${object}/search`, {
    method: "POST",
    body: JSON.stringify({
      filterGroups: [{ filters: [{ propertyName: property, operator, value }] }],
      limit,
      properties: OBJECT_PROPS[object]?.split(",") ?? [],
    }),
  });
}

export const hubspotAdapter: UpstreamAdapter = {
  name: "HubSpot",
  listTools: () => TOOLS,
  async callTool(ctx, toolName, args) {
    switch (toolName) {
      case "list_contacts": {
        const limit = getInt(args, "limit", 50);
        const qs = new URLSearchParams({
          limit: String(Math.min(Math.max(limit, 1), 100)),
          properties: OBJECT_PROPS.contacts,
        });
        if (typeof args.after === "string" && args.after) qs.set("after", args.after);
        return asResult(await hubspotFetch(ctx, `/crm/v3/objects/contacts?${qs}`));
      }
      case "get_contact": {
        const id = getString(args, "id");
        const qs = new URLSearchParams({ properties: OBJECT_PROPS.contacts });
        return asResult(
          await hubspotFetch(ctx, `/crm/v3/objects/contacts/${encodeURIComponent(id)}?${qs}`),
        );
      }
      case "search_contacts": {
        const value = getString(args, "value");
        const property = typeof args.property === "string" ? args.property : "email";
        const operator = typeof args.operator === "string" ? args.operator : "EQ";
        const limit = Math.min(getInt(args, "limit", 20), 100);
        return asResult(await search(ctx, "contacts", property, operator, value, limit));
      }
      case "create_contact": {
        const properties = args.properties;
        if (typeof properties !== "object" || properties === null) {
          throw new Error("`properties` must be a non-null object");
        }
        return asResult(
          await hubspotFetch(ctx, `/crm/v3/objects/contacts`, {
            method: "POST",
            body: JSON.stringify({ properties }),
          }),
        );
      }
      case "update_contact": {
        const id = getString(args, "id");
        const properties = args.properties;
        if (typeof properties !== "object" || properties === null) {
          throw new Error("`properties` must be a non-null object");
        }
        return asResult(
          await hubspotFetch(ctx, `/crm/v3/objects/contacts/${encodeURIComponent(id)}`, {
            method: "PATCH",
            body: JSON.stringify({ properties }),
          }),
        );
      }
      case "list_companies": {
        const limit = getInt(args, "limit", 50);
        const qs = new URLSearchParams({
          limit: String(Math.min(Math.max(limit, 1), 100)),
          properties: OBJECT_PROPS.companies,
        });
        if (typeof args.after === "string" && args.after) qs.set("after", args.after);
        return asResult(await hubspotFetch(ctx, `/crm/v3/objects/companies?${qs}`));
      }
      case "list_deals": {
        const limit = getInt(args, "limit", 50);
        const qs = new URLSearchParams({
          limit: String(Math.min(Math.max(limit, 1), 100)),
          properties: OBJECT_PROPS.deals,
        });
        if (typeof args.after === "string" && args.after) qs.set("after", args.after);
        return asResult(await hubspotFetch(ctx, `/crm/v3/objects/deals?${qs}`));
      }
      case "get_deal": {
        const id = getString(args, "id");
        const qs = new URLSearchParams({ properties: OBJECT_PROPS.deals });
        return asResult(
          await hubspotFetch(ctx, `/crm/v3/objects/deals/${encodeURIComponent(id)}?${qs}`),
        );
      }
      case "search_deals": {
        const value = getString(args, "value");
        const property = typeof args.property === "string" ? args.property : "dealname";
        const operator =
          typeof args.operator === "string" ? args.operator : "CONTAINS_TOKEN";
        const limit = Math.min(getInt(args, "limit", 20), 100);
        return asResult(await search(ctx, "deals", property, operator, value, limit));
      }
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  },
};
