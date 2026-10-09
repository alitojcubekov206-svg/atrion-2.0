import { randomBytes } from "node:crypto";

// Guest access for hackathon judges and other one-click demos. Off unless the
// deployment opts in, so a normal install never creates accounts without a form.
export function isDemoLoginEnabled(env: Record<string, string | undefined> = process.env) {
  return env.DEMO_LOGIN_ENABLED === "true";
}

// Each visit gets its own throwaway account so guests never see each other's
// projects. The password is random and never shown, so the account can only be
// reached through the session cookie issued with it. `.invalid` is reserved
// (RFC 2606) and can never receive mail.
export function guestIdentity() {
  const id = randomBytes(8).toString("hex");
  return {
    name: "Гость",
    email: `guest-${id}@demo.atrion.invalid`,
    password: randomBytes(32).toString("hex"),
  };
}

export const DEMO_LANDING_PATH = "/dashboard/design-engine";
