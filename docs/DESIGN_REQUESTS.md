# Design Requests

The design workspace routes a description to a room, a house, a separate object or an explicitly selected local-AI composition workflow.

## Describe the result

Include the main subject, dimensions, required objects and style where relevant.

| Request | Intended workflow |
| --- | --- |
| “A bedroom, 4 by 5 metres, with a bed and wardrobe” | Interior layout |
| “A two-storey house, 12 by 9 metres, with a kitchen, living room and bedrooms” | Furnished house |
| “Create a rocket” | Separate 3D object |
| “Create an office” | Office interior |
| “Create an office building” | Building concept |

These examples illustrate routing, rather than an exhaustive list of understood language. The interface does not require a fixed example template.

## Clarification

The brief tracks known values and asks about missing dimensions, floors or room requirements. Answers accumulate in context. Later explicit values override earlier ones.

A user can delegate unspecified choices. Chosen defaults are assumptions, not measurements. Dimensions, budgets, opening sizes and object counts must remain distinct.

## Interior commands

Supported local actions include adding or removing known furniture, setting colours, rotation, scale, lock state and position. Explicit empty-room instructions override automatic furnishing.

The parser distinguishes similar furniture categories and considers quantities before modifiers. An unrecognised command segment can reject the whole edit rather than applying only part of it.

## Preservation

Invalid geometry, collisions or unavailable inference preserve the accepted scene. Returned object names and a valid JSON structure do not prove that every requested relationship was satisfied.

Direct design results are kept in the page. Export GLB/JSON before refreshing if the result has not been saved through a configured project workflow.

## Checks

Request tests cover routing, clarification, explicit values, colours, counts and unsupported requests. House and room tests cover placement and export. New prompts should also be inspected visually.

[House architecture](HOUSE_ARCHITECTURE.md) · [Interior design](INTERIOR_DESIGN.md) · [Generation quality](GENERATION_QUALITY.md)
