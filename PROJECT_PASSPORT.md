# Atrion — Project Passport

| Field | Description |
| --- | --- |
| Project | Atrion 2.0 |
| Tagline | Just build it. |
| Product | Browser-based 3D concept generation and design workspace |
| Website | [www.atrion.online](https://www.atrion.online/) |
| Repository | [Atrion on GitHub](https://github.com/alitojcubekov206-svg/atrion-2.0) |
| Stage | Working prototype |
| Intended users | People exploring spatial ideas, interior layouts and 3D prototypes |
| Access | Account sign-in; email/password and configured Google sign-in |

## Problem and approach

Users need to turn an idea into something they can inspect and change before committing to detailed modelling. Atrion combines text input, an editable 3D scene, interior planning, floor-plan export and a preliminary procurement list.

The central workflow is **describe → generate → inspect → edit → export**. Objects retain individual identities so users can rearrange a room or modify a concept after generation.

## Implemented capabilities

- Part-based 3D concepts for supported object categories.
- Houses with rooms, storeys, doors, windows, roof variations and furniture.
- Interior styles, placement checks and an editable furniture catalog.
- Move, rotate, scale, delete, undo and redo.
- Procurement quantities, CSV export and demonstration furniture budgets.
- SVG floor plans and reviewed reconstruction from PNG/JPG plans.
- GLB/JSON export and additional mesh formats in the general studio.
- Basic Idle/Walk motion for procedural people and animals.

## AI and models

The text provider selected by the production configuration was verified on **10 October 2026** as `openai/gpt-oss-120b` through an OpenAI-compatible adapter. This is a configuration observation; it does not guarantee a successful model response to every request.

Text AI can propose structured geometry and supported refinements. The application validates the result before rendering. Fast interior planning, transforms, quantities and exports are implemented by application code.

Optional integrations in the source include:

| Integration | Model or runtime | Availability |
| --- | --- | --- |
| Local scene composition | Qwen3-4B-Instruct-2507 through llama.cpp | Requires a separately running local inference process |
| Plan-image analysis | Cloudflare Llama 3.2 11B Vision | Requires explicit configuration; production availability must be checked |
| Realistic mesh generation | SDXL with SDXL-Lightning, then `microsoft/TRELLIS-image-large` | Requires a separately deployed Modal GPU service |

Available adapters and a running service are separate concerns.

## Data

**Application data category: mixed.** Real user descriptions and uploaded plans are combined with synthetic procedural geometry, generated scene descriptions and a curated furniture catalog.

This classification describes application inputs and outputs. Atrion has not trained or fine-tuned its own model on a mixed dataset. The training data of external pretrained models is controlled by their providers.

Open-data collection utilities are available for future experiments. Collected datasets are not connected to production generation.

## Engineering

The application uses Next.js, React, TypeScript and Three.js. Backend routes handle authentication, provider calls and validation. Shared contracts connect server generation to browser editing and export. PostgreSQL/Neon stores account and project data; Vercel hosts the web application.

Private APIs require a session. Project and file operations verify ownership. Provider secrets remain on the server. Generated JSON is validated; generated code is not executed.

## Validation and limits

Regression tests cover generation, authentication boundaries, interior placement, editing, procurement and export. TypeScript and production builds run in CI.

The prototype produces visual concepts rather than construction documents. It does not guarantee every arbitrary object, engineering accuracy, photorealism or a production character rig. Unity Editor import remains an unverified integration step.

## Evaluation

Follow the [product walkthrough](docs/DEMO.md). Use a normal account or privately supplied test credentials. The repository contains no passwords or registration bypass.

[Specification](SPEC.md) · [Architecture](ARCHITECTURE.md) · [Setup](docs/DEVELOPMENT.md)
