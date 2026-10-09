# Configuration

Copy `.env.example` to `.env` and set values for the required workflow. Keep credentials outside Git. Local settings are not automatically copied to a deployment.

## Core application

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection for accounts and projects |
| `AUTH_SECRET` | A long random session-signing secret |
| `APP_URL` | Public URL: `https://www.atrion.online` |
| `DATABASE_URL_UNPOOLED` | Direct connection used separately for migrations |

Development procedural playgrounds do not require a database or inference keys. Private routes and account flows require a prepared database.

## Text inference

| Variable | Purpose |
| --- | --- |
| `AI_TEXT_PROVIDER` | `auto`, `compatible`, `cloudflare` or `disabled` |
| `OPENAI_API_KEY` | Compatible provider credential |
| `OPENAI_BASE_URL` | Provider endpoint |
| `OPENAI_MODEL` | Provider model identifier |
| `GROQ_API_KEY` | Alternative compatible credential; see `text-ai.ts` for selection |
| `AI_FALLBACK_API_KEY`, `AI_FALLBACK_BASE_URL`, `AI_FALLBACK_MODEL` | Optional fallback for compatible primary inference |
| `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` | Workers AI access |
| `CLOUDFLARE_TEXT_MODEL` | Workers AI text model |

Auto mode prioritises configured compatible keys, then Cloudflare. Disabled mode prevents external text inference. Cloudflare does not automatically switch to the compatible fallback.

The `openai` package is an HTTP SDK; the configured endpoint determines the service. An authenticated `GET /api/3d/providers` reports the selected provider and model without exposing credentials. Configuration alone does not prove a successful inference request.

## Optional features

| Feature | Configuration |
| --- | --- |
| CPU composition | `LOCAL_DESIGN_AI_URL=http://127.0.0.1:8081` and a running llama.cpp process |
| Realistic mesh | `MODAL_REALISTIC_URL`, `MODAL_REALISTIC_SECRET` and the deployed Modal service |
| Image analysis | `DESIGN_VISION_ENABLED=true` and Cloudflare credentials |
| Interior AI worker | `DESIGN_TEXT_PROVIDER=cloudflare`, worker and prepared design tables |
| Stored project plans | `DESIGN_R2_BUCKET`, `DESIGN_R2_ACCESS_KEY_ID`, `DESIGN_R2_SECRET_ACCESS_KEY` |

The default `DESIGN_TEXT_PROVIDER=local` handles supported commands without external inference. Direct image tracing does not need R2. Vercel cannot access an inference process on the developer's loopback address.

## Authentication and email

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | Public Google web client ID |
| `GOOGLE_AUTH_ENABLED` | Enable after origins and identity schema are prepared |
| `EMAIL_VERIFICATION_ENABLED` | Require email verification |
| `BREVO_API_KEY` | Email delivery credential |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME` | Verified sender |
| `EMAIL_DEV_RETURN_CODE` | Development-only recovery response on delivery failure |

Google origins must match each actual deployment hostname. Changing a Markdown URL does not update the Google console. See [Google sign-in](GOOGLE_SIGN_IN.md).

## Deployment

Set server secrets in the deployment environment, then deploy the matching commit. Prepare required database tables separately. Builds do not apply additive SQL or launch the design worker.

Application access is free of paid tier limits. Third-party services may impose quotas and costs. Configure and review those in their own accounts.

[Development](DEVELOPMENT.md) · [Project passport](../PROJECT_PASSPORT.md)
