import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isAdminUser } from "@/lib/permissions/resolve";

// Replaces the (dashboard) layout for /specs. Reuses the same auth + role
// model: anonymous visitors get bounced to /login, non-admins back to the
// home route (which then shows them the "no dashboard access" view).
export default async function SpecsLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (!(await isAdminUser(session.user.id))) redirect("/");

  return <>{children}</>;
}
