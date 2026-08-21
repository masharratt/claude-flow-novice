#!/usr/bin/env bash

set -euo pipefail

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
DOCS_ALPHA_DIR="${PROJECT_ROOT}/docs/alpha"
LOG_FILE="${SCRIPT_DIR}/logs/execution.log"
FIX_LIST="${DOCS_ALPHA_DIR}/fix-list.md"
DEFAULT_AGENTS=3
LAST_MANIFEST_PATH=""  # set by mode_manifest, read by mode_fix

# Ensure directories exist
mkdir -p "$(dirname "$LOG_FILE")"
mkdir -p "$DOCS_ALPHA_DIR"

# Logging function
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR: $1"
    exit 1
}

# Show help
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

CFN Alpha Launch - Readiness analysis and fix execution.

OPTIONS:
    -m, --mode MODE         Mode: analyze, fix, or manifest (required)
    -a, --agents NUM        Unused by fix/manifest (default: 3). fix hands off to
                            /cfn-vote-implement, which always runs a fixed 3-agent vote.
    -h, --help              Show this help message

MODES:
    analyze                 Run readiness analysis (spawns 8 parallel agents)
    fix                     Build the fix manifest, then print the /cfn-vote-implement
                            hand-off (a shell script cannot spawn Claude agents itself)
    manifest                Convert docs/alpha/fix-list.md to cfn-vote-implement JSON manifest

EXAMPLES:
    $0 -m analyze
    $0 -m fix
    $0 -m manifest

ANALYSIS OUTPUTS:
    docs/alpha/readiness-test.md        - Test coverage, type safety, build
    docs/alpha/readiness-frontend.md    - UI functionality, UX readiness
    docs/alpha/readiness-backend.md     - API functionality, data integrity
    docs/alpha/readiness-security.md    - Auth, RLS, secrets, CORS
    docs/alpha/readiness-architect.md   - System design, scalability, tech debt
    docs/alpha/readiness-supabase.md    - Database, storage, real-time, edge functions
    docs/alpha/readiness-contract.md    - API contracts, GraphQL schema, types
    docs/alpha/readiness-consistency.md - Naming, conventions, code patterns
    docs/alpha/fix-list.md              - Prioritized list of required fixes

FIX EXECUTION:
    Spawns N parallel agents (default: 3)
    Each agent gets 1 small task
    Agents run in background
    Maintain pipeline by spawning replacements as agents finish
    Stop after spawn, wait for exit notifications

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -m|--mode)
                MODE="$2"
                shift 2
                ;;
            -a|--agents)
                AGENT_COUNT="$2"
                shift 2
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                error_exit "Unknown option: $1"
                ;;
        esac
    done
}

# Validate arguments
validate_args() {
    if [[ -z "${MODE:-}" ]]; then
        error_exit "Mode is required. Use -m or --mode option."
    fi

    case "$MODE" in
        analyze|fix|manifest)
            ;;
        *)
            error_exit "Invalid mode: $MODE. Must be analyze, fix, or manifest."
            ;;
    esac

    AGENT_COUNT="${AGENT_COUNT:-$DEFAULT_AGENTS}"
    if ! [[ "$AGENT_COUNT" =~ ^[0-9]+$ ]] || [[ "$AGENT_COUNT" -lt 1 ]]; then
        error_exit "Agent count must be a positive integer."
    fi
}

# Archive previous fix-list if exists
archive_previous_fixlist() {
    if [[ -f "$FIX_LIST" ]]; then
        local timestamp=$(date +%Y%m%d-%H%M%S)
        local archive="${FIX_LIST%.md}-${timestamp}.md"
        log "Archiving previous fix-list to: $(basename "$archive")"
        mv "$FIX_LIST" "$archive"
    fi
}

# Track previous scores for regression detection
track_previous_scores() {
    local scores_file="${DOCS_ALPHA_DIR}/.readiness-scores-history.json"
    if [[ -f "$FIX_LIST" ]]; then
        # Extract overall readiness from previous fix-list
        local previous_score=$(grep -oP 'Overall Readiness.*\K\d+' "$FIX_LIST" 2>/dev/null || echo "0")
        local previous_date=$(grep -oP 'Generated.*\K\d{4}-\d{2}-\d{2}' "$FIX_LIST" 2>/dev/null || echo "unknown")
        echo "{\"date\":\"$previous_date\",\"score\":$previous_score}" > "${scores_file}.tmp"
    fi
}

