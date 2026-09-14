# Test Output Capture Flags (per language)

Full-error command table for the Test Output Capture rule in `~/.claude/CLAUDE.md`. Load when running any test suite.

All commands assume the capture pattern (project dir name + timestamp = no collision across concurrent project runs):

```bash
OUT=/tmp/test-${PWD##*/}-$(date +%s).txt
<test-cmd> 2>&1 | tee "$OUT"
```

## Per-language commands

| Lang | Command |
|------|---------|
| vitest | `vitest run --reporter=verbose 2>&1 \| tee "$OUT"` |
| jest | `jest --verbose --no-coverage 2>&1 \| tee "$OUT"` |
| pytest | `pytest -v --tb=short 2>&1 \| tee "$OUT"` |
| Rust | `cargo test 2>&1 \| tee "$OUT"` (`-- --nocapture` for stdout) |
| Go | `go test ./... -v 2>&1 \| tee "$OUT"` |

## Compile-error triage (before blaming tests)

Compile fail = zero tests run. Dump all compile errors one pass first:

- Rust: `cargo check --message-format=short`
- TS: `tsc --noEmit`
- Go: `go build ./...`

## Two zero-assertion outcomes that read as passes

A capture can be green because tests passed, or green because they never ran. These two
account for most false greens. Neither shows up in a totals line.

### A task runner cancels the rest of the run, and cancelled looks identical to passed

Turbo (and any runner that cancels queued tasks on first failure) prints no summary block
for a cancelled package, and does not list it on the `Failed:` line. So grepping the capture
for `Failed:` or for a red count answers "what failed" and never "what ran". A package that
never started is indistinguishable from one that passed.

**The tell is arithmetic: successful plus failed must equal total.** If it does not, the
missing tasks never started and the run is partial regardless of the totals. Measured
repeatedly in a pnpm + turbo monorepo: a default `typecheck` reported 4 successful of 11
total with one failing package, while the same tree with `--continue` reported 7 successful
and four failing packages. Three of the four were invisible in the default run. The same
trap hit `lint` inside a pre-push hook (one failing package reported, five actually failing
across 38 files) and `test` under a `--filter` invocation (five filtered packages all
cancelled, none run).

How to run and how to read it:

- Always pass `--continue` before drawing any conclusion about repo-wide health.
- Count per-package summary blocks and compare against the number of packages you expected.
  A short count means partial.
- Beware that a root script's own `--concurrency=1 --continue` is dropped when you add
  `--filter`, which silently reintroduces the trap on an otherwise safe command.
- When one package is known-red for environmental reasons, skip the task runner and invoke
  the test binary on paths directly from the repo root.

### A test dies in import analysis, so it makes zero assertions

A transform or config error ("Failed to parse source for import analysis because the content
contains invalid JS syntax", a missing alias, a wrong `include` glob) kills the file before
the first assertion. It is the same class of outcome as a suite that self-skips: it hides
whatever the test would have said.

The trap is the reasoning, not the error. "That file is byte-identical to HEAD, so this is
pre-existing toolchain noise, unrelated to my change" proves only that your change did not
break the file. It says nothing about whether the failure is noise. Measured 2026-09-06: a
parse error was written off as unrelated across two consecutive review passes; the real
cause was one vitest project block missing a jsx runtime setting after a composition root
started importing a `.tsx`, and once fixed the test ran and was genuinely red for the reason
the pass was meant to catch.

Fix the transform first (usually the project block in the vitest config: jsx runtime, alias,
include), then classify the test. Never carry a "pre-existing parse error" across a gate.
