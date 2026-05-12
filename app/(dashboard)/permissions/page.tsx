import { PageHeader } from "@/components/layouts/page-header";
import { PermissionsMatrix } from "./permissions-matrix";

export const dynamic = "force-dynamic";

export default function PermissionsPage() {
  return (
    <>
      <PageHeader
        title="Permissions"
        description="Effective access per user × connection. Click any cell to view sources and edit the direct grant."
      />
      <PermissionsMatrix />
    </>
  );
}
