#!/usr/bin/env bash
# Exercises validate-role-skills.sh against a known-good role doc, then feeds it
# known-bad mutations and requires a catch for each. A linter that cannot fail
# proves nothing, so every schema rule gets a negative control here.
#
# The fixture is modelled on a real role doc (NYSDRA role-manager): prose Allowed
# and Denied carrying dated decisions and rationale, plus the machine-driven
# Capabilities table. If the schema cannot express a doc that already exists,
# the schema is wrong.
set -uo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../validate-role-skills.sh
source "$HERE/../validate-role-skills.sh"

PASS=0
FAIL=0
ok()  { PASS=$((PASS + 1)); echo "  ok: $1"; }
bad() { FAIL=$((FAIL + 1)); echo "  FAIL: $1"; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

GOOD="$TMP/role-manager/SKILL.md"
mkdir -p "$(dirname "$GOOD")"
cat > "$GOOD" <<'FIXTURE'
---
name: role-manager
actor: manager
kind: human-role
version: 1.1.0
status: production
description: "Expected access, nav chrome, landing page, and capabilities for the manager role."
---

# Role: manager

Operator tier. Same surface as [[role-super-admin]] EXCEPT it is NOT exempt from
the E4 expense self-approval block, and is not `isOwner`.

## Access
- Login: `/login`
- Account: `$APP_TEST_MANAGER_EMAIL` / `$APP_TEST_MANAGER_PASSWORD`
- Target: `$APP_BASE_URL`

## Capabilities
| Capability | Entry point | Expected affordance | Observable outcome | Ref | Expect | Execute |
|---|---|---|---|---|---|---|
| Approve a staff expense | Expenses queue | "Approve" on a submitted expense | status submitted -> approved | E1 | reachable | observe |
| Approve own expense | Expenses queue | none offered | action rejected, expense stays unapproved | E4 | denied | seeded |
| Case identity is File # | Cases list | first column header reads "File #" | no NYSC-### rendered as a case identity | PR4 | reachable | observe |
| Reach the template builder | /admin/programs | none offered | redirected, requireOwner blocks | PR2 | denied | observe |

## Allowed
- **Edit a SUBMITTED report (PR3 / 0110):** operators may re-open and re-save an
  already-submitted report; CDRC users get a read-only gate. G5 decided staff is
  IN, so the TS predicate (`isAdmin`) and the DB gate are the same set. A narrower
  TS check would make the trigger the real, broader boundary.
- **Case identity = OCA "File #" (2026-07-16, PR4):** one shared helper
  `lib/format/caseIdentifier(row)` returns `cases.case_number` under a unified
  "File #" label for BOTH audiences. Supersedes the 2026-07-10 audience-split rule.
- All `/admin/*` routes; full finance (create, submit, approve, reject).

## Denied
- **E4:** a manager may NOT approve an expense it submitted itself (only
  super_admin may self-approve).
- **Program Template Builder:** super_admin ONLY. Direct nav to `/admin/programs*`
  is blocked by `requireOwner`.

## Landing + shell
- **Landing:** `/admin/dashboard`.
- **Nav (exact order):** Action Queue, Dashboard, Cases, Accounts, Expenses, Staff.

## Seed recipes

### Approve own expense (E4)

- **Marker:** expense description contains `integration-test`
- **Create:** log in as this manager, submit an expense through the UI carrying the marker
- **Cleanup:** as the same manager, withdraw that expense via the UI

## Known-state exceptions
- 18 of 28 prod cases have no OCA number, so a queue of stalled, un-backfilled
  cases may render ENTIRELY as `--`. That is the decision working as designed,
  NOT a defect. The remedy is an OCA backfill, not a code change.

## Related role skills
[[role-super-admin]] [[role-staff]] [[role-cdrc]]
FIXTURE

echo "== known-good role doc validates clean"
violations="$(lint_role "$GOOD")"
if [ -z "$violations" ]; then
  ok "role-manager fixture (real-world shape: prose record + capability table)"
else
  bad "known-good fixture rejected: $violations"
fi

# mutate <sed-expr> <expected-substring> <label>
# Copies the good fixture, applies the mutation, requires the linter to catch it.
mutate() {
  local expr="$1" want="$2" label="$3"
  local d="$TMP/mut/role-manager"
  rm -rf "$TMP/mut"; mkdir -p "$d"
  sed "$expr" "$GOOD" > "$d/SKILL.md"
  # Capture before matching. Piping into `grep -q` lets grep exit on the first hit,
  # SIGPIPEs lint_role mid-write, and pipefail then reports 141 for a rule that did fire.
  local out
  out="$(lint_role "$d/SKILL.md")"
  if grep -qF "$want" <<< "$out"; then
    ok "$label"
  else
    bad "$label (linter did not catch it; rule is not enforcing)"
  fi
}

echo "== linter rejects schema violations (negative controls)"

# The join key. Without it the role is silently never checked.
mutate '/^actor:/d' 'missing "actor:"' "caught missing actor key"
mutate 's/^kind: human-role/kind: person/' 'invalid kind "person"' "caught invalid kind"
mutate 's/^name: role-manager/name: role-boss/' 'does not match directory' "caught name/dir mismatch"

# Required sections.
mutate '/^## Known-state exceptions$/d' 'missing required section "## Known-state exceptions"' \
  "caught missing Known-state exceptions"
mutate '/^## Denied$/d' 'missing required section "## Denied"' "caught missing Denied"
mutate '/^## Landing + shell$/d' 'missing required section "## Landing + shell"' \
  "caught missing Landing + shell"
mutate '/^## Access$/d' 'missing required section "## Access"' "caught missing Access"

# The duplicated procedure this skill exists to delete.
mutate 's|^## Related role skills$|## How to verify (Playwright, prod)|' \
  'is the global protocol'"'"'s job' "caught leftover How to verify section"

# Column drift breaks the walk.
mutate 's/| Capability | Entry point | Expected affordance |/| Capability | Where | Expected affordance |/' \
  '## Capabilities: columns are' "caught capability column drift"

# An empty Ref turns every unbuilt feature into a reported regression.
mutate 's/| E1 | reachable | observe |/|  | reachable | observe |/' 'Ref is empty' \
  "caught capability with no Ref"
mutate 's/| E1 | reachable | observe |/| E1 and PR9 | reachable | observe |/' 'contains whitespace' \
  "caught multi-token Ref"

# Expect drives whether absence is the finding or the pass.
mutate 's/| E1 | reachable | observe |/| E1 | maybe | observe |/' 'want reachable|denied' \
  "caught invalid Expect mode"
mutate 's/| E1 | reachable | observe |/| E1 | reachable | sometimes |/' 'want observe|seeded' \
  "caught invalid Execute mode"

# Seeded execution without a declared recipe means an unbounded write.
mutate '/^## Seed recipes$/,/^## Known-state exceptions$/{/^## Known-state exceptions$/!d}' \
  'marked seeded but no "## Seed recipes" section' "caught seeded capability with no recipe"
mutate 's/^- \*\*Marker:\*\*.*/- Marker: none/' 'missing required field "Marker"' \
  "caught seed recipe with no marker"

# Unscoped cleanup wipes real data on a shared database.
mutate 's|^- \*\*Cleanup:\*\*.*|- **Cleanup:** `DELETE FROM expenses;`|' \
  'DELETE without a WHERE clause' "caught unscoped DELETE in cleanup"
mutate 's|^- \*\*Cleanup:\*\*.*|- **Cleanup:** `TRUNCATE expenses CASCADE;`|' \
  'TRUNCATE is never permitted' "caught TRUNCATE in cleanup"
mutate 's|^- \*\*Cleanup:\*\*.*|- **Cleanup:** set `session_replication_role = replica` then delete WHERE marker|' \
  'disabling FK checks' "caught FK-check disable in cleanup"

# Role docs are committed.
mutate 's|^- Account:.*|- Account: manager@corp.com / password: hunter2literal|' \
  'possible literal credential' "caught literal credential in Access"

# Freshness (protocol Step 3) needs a date to compare against.
mutate 's/[0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}//g' 'no ISO date' "caught doc with no dated decision"

echo
echo "passed: $PASS  failed: $FAIL"
[ "$FAIL" -eq 0 ]
