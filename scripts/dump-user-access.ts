import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2] ?? "alice@devart.com";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  console.log(`User: ${user.email} (${user.id})`);

  const wus = await prisma.workspaceUser.findMany({
    where: { userId: user.id, workspace: { deletedAt: null } },
    include: {
      workspace: {
        include: { dataSources: { include: { dataSource: true } } },
      },
    },
  });
  console.log(`Workspace assignments: ${wus.length}`);
  for (const wu of wus) {
    console.log(`  - "${wu.workspace.name}" perms=${wu.permissions}`);
    for (const wds of wu.workspace.dataSources) {
      console.log(
        `      ${wds.dataSource.name} [${wds.dataSource.slug}] type=${wds.dataSource.type} url=${wds.dataSource.upstreamUrl} allowedTables=${wds.allowedTables ?? "(all)"}`,
      );
    }
  }

  const totalDS = await prisma.dataSource.count();
  console.log(`Total data sources in DB: ${totalDS}`);
  const totalWS = await prisma.workspace.count();
  console.log(`Total workspaces in DB: ${totalWS}`);

  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
