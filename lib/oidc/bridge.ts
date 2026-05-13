import { toReqRes, toFetchResponse } from "fetch-to-node";
import { provider } from "./provider";
import type { IncomingMessage, ServerResponse } from "node:http";

// Web Request → Node (req, res) → oidc-provider Koa callback → Web Response.
//
// fetch-to-node handles the heavy lifting: it preserves multiple Set-Cookie
// headers, streams the body, and converts back via toFetchResponse.
//
// oidc-provider's internal urlFor() reads req.socket.encrypted to decide
// http vs https when building absolute URLs. fetch-to-node leaves socket
// as null, so we stub it from the request URL's protocol below.

let cachedCallback: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;

function getCallback(): (req: IncomingMessage, res: ServerResponse) => void {
  if (!cachedCallback) {
    cachedCallback = provider.callback();
  }
  return cachedCallback;
}

function patchSocket(request: Request, req: IncomingMessage): void {
  const url = new URL(request.url);
  const proto = request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "");
  const encrypted = proto === "https";
  // Stub a minimal socket. Cast through unknown because IncomingMessage.socket
  // is typed as a full net.Socket — we only need the field oidc-provider reads.
  (req as unknown as { socket: { encrypted: boolean; remoteAddress: string } }).socket = {
    encrypted,
    remoteAddress:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "127.0.0.1",
  };
}

export async function handleWithProvider(request: Request): Promise<Response> {
  const { req, res } = toReqRes(request);
  patchSocket(request, req);
  const fetchResPromise = toFetchResponse(res);
  getCallback()(req, res);
  return await fetchResPromise;
}

// Used by the interaction page (server component) to read interaction state
// via provider.interactionDetails(req, res). We need a (req, res) pair to
// pass to provider methods that expect Node-style I/O.
export function nodifyRequest(request: Request) {
  const { req, res } = toReqRes(request);
  patchSocket(request, req);
  return { req, res };
}
