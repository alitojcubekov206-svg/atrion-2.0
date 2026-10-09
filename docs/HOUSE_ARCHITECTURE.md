# House Architecture

The direct design workflow compiles a house description into a structured document containing a footprint, floors, rooms, openings and furnishing.

## Supported variations

| Element | Supported choices |
| --- | --- |
| Footprint | Rectangular or L-shaped |
| Floors in the direct house planner | One to three |
| Facade | Modern, Scandinavian, classic, timber/chalet and brick |
| Windows | Regular, small or panoramic |
| Roof | Flat, gable, hip, shed or mansard |
| Colours | Separate wall, roof, frame and door choices |
| Interior | Named rooms with suitable catalog furniture |

An L-shaped house uses two wings. Floors, walls, rooms and roof follow the footprint, leaving the removed corner empty. At least two rooms are needed per floor in this workflow.

The general building generator has a different contract and supports taller buildings. The direct furnished-house planner's floor limit does not apply to every building route.

## Openings and furnishing

Windows lie on exterior walls with margins and door clearance. Bathrooms use smaller high windows. Wall openings contain frames, glass or door leaves and handles.

The exterior entrance is on the ground floor. Internal doors connect rooms. Upper floors do not receive repeated exterior entrances.

Furniture placement reserves room boundaries and passages. Items that do not fit produce warnings. Room purpose, recognised furniture requests and explicit empty-room instructions influence furnishing.

## Implementation

`backend/design/house-architecture.ts` parses architectural preferences. The house layout compiles rooms and openings. Shared footprint, roof, facade and fittings modules supply geometry without database or browser dependencies.

`frontend/house-model.ts` builds both display and GLB geometry. Procurement counts windows, doors and furniture as whole items; decorative facade lines are not separate purchases.

## Views and export

New results show the complete house from the entrance side. Users can inspect floors, zoom into rooms and edit furniture. Framing includes the roof and full bounds.

JSON retains the house document and interiors. GLB always contains the complete house with all furnished floors.

## Boundaries and checks

Curved footprints, engineered stairs, opening-door simulation, roof framing and building services are outside this implementation. Roof joins are conceptual rather than structural designs.

Regression tests cover footprints, openings, colours, roofs, furniture boundaries and quantities. Visual review and exported-file checks are still required.

[Design requests](DESIGN_REQUESTS.md) · [Plan editor](PLAN_EDITOR_RU.md)
