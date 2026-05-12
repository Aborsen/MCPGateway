import bcrypt from "bcryptjs";
import { PrismaClient } from "../generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL not set. Point it at your Postgres before running the seed.");
}
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

type ToolDef = { name: string; level: "READ" | "WRITE" | "DELETE" };

const TOOL_CATALOG: Record<string, ToolDef[]> = {
  jira: [
    { name: "get_issue", level: "READ" },
    { name: "search_issues", level: "READ" },
    { name: "list_projects", level: "READ" },
    { name: "list_users", level: "READ" },
    { name: "get_user", level: "READ" },
    { name: "list_boards", level: "READ" },
    { name: "list_sprints", level: "READ" },
    { name: "get_sprint", level: "READ" },
    { name: "create_issue", level: "WRITE" },
    { name: "update_issue", level: "WRITE" },
    { name: "add_comment", level: "WRITE" },
    { name: "transition_issue", level: "WRITE" },
    { name: "assign_issue", level: "WRITE" },
    { name: "create_sprint", level: "WRITE" },
    { name: "delete_issue", level: "DELETE" },
    { name: "delete_comment", level: "DELETE" },
  ],
  zoho: [
    { name: "list_records", level: "READ" },
    { name: "get_record", level: "READ" },
    { name: "search_records", level: "READ" },
    { name: "list_modules", level: "READ" },
    { name: "list_fields", level: "READ" },
    { name: "get_organization", level: "READ" },
    { name: "create_record", level: "WRITE" },
    { name: "update_record", level: "WRITE" },
    { name: "upsert_record", level: "WRITE" },
    { name: "convert_lead", level: "WRITE" },
    { name: "delete_record", level: "DELETE" },
  ],
  hubspot: [
    { name: "list_contacts", level: "READ" },
    { name: "get_contact", level: "READ" },
    { name: "list_deals", level: "READ" },
    { name: "get_deal", level: "READ" },
    { name: "list_companies", level: "READ" },
    { name: "get_company", level: "READ" },
    { name: "search_objects", level: "READ" },
    { name: "list_owners", level: "READ" },
    { name: "create_contact", level: "WRITE" },
    { name: "update_contact", level: "WRITE" },
    { name: "create_deal", level: "WRITE" },
    { name: "update_deal", level: "WRITE" },
    { name: "create_company", level: "WRITE" },
    { name: "update_company", level: "WRITE" },
    { name: "associate_objects", level: "WRITE" },
    { name: "delete_contact", level: "DELETE" },
    { name: "delete_deal", level: "DELETE" },
    { name: "delete_company", level: "DELETE" },
  ],
  salesforce: [
    { name: "list_objects", level: "READ" },
    { name: "describe_object", level: "READ" },
    { name: "query_records", level: "READ" },
    { name: "get_record", level: "READ" },
    { name: "run_soql", level: "READ" },
    { name: "list_reports", level: "READ" },
    { name: "create_record", level: "WRITE" },
    { name: "update_record", level: "WRITE" },
    { name: "upsert_record", level: "WRITE" },
    { name: "run_apex", level: "WRITE" },
    { name: "delete_record", level: "DELETE" },
  ],
  postgres: [
    { name: "list_databases", level: "READ" },
    { name: "list_tables", level: "READ" },
    { name: "describe_table", level: "READ" },
    { name: "read_table", level: "READ" },
    { name: "query", level: "READ" },
    { name: "list_schemas", level: "READ" },
    { name: "insert_row", level: "WRITE" },
    { name: "update_row", level: "WRITE" },
    { name: "execute_ddl", level: "WRITE" },
    { name: "delete_row", level: "DELETE" },
    { name: "drop_table", level: "DELETE" },
  ],
};

const DATA_SOURCES = [
  {
    name: "Jira Cloud",
    slug: "jira",
    type: "jira",
    upstreamUrl: "https://mcp.example.com/jira",
    description: "Atlassian Jira issue tracking",
  },
  {
    name: "Zoho CRM",
    slug: "zoho",
    type: "zoho",
    upstreamUrl: "https://mcp.example.com/zoho",
    description: "Zoho CRM records and modules",
  },
  {
    name: "HubSpot",
    slug: "hubspot",
    type: "hubspot",
    upstreamUrl: "https://mcp.example.com/hubspot",
    description: "HubSpot CRM contacts, deals, companies",
  },
  {
    name: "Salesforce",
    slug: "salesforce",
    type: "salesforce",
    upstreamUrl: "https://mcp.example.com/salesforce",
    description: "Salesforce SOQL + record CRUD",
  },
  {
    name: "PostgreSQL",
    slug: "postgres",
    type: "postgres",
    upstreamUrl: "https://mcp.example.com/postgres",
    description: "Direct Postgres database access via MCP",
  },
];

async function main() {
  console.log("Seeding database…");

  await prisma.workspaceUser.deleteMany();
  await prisma.workspaceDataSource.deleteMany();
  await prisma.workspace.deleteMany();
  await prisma.userMcpToken.deleteMany();
  await prisma.auditLog.deleteMany();
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
    const created = await prisma.dataSource.create({ data: ds });
    const tools = TOOL_CATALOG[ds.type] ?? [];
    await prisma.toolPermission.createMany({
      data: tools.map((t) => ({
        dataSourceId: created.id,
        toolName: t.name,
        level: t.level,
      })),
    });
    console.log(`✓ Created data source "${ds.name}" with ${tools.length} tool permissions`);
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
        permissions: JSON.stringify(["read", "write"]),
      },
      {
        workspaceId: salesWorkspace.id,
        userId: bob.id,
        permissions: JSON.stringify(["read"]),
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
        permissions: JSON.stringify(["read", "write", "delete"]),
      },
      {
        workspaceId: engineeringWorkspace.id,
        userId: admin.id,
        permissions: JSON.stringify(["read", "write", "delete"]),
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
