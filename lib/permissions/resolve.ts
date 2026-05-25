import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Permission } from "./catalog";

// Permission resolver. Computes a user's effective permission set as:
//   (UNION of permissions from every assigned UserRole that matches scope)
//   + (GRANT overrides for that scope)
//   − (REVOKE overrides for that scope)
//
// Cached via React.cache: the same (userId, workspaceId) inside one request
// hits the DB once. In Next 16, this applies to Server Components, Server
// Actions, and Route Handlers — i.e. every server entry point we have.
//
// "Scope" carries an optional workspaceId. A global-scoped query returns
// every permission the user has globally (UserRole.workspaceId IS NULL)
// PLUS overrides at workspaceId=NULL. A workspace-scoped query additionally
// includes UserRoles and overrides bound to that workspaceId — so a
// workspace_admin assignment naturally widens the user's permission set
// only when the question is "can they do X in workspace W?".

export type Scope = { workspaceId: string } | undefined;

// Internal: one DB roundtrip per (user, scope), wrapped in React.cache so
// repeated calls within the same request are deduped automatically.
const _permissionsForUser = cache(
  async (userId: string, workspaceId: string | null): Promise<Set<string>> => {
    // Query 1: all UserRole rows in scope, expanded to their permission keys.
    const roleRows = await prisma.userRole.findMany({
      where: {
        userId,
        // Match: this role applies globally (workspaceId IS NULL) OR is
        // pinned to the workspace we're asking about.
        OR: [{ workspaceId: null }, ...(workspaceId ? [{ workspaceId }] : [])],
      },
      select: {
        role: {
          select: {
            rolePermissions: { select: { permissionKey: true } },
          },
        },
      },
    });

    const perms = new Set<string>();
    for (const ur of roleRows) {
      for (const rp of ur.role.rolePermissions) {
        perms.add(rp.permissionKey);
      }
    }

    // Query 2: overrides in scope. We filter expiry in memory because the
    // expiry list is short per user; combining "(workspaceId match) AND
    // (expiresAt IS NULL OR > now)" via Prisma is awkward and slower.
    const now = new Date();
    const overrides = await prisma.userPermissionOverride.findMany({
      where: {
        userId,
        OR: [{ workspaceId: null }, ...(workspaceId ? [{ workspaceId }] : [])],
      },
      select: { permissionKey: true, effect: true, expiresAt: true },
    });

    for (const o of overrides) {
      if (o.expiresAt && o.expiresAt <= now) continue;
      if (o.effect === "GRANT") perms.add(o.permissionKey);
      else if (o.effect === "REVOKE") perms.delete(o.permissionKey);
    }

    return perms;
  },
);

export async function permissionsForUser(
  userId: string,
  scope?: Scope,
): Promise<Set<Permission>> {
  const set = await _permissionsForUser(userId, scope?.workspaceId ?? null);
  return set as Set<Permission>;
}

export async function can(
  userId: string,
  permission: Permission,
  scope?: Scope,
): Promise<boolean> {
  const set = await permissionsForUser(userId, scope);
  return set.has(permission);
}

export async function canInWorkspace(
  userId: string,
  permission: Permission,
  workspaceId: string,
): Promise<boolean> {
  return can(userId, permission, { workspaceId });
}

// Convenience: "does this user have ANY permission in the named category?"
// Used for sidebar visibility and similar coarse checks.
export async function canSeeCategory(
  userId: string,
  category: string,
  scope?: Scope,
): Promise<boolean> {
  const set = await permissionsForUser(userId, scope);
  for (const key of set) {
    if (key.startsWith(`${category}.`)) return true;
  }
  return false;
}

// Is this user assigned the global "owner" system role? Reads UserRole
// rather than the (possibly stale) JWT role string. Used for the Owner-only
// invariants (last-Owner guard, only-Owner-touches-Owner) that need a fresh
// check against the DB regardless of when the session was issued.
//
// Cached per-request like the other lookups.
export const isOwnerUser = cache(async (userId: string): Promise<boolean> => {
  const row = await prisma.userRole.findFirst({
    where: {
      userId,
      workspaceId: null,
      role: { slug: "owner", isSystem: true },
    },
    select: { id: true },
  });
  return !!row;
});

