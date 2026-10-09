# Atrion 2.0

**Just build it.**

Atrion is a browser-based studio for turning written ideas into editable 3D concepts. Describe a building, a room or an object, explore the result, rearrange its parts and export the model.

[Open Atrion](https://www.atrion.online/) · [Project passport](PROJECT_PASSPORT.md) · [Product walkthrough](docs/DEMO.md) · [Documentation](docs/README.md) · [CI](https://github.com/alitojcubekov206-svg/atrion-2.0/actions/workflows/ci.yml)

## The problem

Explaining a spatial idea often takes several tools: a floor planner, a 3D editor and a spreadsheet. Atrion brings the first draft, editing, floor plans and an initial procurement list into one browser workspace.

It is built for early design discussions, rapid prototyping and presentations. Users can refine the exported result in a dedicated 3D application.

## What you can do

| Feature | Result |
| --- | --- |
| Text to 3D | Part-based concepts for supported buildings, vehicles, furniture, plants, people and animals |
| Houses and interiors | Storeys, rooms, doors, windows, furniture, rectangular and L-shaped footprints |
| Interactive editing | Select, move, rotate, resize or delete objects; undo and redo changes |
| Natural-language changes | Update supported dimensions, colours and scene elements through text or voice |
| Procurement | Recalculate quantities from the edited scene and download CSV; furniture budget uses demonstration prices |
| Floor plans | View rooms, openings and furniture with dimensions; download SVG |
| Plan images | Trace a PNG/JPG plan, review dimensions and build a concept; automatic analysis needs a configured Vision service |
| Export | GLB and JSON in the design workspace; additional mesh formats in Design Engine |
| Character motion | Basic joint-based Idle and Walk clips for procedural people and animals |

## Try the workflow

1. Open [Atrion](https://www.atrion.online/) and sign in with an account.
2. In Design Engine, describe a building, for example: **“Create an eight-storey office building with a flat roof and large windows.”**
3. Open Design and Interior. Describe a room with its dimensions, furniture and style.
4. Select an object, move it, delete it and undo the change.
5. Review the procurement list and download GLB. For a house, also export its SVG floor plan.

See the [walkthrough](docs/DEMO.md) for a short presentation sequence. Test-account credentials are shared privately and are not stored in this repository.

## How generation works

The editable workflow converts a prompt into a structured description of parts, validates the geometry and renders a 3D scene. A configured text model can propose the geometry; supported procedural builders provide an explicitly identified fallback. The fast interior workflow uses local planning rules and a furniture catalog.

An optional realistic mode runs an image-to-mesh pipeline on a separate GPU service. Its output is a textured mesh, with different editing capabilities from a structured house or room.

Atrion uses pretrained models and application geometry. It does not train its own foundation model. See the [project passport](PROJECT_PASSPORT.md) for the AI and data summary.

## Technology

Next.js 15 · React 19 · TypeScript · Tailwind CSS · Three.js · React Three Fiber · Prisma · PostgreSQL / Neon · OpenAI-compatible inference adapters · Vercel

| Directory | Purpose |
| --- | --- |
| `src/app/` | Pages and HTTP routes |
| `src/backend/` | Authentication, providers, generation and validation |
| `src/shared/` | Contracts, geometry, house documents and interior catalog |
| `src/frontend/` | 3D viewers, editing controls and browser exports |
| `infra/` | Optional GPU inference service |
| `scripts/` | Regression checks and development tools |

## Run locally

Use Node.js 22 or newer and npm.

```bash
npm ci
npm run dev
```

The development-only [generator playground](http://localhost:3000/playground/generator) and [interior playground](http://localhost:3000/playground/interior) support procedural previews without a database or external AI keys.

For authentication and the full application, copy `.env.example` to `.env`, configure PostgreSQL and a session secret, and follow [Development](docs/DEVELOPMENT.md) and [Configuration](docs/CONFIGURATION.md).

## Verification

```bash
npm run test:backend
npx tsc --noEmit
npm run build
```

These checks run in [GitHub Actions](https://github.com/alitojcubekov206-svg/atrion-2.0/actions/workflows/ci.yml). Provider configuration and real generation responses need deployment-specific checks.

## Current boundaries

- Generated models are design concepts. Structural calculations, building-code compliance and certified estimates are outside the current scope.
- Procedural generation supports defined object categories; arbitrary prompts and photorealism are not guaranteed.
- Photo-plan reconstruction requires review. The direct tracing workflow supports a single rectangular floor.
- Basic character animation uses articulated parts, without a skinned Humanoid rig.
- GLB structure has been checked with loaders and validators. Import inside Unity Editor has not been verified.
- Direct design results stay in the current page unless exported. Persistent design history needs its database schema and worker.
- Atrion has no paid application tiers. Infrastructure limits and third-party quotas still apply.

## Documentation and license

Start with the [project passport](PROJECT_PASSPORT.md), [product specification](SPEC.md) and [architecture](ARCHITECTURE.md). The [documentation index](docs/README.md) links to feature and setup guides.

All rights reserved. See [LICENSE](LICENSE). Attribution for adapted source components is kept alongside their source files.
