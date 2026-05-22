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
