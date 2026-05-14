# MCP Gateway

A multi-tenant proxy that brokers [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) JSON-RPC traffic from Claude Code (and other MCP clients) to many heterogeneous upstream MCP servers — Jira, HubSpot, Salesforce, Zoho, Postgres, internal services. Permissions, OAuth, table-level allowlists, and a full audit log are enforced at the gateway, so end-users get a single OAuth-secured URL instead of juggling per-vendor tokens.

Built with Next.js 16 + Prisma 7 + Postgres + Auth.js v5 + `oidc-provider`. Deployed on Vercel.

## What it does

1. Admin registers **Connections** in one of two ways:
   - **Create connection** — pick from a built-in catalog (HubSpot, Salesforce, Supabase, Zoho CRM today; more coming). A Skyvia-style modal collects the connection name and an access token (via OAuth popup or pasted PAT), plus per-vendor advanced settings. The gateway **generates its own MCP server** for the new connection — no dependency on whether the vendor ships an MCP.
   - **Existing MCP URL** — paste the URL of an existing remote MCP server (and any auth headers) for anything not in the catalog.
2. Admin creates **Workspaces** that bundle Connections, optionally restricting which tables/objects each workspace can touch.
3. Admin adds **Users** to Workspaces with permission levels (`select | insert | update | delete | execute`), or grants users direct per-Connection access.
4. Each user (or each workspace) gets its own OAuth-secured MCP URL. Claude Code completes a PKCE flow against the gateway, then sends `Authorization: Bearer …` on every JSON-RPC call.
5. Every tool call is permission-checked at both `tools/list` (filter the menu) and `tools/call` (block disallowed actions), then forwarded to the right upstream — and recorded in the **Audit Log** within milliseconds.

## Roles

| Role | Capability |
|---|---|
| `OWNER` | Tenant root. Only role allowed to delete users and reassign roles. Gated by `requireOwner()` in [lib/auth.ts](lib/auth.ts). |
| `ADMIN` | Manages connections, workspaces, permissions, and audit. Gated by `requireAdmin()`. |
| `USER` | No admin UI access. Used only as the OAuth account on the MCP endpoint. |

## Quick start (local)

