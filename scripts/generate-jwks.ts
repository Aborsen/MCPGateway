// One-shot: prints a JWKs JSON suitable for the OIDC_JWKS env var.
// Run once per deployment; commit the public part to env management, the
// private keys live only in the env var.

import { generateKeyPair, exportJWK } from "jose";

async function main() {
  const rs = await generateKeyPair("RS256", { extractable: true });
  const es = await generateKeyPair("ES256", { extractable: true });
  const rsJwk = await exportJWK(rs.privateKey);
  const esJwk = await exportJWK(es.privateKey);
  rsJwk.use = "sig";
  rsJwk.alg = "RS256";
  rsJwk.kid = "rs-" + Math.random().toString(36).slice(2, 8);
  esJwk.use = "sig";
  esJwk.alg = "ES256";
  esJwk.kid = "es-" + Math.random().toString(36).slice(2, 8);
  const jwks = { keys: [rsJwk, esJwk] };
  console.log(JSON.stringify(jwks));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
