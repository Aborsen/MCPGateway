import { cache } from "react";
import { prisma } from "@/lib/db";
import type { Permission } from "./catalog";
import { LEGACY_ROLE_TO_SLUG, SYSTEM_ROLES } from "./catalog";

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

// Feature flag: when "true", the resolver reads from the new RBAC tables
// (UserRole + RolePermission + UserPermissionOverride). When unset/false,
// it falls back to translating the legacy User.role string into the
// equivalent system-role permission set from catalog.ts.
//
// Both paths return identical results for users who haven't been migrated
// beyond the legacy role string, because the seed populates UserRole rows
// that mirror the legacy role exactly. The flag exists so PR2 can ship
// the rewired guards safely — flip the flag to roll back the engine
// without reverting code.
function useNewRbac(): boolean {
  return process.env.USE_NEW_RBAC === "true";
}

// Legacy resolver. Cached just like the new one. Reads the User.role
// string and maps via SYSTEM_ROLES from catalog.ts. The output Set is the
// same the new path would produce for a user who only has a global role
// matching their legacy string.
const _permissionsFromLegacyRole = cache(
  async (userId: string): Promise<Set<string>> => {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, deletedAt: true, suspendedAt: true },
    });
    if (!user || user.deletedAt || user.suspendedAt) return new Set();
    const slug = LEGACY_ROLE_TO_SLUG[user.role] ?? "user";
    const def = SYSTEM_ROLES.find((r) => r.slug === slug);
    return new Set(def?.permissions ?? []);
  },
);

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
  const set = useNewRbac()
    ? await _permissionsForUser(userId, scope?.workspaceId ?? null)
    : await _permissionsFromLegacyRole(userId);
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
