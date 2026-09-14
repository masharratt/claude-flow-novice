# Authoring grounded wiki knowledge

Knowledge lives in `readme/wiki/knowledge.json` plus, at version 2, its
shards under `readme/wiki/domains/`, `capabilities/` and `entities/`. All
tracked; `.wiki/` is a cache. Version 1 files stay readable; migrate to
version 2 explicitly with `wiki migrate <repo> --to 2` (idempotent, backed
up, never runs during build or sync). The CFN file is a complete worked
example. Keep the format repo-neutral.

## Content model

Version 2 top-level fields: `version`, `overview` (same shape as v1), and
id lists `domains`, `capabilities`, `entities` resolving to shard files
(loader rejects duplicate ids, escaping references and missing shards).
A capability shard adds `evidence` (work-queue evidence ids), `domains`
(domain ids it belongs to) and `unknowns` (named open questions) to the
v1 fields below. A domain shard carries `id`, `name`, `purpose`,
`capabilities`, `entities`, `shared_contracts`, `unknowns`; it may list
only capabilities that already exist (bootstrap incrementally: seed a
domain with the capabilities that exist, add the rest as they land).

Each capability requires:

- `fid`: stable lowercase hyphenated ID independent of directory names.
- `name`, `description`, `purpose`: human capability name, concise card copy,
  and the problem the capability solves.
- `status`: prod, beta, dev, stub or deprecated; `status_reason` states evidence
  and limits. Use dev with an explicit unassessed reason when maturity is unknown.
- `reviewed_at`: source-review date; this is not a deployment/test certification.
- `sources`: objects with `path` (repo relative), positive `line`, `claim`, and
  `sha256` of the reviewed file. Cite implementations and relevant tests. Do not
  cite secrets or environment files: short source excerpts enter the static portal.
- `flow`: ordered `{title, detail, source, line}` objects. Pin the relevant source line for each step. `source` must name a cited
  path. Explain data/control movement, not just a list of components.
- `failures`, `change_guidance`, `limitations`: lists of concrete reader guidance.
- `dependencies`: optional concise text describing actual prerequisites.

Each entity has `name`, `capability` (capability fid), `source` (path:line),
`description`, `states` (names), optional `meanings` (name to meaning), and
`transitions` containing `from`, `to`, `trigger`, `guard`. `[*]` is the start/end
marker. Explain whether these are persisted states, execution modes or a
conceptual model. Only include transitions supported by source. Do not convert
feature maturity into runtime state. Do not conflate mode, status and verdict.

## Evidence workflow

Read the entrypoint and follow its calls or workflow references through the
outcome. Inspect tests and failure branches. Distinguish runtime implementation
from instructions that an agent follows. If a workflow says one thing and code
does another, describe the actual boundary and uncertainty.

For repos with a seeded work queue, author through it so context stays
bounded: `wiki work next` leases one job and prints a brief (8 KiB cap);
gather sources only via `wiki work evidence` (120 lines / 8 KiB per span,
64 KiB per attempt, every retrieval accounted); write the candidate as a
wrapper `{"capabilities": [shard...], "entities": [...], "domains": [...]}`
(a bare shard fails submit's promotion-shape check); `work submit`, a
separate reviewer decides, and `work promote` lands accepted content
(freshness-rechecked; promote right after review in a quiet tree). Name
what you did not read in `unknowns` instead of inventing it; the reviewer
verifies claims against cited lines, and schema validity alone never
accepts.

Hash cited files only after reviewing them (`sha256sum <source>`; the
canonical hash covers committed content, so hash what git holds, not a
locally edited file). Source changes preserve authored text and display
review warnings. Reconcile each changed claim before updating hashes.
Directory enrichment preserves its old fingerprint until explicitly
reviewed; prefer moving important explanations into the capability model
instead of maintaining parallel prose copies.

Review reader notes as feedback. For a supported correction, update the authored
claim and evidence. A note alone never establishes a fact or maturity change.

## Reader acceptance

With only the wiki open, verify that a reader can:

1. State the system's purpose and the limits of documented coverage.
2. Follow one real trigger through components, data and an outcome.
3. Explain a failure or unresolved case and the next investigation step.
4. Locate the source evidence and tests relevant to a proposed change.
5. Distinguish source-reviewed claims, unassessed inventory and stale evidence.

Use a real repo case and adversarial checks: source edit with unchanged filename,
missing evidence, an unresolved result, note saved without factual promotion,
and imported appendix content. A useful wiki may be small; do not fill gaps with
plausible generic diagrams or status defaults presented as verified facts.
