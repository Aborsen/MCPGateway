import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (process.env.NODE_ENV === "production" && !process.argv.includes("--allow-prod")) {
  throw new Error(
    "Seed refused: NODE_ENV=production. This script deletes every row in every table. Pass --allow-prod if you really mean it.",
  );
}
if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Point it at your Postgres before running the seed.");
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

// Tool catalog is no longer seeded.
// Tools are discovered live from upstream MCPs and persisted with heuristic
// classification on first successful tools/list. Admins can override per-tool
// levels via the Connection detail page.

const DATA_SOURCES = [
  {
    name: "Jira Cloud",
    slug: "jira",
    type: "operations",
    upstreamUrl: "https://mcp.example.com/jira",
    description: "Atlassian Jira issue tracking",
  },
  {
    name: "Zoho CRM",
    slug: "zoho",
    type: "sales",
    upstreamUrl: "https://mcp.example.com/zoho",
    description: "Zoho CRM records and modules",
  },
  {
    name: "HubSpot",
    slug: "hubspot",
    type: "marketing",
    upstreamUrl: "https://mcp.example.com/hubspot",
    description: "HubSpot CRM contacts, deals, companies",
  },
  {
    name: "Salesforce",
    slug: "salesforce",
    type: "sales",
    upstreamUrl: "https://mcp.example.com/salesforce",
    description: "Salesforce SOQL + record CRUD",
  },
  {
    name: "PostgreSQL",
    slug: "postgres",
    type: "database",
    upstreamUrl: "https://mcp.example.com/postgres",
    description: "Direct Postgres database access via MCP",
  },
];

async function main() {
  console.log("Seeding database…");

  await prisma.userDataSourceAccess.deleteMany();
  await prisma.workspaceUser.deleteMany();
  await prisma.workspaceDataSource.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.adminEvent.deleteMany();
  await prisma.toolPermission.deleteMany();
  await prisma.dataSource.deleteMany();
  await prisma.user.deleteMany();

  const adminHash = await bcrypt.hash("admin123", 10);
  const demoHash = await bcrypt.hash("demo123", 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@devart.com",
      name: "Admin",
      passwordHash: adminHash,
      role: "ADMIN",
    },
  });

  const alice = await prisma.user.create({
    data: { email: "alice@devart.com", name: "Alice", passwordHash: demoHash, role: "USER" },
  });
  const bob = await prisma.user.create({
    data: { email: "bob@devart.com", name: "Bob", passwordHash: demoHash, role: "USER" },
  });
  const carol = await prisma.user.create({
    data: { email: "carol@devart.com", name: "Carol", passwordHash: demoHash, role: "USER" },
  });
  console.log(`✓ Created users: admin, alice, bob, carol`);

  for (const ds of DATA_SOURCES) {
    await prisma.dataSource.create({ data: ds });
    console.log(`✓ Created data source "${ds.name}"`);
  }

  const hubspot = await prisma.dataSource.findUniqueOrThrow({ where: { slug: "hubspot" } });
  const salesforce = await prisma.dataSource.findUniqueOrThrow({ where: { slug: "salesforce" } });
  const zoho = await prisma.dataSource.findUniqueOrThrow({ where: { slug: "zoho" } });

  const salesWorkspace = await prisma.workspace.create({
    data: {
      name: "Sales Team",
      description: "Restricted access to CRM contacts and deals only",
    },
  });

  await prisma.workspaceDataSource.createMany({
    data: [
      {
        workspaceId: salesWorkspace.id,
        dataSourceId: hubspot.id,
        allowedTables: JSON.stringify(["contacts", "deals"]),
      },
      {
        workspaceId: salesWorkspace.id,
        dataSourceId: salesforce.id,
        allowedTables: JSON.stringify(["Contact", "Opportunity"]),
      },
      {
        workspaceId: salesWorkspace.id,
        dataSourceId: zoho.id,
        allowedTables: null,
      },
    ],
  });

  await prisma.workspaceUser.createMany({
    data: [
      {
        workspaceId: salesWorkspace.id,
        userId: alice.id,
        permissions: JSON.stringify(["select", "insert", "update"]),
      },
      {
        workspaceId: salesWorkspace.id,
        userId: bob.id,
        permissions: JSON.stringify(["select"]),
      },
    ],
  });
  console.log(`✓ Created Sales Team workspace with Alice (read,write) and Bob (read)`);

  const engineeringWorkspace = await prisma.workspace.create({
    data: {
      name: "Engineering",
      description: "Full access to Jira and Postgres for engineering team",
    },
  });
  const jira = await prisma.dataSource.findUniqueOrThrow({ where: { slug: "jira" } });
  const postgres = await prisma.dataSource.findUniqueOrThrow({ where: { slug: "postgres" } });
  await prisma.workspaceDataSource.createMany({
    data: [
      { workspaceId: engineeringWorkspace.id, dataSourceId: jira.id, allowedTables: null },
      { workspaceId: engineeringWorkspace.id, dataSourceId: postgres.id, allowedTables: null },
    ],
  });
  await prisma.workspaceUser.createMany({
    data: [
      {
        workspaceId: engineeringWorkspace.id,
        userId: carol.id,
        permissions: JSON.stringify(["select", "insert", "update", "delete", "execute"]),
      },
      {
        workspaceId: engineeringWorkspace.id,
        userId: admin.id,
        permissions: JSON.stringify(["select", "insert", "update", "delete", "execute"]),
      },
    ],
  });
  console.log(`✓ Created Engineering workspace with Carol (full) and Admin (full)`);

  console.log("\nDone. Login as admin@devart.com / admin123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
