import { requireAuth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await requireAuth();
  const userId = (session.user as { id: string }).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true },
  });
  return (
    <SettingsView
      initialName={user?.name ?? session.user?.name ?? ""}
      email={user?.email ?? session.user?.email ?? ""}
      role={user?.role ?? (session.user as { role?: string }).role ?? "USER"}
    />
  );
}
