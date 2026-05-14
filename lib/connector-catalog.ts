// Hardcoded catalog of vendor connectors offered through the "Create
// connection" path on /connections. Every catalog connector that ships is
// served by an MCP adapter we host in this app (under
// /api/upstream-mcp/<adapter>/<connectorId>) — we don't proxy to vendors'
// own MCP servers. This is what lets the UX be consistent across vendors
// and lets connectors work even when the vendor doesn't ship an MCP.
//
// Three kinds:
//   - saas-adapter : OAuth or PAT against a SaaS REST API; we host the
//                    MCP server in this app.
//   - db-adapter   : connection-string / service-account / key-pair
//                    against a database; we host the MCP server in this
//                    app.
//   - coming-soon  : visible in the catalog UI but disabled until wired.
//
// The catalog is intentionally a constant rather than a DB table — admins
// don't add new vendors, only Devart does. Move to DB later if/when
// per-tenant catalogs become a thing.

export type ConnectorKind = "saas-adapter" | "db-adapter" | "coming-soon";

export type ConnectorAuth =
  | { kind: "oauth"; provider: string }
  | { kind: "connection-string" }
  | { kind: "service-account-json" }
  | { kind: "key-pair" }
  | { kind: "pat"; provider: string };

// Per-vendor "Advanced Settings" rendered by the connect dialog. Adapter
// code reads these out of cfg.extra by key.
export type AdvancedSettingDef =
  | {
      key: string;
      label: string;
      kind: "boolean";
      default?: boolean;
      help?: string;
    }
  | {
      key: string;
      label: string;
      kind: "string";
      default?: string;
      placeholder?: string;
      help?: string;
    }
  | {
      key: string;
      label: string;
      kind: "select";
      options: { value: string; label: string }[];
      default?: string;
      help?: string;
    };

export type CatalogEntry = {
  slug: string; // stable. ends up in DataSource.slug and the OAuth callback URL
  name: string; // display name
  vendor: string; // raw vendor name
  kind: ConnectorKind;
  type: string; // maps to DataSource.type — drives dashboard category coloring
  description: string;
  badge: { label: string; classes: string };
  auth?: ConnectorAuth;
  // The adapter file under lib/upstream-adapters/ that knows how to talk
  // to this vendor's API. Required for saas-adapter / db-adapter.
  adapter?: string;
  // Vendor-specific knobs surfaced in the connect dialog. Stored as
  // cfg.extra in the encrypted DataSource config.
  advancedSettings?: AdvancedSettingDef[];
  // If the auth flow supports a Personal Access Token / Private App token
  // path, the dialog renders a paste-token field alongside the OAuth
  // button. True for vendors that publish PAT support; false for vendors
  // that are OAuth-only.
  supportsPat?: boolean;
  // Help text shown above the access-token field — what the field is
  // expected to contain (e.g. "HubSpot Private App access token starting
  // with 'pat-...'").
  patHint?: string;
};

export const CONNECTOR_CATALOG: CatalogEntry[] = [
  // ---- v1.0 — SaaS adapters (we host the MCP server) ----
  {
    slug: "hubspot",
    name: "HubSpot",
    vendor: "HubSpot",
    kind: "saas-adapter",
    type: "marketing",
    description: "Contacts, companies, deals, tickets, marketing campaigns.",
    badge: { label: "HS", classes: "bg-orange-500/20 text-orange-400 border-orange-500/40" },
    auth: { kind: "oauth", provider: "hubspot" },
    adapter: "hubspot",
    supportsPat: true,
    patHint: "HubSpot Private App access token (pat-...) or paste a token from the OAuth popup.",
    advancedSettings: [
      {
        key: "useCustomObjects",
        label: "Include custom objects",
        kind: "boolean",
        default: false,
        help: "If set, list_custom_objects + per-object record tools become available.",
      },
    ],
  },
  {
    slug: "salesforce",
    name: "Salesforce",
    vendor: "Salesforce",
    kind: "saas-adapter",
    type: "sales",
    description: "Accounts, opportunities, leads, custom objects.",
    badge: { label: "SF", classes: "bg-sky-500/20 text-sky-400 border-sky-500/40" },
    auth: { kind: "oauth", provider: "salesforce" },
    adapter: "salesforce",
    supportsPat: false,
    advancedSettings: [
      {
        key: "sandbox",
        label: "Connect to a sandbox org",
        kind: "boolean",
        default: false,
        help: "Use test.salesforce.com login + the org's sandbox API URL.",
      },
      {
        key: "apiVersion",
        label: "Salesforce API version",
        kind: "string",
        default: "v60.0",
        placeholder: "v60.0",
        help: "REST API version path segment, e.g. v60.0.",
      },
    ],
  },
  {
    slug: "supabase",
    name: "Supabase",
    vendor: "Supabase",
    kind: "saas-adapter",
    type: "database",
    description: "Postgres-backed Supabase projects: tables, RPCs, auth users.",
    badge: { label: "SB", classes: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
    // Supabase OAuth is for the management API. Most users will paste a
    // service_role key or anon key from the project settings — so PAT is
    // the primary path.
    auth: { kind: "pat", provider: "supabase" },
    adapter: "supabase",
    supportsPat: true,
    patHint: "Paste the project's service_role key (Project Settings → API).",
    advancedSettings: [
      {
        key: "projectRef",
        label: "Project ref",
        kind: "string",
        placeholder: "abcd1234efgh",
        help: "The project ref from the Supabase URL (https://<projectRef>.supabase.co).",
      },
    ],
  },
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
    supportsPat: false,
    advancedSettings: [
      {
        key: "region",
        label: "Zoho region",
        kind: "select",
        options: [
          { value: "com", label: "US (.com)" },
          { value: "eu", label: "EU (.eu)" },
          { value: "in", label: "India (.in)" },
          { value: "jp", label: "Japan (.jp)" },
          { value: "com.au", label: "Australia (.com.au)" },
        ],
        default: "com",
        help: "Zoho's regional API. Affects both auth and API base URL.",
      },
    ],
  },

  // ---- v1.1 — DB adapters (coming soon) ----
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

  // ---- visible-only ----
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

export function isCatalogEntryReady(entry: CatalogEntry): boolean {
  return entry.kind !== "coming-soon";
}
