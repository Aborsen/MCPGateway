@AGENTS.md

## Project conventions

- **Prisma 7 + Postgres**: schema generator outputs to `./generated/prisma`. The `datasource` block declares `provider = "postgresql"`; the connection URL is wired in `prisma.config.ts` via `process.env.DATABASE_URL`. The `PrismaClient` constructor uses `@prisma/adapter-pg`. There is no SQLite adapter — Postgres is the only supported provider (Neon / Vercel Postgres / Supabase / any Postgres).
- **Prisma client access**: import `prisma` from `lib/db.ts`. It's a lazy `Proxy` — the underlying client isn't instantiated until first method access, which keeps `next build` working before env vars are set on Vercel.
- **No migration history yet**: the project uses `prisma db push` (see `db:push` / `db:reset` / `db:seed` scripts). When adding schema changes that need to survive across deploys, generate a baseline migration first.
- **Next.js 16 async APIs**: `params` in pages / route handlers is `Promise<...>` — always `await` it. `middleware` is now `proxy` (we don't use it; auth check happens in `app/(dashboard)/layout.tsx`).
- **Auth (admin UI)**: Auth.js v5 with Credentials provider + JWT sessions, configured in `lib/auth.ts`. Use `requireAuth()` / `requireAdmin()` from `lib/auth.ts` in route handlers — they return either the session or a `NextResponse` (401/403). Callers must check `if (auth instanceof NextResponse) return auth;` before using the session.
- **Auth (MCP endpoint)**: separate flow — OAuth 2.1 via `oidc-provider` (see `lib/oidc/`). Claude Code performs PKCE, gets an opaque access token, and includes it as `Authorization: Bearer …` on every JSON-RPC request. The `lib/oidc/provider.ts` singleton owns issuer config, scopes (`openid`, `mcp`, `offline_access`), and the Prisma-backed adapter. Required env vars: `OIDC_ISSUER`, `OIDC_COOKIE_KEY`, `OIDC_JWKS`.
- **MCP proxy**: lives at `app/api/mcp/u/[uid]/route.ts`. The `uid` segment is a routing handle; the OAuth-authenticated account is authoritative for permissions. Tools are namespaced `<connector-slug>__<tool>`. Permission filtering happens in `lib/mcp/permission-filter.ts` — applied at both `tools/list` and `tools/call`, plus post-filtering of list-tool responses. Upstream calls go through `lib/mcp/upstream-client.ts` which falls back to a mock provider for `mcp.example.com/*` and `mock:*` URLs so the demo works offline.
- **Audit log**: written via `next/server`'s `after()` so it never blocks the JSON-RPC response. Bodies are size-capped by `truncateJson()`. No retention cron yet — long-running deployments will accumulate rows.
- **JSON-as-string fields**: arrays are stored as JSON strings (`UserDataSourceAccess.permissions`, `.allowedTables`, `WorkspaceDataSource.allowedTables`, `WorkspaceUser.permissions`). Use the helpers in `lib/json.ts` (`parsePermissions`, `parseAllowedTables`) to read them — they validate values and filter invalid entries.
- **Crypto**: `lib/crypto.ts` uses libsodium secretbox to encrypt upstream connector credentials. Key is derived from `MCP_CONFIG_KEY` (SHA-256). `MCP_CONFIG_KEY` is **required** in production — boot fails if it's unset there.
- **OIDC bundling gotcha**: `oidc-provider` is in `serverExternalPackages` (`next.config.ts`). Don't remove it — the library keeps state in module-scoped WeakMaps, and Next's bundler will duplicate the module across route chunks otherwise, breaking `AccessToken.save`.
- **Rate limiting**: `lib/rate-limit.ts` is an in-memory sliding-window limiter. Applied to the MCP proxy (60 req/min per account) and `/api/auth/sign-in` (10 attempts / 15 min per IP). Per-process — fine for single-instance deploys, swap to Redis when scaling horizontally.
- **Audit retention**: `app/api/cron/prune-audit/route.ts` deletes rows older than `AUDIT_RETENTION_DAYS` (default 90). Triggered daily 03:00 UTC by `vercel.json` cron. The endpoint requires `Authorization: Bearer ${CRON_SECRET}` — anything else returns 401.
- **Migrations**: production uses `prisma migrate deploy` (run via `npm run db:migrate`). `npm run db:push` is for local dev only — it bypasses the migration history and will fight `prisma migrate` if run against a migrated database.

## Required env vars (production)

- `DATABASE_URL` — Postgres connection string (use pooled URL on Vercel)
- `AUTH_SECRET` — Auth.js session signing
- `AUTH_TRUST_HOST` — `true` when behind a proxy / on Vercel
- `MCP_CONFIG_KEY` — libsodium key for connector-credential encryption
- `OIDC_ISSUER` — exact deploy origin (no trailing slash)
- `OIDC_COOKIE_KEY` — cookie signing for OAuth interactions
- `OIDC_JWKS` — JWKs JSON (generate once with `tsx scripts/generate-jwks.ts`)
