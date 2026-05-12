import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/layouts/sidebar";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={session.user} />
      <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
