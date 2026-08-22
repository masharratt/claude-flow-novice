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
