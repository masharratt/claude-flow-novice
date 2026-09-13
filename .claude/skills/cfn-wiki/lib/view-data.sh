#!/usr/bin/env bash
# cfn-wiki data view: ERD + RLS from the live Postgres, for the portal payload.
#
# Fixed JSON contract (API — the portal payload assembles from these keys):
#   wiki_view_data <store> <repo>   # store = <repo>/.wiki/store.json
#     -> live:
#        {"erd": {"tables": [ {"name": "<public table>",
#                              "columns": [ {"name": ..., "type": <data_type>,
#                                            "nullable": <bool>} ],
#                              "fks": [ {"from": "<local column>",
#                                        "to": "<ref table>.<ref column>"} ]} ]},
#         "rls": [ {"table": ..., "policy": ..., "cmd": ...} ],
#         "empty": false}
#     -> degraded (exit 0 in every case):
#        {"erd": null, "rls": null, "empty": true, "reason": "<one of>"}
#        reasons: "no DATABASE_URL"          no usable line in <repo>/.env
#                 "excluded by config: include_data_in_md=false"
#                                             <repo>/.wiki/config.json flag
#                 "psql not available"        no psql binary on PATH
#                 "unparseable DATABASE_URL"  not a postgres:// URL
#                 "database unreachable"      psql failed (auth, refused, ...)
#
# Config: <repo>/.wiki/config.json key include_data_in_md (default true).
# false suppresses the whole view BEFORE any connection attempt, keeping
# ERD/RLS out of any committed artifact downstream.
#
# Credential safety (binding): DATABASE_URL is read from <repo>/.env with a
# bare `grep '^DATABASE_URL='` + cut (never sourced; multi-line tokens cannot
# leak), parsed in python into libpq env vars (PGHOST/PGPORT/PGUSER/
# PGPASSWORD/PGDATABASE) so it never appears in an argv, and NO connection
# string, credential or psql stderr ever reaches stdout. Output is schema
# shape only: information_schema.columns, FKs via table_constraints/
# key_column_usage/constraint_column_usage, pg_policies — public schema.
# Schema-qualified queries throughout; no search_path reliance.
#
# Exit 0 with the JSON object on stdout (live OR degraded); exit 1 (stderr
# note, no stdout) only on a missing/unreadable store.