You need a Postgres database. The easiest path is a free [Neon](https://neon.tech) project (30-second signup).

```bash
# 1. Clone and install
git clone <repo-url> mcp-gateway
cd mcp-gateway
npm install

# 2. Copy the env template and fill in secrets
cp .env.example .env.local
#   - DATABASE_URL    -> your Postgres connection string (use pooled URL on Vercel)
#   - AUTH_SECRET     -> openssl rand -base64 32
#   - MCP_CONFIG_KEY  -> openssl rand -base64 32
#   - OIDC_ISSUER     -> http://localhost:3000  (exact, no trailing slash)
#   - OIDC_COOKIE_KEY -> openssl rand -hex 32
#   - OIDC_JWKS       -> single-line output of: npx tsx scripts/generate-jwks.ts
#   - CRON_SECRET     -> openssl rand -hex 32

# 3. Initialise the DB and seed demo data
npm run db:migrate   # apply committed migrations (use db:push for quick iteration)
npm run db:seed      # admin + 3 users + 5 connections + 2 workspaces

# 4. Run
npm run dev          # http://localhost:3000
```

### Seeded accounts

| Email | Password | Role | Membership |
|---|---|---|---|
| `admin@devart.com` | `admin123` | `OWNER` | Engineering (full access) |
| `alice@devart.com` | `demo123` | `USER`  | Sales Team — `select`, `insert`, `update` on HubSpot / Salesforce / Zoho (restricted to a curated table set) |
| `bob@devart.com`   | `demo123` | `USER`  | Sales Team — `select` only |
| `carol@devart.com` | `demo123` | `USER`  | Engineering — full access on Jira and Postgres, no table restrictions |

All seeded connectors point at `mcp.example.com/*` and resolve through a built-in mock provider, so the whole demo works offline.

## Demo flow

1. Log in as `admin@devart.com` → land on **Dashboard** (live overview of users, connectors, queries, errors).
2. **Connections** → open Jira Cloud → see its tool catalog with per-tool permission overrides.
3. **Connections** → **Add Connection** → **Create connection** → pick HubSpot. The modal opens with a name field, an access-token field, and an advanced-settings section. Paste a HubSpot Private App token (or click **Sign In with HubSpot** if OAuth credentials are configured), Continue — a new MCP-backed HubSpot connection appears in the list. Same flow for Salesforce, Supabase, Zoho CRM. (Postgres / BigQuery / Snowflake / Databricks are visible in the catalog as "Coming soon" cards.)
4. **Workspaces** → **Sales Team** → see HubSpot restricted to `contacts, deals` only. Hit **Copy MCP URL** to grab the workspace's OAuth URL — every member of Sales Team can paste the same URL into their own Claude Code.
5. **Users** → Alice → grab her personal MCP URL (the union of her workspace memberships + direct grants).
6. Drop the URL into Claude Code's `~/.claude.json`:
   ```json
   { "mcpServers": { "mcp-gateway": { "url": "<copied URL>" } } }
   ```
7. Claude Code does the OAuth dance (PKCE), then `tools/list` returns just the tools Alice is allowed to use. Try a write — it succeeds (Alice has `update`). Try a delete — blocked. The action lands in **Audit** in real time.
8. **Specifications** → open the avatar menu at the bottom of the sidebar to read the full architecture/spec inside the app (OWNER/ADMIN-gated).

## Deploying to Vercel

The repo is set up to deploy cleanly with `vercel.json` declaring the audit-prune cron.

1. **Postgres**: provision Neon / Vercel Postgres / Supabase. Use the **pooled** connection string as `DATABASE_URL`.
2. **Environment variables** to set in the Vercel project settings:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Postgres connection string (pooled) |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_TRUST_HOST` | `true` |
   | `MCP_CONFIG_KEY` | `openssl rand -base64 32` — encrypts upstream connector credentials |
   | `OIDC_ISSUER` | Exact deploy origin, no trailing slash (e.g. `https://mcpgateway.vercel.app`) |
   | `OIDC_COOKIE_KEY` | `openssl rand -hex 32` |
   | `OIDC_JWKS` | Output of `npx tsx scripts/generate-jwks.ts`, as a single-line string |
   | `CRON_SECRET` | `openssl rand -hex 32` — Vercel-cron auth for the audit-prune job |
   | `AUDIT_RETENTION_DAYS` | (Optional) days of audit-log rows to keep; defaults to `90` |

   **Optional — connector-catalog OAuth (per vendor you want to enable):**

   | Variable | Used by |
   |---|---|
   | `CONNECTOR_OAUTH_HUBSPOT_CLIENT_ID` / `_CLIENT_SECRET` | HubSpot catalog connector |
   | `CONNECTOR_OAUTH_SALESFORCE_CLIENT_ID` / `_CLIENT_SECRET` | Salesforce catalog connector |
   | `CONNECTOR_OAUTH_ZOHO_CRM_CLIENT_ID` / `_CLIENT_SECRET` | Zoho CRM catalog connector |
   | `CONNECTOR_OAUTH_SUPABASE_CLIENT_ID` / `_CLIENT_SECRET` | Supabase catalog connector (optional — Supabase works with a pasted service_role key too) |

   Each vendor needs an OAuth app registered with redirect URI `${OIDC_ISSUER}/api/connections/oauth/<slug>/callback` (slugs: `hubspot`, `salesforce`, `zoho-crm`, `supabase`). Without these, the catalog card still renders and pasted PATs still work — only the "Sign In with X" button is disabled.

   > **Preview-deploy gotcha:** `OIDC_ISSUER` must match the request origin exactly. Vercel preview deployments use different hostnames than the prod alias, so the OAuth flow only works on the prod alias unless you scope `OIDC_ISSUER` per-environment.

3. **Bootstrap the schema and seed** — run locally against the prod URL once. The seed refuses to run with `NODE_ENV=production` unless you pass `--allow-prod` (it deletes every row in every table before re-inserting demo data, so the guard is deliberate):
   ```bash
   DATABASE_URL="<prod url>" npm run db:migrate
   NODE_ENV=production DATABASE_URL="<prod url>" npx tsx prisma/seed.ts --allow-prod
   ```
4. **Redeploy** so the env vars take effect.
5. (Optional) Enable **Fluid Compute** in Vercel project settings so the MCP route can use its full `maxDuration: 60` setting (`vercel.json`).

## Architecture

### MCP endpoints

- **[app/api/mcp/u/[uid]/route.ts](app/api/mcp/u/[uid]/route.ts)** — per-user JSON-RPC endpoint. Aggregates the union of every workspace membership + every direct grant for the OAuth-authenticated user.
- **[app/api/mcp/w/[uid]/route.ts](app/api/mcp/w/[uid]/route.ts)** — per-workspace endpoint. Same JSON-RPC dispatcher but the permission scope is *only* that workspace's connections; direct user grants are intentionally ignored so the workspace URL stays scoped to the workspace.

Both routes handle `initialize`, `tools/list`, `tools/call`, `ping`, and the `notifications/*` lifecycle. Tools are namespaced as `<slug>__<tool>` (e.g. `hubspot__list_contacts`). The `uid` URL segment is a routing handle only — the OAuth-authenticated account is authoritative for permissions. The `initialize` response includes a `serverInfo` block with `title` and `icons` for SEP-973 / 2025-11-25 forward-compat.

### Auth

- **[lib/oidc/](lib/oidc/)** — OAuth 2.1 / OIDC provider (`oidc-provider`) for the MCP endpoint. PKCE required; opaque access tokens (1h TTL) with rotating refresh tokens; resource indicators bind tokens to a specific MCP URL. Prisma-backed adapter; JWKs from `OIDC_JWKS`.
- **[lib/auth.ts](lib/auth.ts)** — Auth.js v5 + Credentials provider + JWT sessions, for the admin dashboard only. `requireAuth()` / `requireAdmin()` / `requireOwner()` return either the session or a `NextResponse` (401/403) — callers must check the return type before using it.
- **OIDC discovery**: `/.well-known/oauth-authorization-server` (RFC 8414) and `/.well-known/oauth-protected-resource` (RFC 9728).

### Permission filtering & upstream

- **[lib/mcp/permission-filter.ts](lib/mcp/permission-filter.ts)** — rolls up workspace + direct-grant permissions, classifies tools (`select` / `insert` / `update` / `delete` / `execute`) via heuristic regex with admin overrides, enforces table allowlists at call-time, and scrubs list-tool responses. Blocks raw-SQL/SOQL/APEX tools when a table allowlist is in effect.
- **[lib/mcp/upstream-client.ts](lib/mcp/upstream-client.ts)** — outbound JSON-RPC + SSE to upstream MCP servers, 30-second tool-list cache, 55-second timeout. Four auth schemes: `bearer`, `customHeaders`, `oauth` (with transparent refresh-token rotation), `none`.
- **[lib/mcp/mock-upstream.ts](lib/mcp/mock-upstream.ts)** — deterministic responses for `mcp.example.com/*` and `mock:*` URLs so demos work offline.

### Connector catalog (Skyvia-style "Create connection")

- **[lib/connector-catalog.ts](lib/connector-catalog.ts)** — hardcoded list of 14 catalog entries. 4 are wired up today (HubSpot, Salesforce, Supabase, Zoho CRM); the rest render as "Coming soon" cards (Postgres / BigQuery / Snowflake / Databricks / Vertica / Google Drive / Google Sheets / OneDrive / Google Ads / Meta Ads).
- **[app/(dashboard)/connections/new/catalog/](app/(dashboard)/connections/new/catalog/)** — catalog grid + the "Connect to <vendor>" modal. The modal accepts a connection name, an access token (paste OR OAuth popup via [lib/hooks/use-oauth-popup.ts](lib/hooks/use-oauth-popup.ts)), and per-vendor advanced settings, then POSTs [`/api/connections/from-catalog`](app/api/connections/from-catalog/route.ts) which creates the DataSource.
- **[lib/upstream-adapters/](lib/upstream-adapters/)** — in-process MCP servers that translate vendor REST APIs to MCP JSON-RPC. Generic dispatcher at [`/api/upstream-mcp/[adapter]/[connectorId]`](app/api/upstream-mcp/) is gated by an `x-mcpgw-internal: ${MCP_CONFIG_KEY}` header so only the gateway's own proxy can invoke it. The proxy's `upstreamUrl` for a catalog connection points back at this route, looping through the same audit / permission / rate-limit pipeline as any other connector.
- **[lib/connector-oauth.ts](lib/connector-oauth.ts)** — per-vendor OAuth client config (authorize/token URLs, scopes, redirect URI builder). Client credentials read from `CONNECTOR_OAUTH_<SLUG>_CLIENT_ID` / `_CLIENT_SECRET` env vars.
- **[app/api/connections/oauth/[slug]/](app/api/connections/oauth/)** — `start/` does the PKCE redirect; `callback/` returns an HTML page that `window.postMessage`s the tokens back to the modal and closes the popup, instead of doing a full-page redirect.

### Audit, rate limiting, crypto

- **[lib/mcp/audit.ts](lib/mcp/audit.ts)** — writes audit rows out-of-band via `next/server`'s `after()` so they never block the response. Bodies size-capped via `truncateJson()`.
- **[app/api/cron/prune-audit/route.ts](app/api/cron/prune-audit/route.ts)** — daily Vercel cron (03:00 UTC, declared in [vercel.json](vercel.json)) deletes audit rows older than `AUDIT_RETENTION_DAYS` (default 90). Gated by `Authorization: Bearer ${CRON_SECRET}`.
- **[lib/rate-limit.ts](lib/rate-limit.ts)** — in-memory sliding-window limiter. Sign-in is 10 / 15 min per IP; MCP proxy is 60 / 60 s per OAuth account. Per-process — swap to Redis for horizontal scale.
- **[lib/crypto.ts](lib/crypto.ts)** — libsodium secretbox (XChaCha20-Poly1305) for upstream connector credentials at rest, keyed by `MCP_CONFIG_KEY`. **Boot fails in production** if `MCP_CONFIG_KEY` is unset.

### In-product spec viewer

[app/specs/](app/specs/) renders [SPECIFICATIONS.md](SPECIFICATIONS.md) (the full architecture / feature / dependency spec) inside the app with a scroll-spy TOC. Reachable via the **Specifications** item in the avatar dropdown menu (OWNER/ADMIN-gated).

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | Tailwind v4 + Radix primitives (shadcn-style) + lucide-react |
| DB / ORM | Prisma 7 + Postgres (`@prisma/adapter-pg`) |
| Admin auth | Auth.js v5 (Credentials + JWT sessions) |
| MCP auth | `oidc-provider` v9 — OAuth 2.1 / PKCE |
| Crypto | libsodium secretbox |
| Runtime | Node.js (the MCP proxy needs Node, not Edge) |

## v1 caveats

- **In-memory rate limit** — per-process. Effective rate on multi-instance deploys is `instances × declared_rate`. Port to Redis when scaling horizontally.
- **OIDC singleton WeakMaps** — `oidc-provider` keeps state in module-scoped WeakMaps; multi-instance deploys need either single-function affinity or a shared cache.
- **Static JWKS** — no runtime rotation; rotating means redeploying with a new `OIDC_JWKS` and accepting that all issued tokens become invalid.
- **Mock connectors only by default** — the 5 seeded connectors all point at `mcp.example.com/*`. Use **Add Connection → Create connection** to add real catalog-backed connectors (HubSpot, Salesforce, Supabase, Zoho CRM), or **Existing MCP URL** for any other upstream.
- **Catalog OAuth is per-deploy, not per-tenant** — one OAuth app per vendor per deployment, configured via env vars. Multi-tenant per-customer OAuth apps would need a DB-backed config table.
- **AdminEvent not pruned** — the daily cron only prunes `AuditLog`; `AdminEvent` grows unbounded (low cardinality, so this is OK for the demo timeframe).
- **No CSP / CSRF middleware** — Auth.js handles CSRF for its own routes; nothing custom on top.

For everything else — full schema, all env vars, OAuth sequence diagrams, troubleshooting — see [SPECIFICATIONS.md](SPECIFICATIONS.md) or the in-app `/specs` viewer.
