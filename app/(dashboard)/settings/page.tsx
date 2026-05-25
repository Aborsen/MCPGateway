import { gatePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { primarySystemRoleFor } from "@/lib/permissions/resolve";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await gatePermission("settings.view");
  const [user, role] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { name: true, email: true },
    }),
    primarySystemRoleFor(session.user.id),
  ]);
  return (
    <SettingsView
      initialName={user?.name ?? session.user.name ?? ""}
      email={user?.email ?? session.user.email ?? ""}
      role={role}
    />
  );
}
