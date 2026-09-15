const DEFAULT_SITE_URL = "https://atrion-2-0.vercel.app";

function parseOrigin(value: string | undefined) {
  if (!value) return null;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return null;
  }
}

// Never throws: a malformed APP_URL in a hosting dashboard must not take the
// whole build down, it should just fall back to the known production origin.
export function siteUrl() {
  return (
    parseOrigin(process.env.APP_URL) ??
    parseOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL) ??
    DEFAULT_SITE_URL
  );
}
