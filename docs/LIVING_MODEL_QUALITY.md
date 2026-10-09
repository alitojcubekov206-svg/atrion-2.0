# Living-Model Quality

Procedural people and animals are stylised concepts assembled from individual geometric parts. Their quality is assessed through recognisable proportions, appropriate anatomy and useful motion.

## Acceptance criteria

- The requested subject remains recognisable.
- Required limbs and features are present in plausible positions.
- Named dimensions and counts are respected where supported.
- Parts remain finite and within coherent bounds.
- Motion pivots attach to the correct limb groups.
- Idle and walking clips avoid obvious separation of parts.
- Exports preserve the geometry and intended animation channels.

The anatomical regression suite is `scripts/living-anatomy.test.ts`. Generation tests also check category routing so incidental words do not accidentally change a building into an animal.

## Visual review

Inspect front, side and three-quarter views. Check hands, feet, paws, muzzle, tail and joint placement. Review idle and walking before export and verify the downloaded file independently.

Numerical tests do not establish anatomical realism. A readable GLB does not establish a game-ready character.

## Current boundaries

There is no skinned skeleton, Humanoid retargeting, facial rig, cloth or muscle simulation. Walking is a repeated joint animation in place. Unsupported species and complex poses can remain approximations.

Unity Editor import and animation playback have not been verified on this machine.

[Editing and motion](DESIGN_EDITING_MOTION.md) · [Generation quality](GENERATION_QUALITY.md)
