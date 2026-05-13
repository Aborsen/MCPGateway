import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsView } from "./settings-view";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // Dashboard layout already redirects unauthenticated users, but be defensive.
  const session = await auth();
  if (!session?.user) redirect("/login");
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { name: true, email: true, role: true },
  });
  return (
    <SettingsView
      initialName={user?.name ?? session.user.name ?? ""}
      email={user?.email ?? session.user.email ?? ""}
      role={user?.role ?? session.user.role ?? "USER"}
    />
  );
}
