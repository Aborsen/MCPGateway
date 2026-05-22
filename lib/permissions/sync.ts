import { prisma } from "@/lib/db";
import { LEGACY_ROLE_TO_SLUG } from "./catalog";

// Keeps the new UserRole mirror in sync with the legacy User.role string.
//
// During the PR2 transition, User.role remains the field admins set from
// the existing user-edit UI. The resolver (lib/permissions/resolve.ts) with
// USE_NEW_RBAC=true reads UserRole, *not* User.role — so without this sync
// any role change made via the UI is invisible to the new engine.
//
// Contract:
//   - Removes every global, system-role UserRole row for the user.
//   - Inserts exactly one global UserRole pointing at the system Role whose
//     slug matches the new legacy string.
//   - Leaves workspace-scoped UserRoles and custom (isSystem=false) Roles
//     completely alone. Custom roles + per-workspace assignments are an
//     orthogonal axis the legacy column doesn't model.
//
// Idempotent: safe to call from create, update, and any future migration
// path. Run inside a transaction by the caller if atomicity matters; the
// two ops below are tiny and the worst case is a race window of a few ms
// where the user has zero roles — the resolver returns an empty set then,
// which is the safest possible fail-mode.
export async function syncUserRoleMirror(
  userId: string,
  newLegacyRole: string,
): Promise<void> {
  const slug = LEGACY_ROLE_TO_SLUG[newLegacyRole] ?? "user";
  const role = await prisma.role.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (!role) {
    // Seed hasn't populated system roles yet (only happens on a fresh DB
    // before the rbac-seed has run). Surface loudly — the next build/seed
    // will reconcile, but the role change won't take effect until then.
    console.warn(
      `[rbac-sync] no system Role with slug=${slug}; cannot sync ${userId}. Run the rbac seed.`,
    );
    return;
  }

  await prisma.$transaction([
    prisma.userRole.deleteMany({
      where: {
        userId,
        workspaceId: null,
        role: { isSystem: true },
      },
    }),
    prisma.userRole.create({
      data: { userId, roleId: role.id, workspaceId: null },
    }),
  ]);
}
