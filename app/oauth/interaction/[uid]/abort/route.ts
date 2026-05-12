import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { provider } from "@/lib/oidc/provider";
import { nodifyRequest } from "@/lib/oidc/bridge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteCtx = { params: Promise<{ uid: string }> };

export async function POST(request: Request, { params }: RouteCtx) {
  const { uid } = await params;
  const hdrs = await headers();
  const proto = hdrs.get("x-forwarded-proto") ?? "http";
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "localhost";
  const url = `${proto}://${host}/oauth/interaction/${uid}`;
  const req = new Request(url, { method: "GET", headers: new Headers(request.headers) });
  const { req: nodeReq, res: nodeRes } = nodifyRequest(req);
  const result = await provider.interactionResult(nodeReq, nodeRes, {
    error: "access_denied",
    error_description: "End-user aborted the interaction",
  });
  return NextResponse.redirect(result, 303);
}
