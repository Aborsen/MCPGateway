import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary text-primary-foreground text-sm font-bold">
            +
          </div>
          <div>
            <div className="text-base font-semibold text-foreground">AI Connectivity</div>
            <div className="text-xs text-muted-foreground">Devart</div>
          </div>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
