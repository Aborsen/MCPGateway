// RBAC seed — runs on every deploy via `npm run build`. Production-safe and
// idempotent:
//   - Upserts every entry in PERMISSION_ENTRIES into the Permission table.
//   - Upserts each system Role and reconciles its RolePermission rows
//     (adds new permissions; removes any that are no longer in the catalog
//     definition).
//   - For each User that still has zero UserRole rows (shouldn't happen
//     post-PR2b but defensive), creates a global UserRole pointing at the
//     "user" system role.
//
// Run via tsx so it doesn't go through Next bundling:
//   tsx lib/permissions/seed.ts
//
// Exits 0 on success, non-zero on any error so a broken seed fails the
// Vercel build before any user-facing pages go live with a half-seeded DB.

import { PrismaClient } from "../../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PERMISSION_ENTRIES, SYSTEM_ROLES } from "./catalog";

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

async function backfillOrphanedUsers() {
  // Defensive: users without any UserRole row get the "user" system role
  // globally. Shouldn't normally happen post-PR2b because every create path
  // writes a UserRole row, but the seed is the safety net for any state
  // that gets out of sync (manual SQL, restored backups, etc.).
  const orphans = await prisma.user.findMany({
    where: { deletedAt: null, roles: { none: {} } },
    select: { id: true, email: true },
  });
  if (orphans.length === 0) return;

  const userRole = await prisma.role.findUnique({
    where: { slug: "user" },
    select: { id: true },
  });
  if (!userRole) {
    console.warn(`[rbac-seed] cannot backfill ${orphans.length} orphans: "user" system role missing`);
    return;
  }
  console.log(`[rbac-seed] backfilling ${orphans.length} orphaned users → "user" role…`);
  for (const u of orphans) {
    await prisma.userRole.create({
      data: { userId: u.id, roleId: userRole.id, workspaceId: null, grantedById: null },
    });
  }
}

async function main() {
  await seedPermissions();
  await seedSystemRoles();
  await backfillOrphanedUsers();
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
