// Hardcoded catalog of vendor connectors offered through the "Create
// connection" path on /connections. Each entry maps to one of three
// integration "kinds":
//
//   - saas-remote-mcp : vendor hosts a remote MCP server we can proxy to
//                       directly. We just store the OAuth token and set
//                       upstreamUrl to the vendor's MCP endpoint.
//   - saas-adapter    : no vendor MCP server. We host a thin REST->MCP
//                       adapter at /api/upstream-mcp/<adapter>/<id> and
//                       point upstreamUrl back at ourselves.
//   - db-adapter      : same shape as saas-adapter but for databases.
//                       Auth is a connection string / service account /
//                       key-pair instead of OAuth.
//   - coming-soon     : visible in the catalog UI but the card is
//                       disabled until we wire it up.
//
// The catalog is intentionally a constant rather than a DB table — admins
// don't add new vendors, only Devart does. Move to DB later if/when
// per-tenant catalogs become a thing.

export type ConnectorKind =
  | "saas-remote-mcp"
  | "saas-adapter"
  | "db-adapter"
  | "coming-soon";

export type ConnectorAuth =
  | { kind: "oauth"; provider: string }
  | { kind: "connection-string" }
  | { kind: "service-account-json" }
  | { kind: "key-pair" }
  | { kind: "pat"; provider: string };

export type CatalogEntry = {
  slug: string; // stable. ends up in DataSource.slug and the OAuth callback URL
  name: string; // display name
  vendor: string; // raw vendor name (for matching against existing data sources, etc.)
  kind: ConnectorKind;
  type: string; // maps to DataSource.type — drives the dashboard category coloring
  description: string;
  // Visual: a short string for the placeholder badge ("HS" for HubSpot etc.)
  // and a Tailwind class for the badge color.
  badge: { label: string; classes: string };
  // Auth metadata. Only relevant for non-"coming-soon" entries.
  auth?: ConnectorAuth;
  // For saas-remote-mcp: where the vendor hosts their MCP server.
  // For saas-adapter / db-adapter: undefined (the adapter slug lives in
  // `adapter` and we construct the URL at create time).
  remoteMcpUrl?: string;
  // For saas-adapter / db-adapter: which adapter file to dispatch to.
  adapter?: string;
};

