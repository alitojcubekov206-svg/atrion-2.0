# Editing and Character Motion

## Transfer from the generator

After generation, Design Engine exposes an entry into the design workspace. The current result can be transferred without regenerating it, including accepted geometry and edits.

The transfer is a temporary in-tab draft with a 30-minute lifetime. Refreshing the tab can discard it. Export GLB or JSON to retain the result. Transferring a building mesh does not automatically create a new room layout.

## Object editing

Furniture can be selected in the scene or list, moved on the floor plane and rotated around the vertical axis. A drag commits on release. Invalid placements restore the previous position.

House furniture can be transferred between rooms or floors while preserving its identifier, scale and material. A locked object or an invalid destination leaves the source intact.

Local history supports undo and redo. Persistent history is a separate project feature that requires its schema and checks session, ownership and revision.

## People and animals

Procedural characters use articulated groups of parts for legs, arms, heads, tails and wings. Repeated characters receive separate motion groups.

The viewer supports idle, walking and pause. Part editing uses the base pose. The GLB exporter can include looping `Idle` and `Walk` clips; walking is in place.

The motion builder is `src/shared/living/motion.ts`. It is shared by preview and export.

## Boundaries

This is basic joint animation, without skinning, Humanoid Avatar construction, inverse kinematics, facial animation or game-ready locomotion.

A realistic mesh does not automatically acquire this rig. Model readability, visible motion, GLB validity and actual engine import must be checked separately.

[Living-model quality](LIVING_MODEL_QUALITY.md) · [Unity export](UNITY_EXPORT.md)
