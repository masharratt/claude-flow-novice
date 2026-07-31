#!/usr/bin/env bash
# cfn-track-skill-usage — PostToolUse hook: record every Skill-tool invocation
# to a SQLite DB so unused skills can be surfaced later for deprecation.
#
#   - Fires after each Skill tool call. Reads the event JSON from stdin
#     (tool_name, tool_input.skill, cwd, session_id) via python3 -c (stdin
#     carries the event; no heredoc, which would replace it).
#   - Filters: skip unless tool_name == "Skill" and skill is non-empty.
#   - Inserts one row per fire (raw skill, normalized skill_norm, project,
#     session_id, ISO-8601 ts) into $CFN_SKILL_USAGE_DB. WAL + busy_timeout
#     handle parallel sessions; no flock needed at skill-fire frequency.
#   - NEVER blocks the tool call: every error path exits 0. DB write failures
#     are appended to $CFN_SKILL_USAGE_ERRLOG for later triage.
#   - Env overrides:
#       CFN_SKILL_USAGE_DB      default $HOME/.claude/cfn-data/skill-usage.sqlite
#       CFN_SKILL_USAGE_ERRLOG  default $HOME/.claude/cfn-data/skill-usage-errors.log
set -euo pipefail

export CFN_SKILL_USAGE_DB="${CFN_SKILL_USAGE_DB:-$HOME/.claude/cfn-data/skill-usage.sqlite}"
export CFN_SKILL_USAGE_ERRLOG="${CFN_SKILL_USAGE_ERRLOG:-$HOME/.claude/cfn-data/skill-usage-errors.log}"

mkdir -p "$(dirname "$CFN_SKILL_USAGE_DB")" 2>/dev/null || true
mkdir -p "$(dirname "$CFN_SKILL_USAGE_ERRLOG")" 2>/dev/null || true

python3 -c 'import json, os, sqlite3, sys
from datetime import datetime, timezone
db = os.environ["CFN_SKILL_USAGE_DB"]; errlog = os.environ["CFN_SKILL_USAGE_ERRLOG"]
def emit_err(msg):
    try:
        with open(errlog, "a") as f: f.write(msg + "\n")
    except Exception: pass
try:
    data = json.loads(sys.stdin.read() or "{}")
except Exception:
    sys.exit(0)
if data.get("tool_name") != "Skill":
    sys.exit(0)
skill = (data.get("tool_input") or {}).get("skill") or ""
if not skill.strip():
    sys.exit(0)
cwd = data.get("cwd") or ""
project = os.path.basename(cwd.rstrip("/")) if cwd else ""
session = data.get("session_id") or ""
ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
norm = skill.split(":")[-1].strip().lower()
try:
    con = sqlite3.connect(db, timeout=3.0)
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.execute("""CREATE TABLE IF NOT EXISTS skill_usage(
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill TEXT NOT NULL,
        skill_norm TEXT NOT NULL,
        project TEXT,
        session_id TEXT,
        ts TEXT NOT NULL)""")
    con.execute("CREATE INDEX IF NOT EXISTS idx_skill_norm ON skill_usage(skill_norm)")
    con.execute("CREATE INDEX IF NOT EXISTS idx_ts ON skill_usage(ts)")
    con.execute("INSERT INTO skill_usage(skill,skill_norm,project,session_id,ts) VALUES(?,?,?,?,?)",
                (skill, norm, project, session, ts))
    con.commit(); con.close()
except Exception as e:
    emit_err(f"{ts} {type(e).__name__}: {e}")
sys.exit(0)' || true

exit 0
