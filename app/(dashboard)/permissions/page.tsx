import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layouts/page-header";
import { gatePermission } from "@/lib/auth";
import { PermissionsView } from "./permissions-view";

export const dynamic = "force-dynamic";

export default async function PermissionsPage() {
  await gatePermission("permissions.view");
  return (
    <>
      <PageHeader
        title="Permissions"
        description="Manage who can access which connection. Workspace assignments and direct grants are combined."
        actions={
          <Link
            href="/permissions/roles"
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <ShieldCheck className="h-4 w-4" />
            Manage roles →
          </Link>
        }
      />
      <PermissionsView />
    </>
  );
}
