# MCP Gateway — Product Specifications

> **Status**: Working draft for internal team review.
> **Audience**: Engineers / architects working on the MCP Gateway product.
> **Source of truth**: This document is generated from the codebase. When code and document disagree, the code wins — please open a PR to update this file.

---

## Table of Contents

1. [Executive Overview](#1-executive-overview)
2. [Architecture Overview](#2-architecture-overview)
3. [Tech Stack & Dependencies](#3-tech-stack--dependencies)
4. [Database Schema](#4-database-schema)
5. [Authentication & Authorization](#5-authentication--authorization)
6. [MCP Proxy & Permission Filtering](#6-mcp-proxy--permission-filtering)
7. [Connectors / Data Sources](#7-connectors--data-sources)
8. [Workspaces & User-Scoped URLs](#8-workspaces--user-scoped-urls)
9. [Audit Logging](#9-audit-logging)
10. [Cryptography & Secrets](#10-cryptography--secrets)
11. [Rate Limiting](#11-rate-limiting)
12. [Admin UI Tour](#12-admin-ui-tour)
13. [Security Measures (Checklist)](#13-security-measures-checklist)
14. [Local Setup Guide](#14-local-setup-guide)
15. [Production Deployment (Vercel + Postgres)](#15-production-deployment-vercel--postgres)
16. [Environment Variables Reference](#16-environment-variables-reference)
17. [Operational Notes](#17-operational-notes)
18. [Known Limitations / Future Work](#18-known-limitations--future-work)

---

## 1. Executive Overview

**MCP Gateway** is a multi-tenant proxy that brokers [Model Context Protocol](https://modelcontextprotocol.io/) (MCP) JSON-RPC 2.0 traffic from MCP-compatible clients (notably Claude Code) to many heterogeneous upstream MCP servers (Jira, Salesforce, HubSpot, Zoho, Postgres, internal services, …) while enforcing centralised permission rules.

The problem it solves: enterprises want to give employees AI assistants that can query company data, but they cannot hand out raw connector tokens — and they cannot tolerate per-user OAuth dances against every individual SaaS vendor. MCP Gateway gives each employee **a single OAuth-secured MCP URL** that, once authorised, transparently exposes the union of:

- the user's workspace memberships (e.g., "Sales Team" → HubSpot/Salesforce/Zoho with read-only access to a curated table list);
- direct per-user grants (e.g., the user has personal write access to a Postgres data source);

with table-level access controls applied both at call-time (block the request) and post-response (scrub disallowed rows from list-tool output). Every request is audited.

The project ships with **mock upstream servers** so anyone can clone, seed, and demo the full flow offline — no real SaaS credentials required. Replace the mock URLs with real MCP server endpoints to go live.

---

## 2. Architecture Overview

### 2.1 System Diagram

```mermaid
flowchart LR
    subgraph Client["Client"]
        CC["Claude Code / MCP client"]
    end

    subgraph Gateway["MCP Gateway (Next.js 16)"]
        direction TB
        WK[".well-known<br/>OAuth discovery"]
        OIDC["OIDC Provider<br/>(oidc-provider)"]
        ADMIN["Admin UI<br/>(/dashboard)"]
        AUTHJS["Auth.js v5<br/>(Credentials + JWT)"]
        PROXY_U["MCP Proxy<br/>/api/mcp"]
        PROXY_W["MCP Proxy<br/>/api/mcp/w/[uid]"]
        PFILT["Permission Filter<br/>+ Table Security"]
        UPSTREAM["Upstream MCP Client<br/>+ Mock Fallback"]
        CRON["Cron: prune-audit<br/>(daily 03:00 UTC)"]
    end

    subgraph DB["Postgres"]
        T_USER[("User / Workspace<br/>WorkspaceUser<br/>UserDataSourceAccess")]
        T_DS[("DataSource<br/>ToolPermission<br/>WorkspaceDataSource")]
        T_OIDC[("OidcModel")]
        T_AUDIT[("AuditLog<br/>AdminEvent")]
    end

    subgraph Upstreams["Upstream MCP Servers"]
        JIRA["Jira"]
        SF["Salesforce"]
        PG["Postgres MCP"]
        OTHER["…N more"]
    end

    CC -->|"1. discovery"| WK
    CC -->|"2. PKCE authorize"| OIDC
    OIDC -->|"login"| AUTHJS
    AUTHJS --> T_USER
    OIDC --> T_OIDC
    CC -->|"3. JSON-RPC + Bearer"| PROXY_U
    CC --> PROXY_W
    PROXY_U --> PFILT
    PROXY_W --> PFILT
    PFILT --> T_DS
    PFILT --> T_USER
    PFILT --> UPSTREAM
    UPSTREAM --> JIRA
    UPSTREAM --> SF
    UPSTREAM --> PG
    UPSTREAM --> OTHER
    PROXY_U -. "after()" .-> T_AUDIT
    PROXY_W -. "after()" .-> T_AUDIT
    ADMIN --> AUTHJS
    ADMIN --> T_USER
    ADMIN --> T_DS
    ADMIN --> T_AUDIT
    CRON --> T_AUDIT
```

### 2.2 Component Breakdown

| Component | Path | Responsibility |
|---|---|---|
| Admin UI | [app/(dashboard)/](app/(dashboard)/) | Authenticated React server-component dashboard for managing users, workspaces, connectors, permissions, audit logs, and settings. |
| Auth.js (admin) | [lib/auth.ts](lib/auth.ts) | Credentials-provider login + JWT session for the admin UI. |
| RBAC engine | [lib/permissions/](lib/permissions/) | `catalog.ts` (32 permissions + 8 system roles), `resolve.ts` (`can`/`canInWorkspace`/`isOwnerUser`/etc., cached per-request), `seed.ts` (idempotent role reconciliation run on every deploy). |
| OIDC provider | [lib/oidc/](lib/oidc/) | OAuth 2.1 server for MCP clients. `oidc-provider` library, Prisma-backed adapter, Auth.js bridge. |
| MCP generic proxy | [app/api/mcp/route.ts](app/api/mcp/route.ts) | Generic JSON-RPC endpoint serving every authenticated user. The OAuth-authenticated account is authoritative; applies the union of all the user's workspace memberships + direct grants. |
| MCP workspace proxy | [app/api/mcp/w/[uid]/route.ts](app/api/mcp/w/[uid]/route.ts) | Per-workspace JSON-RPC endpoint; applies only that workspace's grants for the calling member. |
| Permission filter | [lib/mcp/permission-filter.ts](lib/mcp/permission-filter.ts) | Resolves access, classifies tools, enforces table allowlists, scrubs list-tool responses. |
| Upstream client | [lib/mcp/upstream-client.ts](lib/mcp/upstream-client.ts) | Outbound HTTP JSON-RPC + SSE; 30s tool-list cache; mock fallback. |
| Mock upstream | [lib/mcp/mock-upstream.ts](lib/mcp/mock-upstream.ts) | Deterministic responses for `mcp.example.com/*` and `mock:*` URLs so demos work offline. |
| Audit | [lib/mcp/audit.ts](lib/mcp/audit.ts), [lib/admin-events.ts](lib/admin-events.ts) | Non-blocking write-behind audit log + admin-action event log. |
| Crypto | [lib/crypto.ts](lib/crypto.ts) | libsodium secretbox for connector-credential encryption + opaque token minting. |
| Rate limit | [lib/rate-limit.ts](lib/rate-limit.ts) | In-memory sliding-window limiter. |
| Cron | [app/api/cron/prune-audit/route.ts](app/api/cron/prune-audit/route.ts) | Daily audit retention prune, triggered by Vercel cron. |
| Connector catalog | [lib/connector-catalog.ts](lib/connector-catalog.ts), [lib/connector-oauth.ts](lib/connector-oauth.ts) | Hardcoded list of vendor connectors offered via the "Create connection" modal flow. |
| Catalog UI | [app/(dashboard)/connections/new/catalog/](app/(dashboard)/connections/new/catalog/) | Grid + Skyvia-style "Connect to <vendor>" modal that owns name + token field + advanced settings + OAuth popup. |
| Catalog backend | [app/api/connections/oauth/[slug]/](app/api/connections/oauth/) (start + callback), [app/api/connections/from-catalog/route.ts](app/api/connections/from-catalog/route.ts) | OAuth PKCE start, popup-friendly callback (returns `postMessage` HTML, not a redirect), and the DataSource-creation endpoint the modal POSTs to. |
| Upstream adapters | [lib/upstream-adapters/](lib/upstream-adapters/), [app/api/upstream-mcp/[adapter]/[connectorId]/route.ts](app/api/upstream-mcp/[adapter]/[connectorId]/route.ts) | In-process MCP servers (HubSpot, Salesforce, Supabase, Zoho CRM) that translate vendor REST APIs to MCP JSON-RPC. Generic dispatcher gated by an internal-only header. |
| DB layer | [lib/db.ts](lib/db.ts), [prisma/schema.prisma](prisma/schema.prisma) | Lazy `PrismaClient` proxy using `@prisma/adapter-pg`. |

### 2.3 Request Paths

**Admin path** — Browser hits `/(dashboard)/*`; the dashboard layout in [app/(dashboard)/layout.tsx](app/(dashboard)/layout.tsx) calls `requireAuth()` and redirects to `/login` if the JWT session is missing. Server components read from Prisma; mutations go through `/api/*` routes that all check a permission via `requirePermission(key)` / `requirePermissionInWorkspace(key, wsId)` / `requireAdmin()` / `requireOwner()` from [lib/auth.ts](lib/auth.ts). The permission catalog itself lives in [lib/permissions/catalog.ts](lib/permissions/catalog.ts) — see [§5.3](#53-rbac-system).

**MCP path** — Client POSTs JSON-RPC 2.0 to `/api/mcp` (generic) or `/api/mcp/w/{uid}` (workspace-scoped) with `Authorization: Bearer …`. The route handler validates the token against `provider.AccessToken.find()`, resolves the OAuth-authenticated user (the workspace URL `uid` is **only a workspace selector** — the OAuth account is authoritative for permissions), rate-limits, parses the JSON-RPC envelope, dispatches by `method`, and writes an `AuditLog` row via `after()` so the response returns before persistence completes.

---

## 3. Tech Stack & Dependencies

All version pins come from [package.json](package.json).

### 3.1 Framework & Runtime

| Package | Version | Purpose |
|---|---|---|
| `next` | 16.2.6 | App-Router framework. **Note**: this is the Next 16 line — `params` is async, `middleware` was renamed to `proxy`. See [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md). |
| `react`, `react-dom` | 19.2.4 | UI runtime. |
| `typescript` | ^5 | Strict-mode TypeScript. |
| Node.js | 20+ | Runtime (from `@types/node ^20`). |

### 3.2 Database / ORM

| Package | Version | Purpose |
|---|---|---|
| `prisma`, `@prisma/client` | ^7.8.0 | Schema and codegen. Generator output path: `./generated/prisma` (custom — see `generator client` block in [prisma/schema.prisma](prisma/schema.prisma)). |
| `@prisma/adapter-pg` | ^7.8.0 | Native Postgres adapter (the only supported DB). |
| `pg`, `@types/pg` | ^8.20.0 | Node Postgres driver. |

### 3.3 Authentication & OAuth

| Package | Version | Purpose |
|---|---|---|
| `next-auth` | ^5.0.0-beta.31 | Auth.js v5 — admin-UI session (Credentials provider + JWT). |
| `@auth/prisma-adapter` | ^2.11.2 | Prisma adapter for Auth.js (declared but not actively used since JWT sessions are stateless; kept available for future DB sessions). |
| `oidc-provider` | ^9.8.3 | RFC-compliant OAuth 2.1 / OIDC server for the MCP endpoint. **Must remain in `serverExternalPackages`.** |
| `jose` | ^6.2.3 | JOSE primitives (JWKS generation, JWT signing/verify). |
| `bcryptjs` | ^3.0.3 | Password hashing for admin users. |
| `@types/bcryptjs` | ^2.4.6 | Types for `bcryptjs` (the v2 types still match the v3 runtime API). |

### 3.4 Cryptography

| Package | Version | Purpose |
|---|---|---|
| `libsodium-wrappers` | ^0.8.4 | XChaCha20-Poly1305 secretbox for encrypting connector configs at rest. |

### 3.5 UI

| Package | Version | Purpose |
|---|---|---|
| `@radix-ui/react-checkbox` | ^1.3.3 | Accessible primitives — Radix Checkbox. |
| `@radix-ui/react-dialog` | ^1.1.15 | Modal/dialog primitive. |
| `@radix-ui/react-dropdown-menu` | ^2.1.16 | Dropdown menus. |
| `@radix-ui/react-label` | ^2.1.8 | Form labels. |
| `@radix-ui/react-select` | ^2.2.6 | Select / combobox. |
| `@radix-ui/react-slot` | ^1.2.4 | Render-prop composition. |
| `@radix-ui/react-tabs` | ^1.1.13 | Tabbed views (audit log). |
| `@radix-ui/react-toast` | ^1.2.15 | Toast notifications. |
| `@radix-ui/react-tooltip` | ^1.2.8 | Tooltips. |
| `tailwindcss` | ^4 | Utility-first CSS. |
| `@tailwindcss/postcss` | ^4 | Tailwind v4 PostCSS plugin. |
| `tailwind-merge` | ^3.6.0 | Conflict-resolving class merger. |
| `tailwindcss-animate` | ^1.0.7 | Animation utility classes. |
| `class-variance-authority` | ^0.7.1 | Variant API for components (shadcn-style). |
| `clsx` | ^2.1.1 | Conditional class joiner. |
| `lucide-react` | ^1.14.0 | Icon set. |
| `next-themes` | ^0.4.6 | Dark/light theme toggle. |
| `react-markdown` | ^10.1.0 | Renders the in-product spec viewer at `/specs`. |
| `remark-gfm` | ^4.0.1 | GitHub-flavored markdown plugin for the spec viewer (tables, task lists, strikethrough). |

### 3.6 Validation & Utilities

| Package | Version | Purpose |
|---|---|---|
| `zod` | ^4.4.3 | Schema validation for API inputs and parsed JSON-as-string fields. |
| `fetch-to-node` | ^2.1.0 | Node-compatibility shim for `oidc-provider` (which expects Node req/res). |

### 3.7 Tooling

| Package | Version | Purpose |
|---|---|---|
| `eslint`, `eslint-config-next` | ^9, 16.2.6 | Linting (Next core-web-vitals + TypeScript presets). |
| `tsx` | ^4.21.0 | Run TypeScript scripts (`prisma/seed.ts`, helpers in `scripts/`). |
| `@types/oidc-provider` | ^9.5.0 | Types for the OAuth server. |
| `@types/libsodium-wrappers` | ^0.7.14 | Types for libsodium. |

### 3.8 NPM Scripts

From [package.json](package.json):

| Script | Command | Purpose |
|---|---|---|
| `dev` | `next dev` | Local dev server (hot reload). |
| `build` | `next build` | Production build. |
| `start` | `next start` | Run the production build. |
| `lint` | `eslint` | Lint TS/TSX. |
| `postinstall` | `prisma generate` | Generate the Prisma client after install. |
| `db:push` | `prisma db push` | Sync the schema to the DB (dev only — no migration history). |
| `db:migrate` | `prisma migrate deploy` | Apply pending migrations (production). |
| `db:seed` | `tsx prisma/seed.ts` | Populate demo data. |
| `db:reset` | `prisma db push --force-reset && npm run db:seed` | Wipe and reseed (dev only). |
| `db:studio` | `prisma studio` | Browse the DB via Prisma's web UI. |

### 3.9 Helper Scripts (`scripts/`)

Not part of the build — run via `npx tsx scripts/<name>.ts`.

| Script | Purpose |
|---|---|
| [scripts/generate-jwks.ts](scripts/generate-jwks.ts) | One-time generation of the JWKS used by the OIDC provider. Output the JSON into `OIDC_JWKS`. |
| [scripts/grant-execute.ts](scripts/grant-execute.ts) | Bulk-grant `execute`-level tool permissions. |
| [scripts/set-password.ts](scripts/set-password.ts) | Reset a user's password (bcrypt-hashed in place). |
| [scripts/dump-audit.ts](scripts/dump-audit.ts) | Export audit log to disk. |
| [scripts/dump-admin-events.ts](scripts/dump-admin-events.ts) | Export admin events. |
| [scripts/dump-mcp-errors.ts](scripts/dump-mcp-errors.ts) | Surface MCP errors for triage. |
| [scripts/dump-user-access.ts](scripts/dump-user-access.ts) | Export the user→workspace→data-source matrix. |
| [scripts/remap-connection-types.ts](scripts/remap-connection-types.ts) | One-shot data migration helper. |
| [scripts/remap-permissions.ts](scripts/remap-permissions.ts) | One-shot data migration helper. |
| [scripts/probe-upstream.ts](scripts/probe-upstream.ts) | Probe a configured upstream MCP server to verify connectivity. |

---

## 4. Database Schema

**Provider**: Postgres only. The `datasource` block in [prisma/schema.prisma](prisma/schema.prisma) declares `provider = "postgresql"` and the connection URL is wired through `process.env.DATABASE_URL` in [prisma.config.ts](prisma.config.ts). The Prisma client is constructed lazily via a `Proxy` in [lib/db.ts](lib/db.ts) so `next build` succeeds even before env vars are present on Vercel.

**Migrations**: production currently uses `prisma db push --accept-data-loss` from the `build` script (see [§15.2](#152-migrations--rbac-seed) for the full deploy chain). This keeps the schema in lock-step with the model without a separate migration history — fine for the demo prototype, easy to revisit by swapping in `prisma migrate deploy` for environments that need a paper trail of every column change. Local dev can use either `npm run db:push` (quick iteration) or `prisma migrate dev` (if you want to start building a migration history).

### 4.1 ER Diagram

```mermaid
erDiagram
    User ||--o{ WorkspaceUser : has
    User ||--o{ UserDataSourceAccess : has
    User ||--o{ UserRole : "assigned"
    User ||--o{ UserPermissionOverride : "has overrides"
    User ||--o{ AuditLog : "logged for"
    User ||--o{ AdminEvent : "acted"
    User ||--o{ AdminEvent : "targeted"

    Workspace ||--o{ WorkspaceUser : has
    Workspace ||--o{ WorkspaceDataSource : has
    Workspace ||--o{ UserRole : "scopes (optional)"
    Workspace ||--o{ UserPermissionOverride : "scopes (optional)"

    Role ||--o{ RolePermission : grants
    Role ||--o{ UserRole : "assigned to"
    Permission ||--o{ RolePermission : "granted via"
    Permission ||--o{ UserPermissionOverride : "overridden via"

    DataSource ||--o{ WorkspaceDataSource : "linked from"
    DataSource ||--o{ UserDataSourceAccess : "linked from"
    DataSource ||--o{ ToolPermission : owns
    DataSource ||--o{ AuditLog : "logged against"

    OidcModel {
        String id PK
        String model
        Json payload
        String grantId
        String userCode
        String uid
        DateTime expiresAt
        DateTime consumedAt
    }

    User {
        String id PK
        String email UK
        String name
        String passwordHash
        String mcpUid UK
        DateTime createdAt
        DateTime deletedAt
        DateTime suspendedAt
    }

    Workspace {
        String id PK
        String name
        String description
        String mcpUid UK
        DateTime createdAt
        DateTime deletedAt
    }

    DataSource {
        String id PK
        String name
        String slug UK
        String type
        String upstreamUrl
        String configEncrypted
        String description
        String blockedTables
        DateTime createdAt
    }

    Permission {
        String key PK
        String label
        String category
        Boolean scopeable
        String description
    }

    Role {
        String id PK
        String slug UK
        String name
        String description
        Boolean isSystem
        DateTime createdAt
        DateTime updatedAt
    }

    RolePermission {
        String roleId FK
        String permissionKey FK
    }

    UserRole {
        String id PK
        String userId FK
        String roleId FK
        String workspaceId FK
        String grantedById FK
        DateTime grantedAt
    }

    UserPermissionOverride {
        String id PK
        String userId FK
        String permissionKey FK
        String workspaceId FK
        String effect
        String reason
        String grantedById FK
        DateTime grantedAt
        DateTime expiresAt
    }

    ToolPermission {
        String id PK
        String dataSourceId FK
        String toolName
        String level
        String classifiedBy
        DateTime discoveredAt
        DateTime lastSeenAt
    }

    UserDataSourceAccess {
        String id PK
        String userId FK
        String dataSourceId FK
        String permissions
        String allowedTables
        DateTime createdAt
        DateTime updatedAt
    }

    WorkspaceDataSource {
        String id PK
        String workspaceId FK
        String dataSourceId FK
        String allowedTables
    }

    WorkspaceUser {
        String id PK
        String workspaceId FK
        String userId FK
        String permissions
    }

    AdminEvent {
        String id PK
        String actorId FK
        String targetUserId FK
        String eventType
        String targetType
        String targetId
        String targetLabel
        String detailsJson
        DateTime createdAt
    }

    AuditLog {
        String id PK
        String userId FK
        String dataSourceId FK
        String method
        String toolName
        String requestJson
        String responseJson
        String status
        Int durationMs
        String errorMessage
        DateTime createdAt
    }
```

### 4.2 Models

#### `User` ([prisma/schema.prisma:13](prisma/schema.prisma))
Admin-UI user account. Also serves as the OAuth account when the user connects via Claude Code.
- `email` unique; soft-delete via `deletedAt`; sign-in block via `suspendedAt`.
- `passwordHash` is bcrypt.
- `mcpUid` is a legacy routing handle kept on the schema for backward compatibility — the generic MCP endpoint at `/api/mcp` no longer uses it; the OAuth account is authoritative.
- **No `role` column** — Phase 2 PR2b dropped it. The user's effective role(s) live in the `UserRole` join table, layered with `UserPermissionOverride` rows. See [§5.3](#53-rbac-system).
- Relations: `WorkspaceUser[]`, `AuditLog[]`, `AdminEvent[]` (as actor and as target), `UserDataSourceAccess[]`, `UserRole[]`, `UserPermissionOverride[]`.

#### `OidcModel` ([prisma/schema.prisma:30](prisma/schema.prisma))
Storage for all OAuth/OIDC state (sessions, authorization codes, access tokens, refresh tokens, grants, client configs, interaction state). Owned exclusively by [lib/oidc/adapter.ts](lib/oidc/adapter.ts). Indexes on `model`, `grantId`, `userCode`, `uid`, `expiresAt` for fast lookup and lazy cleanup.

#### `DataSource` ([prisma/schema.prisma:53](prisma/schema.prisma))
A registered upstream MCP server (one row per connector).
- `slug` is the unique tool-namespace prefix (e.g., `postgres__query`).
- `type` is a free-form category string used by the UI for grouping (`operations`, `sales`, `marketing`, `database`).
- `configEncrypted` holds the libsodium-encrypted auth config (`authScheme` + token / custom headers) — see [§10](#10-cryptography--secrets).
- `blockedTables` (optional JSON-string array) is a connector-wide deny list. Any MCP tool call targeting one of these tables is rejected regardless of which workspace or direct grant the caller is using — sensitive tables can be permanently kept off the connector even if a workspace's `allowedTables` would otherwise permit them. Edited via the **Block tables** button on the connection detail page.

#### `ToolPermission` ([prisma/schema.prisma:75](prisma/schema.prisma))
The per-tool authorisation level recorded for each `DataSource`. Auto-populated on first `tools/list` (with `classifiedBy = "heuristic"`); admins can override (`classifiedBy = "admin"`). `level` is one of `select | insert | update | delete | execute` (the admin UI groups insert/update/execute under a single "Edit" bucket — see [§6.6](#66-tool-classification-heuristics)). Unique on `(dataSourceId, toolName)`.

#### `UserDataSourceAccess` ([prisma/schema.prisma:76](prisma/schema.prisma))
A **direct** user→data-source grant (sidesteps workspace membership). `permissions` is a JSON-string array of levels (parsed via `parsePermissions()` in [lib/json.ts](lib/json.ts)). `allowedTables` is an optional JSON-string array — `null` means unrestricted. Unique on `(userId, dataSourceId)`.

#### `Workspace` ([prisma/schema.prisma:90](prisma/schema.prisma))
A team/space grouping users with shared connector access. `mcpUid` is a random opaque routing handle used in `/api/mcp/w/{mcpUid}` — rotating it invalidates the prior URL immediately. Soft-delete via `deletedAt`.

#### `WorkspaceDataSource` ([prisma/schema.prisma:102](prisma/schema.prisma))
The connector-to-workspace join. `allowedTables` (optional JSON-string array) restricts which tables/objects every member of the workspace can see in that data source.

#### `WorkspaceUser` ([prisma/schema.prisma:113](prisma/schema.prisma))
The user-to-workspace membership join. `permissions` is the JSON-string array of permission levels granted to that user **for every data source the workspace owns**.

#### `AdminEvent` ([prisma/schema.prisma:124](prisma/schema.prisma))
Audit trail for **administrative actions** (login/logout, user create/delete, role change, password reset, access grant/revoke, tool-level override). Actor and target user are both `SetNull` on delete. Indexed on `createdAt`, `(eventType, createdAt)`, `(actorId, createdAt)`.

#### `AuditLog` ([prisma/schema.prisma:156](prisma/schema.prisma))
Per-request audit for the MCP proxy. Captures `method` (JSON-RPC method name), `toolName` (for `tools/call`), full request/response JSON (truncated to ~8 KB via `truncateJson()` in [lib/json.ts](lib/json.ts)), `status` (`OK`/`ERROR`), `durationMs`, and `errorMessage`. Five indexes covering common filter axes: `(userId, createdAt)`, `createdAt`, `(method, createdAt)`, `(dataSourceId, createdAt)`, `(status, createdAt)`.

#### `Permission` ([prisma/schema.prisma:187](prisma/schema.prisma))
The RBAC catalog. One row per known permission key (e.g. `users.delete`, `workspaces.manage_data_permissions`). Seeded idempotently from [lib/permissions/catalog.ts](lib/permissions/catalog.ts) by `lib/permissions/seed.ts` on every deploy. `scopeable=true` means the permission can be granted in a workspace-scoped way (e.g. workspace_admin in Workspace X but not Workspace Y). See [§5.3](#53-rbac-system).

#### `Role` ([prisma/schema.prisma:202](prisma/schema.prisma))
A named bundle of permissions. `isSystem=true` rows are seeded (owner, admin, editor, staff, guest, user, workspace_admin, workspace_member) and cannot be edited or deleted via the UI. Admins with `permissions.manage_roles` can author custom roles.

#### `RolePermission` ([prisma/schema.prisma:216](prisma/schema.prisma))
Join table: which permissions does each role grant. Composite PK `(roleId, permissionKey)`. Cascade-deletes when either side disappears.

#### `UserRole` ([prisma/schema.prisma:230](prisma/schema.prisma))
Assignment of a `Role` to a `User`, optionally workspace-scoped. NULL `workspaceId` = global; non-NULL = the role's powers apply only within that specific workspace. `grantedById` is `SetNull` on delete so the audit trail survives. Unique on `(userId, roleId, workspaceId)`.

#### `UserPermissionOverride` ([prisma/schema.prisma:252](prisma/schema.prisma))
Per-user GRANT or REVOKE of a single permission, layered on top of the role assignments. Hybrid model — `reason` is required by the UI for audit hygiene; `expiresAt` enables time-bounded access cleaned up daily by [app/api/cron/expire-overrides/route.ts](app/api/cron/expire-overrides/route.ts). Unique on `(userId, permissionKey, workspaceId, effect)`.

### 4.3 JSON-as-String Convention

Four columns store JSON-stringified arrays rather than Postgres `jsonb`:

| Column | Helper |
|---|---|
| `WorkspaceUser.permissions` | `parsePermissions()` |
| `UserDataSourceAccess.permissions` | `parsePermissions()` |
| `UserDataSourceAccess.allowedTables` | `parseAllowedTables()` |
| `WorkspaceDataSource.allowedTables` | `parseAllowedTables()` |

The helpers in [lib/json.ts](lib/json.ts) validate the parsed values against a known allowlist (`select | insert | update | delete | execute` for permissions) and silently drop invalid entries — so a malformed row never propagates an invalid permission to permission-resolution logic.

`AuditLog.requestJson` and `AuditLog.responseJson` are also JSON strings — passed through `truncateJson()` before insert to keep individual rows bounded.

---

## 5. Authentication & Authorization

The product has **two completely separate auth systems** — one for human admins on the dashboard, one for OAuth clients on the MCP endpoint. They share the same `User` table but use different cookies, different session strategies, and different tokens.

### 5.1 Admin UI Auth (Auth.js v5)

Configured in [lib/auth.ts](lib/auth.ts).

- **Provider**: `Credentials` only (email + password). The user record is looked up by email, password verified with `bcrypt.compare()`, and a JWT session is issued.
- **Session strategy**: JWT (stateless). Phase 2 PR2b dropped the role string from the JWT — the token now carries only `user.id`. Effective permissions are resolved per-request from `UserRole` + `UserPermissionOverride` and memoised via `React.cache()`.
- **Sign-in endpoint**: [app/api/auth/sign-in/route.ts](app/api/auth/sign-in/route.ts) wraps Auth.js's sign-in with a per-IP rate limit (10 attempts / 15 min). It writes a `USER_LOGIN` `AdminEvent` on success and surfaces a generic error on failure (no enumeration of "user not found" vs "bad password").
- **Catch-all NextAuth route**: [app/api/auth/[...nextauth]/route.ts](app/api/auth/[...nextauth]/route.ts) for `/api/auth/csrf`, `/api/auth/session`, `/api/auth/signin`, `/api/auth/signout`.
- **Helpers** (all in [lib/auth.ts](lib/auth.ts)):
  - `requireAuth()` — returns the session, or a `NextResponse` with 401.
  - `requirePermission(key)` — returns the session if the caller holds the named catalog permission, otherwise 401/403. The primary gate for API routes.
  - `requirePermissionInWorkspace(key, workspaceId)` — same, but the permission must apply within the given workspace (global grants pass; workspace-scoped grants pass only when the scope matches).
  - `gatePermission(key)` — page-component variant that redirects unauthorised viewers instead of returning a `NextResponse`.
  - `requireAdmin()` — true if the caller holds the `admin` or `owner` system role. Convenience helper; prefer `requirePermission(key)` for new routes.
  - `requireOwner()` — true only if the caller holds the `owner` system role. Used by the few remaining Owner-only invariants (deleting an Owner account, creating/assigning the Owner role).
  - **Calling convention**: every API route handler that uses these must check `if (auth instanceof NextResponse) return auth;` before using the session.
- **Permission resolver** ([lib/permissions/resolve.ts](lib/permissions/resolve.ts)): `can(userId, key)`, `canInWorkspace(userId, key, wsId)`, `isOwnerUser(userId)`, `isAdminUser(userId)`, `primarySystemRoleFor(userId)`, `primarySystemRolesByUserId(userIds[])`, `accessibleWorkspaceIds(userId)`. All cached per-request via `React.cache()` so the resolver runs at most once per (caller, query) within a single request.
- **Dashboard guard**: the route group [app/(dashboard)/layout.tsx](app/(dashboard)/layout.tsx) runs `requireAuth()` server-side; unauthenticated visitors are redirected to the sign-in page.

### 5.2 MCP Endpoint Auth (OAuth 2.1 / OIDC)

Configured in [lib/oidc/provider.ts](lib/oidc/provider.ts).

#### 5.2.1 Flow (PKCE)

```mermaid
sequenceDiagram
    autonumber
    participant CC as Claude Code
    participant Disc as /.well-known/oauth-authorization-server
    participant Auth as /oauth/auth (authorize)
    participant Login as /auth/sign-in (Auth.js)
    participant Consent as /oauth/interaction/{uid}/confirm
    participant Token as /oauth/token
    participant MCP as /api/mcp/u/{uid}

    CC->>Disc: GET metadata
    Disc-->>CC: issuer, endpoints, scopes
    CC->>Auth: GET ?response_type=code&code_challenge=...&scope=openid+mcp+offline_access&resource=https://gateway/api/mcp/u/{uid}
    Auth-->>Login: redirect (no session)
    Login->>Login: user posts credentials
    Login-->>Auth: session cookie
    Auth-->>Consent: interaction.uid
    Consent-->>CC: redirect with code
    CC->>Token: POST code + code_verifier
    Token-->>CC: opaque access_token (1h) + refresh_token
    CC->>MCP: POST JSON-RPC + Authorization: Bearer ...
    MCP->>MCP: provider.AccessToken.find(token)
    MCP->>MCP: validate audience + scope=mcp + not expired
    MCP-->>CC: JSON-RPC result
```

#### 5.2.2 Provider Configuration

| Setting | Value | Why |
|---|---|---|
| `pkce.required` | always `true` | RFC 9700 — no public-client flow without PKCE. |
| Scopes | `openid`, `mcp`, `offline_access` | `mcp` is the resource scope; `offline_access` enables refresh tokens. |
| Resource indicators | enabled | The `resource` parameter binds tokens to a specific MCP URL (user or workspace endpoint). The proxy rejects tokens whose audience doesn't match `getMcpResourceUrl()`. |
| Access token format | opaque | Stored in `OidcModel`. TTL: 3600s. The proxy validates by DB lookup, not by JWT verification — so revocation is immediate. |
| Refresh token rotation | on | Public clients with PKCE get rotating refresh tokens. |
| JWKS | static | Pre-generated via [scripts/generate-jwks.ts](scripts/generate-jwks.ts); loaded once at startup from `OIDC_JWKS`. No runtime rotation. |
| Cookie signing | `OIDC_COOKIE_KEY` | Separate from `AUTH_SECRET`. |

#### 5.2.3 Persistence Adapter

[lib/oidc/adapter.ts](lib/oidc/adapter.ts) implements the `oidc-provider` adapter interface against Prisma. All session/code/token/grant/client records land in the `OidcModel` table, keyed by `(model, id)`. The `findByUid` lookup powers the interaction state hand-off; `findByUserCode` powers the device flow (not currently used). Expired rows are dropped lazily on next access.

#### 5.2.4 Auth.js ↔ OIDC Bridge

[lib/oidc/bridge.ts](lib/oidc/bridge.ts) makes the OIDC interaction pages reuse the existing Auth.js session. The interaction screens live under [app/oauth/interaction/[uid]/](app/oauth/interaction/[uid]/) (page, login form, consent form, account switch, abort/confirm). When the user is sent from `/oauth/auth` to log in, the same Auth.js Credentials form used for the admin UI ([app/login/login-form.tsx](app/login/login-form.tsx)) is rendered. On success the OIDC interaction resumes with `interaction.uid` and the Auth.js cookie identifying who consented.

#### 5.2.5 Discovery

| Endpoint | Spec | Path |
|---|---|---|
| `/.well-known/oauth-authorization-server` | RFC 8414 | [app/.well-known/oauth-authorization-server/route.ts](app/.well-known/oauth-authorization-server/route.ts) |
| `/.well-known/oauth-protected-resource` | RFC 9728 | [app/.well-known/oauth-protected-resource/route.ts](app/.well-known/oauth-protected-resource/route.ts) |

Both are derived from `OIDC_ISSUER` — which **must** be the exact deploy origin with no trailing slash. Misconfigured origins are the most common OAuth failure mode in practice.

#### 5.2.6 Bundling Caveat

`oidc-provider` is listed in `serverExternalPackages` in [next.config.ts](next.config.ts). The library uses module-scoped `WeakMap`s to track state; if Next.js's bundler duplicates the module across route chunks, each chunk gets its own map and `AccessToken.save` fails with `(0 , ig(...).dynamic[this.constructor.name]) is not a function`. **Do not remove this entry.**

### 5.3 RBAC System

Phase 2 replaced the legacy `User.role` string column with a full catalog-driven RBAC system. Source of truth: [lib/permissions/catalog.ts](lib/permissions/catalog.ts), reconciled to the DB on every deploy by [lib/permissions/seed.ts](lib/permissions/seed.ts).

#### 5.3.1 Permission Catalog

**32 permissions** grouped into 7 categories: `dashboard`, `connections`, `users`, `workspaces`, `permissions`, `audit`, `settings`. Each entry has `key` (e.g. `users.delete`), `category`, `label`, `description`, and a `scopeable` flag — `scopeable=true` permissions (most under `workspaces.*`) can be granted in a workspace-scoped way; the rest are global-only.

Every permission gate in the code refers to a catalog key. The catalog is the single source of truth — adding a permission means adding an entry and re-running the seed; renaming or removing a permission requires a coordinated catalog edit + code edit because the resolver enforces exhaustive coverage at type level.

#### 5.3.2 System Roles

8 system roles (`isSystem=true`) are seeded and reconciled by the deploy:

| Slug | Powers | Typical use |
|---|---|---|
| `owner` | All 32 permissions. Owner-only invariants (deleting an Owner account, creating/assigning the Owner role) are enforced on top via `requireOwner()`. | Tenant root. |
| `admin` | All 32 permissions. Can create / edit / delete users and custom roles. Cannot delete the Owner or assign the Owner role. | Day-to-day administrator. |
| `editor` | dashboard + connections (full) + audit.view_all + settings.view. | Connector manager. |
| `staff` | dashboard + workspaces.view + settings.view. | Read-only operator. |
| `guest` | dashboard + connections.view + workspaces.view + settings.view. | Cross-surface read-only. |
| `user` | Empty. MCP client only — no dashboard access. | Default for new accounts that only consume MCP. |
| `workspace_admin` | Workspace-scoped: members + data sources + data permissions; plus dashboard.view, workspaces.view/update/delete, audit.view_own, settings.view. | Designed for `UserRole.workspaceId`-scoped assignment so a person can fully run "Sales" without touching "Engineering". |
| `workspace_member` | dashboard + workspaces.view + settings.view. | Workspace-scoped read-only. |

#### 5.3.3 Custom Roles + Per-User Overrides

- **Custom roles** (`isSystem=false`) are admin-authored via `/permissions/roles`. Anyone with `permissions.manage_roles` can create/edit/delete them.
- **Per-user permission overrides** ([UserPermissionOverride](#userpermissionoverride-prismaschemaprisma252)) sit on top of role assignments — a GRANT adds a single permission a role doesn't carry; a REVOKE removes a permission the role would otherwise grant. Required `reason` field. Optional `expiresAt` — the daily cron at [app/api/cron/expire-overrides/route.ts](app/api/cron/expire-overrides/route.ts) silently cleans expired rows.

#### 5.3.4 Workspace-Scoped Assignments

A `UserRole` row with a non-NULL `workspaceId` means the role's powers apply only within that workspace. The resolver enforces this in `canInWorkspace(userId, key, wsId)`: global assignments pass for any workspace; scoped assignments pass only when the scope matches. The Workspaces list filters to the caller's accessible scopes; the workspace detail page has a dedicated "Workspace roles" card for managing scoped admins.

#### 5.3.5 Resolver

All effective-permission queries go through [lib/permissions/resolve.ts](lib/permissions/resolve.ts):
- `can(userId, key)` — global check (any UserRole/UserPermissionOverride grants the permission, anywhere).
- `canInWorkspace(userId, key, workspaceId)` — workspace-scoped check.
- `isOwnerUser(userId)` / `isAdminUser(userId)` — reads `UserRole` (the source of truth) rather than any cached JWT field.
- `primarySystemRoleFor(userId)` — display-only string ("OWNER" / "ADMIN" / etc.) used by the users list, role badges, and audit details.

Every helper is wrapped in `React.cache()` so within a single server-component render or API request the same query runs at most once.

---

## 6. MCP Proxy & Permission Filtering

The MCP proxy is the heart of the product. There are two route handlers — both implement the same JSON-RPC dispatch but differ in how they resolve permissions:

- [app/api/mcp/route.ts](app/api/mcp/route.ts) — **Generic, OAuth-account-scoped**. A single URL serves every authenticated user; the OAuth account is authoritative and the proxy aggregates that user's workspace memberships *and* direct grants. (The original per-user `/api/mcp/u/[uid]` route was removed — the URL handle was never authoritative anyway.)
- [app/api/mcp/w/[uid]/route.ts](app/api/mcp/w/[uid]/route.ts) — **Workspace-scoped**. The `uid` path parameter selects a workspace; the OAuth account is still authoritative and is additionally required to be a member of that workspace.

### 6.1 Request Lifecycle

```mermaid
sequenceDiagram
    autonumber
    participant CC as Claude Code
    participant Route as /api/mcp
    participant OIDC as provider.AccessToken
    participant DB as Postgres
    participant Filter as permission-filter
    participant Upstream as upstream-client
    participant Audit as AuditLog (after)

    CC->>Route: POST JSON-RPC + Bearer
    Route->>Route: extract bearer; if missing → 401 + WWW-Authenticate
    Route->>OIDC: find(token)
    OIDC-->>Route: AccessToken or null
    Route->>Route: validate exp, audience, scope=mcp
    Route->>DB: User.findUnique(mcpUid or accountId)
    Route->>Route: rate-limit (60/min)
    Route->>Route: parse JSON-RPC envelope
    alt tools/list
        Route->>Filter: getUserAccess(userId)
        Filter->>DB: WorkspaceUser + UserDataSourceAccess
        Filter-->>Route: Map<dataSourceId, UserAccess>
        Route->>Upstream: for each accessible DS → fetch tools (30s cache)
        Upstream-->>Route: namespaced tools (filtered)
        Route-->>CC: tools[]
    else tools/call
        Route->>Route: parse slug__tool
        Route->>Filter: assert access + level + tables
        Route->>Upstream: forward call
        Upstream-->>Route: result
        Route->>Filter: filterListedTablesText(result)
        Route-->>CC: result
    end
    Route-)Audit: after() → AuditLog row
```

### 6.2 Supported JSON-RPC Methods

| Method | Behavior |
|---|---|
| `initialize` | Returns protocol version `2025-06-18`, `capabilities.tools.listChanged: false`, and server info (see [§6.2.1](#621-serverinfo-shape)). |
| `notifications/initialized` | Accepted (fire-and-forget). |
| `notifications/cancelled` | Accepted (fire-and-forget). |
| `notifications/progress` | Accepted (fire-and-forget). |
| `ping` | Returns `{}`. |
| `tools/list` | Aggregates all tools across the user's accessible data sources, filtered by permission level + table allowlist. |
| `tools/call` | Parses `<slug>__<tool>` namespace, checks user has the required level, blocks raw-query tools when table allowlist is set, calls upstream, post-filters list-tool output, returns. |
| anything else | `METHOD_NOT_FOUND` (-32601). |

#### 6.2.1 `serverInfo` Shape

The `initialize` response includes a `serverInfo` object built by `buildServerInfo()` in both MCP route handlers:

```json
{
  "name": "MCP Gateway",
  "title": "MCP Gateway",
  "version": "<package.json version>",
  "icons": [
    { "src": "${OIDC_ISSUER}/logo.png", "sizes": "any", "mimeType": "image/png" }
  ]
}
```

The `title` and `icons` fields are forward-compatible with the **2025-11-25** MCP draft ([SEP-973](https://github.com/modelcontextprotocol/specification/pull/973)). Clients on `protocolVersion: 2025-06-18` simply ignore them; newer clients (e.g. Claude Code's current builds) display the title and icon next to the gateway's tool calls, which is helpful when a user has several MCP servers configured.

### 6.3 Tool Aggregation, Namespacing, and Discovery

- **Namespacing**: tools surface as `<connector-slug>__<tool>` (e.g., `postgres__query`, `salesforce__create_record`). The double-underscore separator is parsed in [lib/mcp/permission-filter.ts](lib/mcp/permission-filter.ts) on every `tools/call`.
- **Caching**: [lib/mcp/upstream-client.ts](lib/mcp/upstream-client.ts) keeps a per-`dataSourceId` in-memory cache of the upstream tool list with a 30-second TTL. Cache invalidation is by expiry only — no manual flush.
- **Discovery**: any tool seen for the first time is persisted to `ToolPermission` with `classifiedBy = "heuristic"` and a level chosen by [§6.6](#66-tool-classification-heuristics). The admin can later override the level via the connections page; the override carries `classifiedBy = "admin"` and is not stomped on re-discovery.
- **Fail-soft**: if an upstream errors during aggregation, the proxy logs and treats that connector's tool list as empty so a single broken connector doesn't break the whole `tools/list` response.

### 6.4 Permission Resolution

Two query helpers, both in [lib/mcp/permission-filter.ts](lib/mcp/permission-filter.ts):

- `getUserAccess(userId)` — used by `/api/mcp`. Runs two parallel Prisma queries:
  1. `WorkspaceUser → Workspace → WorkspaceDataSource → DataSource` (every data source attached to any workspace the user belongs to);
  2. `UserDataSourceAccess → DataSource` (every direct grant).

  Results merge into a single `Map<dataSourceId, UserAccess>` with:
    - `permissions`: **union** of permission levels across all grant sources;
    - `allowedTables`: **union** across sources (any source granting `null` ⇒ unrestricted; otherwise concatenated tables);
    - `sources`: tagged list noting which grants contributed (useful for the admin UI's provenance view).
- `getWorkspaceMemberAccess(workspaceId, userId)` — used by `/api/mcp/w/[uid]`. Same as above but restricted to a single workspace's data sources. **Direct user grants are intentionally ignored** so the workspace URL stays scoped to that workspace.

```mermaid
flowchart TB
    A[User signs in via OAuth] --> B{Endpoint type?}
    B -->|/api/mcp| C[getUserAccess]
    B -->|/api/mcp/w/| D[getWorkspaceMemberAccess]
    C --> E[Workspace memberships<br/>WorkspaceUser → WorkspaceDataSource]
    C --> F[Direct grants<br/>UserDataSourceAccess]
    D --> G[Only this workspace's<br/>WorkspaceDataSource]
    E --> H{Merge per DataSource}
    F --> H
    G --> H
    H --> I[permissions = union of all sources]
    H --> J[allowedTables = union;<br/>null = unrestricted]
    I --> K[Map&lt;dataSourceId, UserAccess&gt;]
    J --> K
```

### 6.5 Table Security

A defence-in-depth measure layered **on top of** whatever ACLs the upstream MCP server already enforces. Implemented in four layers:

1. **Connector-wide blocklist** (`DataSource.blockedTables`): any tool call targeting a table in this array is rejected regardless of which workspace / direct grant the caller is using. Also kills raw-query tools and post-filters list-tables responses. This is the connector owner's "permanent off-limits" list — a workspace's `allowedTables` cannot override it.
2. **Tool visibility at `tools/list`**: tools are filtered by required permission level only. Execute-level tools (Skyvia's `Execute`, raw `query`, vendor `RunReport`, etc.) stay visible even when restrictions are in effect — the SQL-validation step at `tools/call` enforces the allowlist per call. This mirrors how per-arg tools like `ObjectInfo` already work (visible in list, validated at call).
3. **Pre-call enforcement at `tools/call`**:
   - **For execute-level tools** (signal: tool resolves to `execute` level via admin override or `classifyToolByName()`'s `Execute|Run|Call|Invoke|Exec|Eval` heuristic, plus the legacy `SQL_LIKE_TOOLS` backstop set), the SQL string is extracted from the arguments (recognised keys: `sql`, `query`, `statement`, `soql`, `command`). If no top-level match is found, `extractSqlFromArgs()` looks **one level deep** under common wrapper keys (`body`, `request`, `params`) — needed because Skyvia's `Execute` shape is `{ arguments: { body: { sql: "…" }, responseFormat: "…" } }`. First hit wins; deeper nesting is not traversed. The SQL is then table-extracted via `extractTablesFromSql()`:
     1. Strip block + line comments.
     2. **Refuse outright** if the SQL contains any of `DROP|TRUNCATE|ALTER|CREATE|EXEC(UTE)?|CALL|GRANT|REVOKE|ATTACH|DETACH` — these can't be validated by table reference.
     3. Strip string literals so embedded `FROM` text doesn't trip the matcher.
     4. Match `FROM | JOIN | INTO | UPDATE | MERGE INTO <identifier>` and normalise (drop schema prefix, strip quotes/brackets/backticks).
     5. **Refuse outright** if no recognisable table references are found (no SQL argument at all, JQL / SOQL-without-FROM, or unparseable shape).
     6. Validate every extracted table against `allowedTables` (must all be in) and `blockedTables` (none may be in). Errors name the disallowed tables.
   - **For per-arg tools**, the tool arguments are scanned for a table key — known keys include `table_name`, `table`, `module`, `object_name`, `objectName`, `resource`. If the extracted value is **not** in `allowedTables` (or **is** in `blockedTables`), the call is rejected.

   The fail-closed default — when SQL extraction returns no recognisable tables, the call is refused — means JQL queries and stored-proc calls are blocked under restrictions. Users issuing standard SQL against restricted tables work as expected.
4. **Post-call response filter**: `filterListedTablesText()` parses the tool result text as JSON, Markdown pipe-table, or CSV and scrubs entries referencing disallowed tables. Wrapping keys recognised for JSON: `tables`, `objects`, `results`, `data`, `items`, `rows`. The Markdown pipe-table parser handles Skyvia's default `responseFormat: "Markdown"` output — finds a `| ... |` header row followed by a `| --- | ... |` separator, locates a name column matching the recognised name fields, and filters the data rows while preserving any surrounding prose. If the format doesn't match anything recognisable, the response is returned unchanged (intentional fail-open at the *display* layer — the pre-call filter is the security boundary).

The product **does not** rewrite or sandbox SQL. The rule is: if a tool exposes raw SQL/SOQL/APEX/SQL-DDL, table allowlists block its use entirely; otherwise table allowlists narrow which structured calls are permitted.

### 6.6 Tool Classification Heuristics

If admins haven't manually classified a tool, [lib/mcp/permission-filter.ts](lib/mcp/permission-filter.ts) maps its name to a level using these regex matches against the normalized name (lowercased, non-alphanumerics → `_`):

| Pattern (any match) | Level |
|---|---|
| `delete`, `drop`, `remove`, `destroy`, `purge`, `truncate` | `delete` |
| `execute`, `run`, `call`, `invoke`, `exec`, `eval` | `execute` |
| `insert`, `create`, `add`, `new`, `post` | `insert` |
| `update`, `upsert`, `modify`, `edit`, `patch`, `put`, `set`, `write`, `transition`, `assign`, `convert`, `merge`, `approve`, `reject`, `publish`, `unpublish`, `archive`, `restore` | `update` |
| everything else | `select` |

The matches are checked in destructive-first order, so `delete_and_create_new_record` classifies as `delete`. Admins can override per-tool in the connections page.

**UI grouping**: the admin-facing dropdown collapses the 5 raw levels into 3 buckets — **View** = `select`, **Edit** = `insert | update | execute` (toggled as a group), **Delete** = `delete`. Storage stays on the granular 5 levels; the MCP proxy gates with a set-membership check (`connector.permissions.has(required)`) so any of `insert/update/execute` is equivalent at the runtime level — picking "Edit" in the dropdown writes the canonical `update` to `ToolPermission.level`. Helpers live in [app/(dashboard)/permissions/permissions-types.ts](app/(dashboard)/permissions/permissions-types.ts): `effectiveLevelsFor`, `expandEffectiveSet`, `setEffective`.

---

## 7. Connectors / Data Sources

A "connector" is a `DataSource` row that the gateway proxies to. There are two ways an admin can create one:

- **Custom MCP URL** — paste the URL of an existing remote MCP server (Anthropic reference servers, vendor-hosted MCP servers, anything). The original flow, lives on the existing modal-form path.
- **Create connection from catalog** — pick a vendor from a curated catalog. The gateway generates its own MCP server for the new connection ([§7.6](#76-connector-catalog--in-process-adapters)).

Both paths produce a shape-identical `DataSource` row, so everything downstream (proxy, permission filter, audit, workspaces) is unaware of which path was used.

### 7.1 Configuration Model

| Field | Purpose |
|---|---|
| `slug` | Stable identifier; used in the tool namespace (`<slug>__<tool>`). Changing it after deploy will break existing tool references. |
| `type` | UI-only grouping (`operations`, `sales`, `marketing`, `database`, `performance`, `finance`, `support`, `other`). |
| `upstreamUrl` | HTTP(S) URL of the upstream MCP server's JSON-RPC endpoint. URLs matching `mcp.example.com/*` or starting with `mock:` route to the mock provider — see [§7.3](#73-mock-mode). Catalog-created connections get a loopback URL pointing at our own adapter route — see [§7.6](#76-connector-catalog--in-process-adapters). |
| `configEncrypted` | libsodium-encrypted JSON blob. See [§7.2](#72-upstream-auth-schemes) for the variants. |
| `description` | Free-form. |

### 7.2 Upstream Auth Schemes

[lib/mcp/upstream-client.ts](lib/mcp/upstream-client.ts) supports four schemes (chosen via the decrypted config):

| Scheme | Headers added |
|---|---|
| `bearer` | `Authorization: Bearer {apiKey}`. Used for custom MCP URLs with a static token, and for catalog connections that store a pasted PAT (no refresh). |
| `customHeaders` | Arbitrary key/value pairs, with reserved keys (`Authorization`, `Content-Type`, `Mcp-Session-Id`, …) stripped to avoid clobbering protocol headers. |
| `oauth` | Reads `{providerKey, accessToken, refreshToken, expiresAt}` from the encrypted config. Calls `ensureFreshOAuthToken()` to refresh the access token if it's within 60s of expiring, persists the rotated tokens back to the row, then sends `Authorization: Bearer <token>`. Refresh uses the token URL + client credentials registered in [lib/connector-oauth.ts](lib/connector-oauth.ts). |
| `none` | No auth headers. |

The `EncryptedConfig` blob also carries an optional `extra: Record<string,string>` map. Catalog connections stash per-vendor routing info there (Salesforce `instanceUrl`, Zoho `apiDomain`, Supabase `projectRef`, etc.); adapters read it to pick the right per-org base URL.

Outbound requests use a 55-second timeout. Responses are parsed as either JSON or Server-Sent Events. Outbound requests to our own loopback adapter URLs (`${OIDC_ISSUER}/api/upstream-mcp/...`) additionally carry an `x-mcpgw-internal` header set to `MCP_CONFIG_KEY` so the adapter route can reject any other caller.

### 7.3 Mock Mode

[lib/mcp/mock-upstream.ts](lib/mcp/mock-upstream.ts) intercepts URLs whose host is `mcp.example.com` or whose scheme is `mock:`. It returns deterministic responses for `initialize` / `tools/list` / `tools/call` so:

- the seeded demo connectors work without any real credentials;
- the project can be cloned, seeded, and demoed entirely offline;
- automated tests don't need network egress.

The five seeded connectors in [prisma/seed.ts](prisma/seed.ts) — **Jira Cloud**, **Zoho CRM**, **HubSpot**, **Salesforce**, **PostgreSQL** — all point at `mcp.example.com/*`. Seeded rows are independent of the in-app catalog; the catalog creates fresh rows backed by real adapters when an admin clicks through it.

### 7.4 Tool Discovery & Override

On the first `tools/list` against a connector, the upstream's tool list is cached (30s) and any new tool name is upserted into `ToolPermission` with the heuristic level. Admins can override the level on the connections detail page ([app/(dashboard)/connections/[id]/tools-editor.tsx](app/(dashboard)/connections/[id]/tools-editor.tsx)). Overrides set `classifiedBy = "admin"` and are preserved across re-discovery.

### 7.5 Admin Endpoints

| Route | Verbs | Purpose |
|---|---|---|
| [app/api/connections/route.ts](app/api/connections/route.ts) | GET, POST | List / create data sources (custom MCP URL path). |
| [app/api/connections/[id]/route.ts](app/api/connections/[id]/route.ts) | GET, PATCH, DELETE | Read / update / delete one. |
| [app/api/connections/[id]/tools/route.ts](app/api/connections/[id]/tools/route.ts) | GET | List discovered tools. |
| [app/api/connections/[id]/tools/[toolName]/route.ts](app/api/connections/[id]/tools/[toolName]/route.ts) | PATCH | Override tool level. |
| [app/api/connections/[id]/tables/route.ts](app/api/connections/[id]/tables/route.ts) | GET | Probe upstream to list tables / objects (for the table-allowlist picker UI). |
| [app/api/connections/oauth/[slug]/start/route.ts](app/api/connections/oauth/) | GET | PKCE OAuth start for catalog connectors — 302s the popup to the vendor's authorize endpoint. |
| [app/api/connections/oauth/[slug]/callback/route.ts](app/api/connections/oauth/) | GET | OAuth callback. Returns an HTML page that `window.opener.postMessage`s the tokens back to the dialog and closes the popup. **Does not** create the DataSource itself. |
| [app/api/connections/from-catalog/route.ts](app/api/connections/from-catalog/route.ts) | POST | Creates a catalog-backed DataSource from the dialog's submit body (name, accessToken, refreshToken?, advancedSettings). |
| [app/api/upstream-mcp/[adapter]/[connectorId]/route.ts](app/api/upstream-mcp/) | POST | Generic in-process MCP server. Dispatches by adapter slug. Gated by `x-mcpgw-internal: ${MCP_CONFIG_KEY}` so it can only be invoked by the gateway's own proxy. |

### 7.6 Connector Catalog & In-Process Adapters

The catalog is a hardcoded constant in [lib/connector-catalog.ts](lib/connector-catalog.ts) — 14 entries today. Each entry has a `kind`:

| Kind | Behaviour |
|---|---|
| `saas-adapter` | An in-process adapter under [lib/upstream-adapters/](lib/upstream-adapters/) translates a vendor's REST API to MCP JSON-RPC. The new DataSource gets `upstreamUrl = ${OIDC_ISSUER}/api/upstream-mcp/<adapter>/<connectorId>`. Used for HubSpot, Salesforce, Supabase, Zoho CRM. |
| `db-adapter` | Reserved for in-process database adapters (Postgres / BigQuery / Snowflake / Databricks). Currently all four are `coming-soon` — same dispatcher pattern, different adapter implementations. |
| `coming-soon` | Renders in the catalog grid (with a "Coming soon" badge) but the card is non-interactive. Used for `vertica`, `google-drive`, `google-sheets`, `onedrive`, `google-ads`, `meta-ads`. |

#### 7.6.1 Catalog UI flow

1. `Connections` page → **Add Connection** opens the chooser modal ([components/layouts/sidebar.tsx-style two-card chooser](app/(dashboard)/connections/new-connection-chooser.tsx)). One CTA goes to **Existing MCP URL** (the original form), the other to **Create connection**.
2. **Create connection** routes to [app/(dashboard)/connections/new/catalog/](app/(dashboard)/connections/new/catalog/), which renders a grid of all 14 catalog cards. Clickable cards open the **Connect to <vendor>** dialog inline; coming-soon cards are disabled.
3. The dialog ([connect-dialog.tsx](app/(dashboard)/connections/new/catalog/connect-dialog.tsx)) renders:
   - **Connection name** (defaults to the vendor name).
   - **Access token** — pasteable directly for PAT-friendly vendors (HubSpot Private Apps, Supabase `service_role` keys), AND/OR a **Sign In with <vendor>** button that opens an OAuth popup via [useOAuthPopup](lib/hooks/use-oauth-popup.ts).
   - **Advanced Settings** — collapsible. Each catalog entry declares its own `advancedSettings: AdvancedSettingDef[]` schema; the dialog renders booleans / strings / selects generically. Examples: HubSpot's "Use custom objects", Salesforce's "Sandbox" + API version, Supabase's `projectRef`, Zoho's regional domain.
4. **Continue** → POST [`/api/connections/from-catalog`](app/api/connections/from-catalog/route.ts) → DataSource is created with the right `upstreamUrl` and an encrypted `oauth`-or-`bearer` config blob.

#### 7.6.2 OAuth popup flow

```mermaid
sequenceDiagram
    autonumber
    participant Dialog as Connect dialog
    participant Popup as OAuth popup window
    participant Start as /api/connections/oauth/{slug}/start
    participant Vendor as Vendor authorize/token
    participant Callback as /api/connections/oauth/{slug}/callback
    participant FromCat as /api/connections/from-catalog

    Dialog->>Popup: window.open(slug)
    Popup->>Start: GET (admin session)
    Start->>Start: generate PKCE verifier + state, set cookie
    Start-->>Popup: 302 to Vendor authorize
    Popup->>Vendor: redirect with code_challenge + state
    Vendor-->>Popup: redirect to callback with code + state
    Popup->>Callback: GET
    Callback->>Callback: verify cookie state, exchange code for tokens
    Callback-->>Popup: HTML with postMessage(tokens)
    Popup-->>Dialog: window.postMessage({accessToken,...})
    Note over Popup: window.close()
    Dialog->>Dialog: fill access-token field, capture extras
    Dialog->>FromCat: POST {slug, name, accessToken, refreshToken?, advancedSettings}
    FromCat-->>Dialog: 201 {id}
    Dialog->>Dialog: route to /connections/{id}
```

Key safety properties of this flow:
- The popup is same-origin throughout (vendor only sees the popup window, never our app's main tab) — the `postMessage` listener filters by `event.origin === window.location.origin`.
- The OAuth state + PKCE verifier are kept in an `HttpOnly` SameSite=Lax cookie scoped to `/api/connections/oauth`; the callback rejects on mismatch.
- The callback never directly creates a DataSource — the dialog has to explicitly call `from-catalog`. This means re-OAuthing doesn't leave dead rows, and the same dialog supports OAuth and PAT input symmetrically.
- For vendors that don't support OAuth (Supabase as configured), or where credentials aren't set, the "Sign In with <vendor>" button is disabled but the dialog still works via paste.

#### 7.6.3 In-process adapter contract

Every adapter under [lib/upstream-adapters/](lib/upstream-adapters/) implements the shared interface in [types.ts](lib/upstream-adapters/types.ts):

```ts
type UpstreamAdapter = {
  name: string;
  listTools(ctx: AdapterContext): McpTool[] | Promise<McpTool[]>;
  callTool(
    ctx: AdapterContext,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<McpToolResult>;
};
type AdapterContext = {
  connectorId: string;
  cfg: EncryptedConfig;       // includes extra: Record<string,string>
  accessToken?: string;        // already-refreshed if OAuth
};
```

The generic route at [app/api/upstream-mcp/[adapter]/[connectorId]/route.ts](app/api/upstream-mcp/) handles MCP envelope concerns (JSON-RPC framing, `initialize` / `notifications/*` / `ping` / `tools/list` / `tools/call` dispatch, OAuth refresh) so adapters only need to declare their tool catalog and run individual tool calls. Adapters shipped today: `hubspot`, `salesforce`, `supabase`, `zoho-crm`.

#### 7.6.4 OAuth client credentials

Per-vendor OAuth apps must be registered separately on each vendor's developer console with redirect URI `${OIDC_ISSUER}/api/connections/oauth/<slug>/callback`. The resulting client credentials are read from env vars:

- `CONNECTOR_OAUTH_<SLUG_UPPER>_CLIENT_ID`
- `CONNECTOR_OAUTH_<SLUG_UPPER>_CLIENT_SECRET`

where `<SLUG_UPPER>` is the catalog slug uppercased with hyphens turned into underscores (`zoho-crm` → `ZOHO_CRM`). Optional overrides `_AUTHORIZE_URL`, `_TOKEN_URL`, `_SCOPES` let admins point Salesforce at sandboxes or Zoho at non-`.com` regions without code changes.

If the env vars are missing, the catalog card still renders, the OAuth button is disabled, and the dialog falls back to the PAT-paste path (for vendors that support it).

---

## 8. Workspaces & MCP URLs

### 8.1 Two URL Models

| URL | Scope | When to use |
|---|---|---|
| `/api/mcp` | All of the user's workspaces + direct grants merged | Personal use — one generic URL serves every user. The OAuth-authenticated account is authoritative; no per-user routing handle is needed. |
| `/api/mcp/w/{workspace.mcpUid}` | Only that workspace's data sources, scoped to the calling member | Team use — every member of "Sales Team" configures the same URL and gets that workspace's view (the proxy still verifies the OAuth account is a member). |

The workspace `mcpUid` is a random opaque string (24-byte base64url). **It is not a credential.** It only appears in the URL after OAuth completes, so the request must already carry a valid `Authorization: Bearer …` for the gateway to do anything. The URL segment just selects which workspace's grants apply for that authenticated user.

The original per-user URL (`/api/mcp/u/{user.mcpUid}`) was removed — the `uid` in the path was never authoritative for permissions (the OAuth account was), so it added no security but did add a needless per-user URL surface. The generic `/api/mcp` route uses the OAuth account directly. The schema still carries `User.mcpUid` for backward compatibility but it's no longer consumed.

### 8.2 Rotation

Admins can rotate the workspace `mcpUid` via [app/api/workspaces/[id]/tokens/route.ts](app/api/workspaces/[id]/tokens/route.ts). A new value is written and the old URL stops resolving on the next request. Use this if the URL is leaked to an external party (the URL alone isn't enough to access anything, but it's a defence-in-depth move).

### 8.3 Member OAuth

Every user completes their **own** OAuth flow against `/oauth/auth`. The access token is bound to that user (the OAuth account is authoritative on every JSON-RPC request); the workspace URL just selects the scope. The proxy re-checks `WorkspaceUser` membership on each request — kicking a user from a workspace immediately blocks further access through that workspace URL even if their token is still valid.

### 8.4 Seeded Workspaces

From [prisma/seed.ts](prisma/seed.ts):

- **Sales Team** — Alice (`select, insert, update`), Bob (`select`). Connected to HubSpot, Salesforce, Zoho with table allowlists (only a curated set of objects).
- **Engineering** — Carol (full), Admin (full). Connected to Jira and Postgres with no table restrictions.

### 8.5 Workspace-Scoped Admins

A `UserRole` row with a non-NULL `workspaceId` grants that role's powers only within the named workspace. The workspace detail page has a "Workspace roles" card for managing these scoped assignments without granting global admin. The Workspaces list filters to workspaces the caller can access (global admins see everything; workspace-scoped admins see only their workspaces). See [§5.3.4](#534-workspace-scoped-assignments).

### 8.6 Admin UI

- List: [app/(dashboard)/workspaces/page.tsx](app/(dashboard)/workspaces/page.tsx) — sortable table (name, data-source count, user count, created), search across name + description, content filter (`with-users` / `empty-users` / `with-sources` / `empty-sources`), bulk-select with `Delete N…`. The list is scope-filtered to the caller's accessible workspaces.
- Detail editor: [app/(dashboard)/workspaces/[id]/workspace-editor.tsx](app/(dashboard)/workspaces/[id]/workspace-editor.tsx) — data sources + per-member permissions. Name and description are edited inline in the page header ([workspace-header.tsx](app/(dashboard)/workspaces/[id]/workspace-header.tsx)) — click the title or description, Enter/blur saves, Escape cancels. The header autosave PATCHes only the changed field so a workspace-scoped admin can rename without touching the rest of the editor's state.
- URL display + rotate: [app/(dashboard)/workspaces/[id]/workspace-mcp-url.tsx](app/(dashboard)/workspaces/[id]/workspace-mcp-url.tsx).
- Single-member inline edit: `PUT /api/workspaces/[id]/users/[userId]` (gated on `workspaces.manage_data_permissions`) is also wired into the **Permissions → By User / By Connection** matrix so admins can edit a workspace member's data permissions without leaving the matrix view.
- Bulk delete: `POST /api/workspaces/bulk-delete` takes `{ workspaceIds: string[] }`. Each id is re-checked against `canInWorkspace(viewerId, "workspaces.delete", id)`; mixed-permission batches return per-row success/failure so workspace-scoped admins can bulk-delete their own scopes without 403-ing the whole request.

---

## 9. Audit Logging

### 9.1 AuditLog (per-request)

Every JSON-RPC request through the MCP proxy writes an `AuditLog` row via Next's `after()` so persistence runs **after** the response is sent — the audit write never blocks the client.

Captured columns ([prisma/schema.prisma:142](prisma/schema.prisma)):
- `userId` — OAuth-authenticated user (nullable; null when the request failed before auth completed).
- `dataSourceId` — set for tool calls; null for `initialize` / `tools/list` aggregations.
- `method` — JSON-RPC method name.
- `toolName` — namespaced tool, e.g., `postgres__query`.
- `requestJson`, `responseJson` — the full envelopes, **passed through `truncateJson()` in [lib/json.ts](lib/json.ts) (~8 KB cap each)**. Large payloads are truncated at a JSON boundary; the truncation marker is recorded in the row.
- `status` — `OK` or `ERROR`.
- `durationMs` — measured at the route handler boundary.
- `errorMessage` — surfaced on `ERROR` rows.

Indexed on five common filter combinations (see schema) — query patterns like "audit by user", "audit by data source", "errors today" all hit indexes.

### 9.2 AdminEvent (per-administrative-action)

A separate table for admin-panel actions, populated via [lib/admin-events.ts](lib/admin-events.ts). Event types include:

- `USER_LOGIN`, `USER_LOGOUT`
- `USER_CREATED`, `USER_UPDATED`, `USER_DELETED`, `USER_PASSWORD_CHANGED`, `USER_ROLE_CHANGED`
- `USER_SUSPENDED`, `USER_UNSUSPENDED`
- `USER_DATA_SOURCE_ACCESS_CHANGED`, `USER_DATA_SOURCE_ACCESS_REVOKED`
- `WORKSPACE_USER_REMOVED`, `WORKSPACE_USER_PERMISSIONS_CHANGED`
- `TOOL_LEVEL_OVERRIDDEN`
- `ROLE_CREATED`, `ROLE_UPDATED`, `ROLE_DELETED`, `ROLE_ASSIGNED`, `ROLE_UNASSIGNED`
- `PERMISSION_OVERRIDE_GRANTED`, `PERMISSION_OVERRIDE_REVOKED`

Actor (`actorId`) and target user (`targetUserId`) are both `SetNull` on delete so the audit trail survives user deletion.

`detailsJson` is passed through `truncateJson()` with a **4 KB cap** ([lib/admin-events.ts:36](lib/admin-events.ts:36)) — half the 8 KB default used for `AuditLog.requestJson` / `responseJson`. Admin actions don't carry payloads, so the smaller cap is plenty and keeps the table lean.

### 9.3 Retention Cron

[app/api/cron/prune-audit/route.ts](app/api/cron/prune-audit/route.ts) — invoked daily at 03:00 UTC by the Vercel cron declared in [vercel.json](vercel.json).

- **Authentication**: `Authorization: Bearer ${CRON_SECRET}`. Any other header returns 401.
- **Retention**: deletes `AuditLog` rows older than `AUDIT_RETENTION_DAYS` (default 90, clamped to [1, 3650]).
- **AdminEvent**: not currently pruned. Plan accordingly for long-lived deployments.

---

## 10. Cryptography & Secrets

### 10.1 Connector Config Encryption

[lib/crypto.ts](lib/crypto.ts) provides symmetric authenticated encryption for `DataSource.configEncrypted`.

- **Algorithm**: libsodium **secretbox** (XChaCha20-Poly1305 with Poly1305 MAC).
- **Key derivation**: SHA-256 of `MCP_CONFIG_KEY` → 32-byte key.
- **Nonce**: 24 random bytes per encrypt, prepended to the ciphertext and stored as a base64url `nonce.ciphertext` tuple.
- **Production fail-safe**: if `MCP_CONFIG_KEY` is unset, the module throws on first use — production refuses to start.

This protects connector credentials (API tokens, OAuth refresh tokens, custom auth headers) when the database is compromised but the env vars aren't.

The encrypted payload (the `EncryptedConfig` type in [lib/mcp/upstream-client.ts](lib/mcp/upstream-client.ts)) supports four variants:

| `authScheme` | Fields | Used by |
|---|---|---|
| `"bearer"` | `apiKey` | Custom MCP URL with a static token; catalog-created connections that store a pasted PAT (HubSpot Private App, Supabase service_role key, etc.). |
| `"customHeaders"` | `customHeaders: Record<string,string>` | Custom MCP URL with vendor-specific headers. |
| `"oauth"` | `oauth: {providerKey, accessToken, refreshToken?, expiresAt?}` | Catalog connections completed via OAuth. The upstream client refreshes the access token transparently 60s before expiry (see [`ensureFreshOAuthToken`](lib/mcp/upstream-client.ts)). |
| `"none"` | — | No auth headers added. |

All variants also carry an optional `extra: Record<string,string>` map. Catalog connections persist per-vendor routing info there (Salesforce `instanceUrl`, Zoho `apiDomain`, Supabase `projectRef`) so adapters can read it without hitting another env var.

`MCP_CONFIG_KEY` doubles as the secret for the `x-mcpgw-internal` header on loopback adapter calls (see [§7.6.3](#763-in-process-adapter-contract)), so a single env var protects both at-rest credentials and the internal-only adapter route.

### 10.2 MCP Token Hashing

When the application issues opaque tokens directly (outside the OAuth provider), [lib/crypto.ts](lib/crypto.ts) generates 32 random bytes, base64url-encodes them, and stores **only the SHA-256 hash** of the token. The plaintext is shown to the user once and never persisted. (The OAuth provider's own access/refresh tokens are stored via the OIDC adapter, separately.)

### 10.3 Password Hashing

`bcryptjs` with default cost factor. Verified at sign-in via `bcrypt.compare()`.

### 10.4 OAuth Signing Keys

JWKS is pre-generated by [scripts/generate-jwks.ts](scripts/generate-jwks.ts) (one-time bootstrap) and loaded from `OIDC_JWKS` via [lib/oidc/jwks.ts](lib/oidc/jwks.ts). RS256/ES256 keys. **No runtime rotation** — to rotate, regenerate and redeploy with the new env var (note this will invalidate every issued access/refresh token).

---

## 11. Rate Limiting

[lib/rate-limit.ts](lib/rate-limit.ts) — in-memory sliding-window per process. Each limiter is keyed by a string (IP, user id, or composite); the bucket holds a count and a reset timestamp. A lazy cleanup pass runs every 256 operations.

| Limiter | Rate | Key |
|---|---|---|
| Sign-in | 10 / 15 min | client IP |
| MCP user proxy | 60 / 60 s | user id |
| MCP workspace proxy | 60 / 60 s | `(workspaceId, userId)` pair |

**Scaling caveat**: because the buckets live in process memory, every Next.js Lambda/instance has its own limiter. The effective rate is `instances × declared_rate`. For multi-instance deploys, port to Redis (see [§18](#18-known-limitations--future-work)).

---

## 12. Admin UI Tour

All under [app/(dashboard)/](app/(dashboard)/). The route group guard in [app/(dashboard)/layout.tsx](app/(dashboard)/layout.tsx) runs `requireAuth()` server-side.

**UI stack**: shadcn/ui-style components built on Radix primitives ([@radix-ui/react-*](package.json)), Tailwind 4, Lucide icons, `next-themes` for dark/light, `class-variance-authority` + `tailwind-merge` for variants, `@radix-ui/react-toast` for toasts.

| Page | Purpose | Key files |
|---|---|---|
| Dashboard (`/`) | Overview cards (users, connectors, 24h queries, 24h errors), 7-day query chart, top users, queries-by-connector. | [app/(dashboard)/page.tsx](app/(dashboard)/page.tsx), [app/(dashboard)/dashboard-chart.tsx](app/(dashboard)/dashboard-chart.tsx), [lib/dashboard-metrics.ts](lib/dashboard-metrics.ts) |
| Connections (`/connections`) | List, create, edit data sources. **Add Connection** opens a chooser modal: "Existing MCP URL" (paste any MCP URL + headers) or "Create connection" (catalog-based flow, see [§7.6](#76-connector-catalog--in-process-adapters)). Per-connector tool list with level overrides (View / Edit / Delete dropdown). Detail page also has a **Block tables** editor and a **Used by** card listing every workspace and effective user reachable through that connector. The workspace rows in **Used by** intentionally do not show per-workspace table allowlists inline — those are managed on the workspace editor and aren't needed for "who uses this connector" provenance. Name and description are edited inline in the page header ([connection-header.tsx](app/(dashboard)/connections/[id]/connection-header.tsx)) — same pattern as the workspace header (click → input, Enter/blur saves, Escape cancels; gated on `connections.update`). | [app/(dashboard)/connections/](app/(dashboard)/connections/) |
| Users (`/users`) | Sortable / searchable list with role filter, MCP-status chip, CSV export, bulk role assignment + bulk delete. Per-user detail page has account, stats, **assigned roles**, **permission overrides**, workspace memberships, connection access, and effective-permissions cards. | [app/(dashboard)/users/](app/(dashboard)/users/) |
| Workspaces (`/workspaces`) | Sortable table — name, data-source count, user count (with member-name tooltip), created date, quick actions. Search by name/description, content filter (`With users` / `No users` / `With data sources` / `No data sources`), bulk-select with **Delete N…** (gated per-row by `workspaces.delete` — non-deletable rows stay selected but skipped). Per-row kebab: Edit, Delete. The list is scope-filtered: global admins see every workspace; workspace-scoped admins see only the ones they can reach. Detail page = CRUD workspaces, members, attached data sources, table allowlists, rotate workspace MCP URL, and a **Workspace roles** card for scoped-admin assignments. | [app/(dashboard)/workspaces/](app/(dashboard)/workspaces/) |
| Permissions (`/permissions`) | Three views: **By User**, **By Connection**, and a dense **Matrix**. Inline workspace-perm edit dialog (with a warning that workspace perms apply to every connector in the workspace), bulk grant/revoke actions. Pills use the View / Edit / Delete vocabulary throughout. The `/permissions/roles` sub-page is a sortable table (name, type, permission count, assignment count, quick actions) with search across name/slug/description and a type filter (`All` / `System` / `Custom`). System roles open the role dialog read-only; custom roles get Edit + Delete. | [app/(dashboard)/permissions/](app/(dashboard)/permissions/) |
| Audit (`/audit`) | Tabs: full audit log + query log (filtered to tool calls). CSV export via [lib/csv.ts](lib/csv.ts). | [app/(dashboard)/audit/](app/(dashboard)/audit/) |
| Settings (`/settings`) | Global settings (retention, etc.). Accessed via the avatar dropdown at the bottom of the sidebar — not a top-level nav item. | [app/(dashboard)/settings/](app/(dashboard)/settings/) |
| Specifications (`/specs`) | In-product spec viewer that renders [SPECIFICATIONS.md](SPECIFICATIONS.md) with a scroll-spy TOC rail. OWNER/ADMIN-gated. Accessed via the avatar dropdown. | [app/specs/](app/specs/) |

---

## 13. Security Measures (Checklist)

Cross-reference checklist for security review.

**Strong**:
- ✅ OAuth 2.1 with **mandatory PKCE** for all MCP clients ([§5.2](#52-mcp-endpoint-auth-oauth-21--oidc))
- ✅ Opaque access tokens with DB-backed revocation (1-hour TTL)
- ✅ Audience binding via OAuth resource indicators
- ✅ Scope check (`mcp` required) on every JSON-RPC request
- ✅ Separate session systems for admin UI vs MCP clients
- ✅ bcrypt password hashing
- ✅ libsodium XChaCha20-Poly1305 for connector credentials at rest
- ✅ Sign-in rate limiting (per-IP)
- ✅ MCP proxy rate limiting (per-user / per-(workspace,user))
- ✅ Full audit logging of every JSON-RPC call (non-blocking)
- ✅ Admin-action audit (`AdminEvent`)
- ✅ Soft-deletes (`deletedAt`) on `User` and `Workspace` — preserves audit history
- ✅ Per-data-source permission levels (raw: `select | insert | update | delete | execute`; admin UI grouped: View / Edit / Delete)
- ✅ Table-level allowlists on both workspace and direct grants
- ✅ Connector-wide blocklist (`DataSource.blockedTables`) that overrides any workspace allowlist
- ✅ Defence-in-depth: pre-call enforcement + post-response scrubbing
- ✅ Catalog-driven RBAC with 32 permissions + 8 system roles + custom roles + per-user GRANT/REVOKE overrides (with required reason + optional expiry, cleaned up by a daily cron)
- ✅ Permission-gated admin actions: `requirePermission(key)` / `requirePermissionInWorkspace(key, wsId)` / `requireAdmin` / `requireOwner`
- ✅ Workspace-scoped admin assignments via `UserRole.workspaceId`
- ✅ Cron endpoint gated by `Authorization: Bearer ${CRON_SECRET}`
- ✅ Production fail-fast on missing `MCP_CONFIG_KEY`
- ✅ MCP URLs are not credentials (OAuth bearer is authoritative)
- ✅ Token rotation invalidates the prior URL immediately
- ✅ `oidc-provider` pinned to `serverExternalPackages` to prevent state corruption
- ✅ JSON-as-string fields validated on parse (`parsePermissions`, `parseAllowedTables`) so malformed rows can't grant phantom permissions
- ✅ Audit log size-capped via `truncateJson` to bound row growth

**Known gaps** (also called out in [§18](#18-known-limitations--future-work)):
- ⚠️ No global CSP or CSRF middleware (relies on hosting platform defaults).
- ⚠️ In-memory rate limit is per-process — not adversary-proof on multi-instance deployments.
- ⚠️ JWKS is not rotatable at runtime.
- ⚠️ `AdminEvent` is not pruned by the retention cron (only `AuditLog` is).
- ⚠️ Cookie `Secure`/`HttpOnly` flags are not explicitly set in code — relies on platform defaults (Vercel sets `Secure` on HTTPS by default).
- ⚠️ The table allowlist post-response scrubber **fails open** if it can't parse the response format (intentional — the security boundary is the pre-call check).

---

## 14. Local Setup Guide

### 14.1 Prerequisites

- **Node.js 20+** and **npm** — the project pins `@types/node ^20`.
- **Postgres 14+** — local install, Docker container, or a free hosted instance (Neon / Supabase / Vercel Postgres).
- **A shell with `openssl`** — used to generate secrets. On Windows, use **PowerShell 7+** (with `openssl` from Git for Windows or scoop), **WSL**, or **Git Bash**. PowerShell-native commands are listed below where useful.

### 14.2 Step-by-Step

```bash
# 1. Clone & install
git clone <repo-url> mcp-gateway
cd mcp-gateway
npm install      # postinstall runs `prisma generate`

# 2. Copy the env template
cp .env.example .env.local
```

```bash
# 3. Generate secrets (bash / WSL / Git Bash)
echo "AUTH_SECRET=\"$(openssl rand -base64 32)\""
echo "MCP_CONFIG_KEY=\"$(openssl rand -base64 32)\""
echo "OIDC_COOKIE_KEY=\"$(openssl rand -hex 32)\""
echo "CRON_SECRET=\"$(openssl rand -hex 32)\""
npx tsx scripts/generate-jwks.ts > jwks.json
# Paste the contents of jwks.json (single line) as the value of OIDC_JWKS in .env.local
```

```powershell
# 3'. Same on Windows PowerShell (without openssl)
function Rand-Base64($n) { [Convert]::ToBase64String((1..$n | %{ Get-Random -Min 0 -Max 256 } | %{ [byte]$_ })) }
function Rand-Hex($n)    { -join (1..$n | %{ '{0:x2}' -f (Get-Random -Min 0 -Max 256) }) }
"AUTH_SECRET=`"$(Rand-Base64 32)`""
"MCP_CONFIG_KEY=`"$(Rand-Base64 32)`""
"OIDC_COOKIE_KEY=`"$(Rand-Hex 32)`""
"CRON_SECRET=`"$(Rand-Hex 32)`""
npx tsx scripts/generate-jwks.ts | Out-File jwks.json -Encoding utf8
# Paste jwks.json content into OIDC_JWKS
```

```bash
# 4. Fill in .env.local
#    DATABASE_URL  — your Postgres connection string
#    AUTH_URL      — http://localhost:3000
#    OIDC_ISSUER   — http://localhost:3000  (exact, no trailing slash)
#    (paste the secrets generated above)

# 5. Initialise the DB
npm run db:push                  # sync schema.prisma to the DB
npx tsx lib/permissions/seed.ts  # seed the RBAC catalog + 8 system roles
npm run db:seed                  # seed demo users, workspaces, connectors

# 6. Run
npm run dev
# open http://localhost:3000
```

### 14.3 Seed Accounts

From [prisma/seed.ts](prisma/seed.ts). Roles are assigned via `UserRole` rows pointing at the system role from the RBAC seed.

| Email | Password | Role | In workspaces |
|---|---|---|---|
| `admin@devart.com` | `admin123` | `owner` | Engineering (full access) |
| `alice@devart.com` | `demo123` | `user` | Sales Team (View / Edit) |
| `bob@devart.com` | `demo123` | `user` | Sales Team (View) |
| `carol@devart.com` | `demo123` | `user` | Engineering (full access) |

### 14.4 Demo Walkthrough

1. **Log in** as `admin@devart.com` / `admin123`.
2. **Dashboard** shows zero traffic (fresh DB) but lists 5 connectors and 4 users.
3. **Connections** lists Jira, Zoho, HubSpot, Salesforce, Postgres — all pointed at `mcp.example.com` so they respond from the mock provider.
4. **Workspaces → Engineering** → copy the workspace MCP URL.
5. **In Claude Code** (or any MCP client), register the URL as an MCP server. Claude Code will do the OAuth dance (PKCE flow described in [§5.2.1](#521-flow-pkce)).
6. **Back in the dashboard**, the Audit log now shows the `initialize` / `tools/list` calls. Try a tool call — observe table filtering and permission checks.

### 14.5 Verifying the Install

A clean install is correct if:

- ✅ `http://localhost:3000` redirects to a sign-in page (`/login`).
- ✅ `admin@devart.com` / `admin123` reaches the dashboard.
- ✅ All four seeded users and five seeded connectors appear.
- ✅ `GET http://localhost:3000/.well-known/oauth-authorization-server` returns JSON containing `"issuer": "http://localhost:3000"`.
- ✅ A `tools/list` against the engineering workspace (after OAuth) returns mock tools.

---

## 15. Production Deployment (Vercel + Postgres)

### 15.1 Database

Provision Postgres (Neon recommended for Vercel — pooled connection string handles serverless fan-out). The `DATABASE_URL` should be the **pooled** URL.

### 15.2 Migrations & RBAC seed

Production deploys run the `build` script from [package.json](package.json) which is:

```
prisma db push --accept-data-loss && tsx lib/permissions/seed.ts && next build
```

In order:
1. `prisma db push` syncs the `schema.prisma` model to the deployed Postgres without going through `prisma/migrations/`. The `--accept-data-loss` flag is required to drop columns the schema no longer has (e.g. when `User.role` was removed). For deployments that need a full migration history, swap this for `prisma migrate deploy` and use `prisma migrate dev` locally to generate migrations.
2. `tsx lib/permissions/seed.ts` reconciles the Permission catalog + 8 system roles + their RolePermission joins idempotently (adds new permissions, removes deleted ones). This is **how new permissions reach prod** — a code-level addition to [lib/permissions/catalog.ts](lib/permissions/catalog.ts) takes effect on the next deploy.
3. `next build` compiles the app.

The RBAC seed is safe to run repeatedly. If it fails the build fails — a half-seeded catalog never goes live.

### 15.3 Vercel Project Settings

- **Framework preset**: Next.js (auto-detected).
  - *Gotcha*: occasionally Vercel sets framework to `null`, which causes Ready builds to return `NOT_FOUND` at the edge. Fix via `PATCH /v9/projects/{id}` with `{ "framework": "nextjs" }`.
- **Build command**: default (`npm run build`, which runs the chain above).
- **Install command**: default (`npm install` — the postinstall runs `prisma generate`).
- **Environment variables**: all of the [§16](#16-environment-variables-reference) production-required vars.

### 15.4 Cron

[vercel.json](vercel.json) declares one cron — daily 03:00 UTC against `/api/cron/prune-audit`. Vercel automatically sends `Authorization: Bearer ${CRON_SECRET}`. No additional config required.

### 15.5 Smoke Tests After Deploy

```bash
# Discovery returns valid JSON with the right issuer
curl -fsS https://gateway.example.com/.well-known/oauth-authorization-server | jq .issuer

# Admin login works
curl -fsS https://gateway.example.com/auth/sign-in -o /dev/null -w '%{http_code}\n'

# Cron endpoint is bearer-gated (expect 401 without secret)
curl -i https://gateway.example.com/api/cron/prune-audit
```

### 15.6 Scaling Notes

- **Rate limiter is in-memory**: every Vercel function instance has its own buckets. The advertised rate is effectively `instances × rate`. Sticky sessions are not available on Vercel serverless — port to Redis if real rate limits matter.
- **OIDC singleton WeakMaps**: `oidc-provider`'s internal state lives in module-scoped WeakMaps. Single-function-instance behaviour is fine; horizontal scaling with per-instance Provider creates split state. Either confine OAuth to a single dedicated function or replace the Prisma adapter with a strongly-typed shared cache.
- **Audit `after()` writes**: do not race the Vercel function freeze. The platform allows in-flight `after()` work to drain — but very large `responseJson` payloads can hit the 8 KB `truncateJson` cap and still take a while to insert; consider Postgres connection pooling tuning if writes spike.

---

## 16. Environment Variables Reference

Mirrors [.env.example](.env.example) and adds usage citations.

### 16.1 Required in Production

| Variable | Format | Generate | Used in |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection string (`postgresql://user:pass@host:5432/db?sslmode=require`) | provider-specific (Neon, Vercel Postgres, Supabase) | [prisma.config.ts](prisma.config.ts), [lib/db.ts](lib/db.ts) |
| `AUTH_SECRET` | base64 (≥32 bytes) | `openssl rand -base64 32` | [lib/auth.ts](lib/auth.ts) |
| `AUTH_TRUST_HOST` | `"true"` | constant | [lib/auth.ts](lib/auth.ts) — required behind reverse proxy / on Vercel |
| `MCP_CONFIG_KEY` | base64 (≥32 bytes) | `openssl rand -base64 32` | [lib/crypto.ts](lib/crypto.ts) — **boot fails in production if unset** |
| `OIDC_ISSUER` | exact deploy origin, no trailing slash | manual | [lib/oidc/provider.ts](lib/oidc/provider.ts), discovery routes |
| `OIDC_COOKIE_KEY` | hex (32 bytes) | `openssl rand -hex 32` | [lib/oidc/provider.ts](lib/oidc/provider.ts) |
| `OIDC_JWKS` | JWKS JSON (single line) | `npx tsx scripts/generate-jwks.ts` | [lib/oidc/jwks.ts](lib/oidc/jwks.ts) |
| `CRON_SECRET` | hex (32 bytes) | `openssl rand -hex 32` | [app/api/cron/prune-audit/route.ts](app/api/cron/prune-audit/route.ts) |

### 16.2 Optional

| Variable | Default | Purpose |
|---|---|---|
| `AUTH_URL` | auto-set on Vercel; required on non-Vercel | Where Auth.js posts callback URLs to. Same as `OIDC_ISSUER` in most deployments. |
| `AUDIT_RETENTION_DAYS` | `90` (clamped to [1, 3650]) | Days of `AuditLog` retained by the daily prune cron. |
| `NODE_ENV` | set by Next.js / Node | Drives production safety checks in [lib/crypto.ts](lib/crypto.ts) and [prisma/seed.ts](prisma/seed.ts). |

### 16.3 Connector-Catalog OAuth (optional, per vendor)

For each catalog connector you want to enable the OAuth path on, register an OAuth app with the vendor (redirect URI: `${OIDC_ISSUER}/api/connections/oauth/<slug>/callback`) and set the matching pair of env vars. Without them, the catalog card still renders but the "Sign In with <vendor>" button is disabled and the dialog falls back to the paste-a-PAT path (for vendors that support PAT).

| Variable | Used by | Notes |
|---|---|---|
| `CONNECTOR_OAUTH_HUBSPOT_CLIENT_ID` / `_CLIENT_SECRET` | HubSpot | OAuth or Private App. HubSpot Private App tokens can be pasted without OAuth. |
| `CONNECTOR_OAUTH_SALESFORCE_CLIENT_ID` / `_CLIENT_SECRET` | Salesforce | OAuth-only. Override `_AUTHORIZE_URL` and `_TOKEN_URL` to `test.salesforce.com` for sandboxes. |
| `CONNECTOR_OAUTH_ZOHO_CRM_CLIENT_ID` / `_CLIENT_SECRET` | Zoho CRM | OAuth-only. Override `_AUTHORIZE_URL` and `_TOKEN_URL` for non-`.com` Zoho regions (`accounts.zoho.eu`, etc.). |
| `CONNECTOR_OAUTH_SUPABASE_CLIENT_ID` / `_CLIENT_SECRET` | Supabase | Optional — the default Supabase path uses a pasted `service_role` key. |
| `CONNECTOR_OAUTH_<SLUG>_AUTHORIZE_URL` / `_TOKEN_URL` / `_SCOPES` | any | Per-vendor URL/scope overrides without code changes. |

`<SLUG>` is the catalog slug uppercased with hyphens turned into underscores (`zoho-crm` → `ZOHO_CRM`).

---

## 17. Operational Notes

### 17.1 Adding a New MCP Connector

Two paths, depending on what kind of source you're plugging in:

**Path A — Catalog vendor** (HubSpot / Salesforce / Supabase / Zoho CRM today)
1. (Optional, OAuth only) Register an OAuth app on the vendor's developer console. Redirect URI: `${OIDC_ISSUER}/api/connections/oauth/<slug>/callback`. Set `CONNECTOR_OAUTH_<SLUG>_CLIENT_ID` / `_CLIENT_SECRET` in Vercel.
2. `/connections` → **Add Connection** → **Create connection** → pick the vendor card.
3. In the dialog: set a connection name, click **Sign In with <vendor>** (or paste a PAT), adjust advanced settings, click **Continue**.
4. The DataSource is created with `upstreamUrl = ${OIDC_ISSUER}/api/upstream-mcp/<adapter>/<id>` and a libsodium-encrypted token blob. The adapter handles tool listing and dispatch on every JSON-RPC call.
5. Grant access via Workspace memberships or direct `UserDataSourceAccess` rows, set `allowedTables` if needed.

**Path B — Custom MCP URL** (anything already running as an MCP server)
1. **Pick a slug**. It becomes the tool namespace (`<slug>__<tool>`) and must be stable forever — changing it breaks existing tool references.
2. **Create the `DataSource` row** via the admin UI (`/connections` → **Add Connection** → **Existing MCP URL**) or by seed:
   - `name`, `slug`, `type`, `upstreamUrl`.
   - Pick an auth scheme: `bearer` (one `apiKey`), `customHeaders` (free-form map), or `none`. The UI encrypts the config via [lib/crypto.ts](lib/crypto.ts) before insert.
3. **First `tools/list`** — any authorised user who hits the proxy now triggers discovery. New tools are persisted to `ToolPermission` with heuristic classification.
4. **Review classifications** in `/connections/{id}`. Override anything the heuristic got wrong (especially destructive tools mis-classified as `select`).
5. **Grant access** via either:
   - Attach the connector to a `Workspace` (`WorkspaceDataSource`) and add `WorkspaceUser` rows for members; or
   - Add `UserDataSourceAccess` rows for specific users.
6. **Set `allowedTables`** if you want table-level restrictions. Leave `null` for unrestricted.
7. **Probe** with [scripts/probe-upstream.ts](scripts/probe-upstream.ts) to verify connectivity before announcing the connector to users.

**Path C — Adding a new catalog adapter** (developer task; not in the admin UI)
1. Add an entry to `CONNECTOR_CATALOG` in [lib/connector-catalog.ts](lib/connector-catalog.ts) with `kind: "saas-adapter"` (or `"db-adapter"`).
2. Write the adapter file under [lib/upstream-adapters/](lib/upstream-adapters/) implementing the `UpstreamAdapter` interface in [types.ts](lib/upstream-adapters/types.ts).
3. Register it in the `ADAPTERS` map in [app/api/upstream-mcp/[adapter]/[connectorId]/route.ts](app/api/upstream-mcp/).
4. If OAuth: add a provider entry to `PROVIDERS` in [lib/connector-oauth.ts](lib/connector-oauth.ts) and document the env-var names in [.env.example](.env.example).

### 17.2 Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `MCP_CONFIG_KEY is required` at boot | env var missing in production | Set `MCP_CONFIG_KEY` and redeploy. |
| `AccessToken.save` errors mentioning `instance(provider)` | `oidc-provider` got bundled by Next, duplicating its WeakMap | Confirm `oidc-provider` is still in `serverExternalPackages` in [next.config.ts](next.config.ts). |
| `tools/list` returns `[]` for everything | Upstream errors fail soft to `[]` | Check the audit log for the upstream error; verify `upstreamUrl`, the connector's encrypted auth config, and that the upstream is reachable from the deploy environment. |
| 401 on every MCP call | Token expired (1h TTL) or audience mismatch | Re-OAuth in Claude Code. If audience: confirm `OIDC_ISSUER` is the exact deploy origin with no trailing slash. |
| Workspace URL stops working with no warning | Admin rotated the workspace `mcpUid` | This is by design — old URL is invalidated. Send the new URL to members. |
| Sign-in says "too many attempts" | Per-IP rate limit (10 / 15 min) | Wait, or restart the dev server to clear the in-memory bucket. |
| `prisma migrate deploy` complains about drift | Local dev DB was edited via `db:push` after the migration baseline was generated | Run `npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script` to produce a corrective migration, or `prisma migrate reset` against the local DB and re-seed. |
| Vercel deployment Ready but root URL returns NOT_FOUND | Framework preset = `null` | `PATCH /v9/projects/{id}` with `{"framework":"nextjs"}` via the Vercel REST API. |

### 17.3 Common Maintenance Tasks

| Task | Command / route |
|---|---|
| Reset a user's password | `npx tsx scripts/set-password.ts <email>` |
| Dump audit log to CSV | `npx tsx scripts/dump-audit.ts` |
| Inspect user access matrix | `npx tsx scripts/dump-user-access.ts` |
| Apply DB migrations | `npm run db:migrate` (= `prisma migrate deploy`) |
| Open the DB browser | `npm run db:studio` |

---

## 18. Known Limitations / Future Work

| Area | Limitation | Path forward |
|---|---|---|
| Database | Postgres-only (no SQLite fallback). | Use Docker Postgres locally; that's the supported flow. |
| Rate limit | In-memory per process; effective rate = `instances × declared`. | Port [lib/rate-limit.ts](lib/rate-limit.ts) to Redis (Upstash) for multi-instance deploys. |
| OAuth state | `oidc-provider` WeakMaps are per-process. | Multi-instance deploys need a shared cache or routing affinity. |
| Tool list cache | 30-second TTL, in-memory, no manual flush. | Add a cache-buster button or use Redis with PubSub-driven invalidation. |
| AdminEvent retention | Not pruned by the audit cron. | Extend the cron, or accept unbounded growth (low cardinality). |
| CSP / CSRF | No explicit middleware. Relies on Auth.js's built-in CSRF for its own routes. | Add a `proxy` (Next 16 renaming of middleware) with strict CSP + CSRF for non-Auth.js routes. |
| JWKS rotation | Static keys via env var; no runtime rotation. | Implement key-rolling in [lib/oidc/jwks.ts](lib/oidc/jwks.ts); be aware it invalidates all issued tokens unless you publish both old and new keys for a transition period. |
| Demo data | All seeded connectors point at `mcp.example.com/*` — mock-only. The connector catalog ([§7.6](#76-connector-catalog--in-process-adapters)) is the real path for going live. | Use the catalog flow at `/connections/new/catalog` to create real connections; replace seed rows only if you specifically want the demo connectors to hit real endpoints. |
| Catalog adapters shipped | 4 active (HubSpot, Salesforce, Supabase, Zoho CRM) + 10 coming-soon cards (Postgres / BigQuery / Snowflake / Databricks / Vertica / Google Drive / Sheets / OneDrive / Google Ads / Meta Ads). | DB adapters next — same dispatcher pattern, use the matching npm SDK per vendor. |
| Connector retry | No retry/backoff on upstream failures (just 55s timeout). | Wrap [lib/mcp/upstream-client.ts](lib/mcp/upstream-client.ts) with `p-retry` or similar. |
| Catalog OAuth scaling | One OAuth client per vendor per deploy (env vars), so all gateway admins share the same vendor app. | Per-tenant OAuth clients via a DB-backed config table once multi-tenant scope is in scope. |
| Workspace invites | No invitation flow yet — admins create users directly. | Add an invite/accept handshake. |
| Logging | Audit log only; no application logging pipeline. | Add structured logging (pino?) and ship to a sink. |

---

*End of specifications. For project conventions and gotchas not covered here, see [AGENTS.md](AGENTS.md) and [CLAUDE.md](CLAUDE.md).*
