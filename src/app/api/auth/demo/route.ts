import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/backend/db";
import { createSession, getSessionUserId } from "@/backend/auth";
import { DEMO_LANDING_PATH, guestIdentity, isDemoLoginEnabled } from "@/backend/demo-login";
import { clientIp, rateLimit, rateLimitedResponse } from "@/backend/rate-limit";

// One-click guest entry: GET /api/auth/demo creates a fresh verified account,
// signs it in and opens the 3D studio. Enabled only with DEMO_LOGIN_ENABLED="true".
export async function GET(req: Request) {
  if (!isDemoLoginEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const landing = new URL(DEMO_LANDING_PATH, req.url);

  // A link must not replace an existing session (login CSRF), so a signed-in
  // visitor just continues to the studio with their own account.
  if (await getSessionUserId()) return NextResponse.redirect(landing, 303);

  const ipLimit = rateLimit(`demo:ip:${clientIp(req)}`, 5, 60 * 60_000);
  if (!ipLimit.ok) return rateLimitedResponse(ipLimit.retryAfterSec);

  const guest = guestIdentity();
  const passwordHash = await bcrypt.hash(guest.password, 10);
  const user = await db.user.create({
    data: { name: guest.name, email: guest.email, password: passwordHash, emailVerified: true },
  });

  await createSession(user.id, passwordHash);
  return NextResponse.redirect(landing, 303);
}
