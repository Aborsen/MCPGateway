import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { getProvider } from "@/lib/oidc/provider";
import { nodifyRequest } from "@/lib/oidc/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ uid: string }> };

// User clicked "Allow" on the consent screen. Build the Grant with the
// requested OIDC + resource scopes, save it, and finish the interaction
// with consent.

export async function POST(request: Request, { params }: RouteCtx) {
  const { uid: _uid } = await params;
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost";
  const url = `${proto}://${host}/oauth/interaction/${_uid}`;
  // Read the interaction cookie out of the original request so the bridge
  // can resolve interactionDetails. We forward the cookie header.
  const upstream = new Request(url, {
    method: "GET",
    headers: new Headers(request.headers),
  });
  const { req, res } = nodifyRequest(upstream);
  const provider = getProvider();

  const details = await provider.interactionDetails(req, res);
  const accountId = details.session?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "session_lost" }, { status: 400 });
  }
  const clientId = details.params.client_id as string;

  let grantId = details.grantId;
  let grant;
  if (grantId) {
    grant = await provider.Grant.find(grantId);
  } else {
    grant = new provider.Grant({ accountId, clientId });
  }
  if (!grant) {
    return NextResponse.json({ error: "grant_not_found" }, { status: 400 });
  }
  const missingOidc = details.prompt.details.missingOIDCScope as string[] | undefined;
  if (missingOidc?.length) grant.addOIDCScope(missingOidc.join(" "));
  const missingResource = details.prompt.details.missingResourceScopes as
    | Record<string, string[]>
    | undefined;
  if (missingResource) {
    for (const [resource, scopes] of Object.entries(missingResource)) {
      grant.addResourceScope(resource, scopes.join(" "));
    }
  }
  grantId = await grant.save();

  const result = await provider.interactionResult(
    req,
    res,
    { consent: { grantId } },
    { mergeWithLastSubmission: true },
  );
  return NextResponse.redirect(result, 303);
}
