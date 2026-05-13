// MCP `serverInfo.icons` follows the W3C Web App Manifest icon shape
// (per SEP-973 / MCP 2025-11-25): `src` URL, `sizes` as a space-separated
// string, `type` as the MIME type. We list multiple sizes so picky clients
// can pick the closest match; the gateway serves a 256x256 source PNG plus
// a multi-size favicon.ico (16/32/48/64).
//
// Same-origin icon URLs are mandated by the spec security note; the issuer
// is the only origin we trust here.
export function buildServerInfo(title: string) {
  const issuer = process.env.OIDC_ISSUER ?? "";
  return {
    name: "mcp-gateway",
    title,
    version: "0.1.0",
    icons: issuer
      ? [
          {
            src: `${issuer}/logo.png`,
            type: "image/png",
            sizes: "256x256",
            purpose: "any",
          },
          {
            src: `${issuer}/favicon.ico`,
            type: "image/x-icon",
            sizes: "16x16 32x32 48x48 64x64",
            purpose: "any",
          },
        ]
      : undefined,
  };
}
