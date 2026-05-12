import { handleWithProvider } from "@/lib/oidc/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Catch-all that forwards every /oauth/* path into node-oidc-provider's
// internal router. Discovery, authorize, token, jwks, userinfo, register,
// revoke, introspect — all handled by the provider's `routes` config.
//
// /oauth/interaction/* is NOT handled here: it has a dedicated page +
// route in app/oauth/interaction/[uid]/ that uses provider.interactionDetails
// and provider.interactionFinished directly.

async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  // Block interaction requests from reaching the provider here — those have
  // their own UI route. The matcher below makes this defensive only.
  if (url.pathname.startsWith("/oauth/interaction/")) {
    return new Response("Not handled by OAuth catch-all", { status: 404 });
  }
  return handleWithProvider(request);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const DELETE = handle;
export const PATCH = handle;
export const OPTIONS = handle;
