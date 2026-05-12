import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { provider } from "@/lib/oidc/provider";
import { nodifyRequest } from "@/lib/oidc/bridge";
import { auth } from "@/lib/auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { InteractionLoginForm } from "./login-form";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ uid: string }> };

export default async function InteractionPage({ params }: Props) {
  const { uid } = await params;
  const hdrs = await headers();
  const request = buildRequest(hdrs, uid);
  const { req, res } = nodifyRequest(request);

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

  const prompt = details.prompt.name;

  if (prompt === "login") {
    const session = await auth();
    const signedInUserId = (session?.user as { id?: string } | undefined)?.id;
    if (signedInUserId) {
      const result = await provider.interactionResult(req, res, {
        login: { accountId: signedInUserId },
      }, { mergeWithLastSubmission: false });
      redirect(result);
    }
    return (
      <div className="mx-auto max-w-md p-8">
        <Card>
          <CardHeader>
            <CardTitle>Sign in to connect Claude</CardTitle>
            <CardDescription>
              Claude is requesting access to your AI Connectivity workspace. Sign in to continue.
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
    let grantId = details.grantId;
    let grant;
    if (grantId) {
      grant = await provider.Grant.find(grantId);
    } else {
      grant = new provider.Grant({ accountId, clientId: details.params.client_id as string });
    }
    if (!grant) {
      return <ErrorCard title="Grant not found" message="Please restart the connection from Claude." />;
    }
    const missingOidc = details.prompt.details.missingOIDCScope as string[] | undefined;
    if (missingOidc?.length) grant.addOIDCScope(missingOidc.join(" "));
    const missingResource = details.prompt.details.missingResourceScopes as Record<string, string[]> | undefined;
    if (missingResource) {
      for (const [resource, scopes] of Object.entries(missingResource)) {
        grant.addResourceScope(resource, scopes.join(" "));
      }
    }
    grantId = await grant.save();
    const result = await provider.interactionResult(req, res, {
      consent: { grantId },
    }, { mergeWithLastSubmission: true });
    redirect(result);
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
