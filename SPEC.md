# Product Specification

## Scope

Atrion turns descriptions into editable 3D concepts and supports interior planning, part-level editing, procurement quantities, floor plans and export. The main interface is a unified Atrion workspace.

## Authentication

Registration and sign-in use email/password or configured Google Identity Services. Private routes require an authenticated session. Project, job and file requests verify ownership.

Password changes invalidate previous sessions through the password fingerprint. Email verification and delivery are controlled by deployment configuration. There is no guest-account creation or registration-bypass endpoint.

## General 3D generation

`POST /api/3d/generate` accepts a prompt and returns a validated concept. A configured text model can generate part geometry. Supported procedural builders supply an explicitly labelled fallback when usable AI geometry is unavailable.

Part dimensions are full sizes in metres before rotation. Part rotations use XYZ radians. Repetition, mirroring and custom meshes must be reflected in bounds, editing and quantities.

Explicit dimensions and object counts take precedence over generated variations. Storey modifiers describe building height, rather than the number of buildings. New models initially appear whole; section view is enabled by the user.

Bridge prompts use the dedicated bridge builder. Unknown objects must not be presented as successfully understood merely because a generic primitive can be returned.

## Design and interiors

`/dashboard/design` supports rooms, houses and separate objects. Fast preview uses local rules and validates room dimensions, openings, furniture placement and passages.

Incomplete descriptions can trigger clarification. Answers are retained as context; the user can provide missing values or choose defaults. Recognised values in later answers override earlier ones.

Houses support rectangular or L-shaped footprints, storeys, labelled rooms, roof variations, doors, windows and furniture. Exterior entrances belong to the ground floor. Whole-house, storey and room views share the same document. Export includes the complete house.

The furniture catalog supplies detailed editable objects, style palettes and demonstration prices. Prices are not current supplier quotations.

## Editing

Users can select, move, rotate, scale, lock and delete supported objects. Changes are validated before becoming the accepted scene. Failed operations preserve the previous result.

Undo and redo restore scene snapshots. Transform-only furniture changes update existing rendered objects. Static rooms and houses render on demand. The procurement list is derived from the current scene after edits.

Text and voice refinements support defined actions and vocabulary. They do not imply universal natural-language understanding.

## Floor plans and images

SVG export shows floor layout, openings, furniture and dimensions.

The direct PNG/JPG workflow supports a single rectangular floor. Users set scale, trace rooms and openings, review the plan and confirm before building. Vision-assisted analysis requires a configured provider and still requires review. Direct analysis does not persist the image to the project storage service.

## Export and motion

The design workspace exports GLB and JSON. Design Engine exposes additional mesh formats. Formats are generated from the scene geometry; a screenshot is not a substitute for a model.

Procedural people and animals support basic articulated Idle/Walk animation. Exported motion is not a skinned Humanoid rig. Unity Editor import has not been tested.

## Optional services and persistence

Local scene composition needs a separately running llama.cpp process. Realistic mesh generation needs the Modal GPU service and its server configuration.

Direct design results are page-local until exported. Persistent design projects, versions and queued jobs require the corresponding database tables and a running design worker. A web deployment alone does not start that worker.

## Access and error handling

Application features have no paid tier quotas. Request limits and infrastructure protection still apply.

Generation boundaries limit body size and dialogue length, return safe errors with request IDs, and avoid exposing provider credentials. Usage reservations are returned once on failure. Successful fallback is an explicitly identified result.

## Product boundaries

Visual geometry and procurement quantities are preliminary. Structural engineering, building regulations, certified construction drawings, supplier pricing and arbitrary prompt accuracy are outside the current guarantees.

[Architecture](ARCHITECTURE.md) · [Development](docs/DEVELOPMENT.md) · [Feature guides](docs/README.md)
