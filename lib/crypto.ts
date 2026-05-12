import sodium from "libsodium-wrappers";
import { createHash, randomBytes } from "node:crypto";

let ready = false;
async function ensureReady() {
  if (!ready) {
    await sodium.ready;
    ready = true;
  }
}

function getKey(): Uint8Array {
  const raw = process.env.MCP_CONFIG_KEY ?? "dev-key-please-replace-in-production-now";
  const hash = createHash("sha256").update(raw).digest();
  return new Uint8Array(hash);
}

export async function encryptJson(value: unknown): Promise<string> {
  await ensureReady();
  const key = getKey();
  const nonce = sodium.randombytes_buf(sodium.crypto_secretbox_NONCEBYTES);
  const plaintext = sodium.from_string(JSON.stringify(value));
  const cipher = sodium.crypto_secretbox_easy(plaintext, nonce, key);
  return [sodium.to_base64(nonce, sodium.base64_variants.URLSAFE_NO_PADDING),
    sodium.to_base64(cipher, sodium.base64_variants.URLSAFE_NO_PADDING)].join(".");
}

export async function decryptJson<T = unknown>(payload: string): Promise<T | null> {
  await ensureReady();
  try {
    const [nonceB64, cipherB64] = payload.split(".");
    if (!nonceB64 || !cipherB64) return null;
    const key = getKey();
    const nonce = sodium.from_base64(nonceB64, sodium.base64_variants.URLSAFE_NO_PADDING);
    const cipher = sodium.from_base64(cipherB64, sodium.base64_variants.URLSAFE_NO_PADDING);
    const plaintext = sodium.crypto_secretbox_open_easy(cipher, nonce, key);
    return JSON.parse(sodium.to_string(plaintext)) as T;
  } catch {
    return null;
  }
}

export function generateMcpToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

export function hashMcpToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
