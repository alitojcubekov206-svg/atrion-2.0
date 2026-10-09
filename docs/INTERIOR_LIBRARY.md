# Interior Library

The Atrion catalog supplies individually editable furniture, lighting, decor, kitchen and bathroom objects. The current catalog contains **26 assets** across ten categories and supports nine style palettes.

## Geometry and materials

`src/shared/interior/catalog.ts` defines identifiers, dimensions, tags, prices and model routes. Detailed geometry is shared by browser preview and GLB export. Objects are normalised to catalog dimensions and support wood, fabric and procedural material maps.

Source-component attribution is preserved [alongside the adapted geometry](../src/shared/forma/README.md). Atrion provides its own product interface.

## Placement and budgets

Furniture placement checks room boundaries, intersections and door passages. Low-profile floor decor can overlap furniture without blocking movement.

The procurement list counts whole furniture items rather than mesh triangles or individual legs. Demonstration prices are expressed in KGS and can support a preliminary budget. They are editable sample values, not supplier quotations.

## Editing and export

Objects can be selected, moved, rotated, locked, deleted and restored through undo. Transform-only changes update existing rendered objects. Viewers and exports derive from the accepted scene.

The camera supports orbit and zoom. Walkthrough avatars and automatic tours are outside this workspace.

## Legacy compatibility

Older document routes and database models remain available for compatibility. They do not automatically convert saved legacy documents into current interior scenes. Direct previews and exports do not require those legacy tables.

[Interior design](INTERIOR_DESIGN.md) · [Editor](PLAN_EDITOR_RU.md) · [Unity export](UNITY_EXPORT.md)