// Is this user assigned the owner or admin system role globally? Cheap
// boolean used by requireAdmin and a few places that used to compare
// session.user.role against ADMIN_ROLES.
export const isAdminUser = cache(async (userId: string): Promise<boolean> => {
  const row = await prisma.userRole.findFirst({
    where: {
      userId,
      workspaceId: null,
      role: { slug: { in: ["owner", "admin"] }, isSystem: true },
    },
    select: { id: true },
  });
  return !!row;
});

// What's the user's "primary" system role for display purposes? PR2b
// dropped User.role so the UI can no longer read a single string off the
// user record. Instead, return the slug of the user's first global
// system-role UserRole (uppercased to match legacy strings like "ADMIN",
// "OWNER", etc.). Returns "USER" if no system role found, which matches
// the legacy default.
//
// "Primary" here is a UX convention. A user with multiple system roles
// shows only one in single-string contexts (the users list "Role" column,
// the badge in settings). The full set is on /users/[id] under "Assigned
// roles". Owner wins over Admin wins over Editor etc.
const SYSTEM_ROLE_PRIORITY = ["owner", "admin", "editor", "staff", "guest", "user"];

export const primarySystemRoleFor = cache(
  async (userId: string): Promise<string> => {
    const rows = await prisma.userRole.findMany({
      where: {
        userId,
        workspaceId: null,
        role: { isSystem: true },
      },
      select: { role: { select: { slug: true } } },
    });
    const slugs = new Set(rows.map((r) => r.role.slug));
    for (const slug of SYSTEM_ROLE_PRIORITY) {
      if (slugs.has(slug)) return slug.toUpperCase();
    }
    return "USER";
  },
);

// Batched version of primarySystemRoleFor — fetch the primary slug for
// many users in a single query. The users list and CSV export use this.
export async function primarySystemRolesByUserId(
  userIds: string[],
): Promise<Map<string, string>> {
  if (userIds.length === 0) return new Map();
  const rows = await prisma.userRole.findMany({
    where: {
      userId: { in: userIds },
      workspaceId: null,
      role: { isSystem: true },
    },
    select: { userId: true, role: { select: { slug: true } } },
  });
  const byUser = new Map<string, Set<string>>();
  for (const r of rows) {
    const set = byUser.get(r.userId) ?? new Set<string>();
    set.add(r.role.slug);
    byUser.set(r.userId, set);
  }
  const out = new Map<string, string>();
  for (const id of userIds) {
    const slugs = byUser.get(id) ?? new Set();
    let primary = "USER";
    for (const slug of SYSTEM_ROLE_PRIORITY) {
      if (slugs.has(slug)) {
        primary = slug.toUpperCase();
        break;
      }
    }
    out.set(id, primary);
  }
  return out;
}

// Which workspaces is this user allowed to see?
//   { all: true }                — user has global workspaces.view (Owner,
//                                   Admin, Staff, Guest etc.); show every
//                                   workspace.
//   { all: false, ids: Set<id> } — user only has scoped roles on specific
//                                   workspaces; show only those.
//
// A user with NO global workspaces.view but a UserRole(workspaceId=W) row
// that grants workspaces.view through their role definition shows up here
// with ids={W}. The list page filters workspace results accordingly.
//
// Cached per-request.
export type WorkspaceAccess = { all: true } | { all: false; ids: Set<string> };

export const accessibleWorkspaceIds = cache(
  async (userId: string): Promise<WorkspaceAccess> => {
    // Cheap fast path: does the user have any global role that grants
    // workspaces.view?
    const globalSet = await permissionsForUser(userId);
    if (globalSet.has("workspaces.view")) {
      return { all: true };
    }

    // Otherwise enumerate every scoped UserRole the user holds. For each
    // distinct workspaceId, check whether that role's permission set
    // includes workspaces.view.
    const scoped = await prisma.userRole.findMany({
      where: { userId, workspaceId: { not: null } },
      include: {
        role: {
          select: {
            rolePermissions: { select: { permissionKey: true } },
          },
        },
      },
    });

    const ids = new Set<string>();
    for (const ur of scoped) {
      if (!ur.workspaceId) continue;
      const grantsView = ur.role.rolePermissions.some(
        (rp) => rp.permissionKey === "workspaces.view",
      );
      if (grantsView) ids.add(ur.workspaceId);
    }
    return { all: false, ids };
  },
);
