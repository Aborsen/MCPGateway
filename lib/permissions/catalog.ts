// Permission catalog — single source of truth for every action the RBAC
// engine knows about. Referenced by:
//   - lib/permissions/seed.ts  → upserts these into the Permission table
//   - lib/permissions/resolve.ts → uses the derived Permission type for can()
//   - every guard in API routes and pages (PR2)
//
// To add a permission: add an entry below, re-run the seed (idempotent),
// then reference the new key in code. The build-time type check guarantees
// no typo'd keys reach prod.
//
// Editing this file is a schema-level change for the RBAC system. Removing
// a permission requires either updating every Role that grants it OR
// accepting that the foreign-key cascade will silently drop those grants.

export const PERMISSION_ENTRIES = [
  // ── dashboard ─────────────────────────────────────────────────────────
  {
    key: "dashboard.view",
    label: "View dashboard",
    category: "dashboard",
    scopeable: false,
    description: "See the dashboard metrics, charts, and top-users table.",
  },

  // ── connections ───────────────────────────────────────────────────────
  {
    key: "connections.view",
    label: "View connections",
    category: "connections",
    scopeable: false,
    description: "List connections, view connection detail, browse tool catalog and tables.",
  },
  {
    key: "connections.create",
    label: "Create connections",
    category: "connections",
    scopeable: false,
    description: "Add a new connection — either via the catalog (HubSpot, Salesforce, etc.) or by pasting an existing MCP URL.",
  },
  {
    key: "connections.update",
    label: "Update connections",
    category: "connections",
    scopeable: false,
    description: "Rename, edit description, change the upstream URL.",
  },
  {
    key: "connections.delete",
    label: "Delete connections",
    category: "connections",
    scopeable: false,
    description: "Remove a connection. Cascades to remove it from workspaces and any direct grants.",
  },
  {
    key: "connections.manage_credentials",
    label: "Manage connection credentials",
    category: "connections",
    scopeable: false,
    description: "Set, rotate, or clear connection credentials (API keys, OAuth tokens, custom headers). Split from .update because credentials are higher-sensitivity.",
  },
  {
    key: "connections.manage_tools",
    label: "Override tool permission levels",
    category: "connections",
    scopeable: false,
    description: "Override the heuristic that classifies each tool as SELECT/INSERT/UPDATE/DELETE/EXECUTE.",
  },

  // ── users ─────────────────────────────────────────────────────────────
  {
    key: "users.view",
    label: "View users",
    category: "users",
    scopeable: false,
    description: "List users, view user detail and their workspace assignments.",
  },
  {
    key: "users.create",
    label: "Create users",
    category: "users",
    scopeable: false,
    description: "Invite or create a new user account.",
  },
  {
    key: "users.update",
    label: "Update users",
    category: "users",
    scopeable: false,
    description: "Edit a user's name. Required to land on the user detail edit surface.",
  },
  {
    key: "users.change_role",
    label: "Change user role",
    category: "users",
    scopeable: false,
    description: "Assign or replace which role(s) a user holds.",
  },
  {
    key: "users.suspend",
    label: "Suspend users",
    category: "users",
    scopeable: false,
    description: "Block a user from signing in and from using the MCP endpoint.",
  },
  {
    key: "users.delete",
    label: "Delete users",
    category: "users",
    scopeable: false,
    description: "Soft-delete a user. Their grants and memberships are revoked.",
  },
  {
    key: "users.reset_password",
    label: "Reset user password",
    category: "users",
    scopeable: false,
    description: "Set a new password for a user.",
  },

  // ── workspaces ────────────────────────────────────────────────────────
  {
    key: "workspaces.view",
    label: "View workspaces",
    category: "workspaces",
    scopeable: false,
    description: "List workspaces and view detail. When scoped, only the workspaces in scope are visible.",
  },
  {
    key: "workspaces.create",
    label: "Create workspaces",
    category: "workspaces",
    scopeable: false,
    description: "Create a new workspace. Always global — not scopeable.",
  },
  {
    key: "workspaces.update",
    label: "Update workspaces",
    category: "workspaces",
    scopeable: true,
    description: "Edit name and description. Scope to a specific workspace to limit to that one.",
  },
  {
    key: "workspaces.delete",
    label: "Delete workspaces",
    category: "workspaces",
    scopeable: true,
    description: "Soft-delete a workspace. Scope to limit which.",
  },
  {
    key: "workspaces.manage_members",
    label: "Manage workspace members",
    category: "workspaces",
    scopeable: true,
    description: "Add or remove users from the workspace. Does NOT include setting their data permissions — that's manage_data_permissions.",
  },
  {
    key: "workspaces.manage_data_sources",
    label: "Manage workspace connections",
    category: "workspaces",
    scopeable: true,
    description: "Attach or detach connections from the workspace; set table allowlists.",
  },
  {
    key: "workspaces.manage_data_permissions",
    label: "Manage workspace data permissions",
    category: "workspaces",
    scopeable: true,
    description: "Set each member's SQL-level select/insert/update/delete/execute permissions (the MCP-proxy data layer). Split from manage_members so an admin can add people without granting them DELETE on data.",
  },

  // ── permissions ───────────────────────────────────────────────────────
  {
    key: "permissions.view",
    label: "View permission admin pages",
    category: "permissions",
    scopeable: false,
    description: "See the roles list, role detail, and the per-user access pages.",
  },
  {
    key: "permissions.manage_roles",
    label: "Manage roles",
    category: "permissions",
    scopeable: false,
    description: "Create, edit, and delete custom roles; pick which permissions each grants. System roles are read-only.",
  },
  {
    key: "permissions.manage_assignments",
    label: "Assign roles",
    category: "permissions",
    scopeable: false,
    description: "Assign or unassign roles to users, globally or workspace-scoped.",
  },
  {
    key: "permissions.manage_overrides",
    label: "Author permission overrides",
    category: "permissions",
    scopeable: false,
    description: "Grant or revoke individual permissions on top of a user's roles. Separate from .manage_assignments because overrides are the sharp tool for one-off exceptions.",
  },

  // ── audit ─────────────────────────────────────────────────────────────
  {
    key: "audit.view_own",
    label: "View own audit log",
    category: "audit",
    scopeable: false,
    description: "See only your own audit rows. Admin events are hidden.",
  },
  {
    key: "audit.view_all",
    label: "View all audit logs",
    category: "audit",
    scopeable: false,
    description: "See every user's audit rows.",
  },
  {
    key: "audit.view_admin_events",
    label: "View admin events",
    category: "audit",
    scopeable: false,
    description: "Also see AdminEvent rows: role changes, sign-ins, etc.",
  },
  {
    key: "audit.export",
    label: "Export audit data",
    category: "audit",
    scopeable: false,
    description: "Download the audit log as CSV.",
  },

  // ── settings ──────────────────────────────────────────────────────────
  {
    key: "settings.view",
    label: "View settings",
    category: "settings",
    scopeable: false,
    description: "See the settings page (own profile + system settings).",
  },
  {
    key: "settings.manage_system",
    label: "Manage system settings",
    category: "settings",
    scopeable: false,
    description: "Change global settings like audit retention, environment toggles.",
  },
] as const;

