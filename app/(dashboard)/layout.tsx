import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { hasAnyDashboardAccess } from "@/lib/rbac";
import { Sidebar } from "@/components/layouts/sidebar";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // USER role (and any unknown role) has no dashboard access — they only
  // authenticate (Auth.js + OAuth) to use the MCP endpoint from Claude Code.
  // Render a static "no access" page instead of the dashboard chrome.
  if (!hasAnyDashboardAccess(session.user.role)) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <Image src="/logo.png" alt="MCP Gateway" width={48} height={48} className="rounded" priority />
        <h1 className="text-xl font-semibold">No dashboard access</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          Your account doesn&apos;t have admin access to MCP Gateway. You can still use your MCP URL
          in Claude Code — when prompted, sign in with this account&apos;s credentials to authorize.
        </p>
        <SignOutButton />
        <p className="text-xs text-muted-foreground">
          Need access? Ask an admin via the <Link href="/login" className="text-primary hover:underline">login page</Link>.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar user={session.user} />
      <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
