/** Explicit development only: a copied flag must never expose OTPs in production. */
export function canReturnEmailCode(env: Record<string, string | undefined> = process.env): boolean {
  return env.NODE_ENV === "development" && env.EMAIL_DEV_RETURN_CODE === "true";
}
