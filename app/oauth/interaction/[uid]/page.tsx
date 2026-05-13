import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getProvider } from "@/lib/oidc/provider";
import { nodifyRequest } from "@/lib/oidc/bridge";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InteractionLoginForm } from "./login-form";
import { ConsentForm } from "./consent-form";
import { SwitchAccountLink } from "./switch-account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ uid: string }> };

export default async function InteractionPage({ params }: Props) {
  const { uid } = await params;
  const hdrs = await headers();
  const request = buildRequest(hdrs, uid);
  const { req, res } = nodifyRequest(request);

  const provider = getProvider();
  let details;
  try {
    details = await provider.interactionDetails(req, res);
  } catch {
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Authorization expired</CardTitle>
            <CardDescription>This sign-in link is no longer valid. Restart the connection from Claude.</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Reconcile: Auth.js is authoritative. oidc-provider keeps its own session
  // cookie which can drift from Auth.js (e.g. user signed in as admin earlier,
  // then signed out and signed back in as someone else; OAuth still has the
  // old admin session). If the two disagree, force the OAuth side to match.
  const authJsSession = await auth();
  const authJsUserId = (authJsSession?.user as { id?: string } | undefined)?.id ?? null;
  const oauthAccountId = details.session?.accountId ?? null;

  if (authJsUserId && oauthAccountId && authJsUserId !== oauthAccountId) {
    // Override: re-do the login step with the current Auth.js identity.
    const result = await provider.interactionResult(
      req,
      res,
      { login: { accountId: authJsUserId } },
      { mergeWithLastSubmission: false },
    );
    redirect(result);
  }

  if (!authJsUserId && oauthAccountId) {
    // User signed out of Auth.js but oidc-provider still remembers them.
    // Render the inline sign-in form right here. Once they submit, the
    // page reloads with both sessions present; the mismatch branch above
    // then overrides oidc-provider with the new identity.
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to continue</CardTitle>
            <CardDescription>
              You&apos;re signed out of MCP Gateway. Sign in to authorize Claude.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InteractionLoginForm uid={uid} />
          </CardContent>
        </Card>
      </div>
    );
  }

  const prompt = details.prompt.name;

  if (prompt === "login") {
    if (authJsUserId) {
      const result = await provider.interactionResult(req, res, {
        login: { accountId: authJsUserId },
      }, { mergeWithLastSubmission: false });
      redirect(result);
    }
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to connect Claude</CardTitle>
            <CardDescription>
              Claude is requesting access to your MCP Gateway workspace. Sign in to continue.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <InteractionLoginForm uid={uid} />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (prompt === "consent") {
    const accountId = details.session?.accountId;
    if (!accountId) {
      return <ErrorCard title="Session lost" message="Please restart the connection from Claude." />;
    }

    // Render the consent UI. User must click Allow to issue the grant.
    // The /confirm route does all the Grant work after their click.
    const clientId = details.params.client_id as string;
    const client = await provider.Client.find(clientId);
    const clientName = client?.clientName ?? clientId;
    const user = await prisma.user.findUnique({
      where: { id: accountId },
      select: { email: true, name: true },
    });
    const missingOidc = (details.prompt.details.missingOIDCScope as string[] | undefined) ?? [];
    const missingResource =
      (details.prompt.details.missingResourceScopes as Record<string, string[]> | undefined) ?? {};
    const resourceScopes = Object.entries(missingResource).flatMap(([resource, scopes]) =>
      scopes.map((s) => ({ resource, scope: s })),
    );

    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Allow access?</CardTitle>
            <CardDescription>
              <span className="font-medium text-foreground">{clientName}</span> wants to connect to
              your MCP Gateway account
              {user ? ` (${user.email})` : ""}.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {(missingOidc.length > 0 || resourceScopes.length > 0) && (
              <div className="space-y-2 text-sm">
                <div className="text-muted-foreground">It will be able to:</div>
                <ul className="list-disc space-y-1 pl-5">
                  {missingOidc.map((s) => (
                    <li key={`oidc-${s}`}>Read your profile ({s})</li>
                  ))}
                  {resourceScopes.map((r) => (
                    <li key={`${r.resource}-${r.scope}`}>
                      Access MCP tools and data ({r.scope})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              You can revoke access any time from your Settings page.
            </p>
            <ConsentForm uid={uid} />
            {user && (
              <p className="border-t border-border pt-3 text-center text-xs text-muted-foreground">
                Signed in as <span className="font-medium text-foreground">{user.email}</span>.{" "}
                <SwitchAccountLink uid={uid} />
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ErrorCard title="Unknown prompt" message={`Prompt: ${prompt}`} />;
}

function buildRequest(hdrs: Headers, uid: string): Request {
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost";
  const url = `${proto}://${host}/oauth/interaction/${uid}`;
  return new Request(url, {
    method: "GET",
    headers: new Headers(hdrs),
  });
}

function ErrorCard({ title, message }: { title: string; message: string }) {
  return (
    <div className="mx-auto max-w-md p-8">
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <a href="/">Back</a>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
