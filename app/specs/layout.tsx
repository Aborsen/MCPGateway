import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";

const ADMIN_ROLES = new Set(["ADMIN", "OWNER"]);

// Replaces the (dashboard) layout for /specs. Reuses the same auth + role
// model: anonymous visitors get bounced to /login, USERs back to the home
// route (which then shows them the "no dashboard access" view).
export default async function SpecsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!ADMIN_ROLES.has(session.user.role)) redirect("/");

  return <>{children}</>;
}
