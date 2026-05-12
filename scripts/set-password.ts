import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const email = process.argv[2];
const password = process.argv[3];

if (!email || !password) {
  console.error("Usage: tsx scripts/set-password.ts <email> <password>");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

async function main() {
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });
  const hash = await bcrypt.hash(password, 10);
  const updated = await prisma.user.update({
    where: { email },
    data: { passwordHash: hash },
    select: { email: true, name: true, role: true },
  });
  console.log(`✓ Password updated for ${updated.email} (${updated.name}, ${updated.role})`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
