// RBAC seed — runs on every deploy via `npm run build`. Production-safe and
// idempotent:
//   - Upserts every entry in PERMISSION_ENTRIES into the Permission table.
//   - Upserts each system Role and reconciles its RolePermission rows
//     (adds new permissions; removes any that are no longer in the catalog
//     definition).
//   - For each existing User that has zero UserRole rows, creates a global
//     UserRole(workspaceId=NULL) mirroring their legacy User.role string.
//
// Run via tsx so it doesn't go through Next bundling:
//   tsx lib/permissions/seed.ts
//
// Exits 0 on success, non-zero on any error so a broken seed fails the
// Vercel build before any user-facing pages go live with a half-seeded DB.

import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PERMISSION_ENTRIES,
  SYSTEM_ROLES,
  LEGACY_ROLE_TO_SLUG,
} from "./catalog";

if (!process.env.DATABASE_URL) {
  throw new Error("[rbac-seed] DATABASE_URL is not set.");
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function seedPermissions() {
  console.log(`[rbac-seed] upserting ${PERMISSION_ENTRIES.length} permissions…`);
  for (const p of PERMISSION_ENTRIES) {
    await prisma.permission.upsert({
      where: { key: p.key },
      create: {
        key: p.key,
        label: p.label,
        category: p.category,
        scopeable: p.scopeable,
        description: p.description,
      },
      update: {
        label: p.label,
        category: p.category,
        scopeable: p.scopeable,
        description: p.description,
      },
    });
  }
}

async function seedSystemRoles() {
  console.log(`[rbac-seed] reconciling ${SYSTEM_ROLES.length} system roles…`);
  for (const def of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { slug: def.slug },
      create: {
        slug: def.slug,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
      update: {
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });

    // Reconcile RolePermission rows. Add any that should be there; remove
    // any that no longer should. This matters when we EDIT a system role's
    // permission set in a later release — the seed is the single source.
    const existing = await prisma.rolePermission.findMany({
      where: { roleId: role.id },
      select: { permissionKey: true },
    });
    const existingSet = new Set(existing.map((r) => r.permissionKey));
    const wantSet = new Set<string>(def.permissions);

    const toAdd: string[] = [];
    const toRemove: string[] = [];
    for (const k of wantSet) if (!existingSet.has(k)) toAdd.push(k);
    for (const k of existingSet) if (!wantSet.has(k)) toRemove.push(k);

    if (toAdd.length > 0) {
      await prisma.rolePermission.createMany({
        data: toAdd.map((permissionKey) => ({ roleId: role.id, permissionKey })),
        skipDuplicates: true,
      });
    }
    if (toRemove.length > 0) {
      await prisma.rolePermission.deleteMany({
        where: { roleId: role.id, permissionKey: { in: toRemove } },
      });
    }

    if (toAdd.length > 0 || toRemove.length > 0) {
      console.log(
        `[rbac-seed]   role ${def.slug}: +${toAdd.length} −${toRemove.length}`,
      );
    }
  }
}

async function migrateLegacyUserRoles() {
  // Find users with NO UserRole rows. Assume they were created before PR1
  // and need their User.role string translated into a global UserRole.
  const users = await prisma.user.findMany({
    where: { deletedAt: null, roles: { none: {} } },
    select: { id: true, email: true, role: true },
  });

  if (users.length === 0) {
    console.log(`[rbac-seed] no legacy users need role migration.`);
    return;
  }

  console.log(`[rbac-seed] migrating ${users.length} legacy User.role strings → UserRole rows…`);

  // Cache role IDs by slug to avoid N lookups.
  const allSystemRoles = await prisma.role.findMany({
    where: { isSystem: true },
    select: { id: true, slug: true },
  });
  const roleIdBySlug = new Map(allSystemRoles.map((r) => [r.slug, r.id]));

  let migrated = 0;
  for (const u of users) {
    const slug = LEGACY_ROLE_TO_SLUG[u.role] ?? "user";
    const roleId = roleIdBySlug.get(slug);
    if (!roleId) {
      console.warn(
        `[rbac-seed]   user ${u.email}: legacy role ${u.role} → slug ${slug} not in system roles, skipping`,
      );
      continue;
    }
    await prisma.userRole.create({
      data: { userId: u.id, roleId, workspaceId: null, grantedById: null },
    });
    migrated++;
  }
  console.log(`[rbac-seed]   migrated ${migrated} user(s).`);
}

async function main() {
  await seedPermissions();
  await seedSystemRoles();
  await migrateLegacyUserRoles();
  console.log(`[rbac-seed] done.`);
}

main()
  .catch((err) => {
    console.error("[rbac-seed] FAILED:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