# Analyze mode - prints instructions for main chat
mode_analyze() {
    log "Mode: analyze"
    log "Agent count: 8 (fixed for analysis)"

    # Archive previous fix-list and track scores for regression detection
    archive_previous_fixlist
    track_previous_scores

    cat << 'ANALYZE_INSTRUCTIONS'

# CFN Alpha Launch - Readiness Analysis

## Instructions for Main Chat

You are in ANALYZE mode. Spawn 8 agents in parallel to analyze readiness gaps.

### Spawn These Agents Simultaneously

```
Task(subagent_type="tester", prompt="Analyze test readiness for alpha launch. Check:
1. Test coverage - are critical paths covered?
2. Failing tests - any broken tests blocking launch?
3. Type safety - TypeScript errors, missing types
4. Build - does production build pass?
5. CI/CD - are pipelines passing?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 20% for each CRITICAL blocker (broken test suite, build failure)
- Subtract 10% for each HIGH priority issue (failing tests, type errors)
- Subtract 5% for each MEDIUM priority issue (coverage gaps, missing tests)
- Final score = 100% - (critical*20 + high*10 + medium*5)

Write results to docs/alpha/readiness-test.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 90%+)
- Show your calculation: '100% - (2 critical × 20) - (3 high × 10) = 30%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="react-frontend-engineer", prompt="Analyze frontend readiness for alpha launch. Check:
1. UI functionality - are all user-facing features working?
2. UX readiness - critical user flows complete?
3. Performance - frontend performance acceptable?
4. Responsive design - mobile/tablet working?
5. Broken links/views - any dead ends?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 15% for each CRITICAL blocker (build fail, core feature broken)
- Subtract 8% for each HIGH priority issue (UX problems, mobile broken)
- Subtract 4% for each MEDIUM priority issue (minor bugs, styling issues)
- Final score = 100% - (critical*15 + high*8 + medium*4)

Write results to docs/alpha/readiness-frontend.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 85%+)
- Show your calculation: '100% - (1 critical × 15) - (2 high × 8) = 69%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="backend-developer", prompt="Analyze backend readiness for alpha launch. Check:
1. API functionality - all endpoints working?
2. Data integrity - database operations sound?
3. Error handling - proper error responses?
4. Performance - API response times acceptable?
5. Business logic - critical flows implemented?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 20% for each CRITICAL blocker (DB down, API completely broken)
- Subtract 10% for each HIGH priority issue (endpoints failing, data integrity issues)
- Subtract 5% for each MEDIUM priority issue (error handling gaps, performance issues)
- Final score = 100% - (critical*20 + high*10 + medium*5)

Write results to docs/alpha/readiness-backend.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 90%+)
- Show your calculation: '100% - (2 critical × 20) - (1 high × 10) = 50%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="security-specialist", prompt="Analyze security readiness for alpha launch. Check:
1. Authentication - is auth implemented and tested?
2. RLS policies - are row-level security policies applied?
3. Secrets - are secrets properly managed (no hardcoding)?
4. Security scan - does security scan pass?
5. CORS - are CORS policies correctly configured?
6. Input validation - are user inputs validated?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 25% for each CRITICAL blocker (secrets exposed, no auth, RLS disabled)
- Subtract 10% for each HIGH priority issue (CORS misconfig, missing input validation)
- Subtract 5% for each MEDIUM priority issue (minor security gaps, scan warnings)
- Final score = 100% - (critical*25 + high*10 + medium*5)

Write results to docs/alpha/readiness-security.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 95%+)
- Show your calculation: '100% - (1 critical × 25) - (2 high × 10) = 55%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="system-architect", prompt="Analyze architectural readiness for alpha launch. Check:
1. Scalability - can system handle alpha load?
2. Technical debt - any critical debt items?
3. Data model - sound for use cases?
4. Integration points - external dependencies stable?
5. Monitoring coverage - observability gaps?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 15% for each CRITICAL blocker (unscalable design, broken data model)
- Subtract 8% for each HIGH priority issue (technical debt, missing indexes)
- Subtract 4% for each MEDIUM priority issue (monitoring gaps, minor debt)
- Final score = 100% - (critical*15 + high*8 + medium*4)

Write results to docs/alpha/readiness-architect.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 85%+)
- Show your calculation: '100% - (1 critical × 15) - (3 high × 8) = 61%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="supabase-specialist", prompt="Analyze Supabase readiness for alpha launch. Check:
1. Database - schema applied, migrations working, indexes present?
2. Storage - buckets created, policies configured, CDN enabled?
3. Auth - providers configured, email templates working?
4. Realtime - channels configured, permissions set?
5. Edge functions - deployed, environment variables set?
6. Connection pooling - pooler configured for production load?
7. Backups - automated backups enabled?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 15% for each CRITICAL blocker (migrations not applied, RLS disabled)
- Subtract 8% for each HIGH priority issue (storage/realtime not deployed, missing indexes)
- Subtract 4% for each MEDIUM priority issue (email templates, connection pooling)
- Final score = 100% - (critical*15 + high*8 + medium*4)

Write results to docs/alpha/readiness-supabase.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 90%+)
- Show your calculation: '100% - (1 critical × 15) - (2 high × 8) = 69%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="code-standards-reviewer", prompt="Analyze contract readiness for alpha launch. Check:
1. API contracts - are all endpoints properly typed/documented?
2. GraphQL schema - types match resolvers, no orphaned types?
3. TypeScript exports - public API surface consistent?
4. Input validation - Zod schemas match API contracts?
5. Response types - return types match what frontend expects?
6. OpenAPI spec - is it generated and up to date?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 15% for each CRITICAL blocker (schema mismatches, broken types)
- Subtract 8% for each HIGH priority issue (missing contracts, validation gaps)
- Subtract 4% for each MEDIUM priority issue (incomplete docs, minor type issues)
- Final score = 100% - (critical*15 + high*8 + medium*4)

Write results to docs/alpha/readiness-contract.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 90%+)
- Show your calculation: '100% - (0 critical × 15) - (2 high × 8) = 84%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")

Task(subagent_type="code-standards-reviewer", prompt="Analyze consistency readiness for alpha launch. Check:
1. Naming conventions - are files/functions/variables named consistently?
2. Code patterns - similar problems solved similarly across codebase?
3. Import structure - organized and consistent?
4. Error handling - consistent error patterns?
5. Type definitions - organized and deduplicated?
6. File structure - follows project conventions?

SCORING FORMULA (Apply strictly):
- Start at 100%
- Subtract 10% for each CRITICAL blocker (wildly inconsistent patterns)
- Subtract 5% for each HIGH priority issue (naming inconsistencies, mixed patterns)
- Subtract 2% for each MEDIUM priority issue (minor inconsistencies, style issues)
- Final score = 100% - (critical*10 + high*5 + medium*2)

Write results to docs/alpha/readiness-consistency.md with:
- Critical gaps (blockers)
- High priority (before launch)
- Medium priority (post-launch)
- Readiness score using formula above (target: 85%+)
- Show your calculation: '100% - (0 critical × 10) - (4 high × 5) = 80%'

COLD START: Ignore previous alpha reports. Evaluate current state only.")
```

### After Analysis Completes

1. Read all eight readiness reports
2. Calculate OVERALL READINESS SCORE:
   - Extract each agent's score from their report
   - Overall = average of all 8 agent scores
   - Formula: (test + frontend + backend + security + architect + supabase + contract + consistency) / 8
   - Example: (35 + 68 + 45 + 70 + 72 + 68 + 90 + 80) / 8 = 66%
3. Check for REGRESSIONS:
   - Read docs/alpha/.readiness-scores-history.json.tmp for previous score
   - If new score < previous score - 10%, flag as REGRESSION
   - Add regression warning to fix-list.md header
4. Create docs/alpha/fix-list.md with:
   - Overall readiness score (average of 8 agents)
   - Regression assessment (compare with previous if available)
   - Prioritized fixes:
   ```markdown
   # Alpha Launch Fix List

   **Generated**: [DATE]
   **Overall Readiness**: [SCORE]% (Target: 85%+)
   **Regression**: [None/DETECTED] (Previous: [PREV_SCORE]% on [PREV_DATE])

   ## Critical (Blockers)
   1. [gap description] - Agent: [type] - File: [location]
   2. ...

   ## High Priority (Before Launch)
   3. [gap description] - Agent: [type] - File: [location]
   4. ...

   ## Medium Priority (Post-Launch)
   5. [gap description] - Agent: [type] - File: [location]
   6. ...
   ```
5. Emit cfn-vote-implement manifest from fix-list.md:
   ```bash
   .claude/skills/cfn-alpha-launch/execute.sh --mode manifest
   ```
   Writes <project-root>/.cfn-cache/manifests/cfn-review-alpha-<ts>.json. Ingestible by /cfn-vote-implement.

6. Run `/cfn-alpha-launch:fix` to execute fixes, OR
   Run `/cfn-vote-implement latest` to route findings through 3-agent voting first.

ANALYZE_INSTRUCTIONS

    log "Analyze mode instructions printed above"
}

