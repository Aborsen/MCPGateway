import type { JWKS } from "oidc-provider";

// Loads JWKs from OIDC_JWKS env var (stringified JSON). Never generates at
// runtime — that would rotate keys every cold start on serverless.
//
// Generate once with: npx tsx scripts/generate-jwks.ts > jwks.json
// Then set OIDC_JWKS=<stringified contents> in env management.

let cached: JWKS | undefined;

export function loadJwks(): JWKS {
  if (cached) return cached;
  const raw = process.env.OIDC_JWKS;
  if (!raw) {
    throw new Error("OIDC_JWKS env var is not set. Run `npx tsx scripts/generate-jwks.ts` and set it.");
  }
  let parsed: JWKS;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error("OIDC_JWKS is not valid JSON: " + (err as Error).message);
  }
  if (!parsed?.keys || !Array.isArray(parsed.keys) || parsed.keys.length === 0) {
    throw new Error("OIDC_JWKS does not contain a non-empty `keys` array.");
  }
  cached = parsed;
  return parsed;
}
