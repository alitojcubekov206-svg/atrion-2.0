# Development

## Requirements

Use Node.js 22 or newer and npm. PostgreSQL is needed for account and saved-project flows. Optional inference and storage services are configured separately.

## Install and run

```powershell
npm ci
Copy-Item .env.example .env
npm run dev
```

Configure `DATABASE_URL`, `AUTH_SECRET` and any required integrations in `.env`. Keep the file outside Git.

| Development route | Purpose |
| --- | --- |
| `/playground/generator` | Procedural 3D concepts |
| `/playground/interior` | Rooms, houses, editing and plan tracing |

Playground routes are development-only and return 404 in production. Production users enter through registration or ordinary sign-in.

## Verification

```powershell
npm run test:backend
npx tsc --noEmit
npm run build
```

Run these checks for code changes. For documentation-only changes, verify paths, links and `git diff --check`.

Additional tools:

| Command | Purpose |
| --- | --- |
| `npx tsx scripts/gen-check.ts` | Generator regression cases |
| `npx tsx scripts/gen-report.ts` | Generation quality report |
| `npx tsx scripts/csg-smoke.ts` | Boolean geometry smoke test |
| `npx tsx scripts/voice-test.ts` | Voice-command parsing |

Inspect real scenes after generation changes. Automated structure checks do not prove visual quality or understanding of every prompt.

## Browser checks

1. Generate one eight-storey building and verify initial section view is off.
2. Generate a furnished room; move, delete and undo an object.
3. Generate a house; inspect floors, openings and furnishing; export SVG and GLB.
4. Trace a PNG/JPG plan and confirm dimensions before building.
5. Verify rejected edits preserve the accepted scene.
6. Verify private routes reject missing sessions and foreign project identifiers.
7. Confirm `/api/auth/demo` returns 404 without creating an account.

## Optional processes

```powershell
npm run design:ai
```

This starts the prepared local inference runtime after its weights and binaries are installed. See [Local AI](LOCAL_AI.md).

```powershell
npm run design:worker
```

Run the worker in a separate terminal with the same database configuration. It loads `.env` and then `.env.local`. The direct preview and plan-tracing workflows do not need it.

The Modal service in `infra/modal_realistic.py` has a separate deployment lifecycle.

## Database changes

There is no baseline migration directory in this repository. `db:deploy` does not create the current schema without that baseline.

For a new disposable local database, confirm the target before using `db:push`. For an existing database, compare the actual schema, prepare a backup and establish a baseline. Additive SQL files target individual features and are not executed by a normal build.

Do not apply the full Prisma schema to production with `db:push`. Review the exact target and SQL as a separate operation.

[Configuration](CONFIGURATION.md) · [Architecture](../ARCHITECTURE.md)