export const CONNECTOR_CATALOG: CatalogEntry[] = [
  // ---- v1.0 — SaaS remote MCP (vendor hosts the MCP server) ----
  {
    slug: "hubspot",
    name: "HubSpot",
    vendor: "HubSpot",
    kind: "saas-remote-mcp",
    type: "marketing",
    description: "Contacts, companies, deals, tickets, marketing campaigns.",
    badge: { label: "HS", classes: "bg-orange-500/20 text-orange-400 border-orange-500/40" },
    auth: { kind: "oauth", provider: "hubspot" },
    remoteMcpUrl: "https://mcp.hubspot.com/anthropic",
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    vendor: "Salesforce",
    kind: "saas-remote-mcp",
    type: "sales",
    description: "Accounts, opportunities, leads, custom objects.",
    badge: { label: "SF", classes: "bg-sky-500/20 text-sky-400 border-sky-500/40" },
    auth: { kind: "oauth", provider: "salesforce" },
    remoteMcpUrl: "https://api.salesforce.com/mcp",
  },
  {
    slug: "supabase",
    name: "Supabase",
    vendor: "Supabase",
    kind: "saas-remote-mcp",
    type: "database",
    description: "Postgres-backed Supabase projects: tables, RPCs, auth users.",
    badge: { label: "SB", classes: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
    auth: { kind: "oauth", provider: "supabase" },
    remoteMcpUrl: "https://mcp.supabase.com",
  },

  // ---- v1.0 — Zoho CRM (REST->MCP adapter we host) ----
  {
    slug: "zoho-crm",
    name: "Zoho CRM",
    vendor: "Zoho",
    kind: "saas-adapter",
    type: "sales",
    description: "Zoho CRM modules: leads, contacts, accounts, deals, custom modules.",
    badge: { label: "Z", classes: "bg-red-500/20 text-red-400 border-red-500/40" },
    auth: { kind: "oauth", provider: "zoho-crm" },
    adapter: "zoho-crm",
  },

  // ---- v1.1 — DB adapters (we run thin Next.js MCP servers on top of native DB drivers) ----
  {
    slug: "postgres",
    name: "Postgres",
    vendor: "PostgreSQL",
    kind: "coming-soon",
    type: "database",
    description: "Self-hosted or managed Postgres via connection string.",
    badge: { label: "PG", classes: "bg-indigo-500/20 text-indigo-400 border-indigo-500/40" },
    auth: { kind: "connection-string" },
    adapter: "postgres",
  },
  {
    slug: "bigquery",
    name: "BigQuery",
    vendor: "Google Cloud",
    kind: "coming-soon",
    type: "database",
    description: "Google BigQuery datasets via service-account JSON.",
    badge: { label: "BQ", classes: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
    auth: { kind: "service-account-json" },
    adapter: "bigquery",
  },
  {
    slug: "snowflake",
    name: "Snowflake",
    vendor: "Snowflake",
    kind: "coming-soon",
    type: "database",
    description: "Snowflake warehouses via key-pair auth.",
    badge: { label: "SN", classes: "bg-cyan-500/20 text-cyan-400 border-cyan-500/40" },
    auth: { kind: "key-pair" },
    adapter: "snowflake",
  },
  {
    slug: "databricks",
    name: "Databricks",
    vendor: "Databricks",
    kind: "coming-soon",
    type: "database",
    description: "Databricks SQL warehouses via PAT or OAuth.",
    badge: { label: "DB", classes: "bg-rose-500/20 text-rose-400 border-rose-500/40" },
    auth: { kind: "pat", provider: "databricks" },
    adapter: "databricks",
  },

  // ---- visible-only (catalog completeness; not yet wired up) ----
  {
    slug: "vertica",
    name: "Vertica",
    vendor: "Micro Focus",
    kind: "coming-soon",
    type: "database",
    description: "OpenText/Micro Focus Vertica analytics database.",
    badge: { label: "V", classes: "bg-fuchsia-500/20 text-fuchsia-400 border-fuchsia-500/40" },
  },
  {
    slug: "google-drive",
    name: "Google Drive",
    vendor: "Google",
    kind: "coming-soon",
    type: "operations",
    description: "Files and folders in Google Drive.",
    badge: { label: "GD", classes: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  },
  {
    slug: "google-sheets",
    name: "Google Sheets",
    vendor: "Google",
    kind: "coming-soon",
    type: "operations",
    description: "Read and write Google Sheets.",
    badge: { label: "GS", classes: "bg-green-500/20 text-green-400 border-green-500/40" },
  },
  {
    slug: "onedrive",
    name: "Microsoft OneDrive",
    vendor: "Microsoft",
    kind: "coming-soon",
    type: "operations",
    description: "Files and folders in OneDrive via Microsoft Graph.",
    badge: { label: "OD", classes: "bg-blue-500/20 text-blue-400 border-blue-500/40" },
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    vendor: "Google",
    kind: "coming-soon",
    type: "performance",
    description: "Campaigns, ad groups, performance reporting.",
    badge: { label: "GA", classes: "bg-amber-500/20 text-amber-400 border-amber-500/40" },
  },
  {
    slug: "meta-ads",
    name: "Meta Ads",
    vendor: "Meta",
    kind: "coming-soon",
    type: "performance",
    description: "Facebook/Instagram ads accounts, campaigns, reporting.",
    badge: { label: "MA", classes: "bg-violet-500/20 text-violet-400 border-violet-500/40" },
  },
];

export function findCatalogEntry(slug: string): CatalogEntry | undefined {
  return CONNECTOR_CATALOG.find((c) => c.slug === slug);
}

// True iff the user can click through and finish configuring this connector
// today. "coming-soon" cards render but the CTA is disabled.
export function isCatalogEntryReady(entry: CatalogEntry): boolean {
  return entry.kind !== "coming-soon";
}
