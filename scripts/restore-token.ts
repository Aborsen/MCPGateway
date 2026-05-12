import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import crypto from "node:crypto";

const email = process.argv[2];
const rawToken = process.argv[3];

if (!email || !rawToken) {
  console.error("Usage: tsx scripts/restore-token.ts <email> <raw-token>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  const hash = crypto.createHash("sha256").update(rawToken).digest("hex");
  await prisma.userMcpToken.deleteMany({ where: { userId: user.id } });
  await prisma.userMcpToken.create({
    data: { userId: user.id, tokenHash: hash, label: "restored" },
  });
  console.log(`✓ Restored token for ${user.email}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
