import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { permissionsForUser } from "@/lib/permissions/resolve";
import { Sidebar } from "@/components/layouts/sidebar";
import { SignOutButton } from "./sign-out-button";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  // Compute the user's effective permissions ONCE here. React.cache means
  // subsequent calls to permissionsForUser inside the same render hit the
  // cached Set, so child page components re-using can()/canSeeCategory
  // don't trigger extra DB roundtrips.
  const perms = await permissionsForUser(session.user.id);

  // Sidebar visibility: a user sees a nav category if they have ANY
  // permission in that category. Computed here on the server because the
  // sidebar itself is a client component.
  const categories = new Set<string>();
  for (const key of perms) {
    const dot = key.indexOf(".");
    if (dot > 0) categories.add(key.slice(0, dot));
  }

  // Users with zero dashboard permissions have nothing to see — they only
  // authenticate to use the MCP endpoint from Claude Code. Render a static
  // "no access" page instead of the dashboard chrome.
  if (categories.size === 0) {
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
      <Sidebar user={session.user} visibleCategories={Array.from(categories)} />
      <main className="flex min-w-0 min-h-0 flex-1 flex-col overflow-y-auto">{children}</main>
    </div>
  );
}
