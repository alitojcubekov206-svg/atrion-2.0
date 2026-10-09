# Interior Design

Atrion creates an editable room scene with individual furniture objects, openings, finishes and lighting.

## Direct workflow

Open `/dashboard/design` and describe a room or a house. The fast preview uses local planning rules without external inference or queued jobs. A short prompt can trigger clarification; a complete prompt proceeds to construction.

The editor supports room parameters, nine style palettes, the [furniture catalog](INTERIOR_LIBRARY.md), object selection and transform controls. Doors and windows occupy actual wall openings.

Rectangular interior rooms support dimensions from 2 to 30 metres on each side and heights from 2 to 6 metres. Explicit prompt dimensions override current defaults. Invalid openings are reported rather than silently moved.

## Scene contract

`src/shared/interior/` defines scenes, assets and allowed actions. Each scene object retains an ID, asset ID, position, rotation, scale, colour and lock state.

Edits apply to a copy and validate the whole result before acceptance. Placement checks consider rotated bounds, collisions, door clearance and approximate passage accessibility. The passage heuristic is a design check, not a building-code certificate.

Furniture that cannot fit is reported. Fast preview does not claim to understand every arbitrary request.

## Export and procurement

GLB and JSON use the current accepted scene. PNG export captures the actual viewer. Procurement counts complete furniture objects and exposes demonstration prices and budget totals.

House exports include the complete furnished house regardless of selected floor. See [House architecture](HOUSE_ARCHITECTURE.md).

## Optional saved projects

The source also includes project persistence, version history and a task queue. These features require prepared `design_projects`, `design_versions` and `design_jobs` tables and a separately running worker.

| Route under `/api/design/projects` | Behaviour |
| --- | --- |
| `/` | List and create projects |
| `/:id` | Read, rename and delete |
| `/:id/scene` | Read or update scene/actions with revision |
| `/:id/generate`, `/:id/regenerate`, `/:id/assistant` | Enqueue a task |
| `/:id/history` | Read version snapshots |
| `/:id/undo`, `/:id/redo`, `/:id/restore` | Restore accepted state |
| `/:id/variant` | Accept a generated variant |
| `/:id/export` | Export GLB or JSON |
| `/:id/plan`, `/:id/analyze-plan` | Store or analyse a plan with configured storage |

`GET /api/jobs/:id` reports only an owned task. Project updates use revisions; stale writes return a conflict. A foreign project, file or job is not exposed.

## Worker and storage

`npm run design:worker` runs separately from Next.js. It claims jobs atomically, validates allowed JSON actions and records accepted versions. Without a worker, queued jobs are not processed.

R2 storage is optional and private. Stored-plan analysis is distinct from the direct PNG/JPG tracing workflow. The direct workflow does not require R2.

Additive SQL is prepared in `prisma/add-interior.sql`. A build does not apply it. Compare the target schema and approve database changes separately; do not use production `db:push`.

[Development](DEVELOPMENT.md) · [Configuration](CONFIGURATION.md) · [Editor and plans](PLAN_EDITOR_RU.md)
