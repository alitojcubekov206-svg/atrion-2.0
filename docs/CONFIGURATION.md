# Настройка и устройство (developer notes)

Перенесено из прежнего README без изменений по смыслу. Запуск и проверка — [DEVELOPMENT.md](DEVELOPMENT.md), поведение — [../SPEC.md](../SPEC.md), устройство — [../ARCHITECTURE.md](../ARCHITECTURE.md).

Copy `.env.example` to `.env` and fill in your keys. **Never commit `.env`.**

## Atrion AI configuration

Atrion keeps the existing OpenAI-compatible settings, so Groq and other compatible
providers continue to work:

```env
OPENAI_API_KEY="primary-provider-key"
OPENAI_BASE_URL="https://api.groq.com/openai/v1"
OPENAI_MODEL="openai/gpt-oss-120b"
```

For higher availability, use Gemini as the independent second provider. Create
the key in Google AI Studio:

```env
AI_FALLBACK_API_KEY="your-gemini-api-key"
AI_FALLBACK_BASE_URL="https://generativelanguage.googleapis.com/v1beta/openai/"
AI_FALLBACK_MODEL="gemini-3.8-flash"
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

## Email verification

Off by default (`EMAIL_VERIFICATION_ENABLED="false"`). Registration and
password checks work without it — it only gates access behind a 6-digit
email code when turned on.

Sending goes through [Brevo](https://brevo.com) (free tier: 300 emails/day,
forever), not a custom-domain provider — no domain purchase required. Brevo
verifies a single sender **email address** (click a confirmation link),
not a domain, so any real inbox you already own (a Gmail works) is enough:

```env
BREVO_API_KEY="your-brevo-api-key"
EMAIL_FROM_ADDRESS="you@example.com"   # the address you verified in Brevo
EMAIL_FROM_NAME="Atrion"
EMAIL_VERIFICATION_ENABLED="false"     # flip to "true" only after a real code arrives
EMAIL_DEV_RETURN_CODE="false"          # только NODE_ENV=development: OTP при сбое доставки
```

Sign up free, add and verify a sender under **Senders & IP → Senders**, then
create a key under **SMTP & API → API Keys**. Test with
`EMAIL_VERIFICATION_ENABLED="false"` and `EMAIL_DEV_RETURN_CODE="true"` first —
register an account and confirm the code shows up in the email inbox, not
just the dev fallback — before flipping verification on for real users.

## Effects levels

Decorative motion (cinematic intro, particle fields, route wipes, generation
reveals) runs at one of three levels stored in the browser
(`effects` in `src/frontend/settings.ts`): **full**, **lite** (fewer particles,
lower frame rate, no ripple) and **off**. Phones and low-spec machines start on
lite via `detectEffectsLevel()`; the OS reduced-motion preference always forces
off. Users change it in Settings or from the footer toggle. Components read it
through `useEffects()` in `src/frontend/effects.ts` and must render nothing
WebGL-related while it is `null` (pre-hydration) or `off`.

## Limits and abuse protection

- Все функции доступны бесплатно, без подписки и тарифных лимитов. Счётчики AI/3D используются для учёта; ошибки возвращают списание однократно.
- **Генерация 3D** идёт напрямую из текста в геометрию. Путь через изображение
  и интеграция Modal удалены; персонажи и животные используют обычный генератор.
- **Сессии** отзываются при смене или восстановлении пароля. При первом выпуске
  нового формата JWT пользователи должны войти заново; миграция БД не требуется.
- **Auth endpoints** (login, register, verify, resend, forgot/reset password,
  account changes) are rate-limited per IP in `src/backend/rate-limit.ts`.
  The limiter is in-memory per serverless instance - good enough for now,
  swap in Upstash if it needs to be global.
- API routes require a verified email when `EMAIL_VERIFICATION_ENABLED="true"`
  (`requireApiUser` in `src/backend/api-auth.ts`).

Схема находится в `prisma/schema.prisma`; каталога `prisma/migrations/` пока нет.
Переход на Prisma Migrate с baseline описан в `docs/DEVELOPMENT.md` и должен быть
выполнен отдельно. До этого `db:deploy` не создаёт схему на пустой базе.

## Project Structure

The code is split into three layers so a frontend and a backend developer can
work in the same repository without touching the same files. Ownership is
enforced on pull requests through `.github/CODEOWNERS`.

```
Atrion 2.0/
  prisma/              # database schema                           (backend)
  scripts/             # dev tools: generation report, CSG smoke test
  src/
    app/
      api/             # HTTP endpoints — server only              (backend)
      **/page.tsx      # routes and screens                       (frontend)
    backend/           # server-only code, never imported by a client component
      ai.ts            #   model providers with fallback
      auth.ts          #   JWT sessions, plans
      db.ts            #   Prisma client
      procedural-3d.ts #   entry point of the model generator
      gen/             #   text → blueprint → geometry, validation & repair
    frontend/          # browser-only code
      components/      #   UI, 3D viewport, CAD toolbar, voice panel
      csg.ts           #   boolean operations on parts
      export-3d.ts     #   GLB / STL / OBJ writers
      voice-commands.ts#   speech → scene actions
    shared/            # used by both sides
      types.ts         #   the data contract (ModelPart, ThreeDConcept, …)
      geometry.ts      #   primitive expansion, bounds, palettes
```

**The rule:** `frontend` never imports from `backend`, and `backend` never
imports from `frontend`. Anything both sides need lives in `shared`. The two
sides talk over the HTTP endpoints in `src/app/api` only.

### Dev tools

```bash
npx tsx scripts/gen-report.ts          # what each prompt generates, with a summary
npx tsx scripts/gen-report.ts "фраза"  # inspect one prompt
npx tsx scripts/csg-smoke.ts           # verify the boolean engine
```

Дизайн работает через прямой `/api/design/preview` без worker. В результате доступны список закупки, CSV и экспорт GLB для Unity: [инструкция](UNITY_EXPORT.md).
