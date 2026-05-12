import { PageHeader } from "@/components/layouts/page-header";
import { PermissionsView } from "./permissions-view";

export const dynamic = "force-dynamic";

export default function PermissionsPage() {
  return (
    <>
      <PageHeader
        title="Permissions"
        description="Manage who can access which connection. Team assignments and direct grants are combined."
      />
      <PermissionsView />
    </>
  );
}