wiki_view_data() {
    local store="${1:?wiki_view_data: store path required}"
    local repo="${2:?wiki_view_data: repo path required}"
    if [ ! -f "$store" ]; then
        echo "wiki_view_data: no store at $store (run wiki_extract first)" >&2
        return 1
    fi

    python3 - "$store" "$repo" <<'PY'
import json
import os
import shutil
import subprocess
import sys
import urllib.parse

# store load + single-object emit kept per-file across the five view modules:
# the plan's Phase 5 file contract has no shared view helper. (cfn: duplicated
# ~15-line loader, extract into lib/view-common.sh if a 6th view ever lands.)
try:
    with open(sys.argv[1], encoding="utf-8") as fh:
        json.load(fh)   # store content unused here; validity is the contract
except (OSError, ValueError) as exc:
    sys.exit("wiki_view_data: store unreadable: %s" % exc)
repo = sys.argv[2]


def emit(erd, rls, empty, reason=None):
    payload = {"erd": erd, "rls": rls, "empty": empty}
    if reason is not None:
        payload["reason"] = reason
    print(json.dumps(payload, ensure_ascii=False))
    sys.exit(0)


def degrade(reason):
    emit(None, None, True, reason)


# --- config gate: before any connection attempt ------------------------------
config_path = os.path.join(repo, ".wiki", "config.json")
include = True
if os.path.isfile(config_path):
    try:
        with open(config_path, encoding="utf-8") as fh:
            include = json.load(fh).get("include_data_in_md", True)
    except (OSError, ValueError) as exc:
        print("wiki_view_data: config unreadable (%s); default "
              "include_data_in_md=true" % exc.__class__.__name__, file=sys.stderr)
        include = True
if not include:
    degrade("excluded by config: include_data_in_md=false")

# --- DATABASE_URL from .env: grep + cut, never source ------------------------
env_path = os.path.join(repo, ".env")
url = ""
if os.path.isfile(env_path):
    try:
        with open(env_path, encoding="utf-8") as fh:
            for line in fh:
                if line.startswith("DATABASE_URL="):
                    url = line.split("=", 1)[1].strip().strip('"').strip("'")
                    break
    except OSError:
        pass
if not url:
    degrade("no DATABASE_URL")

if not shutil.which("psql"):
    degrade("psql not available")

# --- parse the URL into libpq env vars (never an argv) ------------------------
try:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme not in ("postgres", "postgresql"):
        raise ValueError("scheme %r" % parsed.scheme)
    query = dict(urllib.parse.parse_qsl(parsed.query))
    conn_env = {k: v for k, v in os.environ.items()
                if not k.startswith("PG")}
    conn_env["PGCONNECT_TIMEOUT"] = "5"
    if parsed.hostname:
        conn_env["PGHOST"] = parsed.hostname   # strips IPv6 brackets
        if parsed.port:
            conn_env["PGPORT"] = str(parsed.port)
    elif query.get("host"):
        conn_env["PGHOST"] = query["host"]     # unix-socket directory
    else:
        raise ValueError("no host")
    if parsed.username:
        conn_env["PGUSER"] = parsed.username
    if parsed.password:
        conn_env["PGPASSWORD"] = parsed.password
    if query.get("sslmode"):
        conn_env["PGSSLMODE"] = query["sslmode"]
    dbname = parsed.path.lstrip("/")
    if not dbname:
        raise ValueError("no database")
    conn_env["PGDATABASE"] = dbname
except ValueError as exc:
    print("wiki_view_data: DATABASE_URL rejected (%s)" % exc, file=sys.stderr)
    degrade("unparseable DATABASE_URL")

# --- introspect: schema shape only, schema-qualified -------------------------
SQL_COLUMNS = (
    "SELECT c.table_name, c.column_name, c.data_type, c.is_nullable "
    "FROM information_schema.columns c "
    "WHERE c.table_schema = 'public' "
    "ORDER BY c.table_name, c.ordinal_position")
SQL_FKS = (
    "SELECT tc.table_name, kcu.column_name, ccu.table_name, ccu.column_name "
    "FROM information_schema.table_constraints tc "
    "JOIN information_schema.key_column_usage kcu "
    "  ON kcu.constraint_name = tc.constraint_name "
    " AND kcu.table_schema = tc.table_schema "
    "JOIN information_schema.constraint_column_usage ccu "
    "  ON ccu.constraint_name = tc.constraint_name "
    " AND ccu.table_schema = tc.table_schema "
    "WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public' "
    "ORDER BY tc.table_name, kcu.column_name")
SQL_RLS = (
    "SELECT p.tablename, p.policyname, p.cmd "
    "FROM pg_policies p WHERE p.schemaname = 'public' "
    "ORDER BY p.tablename, p.policyname")


def query(sql):
    proc = subprocess.run(
        ["psql", "-X", "-q", "-t", "-A", "-F", "\t", "-c", sql],
        env=conn_env, capture_output=True, text=True)
    if proc.returncode != 0:
        # psql stderr may name hosts/users; it never reaches stdout.
        print("wiki_view_data: introspection query failed", file=sys.stderr)
        degrade("database unreachable")
    return [ln.split("\t") for ln in proc.stdout.splitlines() if ln.strip()]


tables = {}
for tname, cname, dtype, nullable in query(SQL_COLUMNS):
    tables.setdefault(tname, {"name": tname, "columns": [], "fks": []})
    tables[tname]["columns"].append(
        {"name": cname, "type": dtype, "nullable": nullable == "YES"})
for tname, col, ref_table, ref_col in query(SQL_FKS):
    if tname in tables:
        tables[tname]["fks"].append(
            {"from": col, "to": "%s.%s" % (ref_table, ref_col)})
rls = [{"table": t, "policy": p, "cmd": c}
       for t, p, c in query(SQL_RLS)]

emit({"tables": list(tables.values())}, rls, False)
PY
}
