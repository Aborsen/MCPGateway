import { toReqRes, toFetchResponse } from "fetch-to-node";
import { provider } from "./provider";
import type { IncomingMessage, ServerResponse } from "node:http";

// Web Request → Node (req, res) → oidc-provider Koa callback → Web Response.
//
// fetch-to-node handles the heavy lifting: it preserves multiple Set-Cookie
// headers, streams the body, and converts back via toFetchResponse.

let cachedCallback: ((req: IncomingMessage, res: ServerResponse) => void) | undefined;

function getCallback(): (req: IncomingMessage, res: ServerResponse) => void {
  if (!cachedCallback) {
    cachedCallback = provider.callback();
  }
  return cachedCallback;
}

export async function handleWithProvider(request: Request): Promise<Response> {
  const { req, res } = toReqRes(request);
  const fetchResPromise = toFetchResponse(res);
  getCallback()(req, res);
  return await fetchResPromise;
}

// Used by the interaction page (server component) to read interaction state
// via provider.interactionDetails(req, res). We need a (req, res) pair to
// pass to provider methods that expect Node-style I/O.
export function nodifyRequest(request: Request) {
  const { req, res } = toReqRes(request);
  return { req, res };
}
