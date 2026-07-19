# Atrion 2.0

> **From Idea to Intelligent Architecture**

Atrion 2.0 is an **AI Software Architect** — a SaaS application that transforms a raw product idea into a complete, professional technical plan: analysis, interview, architecture, database schema, API design, roadmap, and project scoring.

## Features

- **AI Project Discovery** — analyze an idea: product, audience, problem, competitors, potential
- **AI Interview Mode** — the AI asks clarifying questions before designing
- **Project Blueprint** — a full project document (overview, audience, problem, solution)
- **Architecture Generator** — frontend / backend / database / AI / storage stack
- **Database Designer** — tables, fields, relationships
- **API Architect** — endpoint list with descriptions
- **Roadmap Generator** — phased development plan with time estimates
- **Project Score** — Innovation / Difficulty / Market Potential / Cost / Risk
- **AI Critic Mode** — honest criticism, not agreement
- **Export System** — Markdown / JSON / PDF
- **Finik Pro Payments** — signed QR checkout with verified, idempotent webhooks

## Tech Stack

- **Frontend:** Next.js (App Router), React, TypeScript, Tailwind CSS
- **3D & animation:** React Three Fiber, drei, Framer Motion
- **Database:** PostgreSQL via Prisma (Neon on Vercel)
- **Auth:** JWT sessions with JOSE, bcrypt and email OTP
- **AI:** Atrion AI Pro (OpenAI-compatible primary provider with optional automatic fallback)

## Getting Started

```bash
npm install
npx prisma migrate dev
npm run dev
```

Copy `.env.example` to `.env` and fill in your keys. **Never commit `.env`.**

## Atrion AI Pro configuration

Atrion keeps the existing OpenAI-compatible settings, so Groq and other compatible
providers continue to work:

```env
OPENAI_API_KEY="primary-provider-key"
OPENAI_BASE_URL="https://api.groq.com/openai/v1"
OPENAI_MODEL="llama-3.3-70b-versatile"
```

For higher availability, use Gemini as the independent second provider. Create
the key in Google AI Studio:

```env
AI_FALLBACK_API_KEY="your-gemini-api-key"
AI_FALLBACK_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
AI_FALLBACK_MODEL="gemini-3.5-flash"
```

Every JSON generation first uses the primary provider. On a network, rate-limit,
provider, or invalid-JSON failure, Atrion tries the fallback once. If both providers
are unavailable, generators return their existing local demo fallback where one is
defined. API keys are server-only and are never logged. This improves resilience but
does not promise unlimited availability: provider quotas, billing, and service limits
still apply.

In Vercel, add the six variables above in **Project Settings → Environment Variables**
for Production (and Preview if required), then redeploy. `OPENAI_BASE_URL` and all
three `AI_FALLBACK_*` values are optional; without `OPENAI_API_KEY`, AI runs in demo mode.

## Finik Pro payments

Atrion charges **200 KGS for 30 days of Pro**. WhatsApp remains available until
the Finik business account is approved. Run `prisma/manual-production-migration.sql`
in Neon before deploying the payment code.

Finik must first be tested against its beta environment:

```env
APP_URL="https://atrion-2-0.vercel.app"
FINIK_ENABLED="false"
FINIK_BASE_URL="https://beta.api.acquiring.averspay.kg"
FINIK_API_KEY=""
FINIK_ACCOUNT_ID=""
FINIK_QR_NAME="Atrion Pro"
FINIK_PRIVATE_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
FINIK_PUBLIC_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
```

Generate the merchant RSA key pair according to the official Finik Web SDK guide.
Upload only the public key to Finik. Keep the private key and all API credentials as
Sensitive Vercel variables; never commit them. `FINIK_PUBLIC_PEM` is Finik's public
key for verifying incoming webhooks, not the merchant public key.

The checkout endpoint creates a pending payment and sends the browser to Finik.
The redirect never grants Pro. Only a correctly signed webhook with the expected
payment ID and exact amount can activate the subscription. Duplicate webhook
deliveries are processed once. After beta checkout and webhook tests pass, switch
to `https://api.acquiring.averspay.kg` and set `FINIK_ENABLED="true"`.

## Project Structure

```
Atrion 2.0/
  prisma/          # database schema & migrations
  src/
    app/           # Next.js App Router pages & API routes
    components/    # UI components (incl. 3D scenes)
    lib/           # AI engine, utilities
  docs/            # documentation
```
