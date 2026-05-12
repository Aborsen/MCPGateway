// Add "execute" to existing direct grants for the given email so the demo can
// call upstream Execute tools that now require the EXECUTE level after the
// 5-verb migration. Run: DATABASE_URL=<prod> npx tsx scripts/grant-execute.ts <email>
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2] ?? "victorg@devart.com";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

async function main() {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    console.error(`User ${email} not found`);
    process.exit(1);
  }

  // 1. Direct grants
  const grants = await prisma.userDataSourceAccess.findMany({
    where: { userId: user.id },
    include: { dataSource: true },
  });
  console.log(`${grants.length} direct grants for ${email}`);
  for (const g of grants) {
    const perms = new Set<string>(JSON.parse(g.permissions));
    if (perms.has("execute")) {
      console.log(`  ✓ ${g.dataSource.name}: already has execute`);
      continue;
    }
    perms.add("execute");
    const next = Array.from(perms);
    await prisma.userDataSourceAccess.update({
      where: { id: g.id },
      data: { permissions: JSON.stringify(next) },
    });
    console.log(`  → ${g.dataSource.name}: ${g.permissions} → ${JSON.stringify(next)}`);
  }

  // 2. Workspace memberships
  const memberships = await prisma.workspaceUser.findMany({
    where: { userId: user.id },
    include: { workspace: true },
  });
  console.log(`${memberships.length} workspace memberships`);
  for (const m of memberships) {
    const perms = new Set<string>(JSON.parse(m.permissions));
    if (perms.has("execute")) {
      console.log(`  ✓ ${m.workspace.name}: already has execute`);
      continue;
    }
    perms.add("execute");
    const next = Array.from(perms);
    await prisma.workspaceUser.update({
      where: { id: m.id },
      data: { permissions: JSON.stringify(next) },
    });
    console.log(`  → ${m.workspace.name}: ${m.permissions} → ${JSON.stringify(next)}`);
  }

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
