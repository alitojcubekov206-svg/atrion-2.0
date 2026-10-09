# Architecture

Atrion is a Next.js application with server-side generation, shared scene contracts and browser-based 3D editing. Optional GPU inference runs as a separate service.

## Application layers

| Layer | Responsibility |
| --- | --- |
| `src/app/` | Pages, HTTP routes and request boundaries |
| `src/backend/` | Authentication, database access, AI adapters and generation |
| `src/shared/` | Pure contracts, geometry, house documents and quantities |
| `src/frontend/` | Rendering, selection, transforms, history and export |
| `infra/modal_realistic.py` | Optional image and mesh inference on a GPU |

Frontend code does not import backend modules. Shared modules contain no credentials or Prisma clients.

## Editable generation

`/api/3d/generate` calls the generation service in `backend/ai.ts`. Configured text inference can propose part dimensions, positions, shapes and materials. `gen/ai-geometry.ts` validates the response and bounds repair work.

`gen/blueprint.ts`, `prompt-params.ts` and `gen/build.ts` implement supported procedural categories and prompt parameters. Explicit user values override random variants. The response identifies procedural fallback when used.

Refinement applies supported local transforms or calls configured text inference. Rejected changes preserve the existing scene.

## Houses and rooms

`DesignWorkspace` calls `/api/design/preview`. The brief identifies missing parameters; house and interior builders construct a validated result without external text inference.

`shared/house/` represents footprints, floors, rooms, openings and finishes. `frontend/house-model.ts` builds detailed geometry for both display and GLB export. A selected-floor view does not truncate export.

Interior objects have stable identifiers. Render synchronisation updates object transforms without rebuilding unrelated furniture. History stores scene snapshots. Procurement derives from the accepted model; floor-plan SVG derives from its house document.

Furniture geometry is shared by viewers and exports. Source attribution is maintained [alongside the adapted component](src/shared/forma/README.md).

## Plan images

`PhotoPlan` loads a PNG/JPG in the browser. Users enter dimensions and trace rooms and openings. `shared/house/from-plan.ts` validates the reviewed plan and constructs geometry.

Configured Vision analysis passes an optimised image to the provider through `/api/design/plan`. The direct workflow does not write the image to R2 or PostgreSQL. Its supported geometry is one rectangular floor.

## Optional inference and persistence

| Component | Dependency |
| --- | --- |
| Text geometry | OpenAI-compatible inference or Cloudflare Workers AI |
| Local composition | llama.cpp on server loopback |
| Realistic mesh | Separately deployed Modal service |
| Saved interior projects and history | Design tables in PostgreSQL |
| Queued interior tasks | A separately running `design:worker` process |
| Stored plan files | Private R2 storage and the project schema |

The direct preview workflow does not require the design queue. Transfers between Design Engine and the design editor use a temporary in-tab draft; refreshing the page can discard it.

## Authentication and validation

- Private routes require a session; project and file operations verify ownership.
- Session tokens include a password fingerprint so password changes revoke old sessions.
- Google sign-in validates the challenge, Origin, JWKS signature and token claims.
- Generation requests enforce input limits and return safe request identifiers.
- Usage counters track operations without paid application quotas.
- The in-memory rate limiter is per process, rather than a distributed global limiter.
- Generated structured data is validated; generated code is not executed.
- Guest-account creation has been removed.

## Export

Browser and server exporters use the same shared scene geometry. Articulated character clips use `shared/living/motion.ts`. GLB validation does not establish compatibility inside an untested Unity Editor installation.

[Specification](SPEC.md) · [Configuration](docs/CONFIGURATION.md) · [Unity export](docs/UNITY_EXPORT.md)
