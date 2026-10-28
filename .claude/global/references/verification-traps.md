# Verification Traps

Load when: writing or reviewing a guard, post-apply check, schema assertion, or new test; adding a field or widening an enum/union; scripting a file edit or applying a patch. Pointers for these live in `~/.claude/rules/code-quality.md`.

## Enum & Value Completeness: incident detail

- **"Widen" in a step title is a smell: ask whether any existing value CHANGES.** A change described as widening a union is often a rename plus additions, and a rename breaks every literal consumer, including tests and fixtures no plan step names. Grep the OLD literal values, not the type name, and give each consumer file its own step. Tracing the call sites of the signature change is not enough: the literal-value consumers of the union it rides on are a different set. One such step produced breakages in a spend call, four source files and three test files in a single run, with typecheck red until the last one was fixed by hand.
- **Adding a field to a type does not make it reach storage when a hash gate sits downstream.** Where a pipeline persists a snapshot only when it differs (`changed = hash(new) !== storedHash`), the new field must participate in the hash function's own projection of "what counts as content". If it does not, a base whose only change is the new field hashes identically, the gate stays shut, and the enrichment is computed on every run and discarded forever, until something unrelated changes. Two checks when adding such a field: (1) the hash's projection includes it; (2) that inclusion cannot manufacture a spurious entry in a different consumer of the same diff (a field-level alert, say), with a unit test asserting the diff stays empty for a same-content-except-the-new-field comparison. Code review and isolated unit tests both pass on the broken version: nothing about any individual function is wrong.

## Checks and Guards Must Name Their Failure

A check that runs, reports, and cannot tell you which way it went is worse than no check: the
next session spends its turn on the wrong question. Four shapes of this, all measured:

- **A cardinality collapses the thing you needed to see.** Live tables carried 22 policies
  under one naming scheme; a migration creates 22 under another. Disjoint sets, identical
  count, so a COUNT-based check reports "intact" while every policy it guards is missing.
- **A bare boolean names neither direction nor members.** `expect(sameSet(a, b)).toBe(true)`
  prints `expected false to be true` and tells you nothing about what drifted.
- **A live-state read makes shared state the fixture.** An assertion on a live feature-flag
  value turns red when somebody else flips the flag, with no indication that the shared
  state, not the code, moved.
- **A check that examined nothing reports the same green as a check that examined
  everything.** A scan that excludes fixture rows by default examines zero rows in an
  environment where every row is a fixture. Two findings and no findings are different
  answers, but so are no findings and no rows, and only the check knows which it had.

Rules:

- When writing or reviewing any guard, post-apply check or schema assertion, ask what its
  output looks like when it fails. If the answer is a number, a bare boolean, or silence,
  make it emit both set differences by name: `missing=[...] unexpected=[...]`. That costs
  nothing and is self-explaining.
- Verify schema state by diffing the full live set against the migration source. Do not
  sample names: two sessions sampling for the same damage both produced wrong three-item
  lists.
- Any check that filters its own population must report that population's SIZE alongside its
  verdict, and a gate needs a distinct exit code for zero (0 clean, 1 findings, 2 read zero
  rows) plus a rendered line saying it certified nothing. Without it, the first run in a
  fresh environment reports the same green it will report on the day it matters.
- **A requirement covering N call sites is usually graded on some of them and reads as full
  coverage.** Coverage counters count mapped requirement ids, not call sites. A row named for
  a sibling function, and a static absence grep (no occurrence of a literal in a file, which
  says nothing about whether anything carries the predicate), both look like coverage and are
  not. At an exit gate, mutate EVERY site the plan enumerates, one at a time, running the
  whole manifest each time. Aim the mutation by first mapping the line to its enclosing
  function: the first predicate after a function name often belongs to the previous function.
  A surviving mutant means write the row and re-gate.

## Tests That Cannot Fail

A green suite is evidence only if the assertion could have gone the other way. Before
trusting a new test, watch it go red.

- **An identity comparison needs two distinct fixture ids.** A fixture that uses one id for
  both sides makes the axis under test unfalsifiable. One suite was 13 of 13 green while the
  live route answered 404 for every legitimate self-read, because the person id and the auth
  user id were the same constant. Name them separately (`FIXTURE_PERSON_ID`,
  `FIXTURE_AUTH_USER_ID`), split them BEFORE writing the regression test, and confirm the red.
  Same family as a fixture naming a real entity.
- **A mocked query proves you sent the SQL you expected, never that the server accepts it.**
  Column scoping, casts and `ON CONFLICT` targets only fail on a real database. A lease
  statement shipped with an ambiguous column reference (Postgres 42702) behind 19 green
  mocked tests, and every cron tick 500'd. For any new or edited raw statement, add an
  integration test that runs it against a real local database inside BEGIN/ROLLBACK.
- **Check the fixture shape against the validator, not against your eye.** Under zod v4,
  `z.string().uuid()` enforces the full RFC 4122 pattern, so a constant like
  `11111111-1111-1111-1111-111111111111` fails with `Invalid UUID` on its variant nibble.
  Use the `00000000-0000-4000-8000-<counter>` family. The value looks like a uuid, tests that
  never cross the schema pass, and the failure surfaces far away as a validation error from a
  route rather than from the fixture.

## Scripted Edits

Three ways a script that reports success leaves the tree worse than it found it. All three
matter more on a checkout shared with other sessions, where uncommitted work has no git
safety net.

- **Compute the content before you open the file for writing.** `open(path, "w").write(f(s))`
  evaluates the open first, so a raising `f` leaves the file at zero bytes. That destroyed a
  peer session's uncommitted paragraph in a hot doc; only a pre-edit hook backup recovered it.
  Compute into a variable, assert on it, then write. Prefer the Edit tool for in-place edits.
  If a scripted edit fails, check the file is not empty before anything else.
- **Never reference an earlier variable in the same `local` statement that declares it.**
  `local n="$1" f="$MIG/${n}.up.sql"` is broken in bash 5.2: every word expands before any
  assignment lands, so `${n}` resolves from the enclosing scope (or empty without `set -u`).
  If an enclosing loop uses the same name, the call silently operates on the wrong value and
  returns success. Split the declarations. When a scripted chain "succeeds" with zero effect,
  echo the computed path before trusting the return code.
- **Never trust a clean `git apply --unidiff-zero`.** A `-U0` hunk carries no context, so git
  applies each hunk at the new-side line number in its header, and those numbers assume every
  earlier hunk was applied. Drop some hunks and every later number is short by their line
  count, so kept insertions land inside unrelated statements. It applies cleanly and reports
  success; one such commit failed typecheck with 14 syntax errors, one per kept hunk after the
  first dropped one. Reconstruct the file instead: read the base blob, parse the hunks, keep
  the ones you own, sort by OLD-side start, and splice in one pass tracking position in the
  base. A single kept hunk, or kept hunks all preceding the first dropped one, happens to
  work. That is luck, not a rule.
