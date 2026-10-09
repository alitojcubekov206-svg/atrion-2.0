# Team Workflow

## Ownership

| Area | Responsibility |
| --- | --- |
| `src/frontend/` and application pages | Interaction, rendering and product interface |
| `src/backend/` and API routes | Authentication, generation, providers and persistence |
| `src/shared/` | Contracts and geometry used by both layers |
| `infra/` | Optional inference services |
| `docs/`, README and passport | Product behaviour, setup and evaluation |

Keep `.github/CODEOWNERS` intact. Client modules must not import server credentials or database code.

## Contribution sequence

1. Read the relevant specification and feature guide.
2. Inspect the working tree and current remote changes.
3. Update the implementation and the documents that describe its behaviour.
4. Run checks appropriate to the change.
5. Review the diff for unrelated edits, secrets and unsupported claims.
6. Commit a focused change and publish it to the authorised branch.

Coordinate shared contracts before changing dimensions, rotations, object identifiers or export structures. Preserve other contributors' work when integrating branches.

## Quality checks

Code changes require backend regression tests, TypeScript checks and a production build. Generation changes also need representative scenes and downloaded-model checks.

Documentation changes require valid file links, accurate feature descriptions and `git diff --check`. Use English for product documentation. Keep test-account credentials and personal data outside the repository.

## Deployment

The public application is [www.atrion.online](https://www.atrion.online/). Verify the deployed commit and readiness after publication. Optional workers, inference hosts, database schemas and OAuth origins have separate activation requirements.

[Specification](../SPEC.md) · [Development](DEVELOPMENT.md)
