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
      />
      <PermissionsView />
    </>
  );
}
