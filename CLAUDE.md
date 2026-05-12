@AGENTS.md

## Project conventions

- **Prisma 7**: schema generator outputs to `./generated/prisma`. The `datasource` block has no `url` — that lives in `prisma.config.ts`. The `PrismaClient` constructor needs an adapter (currently `@prisma/adapter-better-sqlite3`).
- **Next.js 16 async APIs**: `params` in pages / route handlers is `Promise<...>` — always `await` it. `middleware` is now `proxy` (we don't use it; auth check happens in `app/(dashboard)/layout.tsx`).
- **Auth**: Auth.js v5 with Credentials provider + JWT sessions. Use `requireAuth()` / `requireAdmin()` from `lib/auth.ts` in route handlers.
- **MCP proxy**: lives at `app/api/mcp/[token]/route.ts`. Tools are namespaced `<connector-slug>__<tool>`. Permission filtering happens in `lib/mcp/permission-filter.ts`. Upstream calls go through `lib/mcp/upstream-client.ts` which falls back to a mock provider for `mcp.example.com/*` URLs so the demo works offline.
- **Audit log**: written via `next/server`'s `after()` so it never blocks the JSON-RPC response.
- **SQLite + JSON**: arrays are stored as JSON strings (`permissions`, `allowedTables`). Use the helpers in `lib/json.ts` to parse them.
