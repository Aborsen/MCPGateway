# AI Connectivity

Demo prototype of Devart's "AI Connectivity" admin panel: an **MCP proxy** with users, workspaces, permissions, and an audit log. Built with Next.js 16 + Prisma + Auth.js, deployable to Vercel.

## What it does

1. Admin configures upstream **MCP servers** as Connections (Jira, HubSpot, Salesforce, Zoho, Postgres, …)
2. Admin creates **Workspaces** that bundle Connections, optionally restricting access to specific tables
3. Admin assigns **Users** to Workspaces with `read`, `write`, and/or `delete` permissions
4. Admin generates a unique **MCP server URL** per user and pastes it into Claude Code's `.mcp.json`
5. Every tool call from Claude Code is proxied, permission-checked, and **audited** in real time

## Quick start (local)

You need a Postgres database. The easiest path is a free [Neon](https://neon.tech) project (30-second signup). Then:

```bash
# 1. Put your Postgres URL in .env (copy from .env.example)
cp .env.example .env
# Edit .env and set DATABASE_URL=postgresql://...

# 2. Install + push schema + seed
npm install
npm run db:push          # creates all tables in your Postgres
npm run db:seed          # admin + 3 users + 5 sample connections + 2 workspaces

# 3. Run
npm run dev              # http://localhost:3000
```

Login as `admin@devart.com` / `admin123`.

Seeded users:
- `admin@devart.com` / `admin123` — admin
- `alice@devart.com` / `demo123` — Sales Team workspace (HubSpot + Salesforce + Zoho, read+write, restricted tables)
- `bob@devart.com` / `demo123` — Sales Team workspace (read-only)
- `carol@devart.com` / `demo123` — Engineering workspace (Jira + Postgres, full perms)

## Demo flow

1. Open **Connections** — see the 5 seeded data sources. Open one to view its tool catalog.
2. Open **Workspaces** → **Sales Team** — see how HubSpot is restricted to `contacts, deals` only.
3. Open **Users** → click Alice → click **Generate MCP URL**. Copy the URL.
4. Paste into a `.mcp.json` for Claude Code:
   ```json
   {
     "mcpServers": {
       "ai-connectivity": { "url": "<copied URL>" }
     }
   }
   ```
5. In Claude Code: `claude mcp list` then ask the model to list HubSpot contacts. Calls land in the **Audit Log** within seconds.
6. Try a write/delete and you'll see it blocked (Alice has only read+write, not delete).

## Deploying to Vercel

The repo is set up to deploy cleanly. After the first Vercel deploy:

1. In the Vercel project, go to **Storage** → **Create Database** → **Postgres** (or Neon). This auto-sets `POSTGRES_URL` and friends — but Prisma wants `DATABASE_URL`, so add it as an alias.
2. **Environment variables** to set in Vercel project settings:

   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Postgres connection string (use the **pooled** one) |
   | `AUTH_SECRET` | `openssl rand -base64 32` |
   | `AUTH_TRUST_HOST` | `true` |
   | `MCP_CONFIG_KEY` | `openssl rand -base64 32` |
   | `OIDC_ISSUER` | Your prod URL, no trailing slash (e.g. `https://app.example.com`) |
   | `OIDC_COOKIE_KEY` | `openssl rand -hex 32` |
   | `OIDC_JWKS` | Output of `npx tsx scripts/generate-jwks.ts`, as a single-line string |
   | `CRON_SECRET` | `openssl rand -hex 32` — used by the daily audit-prune cron |
   | `AUDIT_RETENTION_DAYS` | (Optional) days of audit-log rows to keep; defaults to `90` |

   > **Vercel preview gotcha:** `OIDC_ISSUER` must match the deploy origin exactly. Preview deployments have hostnames that differ from the prod alias, so the OAuth flow only works on the prod alias by default. Either set `OIDC_ISSUER` per-environment or restrict OAuth testing to the prod alias.

3. **Bootstrap the schema and seed data** — run locally against the prod URL once. The seed script refuses to run with `NODE_ENV=production` unless you pass `--allow-prod` (it deletes every row in every table before re-inserting demo data, so the guard is intentional):
   ```bash
   DATABASE_URL="<prod url>" npm run db:migrate
   DATABASE_URL="<prod url>" npx tsx prisma/seed.ts --allow-prod
   ```
4. **Redeploy** the latest commit so the env vars take effect.
5. (Optional) Enable **Fluid Compute** in Vercel project settings so the MCP route can use the full 60s `maxDuration` (already configured in `vercel.json`).

## Architecture

- **`app/api/mcp/u/[uid]/route.ts`** — JSON-RPC 2.0 over HTTP. Handles `initialize`, `tools/list`, `tools/call`, `ping`, and the `notifications/*` lifecycle. Tools are namespaced as `<slug>__<tool>` (e.g. `hubspot__list_contacts`). The `uid` URL segment is a routing handle; the OAuth-authenticated account is authoritative for permissions.
- **`lib/oidc/`** — OAuth 2.1 / OIDC provider (`oidc-provider`) for the MCP endpoint. Claude Code does PKCE, receives an opaque access token, and sends it as `Authorization: Bearer …` on every JSON-RPC request. Adapter is Prisma-backed (`OidcModel` table); JWKs come from the `OIDC_JWKS` env var.
- **`lib/mcp/upstream-client.ts`** — Calls upstream MCP servers. If the upstream URL is `mcp.example.com/*` or `mock:*` (the seeded demo URLs), uses a built-in mock provider so the demo works offline.
- **`lib/mcp/permission-filter.ts`** — Rolls up workspace + direct-grant permissions per user, applies tool-level `select`/`insert`/`update`/`delete`/`execute` checks, and inspects `table_name` / `module` / `object_name` args against workspace allow-lists. Blocks raw-SQL tools (`query`, `run_soql`, `execute_ddl`, `run_apex`) when table restrictions are in effect. Also post-filters list-tool responses so restricted tables don't leak in `tools/call` results.
- **`lib/mcp/audit.ts`** — Writes audit rows out-of-band via `next/server`'s `after()` so they never block the response. Bodies are size-capped via `truncateJson()` in `lib/json.ts`.
- **`lib/auth.ts`** — Auth.js v5 + Credentials provider + JWT sessions, used by the admin dashboard (not the MCP endpoint). `requireAuth()` / `requireAdmin()` return either the session or a `NextResponse` (401/403) — callers must check the return type before using it.
- **`lib/crypto.ts`** — libsodium secretbox encryption of upstream connector credentials, keyed by `MCP_CONFIG_KEY` (required in production).

## Tech stack

| Concern | Choice |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | Tailwind CSS v4 + custom shadcn-style primitives |
| DB / ORM | Prisma 7 + Postgres (`@prisma/adapter-pg`) |
| Auth | Auth.js v5 (Credentials provider, JWT sessions) |
| Crypto | libsodium (secretbox) |
| Runtime | Node.js (the MCP proxy needs Node, not Edge) |

## v1 limitations

- No SQL parsing — workspaces with table restrictions block raw-SQL tools entirely
- No tool-permission override UI (the seeded mapping is used directly)
- AI Chat is a placeholder (use Claude Code or another MCP client to test queries)
- Audit log has no retention/cleanup cron
- No per-token rate limiting
