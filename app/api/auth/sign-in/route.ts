import { NextResponse } from "next/server";
import { signIn } from "@/lib/auth";
import { checkRateLimit, clientIp } from "@/lib/rate-limit";

// 10 attempts per 15 minutes per IP. Brute-force protection on the only
// password-bearing endpoint we have.
const SIGNIN_LIMIT = 10;
const SIGNIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const rl = checkRateLimit(`signin:${clientIp(request)}`, SIGNIN_LIMIT, SIGNIN_WINDOW_MS);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many sign-in attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } },
    );
  }
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ error: "Email and password required" }, { status: 400 });
    }
    await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sign-in failed";
    if (message.includes("CredentialsSignin") || message.includes("CallbackRouteError")) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
