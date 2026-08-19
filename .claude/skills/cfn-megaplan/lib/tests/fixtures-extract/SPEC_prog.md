Intro content that appears before the first heading. Always kept regardless of part.

# Program Overview

Shared preamble text with no tag, applies to every part.

## Data Model [part: B0, B2]

This section covers the shared data model used by B0 and B2 only.

### Migration Notes

Nested notes under the data model section; no tag of its own, inherits B0/B2 scope.

| Field | Type | Notes |
|---|---|---|
| id | uuid | primary key |
| owner_id | uuid | fk to users [part: B0] |
| region | text | geo partition [part: B2] |

## API Contract [part: B1]

Endpoints owned by B1 only.

### Error Codes

Error taxonomy for the B1 endpoints.

## Shared Utilities [part: shared]

Helpers used by every part, explicit shared tag.

## Rollout Plan

Untagged section, kept for every part by default.

| Step | Owner | Notes |
|---|---|---|
| 1 | infra | provisioning, no tag |
| 2 | B0 | seed data [part: B0] |
| 3 | B1 | wire endpoints [part: B1] |
| 4 | B2 | region sharding [part: B2] |
