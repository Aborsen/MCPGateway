// Role display helpers. This file used to host the static role × resource
// matrix that drove canView/canEdit/hasAnyDashboardAccess — Phase 2 moved
// all permission decisions to lib/permissions/* and what remains here is
// purely for rendering labels and badge colors.
//
// Pure: no Prisma, no next/server imports, safe in client components.

export const ROLES = ["OWNER", "ADMIN", "EDITOR", "STAFF", "GUEST", "USER"] as const;
export type Role = (typeof ROLES)[number];

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

export function badgeVariantFor(role: string) {
  const r = asRole(role);
  return r ? ROLE_BADGE_VARIANT[r] : "secondary";
}

export function labelFor(role: string): string {
  const r = asRole(role);
  return r ? ROLE_LABEL[r] : role;
}
