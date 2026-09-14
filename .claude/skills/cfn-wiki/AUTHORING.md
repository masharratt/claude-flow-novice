# Authoring grounded wiki knowledge

Use `readme/wiki/knowledge.json`, version 1. It is tracked; `.wiki/` is a cache.
The CFN file is a complete worked example. Keep the format repo-neutral.

## Content model

Top-level fields:

- `version`: 1.
- `overview`: `title`, `summary`, `coverage`, and `questions` (reader questions).
- `capabilities`: authored capabilities; add them as understanding improves.
- `entities`: actual runtime state models, or an empty list.

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

Hash cited files only after reviewing them (`sha256sum <source>`). Source
changes preserve authored text and display review warnings. Reconcile each
changed claim before updating hashes. Directory enrichment preserves its old
fingerprint until explicitly reviewed; prefer moving important explanations
into the capability model instead of maintaining parallel prose copies.

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