export type PermissionEntry = (typeof PERMISSION_ENTRIES)[number];
export type Permission = PermissionEntry["key"];
export type PermissionCategory = PermissionEntry["category"];

// Compile-time map for fast lookup by key.
export const PERMISSION_BY_KEY: Record<Permission, PermissionEntry> = Object.fromEntries(
  PERMISSION_ENTRIES.map((p) => [p.key, p]),
) as Record<Permission, PermissionEntry>;

// All keys as a readonly set — useful for the build-time check that asserts
// every key referenced in source exists in the catalog.
export const PERMISSION_KEYS: ReadonlySet<Permission> = new Set(
  PERMISSION_ENTRIES.map((p) => p.key),
) as ReadonlySet<Permission>;

// Permissions grouped by category for UI rendering.
export function permissionsByCategory(): Record<PermissionCategory, PermissionEntry[]> {
  const out = {} as Record<PermissionCategory, PermissionEntry[]>;
  for (const p of PERMISSION_ENTRIES) {
    if (!out[p.category]) out[p.category] = [];
    out[p.category].push(p);
  }
  return out;
}

// ─── System role definitions ─────────────────────────────────────────────
// These are seeded with isSystem=true. They cannot be edited or deleted via
// the admin UI. New keys can be added here — the seed will reconcile.

export type SystemRoleDef = {
  slug: string;
  name: string;
  description: string;
  permissions: ReadonlyArray<Permission>;
};

const ALL_PERMISSIONS = PERMISSION_ENTRIES.map((p) => p.key);

export const SYSTEM_ROLES: ReadonlyArray<SystemRoleDef> = [
  {
    slug: "owner",
    name: "Owner",
    description: "Org root. Holds every permission and is the only role allowed to delete users, assign the Owner role, or manage the permission system itself.",
    permissions: ALL_PERMISSIONS,
  },
  {
    slug: "admin",
    name: "Admin",
    description: "Day-to-day administrator. Holds every permission. Can create, edit, and delete users and custom roles. Owner-role assignment and Owner-account deletion remain restricted to Owners.",
    permissions: ALL_PERMISSIONS,
  },
  {
    slug: "editor",
    name: "Editor",
    description: "Connector manager. Can view the dashboard, fully manage connections, and read the audit log.",
    permissions: [
      "dashboard.view",
      "connections.view",
      "connections.create",
      "connections.update",
      "connections.delete",
      "connections.manage_credentials",
      "audit.view_all",
      "settings.view",
    ],
  },
  {
    slug: "staff",
    name: "Staff",
    description: "Read-only operator. Sees the dashboard and the workspaces list.",
    permissions: ["dashboard.view", "workspaces.view", "settings.view"],
  },
  {
    slug: "guest",
    name: "Guest",
    description: "Read-only across most surfaces (dashboard, connections, workspaces).",
    permissions: [
      "dashboard.view",
      "connections.view",
      "workspaces.view",
      "settings.view",
    ],
  },
  {
    slug: "user",
    name: "User",
    description: "MCP client only. No dashboard access; can still use MCP via OAuth.",
    permissions: [],
  },
  {
    slug: "workspace_admin",
    name: "Workspace Admin",
    description: "Designed for workspace-scoped assignment. Manages members, connections, and data permissions within their assigned workspace; sees their own audit activity.",
    permissions: [
      "dashboard.view",
      "workspaces.view",
      "workspaces.update",
      "workspaces.delete",
      "workspaces.manage_members",
      "workspaces.manage_data_sources",
      "workspaces.manage_data_permissions",
      "audit.view_own",
      "settings.view",
    ],
  },
  {
    slug: "workspace_member",
    name: "Workspace Member",
    description: "Workspace-scoped read-only. Sees their workspace and uses MCP within it; no admin capabilities.",
    permissions: ["dashboard.view", "workspaces.view", "settings.view"],
  },
];

// Map from legacy User.role string → system role slug. PR2b dropped the
// column itself, but the mapping is still useful at API boundaries that
// accept the uppercase legacy form (the role select dropdown, the bulk
// assign body) so we can resolve to the right system role record.
export const LEGACY_ROLE_TO_SLUG: Record<string, string> = {
  OWNER: "owner",
  ADMIN: "admin",
  EDITOR: "editor",
  STAFF: "staff",
  GUEST: "guest",
  USER: "user",
};
