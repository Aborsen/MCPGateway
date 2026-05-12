import { handleWithProvider } from "@/lib/oidc/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8414. oidc-provider serves the same JSON at its built-in
// /.well-known/openid-configuration path; we forward to it.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  url.pathname = "/.well-known/openid-configuration";
  const rewritten = new Request(url, request);
  return handleWithProvider(rewritten);
}
