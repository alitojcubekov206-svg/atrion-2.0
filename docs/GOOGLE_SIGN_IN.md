# Google Sign-In

The registration and login pages use Google Identity Services alongside normal email/password access. The supported SDK button theme is `filled_black`, matching Atrion's dark interface.

## Setup

1. Create a Google OAuth client of type **Web application** and configure the consent screen.
2. Add the actual application origin, including `https://www.atrion.online`, to authorised JavaScript origins. Configure any additional local or deployment origins separately.
3. Inspect the target database and prepare `prisma/add-google-auth.sql` as an additive schema change.
4. Set `GOOGLE_CLIENT_ID` and enable `GOOGLE_AUTH_ENABLED=true` only when the origin and identity table are ready.
5. Deploy, then test a real sign-in, logout and repeat sign-in.

This popup/callback integration uses a public client ID and does not require an OAuth client secret or server redirect URI.

Official guidance: [Create a client ID](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [Button theme](https://developers.google.com/identity/gsi/web/reference/js-reference#theme).

## Availability

`GET /api/auth/google` reports configuration. A configured response does not prove that the domain is authorised or that a real user can sign in. Changing the website URL in documentation does not update the Google console.

The identity-table metadata checker is:

```bash
node scripts/google-auth-db.cjs <NEON_PROJECT_ID>
```

It uses read-only metadata queries and reports readiness and a database fingerprint, without printing account rows or connection credentials. The optional fingerprint and `--require-ready` arguments enforce the same target and a prepared table. It does not apply SQL.

## Server validation

The server issues a short-lived signed challenge with nonce and CSRF protection. The callback checks Origin, request size, frequency, challenge, Google signature, issuer, audience, expiry, nonce, stable subject and verified email.

Identity links use provider plus stable Google subject. A changed Google email does not attach the returning subject to another user's account. Existing-account linking is limited to authoritative email cases; unsupported cases use ordinary account sign-in.

Reference: [Verify Google ID tokens](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token).

## Privacy and sessions

Atrion receives basic profile identity information needed for sign-in. It does not request Gmail or Drive access and does not store Google passwords or ID tokens.

Sessions use the existing Atrion cookie and password fingerprint. Account creation and identity linking use a transaction. Regression tests use local test keys and mocked database boundaries rather than real Google accounts.

[Configuration](CONFIGURATION.md) · [Architecture](../ARCHITECTURE.md)