# Manifest mode - convert fix-list.md to cfn-vote-implement JSON manifest.
# Also the single owner of manifest-path resolution: mode_fix calls this function
# instead of re-checking fix-list existence, re-checking converter existence, and
# invoking the converter a second time (that duplication was the bug being fixed here).
mode_manifest() {
    log "Mode: manifest"

    if [[ ! -f "$FIX_LIST" ]]; then
        error_exit "Fix list not found: $FIX_LIST

Run analyze mode first:
  cfn-alpha-launch --mode analyze"
    fi

    local converter="${SCRIPT_DIR}/lib/fixlist-to-manifest.sh"
    if [[ ! -x "$converter" ]]; then
        error_exit "Converter not found or not executable: $converter"
    fi

    log "Converting $FIX_LIST to manifest..."
    local converter_output
    converter_output=$("$converter" "$FIX_LIST" --source cfn-alpha-launch)
    echo "$converter_output"

    # fixlist-to-manifest.sh prints a human-readable line then the bare manifest path as
    # its last stdout line (echoed above, then re-extracted here into a global so
    # mode_fix can reuse it without invoking the converter a second time).
    LAST_MANIFEST_PATH=$(echo "$converter_output" | tail -n1)

    if [[ -z "$LAST_MANIFEST_PATH" || ! -f "$LAST_MANIFEST_PATH" ]]; then
        error_exit "Converter did not produce a manifest file (got: '$LAST_MANIFEST_PATH')"
    fi
}

