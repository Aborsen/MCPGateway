import Link from "next/link";
import { Plug, Users, ShieldCheck, FolderTree, FileText, Key } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    href: "/connections",
    icon: Plug,
    title: "1. Add a data source",
    description: "Configure an upstream MCP server (Jira, HubSpot, Salesforce, Zoho, Postgres).",
  },
  {
    href: "/teams",
    icon: FolderTree,
    title: "2. Create a team",
    description: "Attach data sources and optionally restrict access to specific tables.",
  },
  {
    href: "/users",
    icon: Users,
    title: "3. Invite users",
    description: "Add team members and assign them to teams with read/write/delete permissions.",
  },
  {
    href: "/permissions",
    icon: ShieldCheck,
    title: "4. Review permissions",
    description: "Verify the user × data source × permission matrix is correct.",
  },
  {
    href: "/users",
    icon: Key,
    title: "5. Generate MCP URL",
    description: "Issue a token per user and paste the URL into Claude Code's .mcp.json.",
  },
  {
    href: "/audit",
    icon: FileText,
    title: "6. Watch the audit",
    description: "Every MCP tool call lands in the Query Log; admin actions land in the Audit Log.",
  },
];

export default function GettingStartedPage() {
  return (
    <>
      <PageHeader
        title="Getting Started"
        description="Set up AI Connectivity in six steps. Each step links to the relevant page."
      />
      <div className="grid gap-4 p-6 md:grid-cols-2 lg:grid-cols-3">
        {STEPS.map((step) => {
          const Icon = step.icon;
          return (
            <Link key={step.title} href={step.href} className="block">
              <Card className="h-full transition-colors hover:border-primary/40">
                <CardHeader>
                  <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Icon className="h-4 w-4" />
                  </div>
                  <CardTitle className="mt-3 text-base">{step.title}</CardTitle>
                  <CardDescription>{step.description}</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
    </>
  );
}
