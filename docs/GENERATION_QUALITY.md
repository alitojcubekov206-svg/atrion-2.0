# Generation Quality

Atrion aims to preserve the subject, dimensions, quantities and required elements of a prompt. These are evaluation criteria, rather than a claim of universal generation accuracy.

## Acceptance checklist

| Area | Check |
| --- | --- |
| Prompt match | Main subject, required parts and explicit exclusions |
| Dimensions | Units, full sizes, proportions and overall bounds |
| Geometry | Finite vertices, supported shapes, coherent placement |
| Structure | Openings, connections and intended separation |
| Materials | Distinct requested colours and usable export materials |
| Editing | Stable identifiers and accepted transforms |
| Export | Readable file with the current geometry |
| Target application | Actual import and visual comparison in the intended editor |

For houses, check footprint coverage, door access, window openings, room boundaries and furnishing passages. For characters, check anatomy and motion pivots.

## AI response handling

Schema validity is only the first check. The generator validates numeric limits, bounds and repeated parts, and can request a bounded repair. Missing-part detection uses recognised names and is not a complete semantic assessment.

Recognised subjects ship from the procedural builders, which vary per request; a text model asked for the same words tends to draw the same typical object. Supported procedural fallback is labelled. Unknown prompts must not be treated as successfully understood merely because a primitive was returned.

Heuristic scores, part counts and a successful build do not prove visual quality.

## Verification tools

Use `npm run test:backend`, `npx tsc --noEmit` and `npm run build`. Generator reports and representative browser scenes add scenario-specific evidence.

Dataset collection does not improve the running generator until data is integrated and evaluated. See [Datasets](DATASETS_RU.md).

## Boundaries

Concept models are not structural designs or certified construction drawings. Arbitrary complex forms and photorealism are not guaranteed. GLB validation does not replace a Unity Editor import test.

[Specification](../SPEC.md) · [Development](DEVELOPMENT.md)