# Fix mode - builds the manifest via mode_manifest, then hands off to /cfn-vote-implement.
# cfn-parallel-execute was never built (documented, never implemented on disk or in git
# history) and could not have worked as a shell delegation anyway: a shell script cannot
# spawn Claude agents. This mode's job ends at "manifest ready". /cfn-vote-implement is
# the documented consumer of an alpha-launch manifest (see mode_analyze's own step 6,
# and cfn-vote-implement/SKILL.md), and it discovers the manifest itself via `latest`,
# so no path argument or agent count is passed.
mode_fix() {
    log "Mode: fix"

    mode_manifest
    local manifest_path="$LAST_MANIFEST_PATH"

    cat << EOF

Manifest ready: $manifest_path

A shell script cannot spawn Claude agents, so cfn-alpha-launch stops here (the --agents
flag is not used by this mode; /cfn-vote-implement always runs a fixed 3-agent vote).
Run this to route the fixes through voting:

  /cfn-vote-implement latest

EOF

    log "Manifest ready, execution not performed: $manifest_path"
    # Exit 3: distinct from 0 (fully done) and 1 (error_exit failure). Signals
    # "manifest ready, operator action required" so callers don't mistake this for success.
    exit 3
}

# Main execution function
main() {
    log "Starting cfn-alpha-launch..."
    log "Project root: $PROJECT_ROOT"
    log "Mode: $MODE"

    case "$MODE" in
        analyze)
            mode_analyze
            ;;
        fix)
            mode_fix
            ;;
        manifest)
            mode_manifest
            ;;
    esac

    log "Instructions printed. Follow the prompts above."
}

# Parse and validate arguments
parse_args "$@"
validate_args

# Run main function
main
