// Role-based access control. Single source of truth for which role can view
// or edit which top-level resource. Keep this file pure — no Prisma, no
// next/server imports — so it can be used in client components too.

export const ROLES = ["OWNER", "ADMIN", "EDITOR", "STAFF", "GUEST", "USER"] as const;
export type Role = (typeof ROLES)[number];

export const RESOURCES = [
  "dashboard",
  "connections",
  "workspaces",
  "users",
  "permissions",
  "audit",
  "settings",
] as const;
export type Resource = (typeof RESOURCES)[number];

type Access = { view: ReadonlySet<Resource>; edit: ReadonlySet<Resource> };
const s = (...r: Resource[]): ReadonlySet<Resource> => new Set(r);

export const ROLE_PERMISSIONS: Record<Role, Access> = {
  OWNER: {
    view: s(...RESOURCES),
    edit: s(...RESOURCES),
  },
  ADMIN: {
    view: s(...RESOURCES),
    edit: s("dashboard", "connections", "workspaces", "users", "permissions", "audit", "settings"),
  },
  EDITOR: {
    view: s("dashboard", "connections", "audit", "settings"),
    edit: s("connections", "settings"),
  },
  STAFF: {
    view: s("dashboard", "workspaces", "settings"),
    edit: s("settings"),
  },
  GUEST: {
    view: s("dashboard", "connections", "workspaces", "settings"),
    edit: s("settings"),
  },
  USER: {
    view: s(),
    edit: s(),
  },
};

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  EDITOR: "Editor",
  STAFF: "Staff",
  GUEST: "Guest",
  USER: "User",
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  OWNER: "Full access, including destructive ops and OWNER role assignments.",
  ADMIN: "Full access except changing OWNER assignments.",
  EDITOR: "View Dashboard, Connections, Audit. Connect or delete MCP servers.",
  STAFF: "View-only Dashboard and Workspaces.",
  GUEST: "View-only Dashboard, Connections, Workspaces.",
  USER: "MCP usage only — no dashboard access.",
};

export const ROLE_BADGE_VARIANT: Record<
  Role,
  "destructive" | "default" | "secondary" | "outline" | "success"
> = {
  OWNER: "destructive",
  ADMIN: "default",
  EDITOR: "success",
  STAFF: "secondary",
  GUEST: "outline",
  USER: "secondary",
};

function asRole(role: string): Role | undefined {
  return (ROLES as readonly string[]).includes(role) ? (role as Role) : undefined;
}

export function canView(role: string, resource: Resource): boolean {
  const r = asRole(role);
  if (!r) return false;
  return ROLE_PERMISSIONS[r].view.has(resource);
}

export function canEdit(role: string, resource: Resource): boolean {
  const r = asRole(role);
  if (!r) return false;
  return ROLE_PERMISSIONS[r].edit.has(resource);
}

export function hasAnyDashboardAccess(role: string): boolean {
  const r = asRole(role);
  if (!r) return false;
  return ROLE_PERMISSIONS[r].view.size > 0;
}

export function badgeVariantFor(role: string) {
  const r = asRole(role);
  return r ? ROLE_BADGE_VARIANT[r] : "secondary";
}

export function labelFor(role: string): string {
  const r = asRole(role);
  return r ? ROLE_LABEL[r] : role;
}
