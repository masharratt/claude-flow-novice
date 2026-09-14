#!/usr/bin/env python3
"""cfn-wiki Phase 2: durable work queue, leases, budgets and promotion.

Implements the frozen contracts in
planning/cfn-wiki/CONTRACTS_work-knowledge-v2.md sections 2 through 4:
the .wiki/work/jobs.sqlite store (never cleared by sync, rebuild or
migration), the job state machine with BEGIN IMMEDIATE lease safety, the
work CLI (plan/next/evidence/checkpoint/submit/review/promote/status/
unblock/release/requeue/export/import), budget inheritance and
journal-first promotion with backups and crash recovery.

Host agent invocation stays outside these commands: no model calls, no
claude -p. Stdlib only. No em dashes in code or comments by repo rule.
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import sqlite3
import subprocess
import sys
import time

import discovery
import evidence
import knowledge

WORK_SCHEMA = """
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY, type TEXT, question TEXT, scope TEXT,
  priority INTEGER, dependencies TEXT, input_revision TEXT,
  budget_json TEXT, evidence_ids TEXT, candidate_path TEXT,
  status TEXT, lease_owner TEXT, lease_expires_epoch INTEGER,
  attempt_count INTEGER DEFAULT 0, blocked_reason TEXT, blocked_on TEXT,
  created_epoch INTEGER, updated_epoch INTEGER);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY, job_id TEXT, lease_owner TEXT,
  started_epoch INTEGER, ended_epoch INTEGER, outcome TEXT,
  evidence_ids TEXT, bytes_delivered INTEGER, candidate_path TEXT,
  checkpoint_path TEXT);
CREATE TABLE IF NOT EXISTS reviews (
  id INTEGER PRIMARY KEY, job_id TEXT, attempt_id INTEGER,
  decision TEXT, findings TEXT, evidence_ids TEXT,
  reviewer_epoch INTEGER);
CREATE TABLE IF NOT EXISTS promotions (
  id INTEGER PRIMARY KEY, job_id TEXT, attempt_id INTEGER,
  state TEXT, plan_json TEXT, backup_paths TEXT, epoch INTEGER);
CREATE TABLE IF NOT EXISTS counters (
  name TEXT PRIMARY KEY, value INTEGER);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_type ON jobs(type);
CREATE INDEX IF NOT EXISTS idx_attempts_job ON attempts(job_id);
CREATE INDEX IF NOT EXISTS idx_reviews_job ON reviews(job_id);
CREATE INDEX IF NOT EXISTS idx_promotions_job ON promotions(job_id);
"""

JOB_TYPES = ('plan', 'author', 'review', 'synthesize', 'refresh')
JOB_STATUSES = ('queued', 'leased', 'in_progress', 'checkpointed',
                'awaiting_review', 'accepted', 'blocked', 'stale',
                'rejected')
REVIEW_DECISIONS = ('accepted', 'revision_requested', 'rejected')

WORK_DEFAULTS = {
    'work_lease_seconds': 900,
    'work_brief_max_bytes': 8192,
    'work_checkpoint_max_bytes': 8192,
    'work_attempt_max_retries': 2,
    'work_run_allowance_bytes': 262144,
}

EDIT_HOOK_AGENT = 'work2'
STATUS_BLOCKED_CAP = 20


class WorkError(Exception):
    """Bounded error carrying an exit code for the CLI envelope."""

    def __init__(self, message, exit_code=1):
        super().__init__(message)
        self.exit_code = exit_code


# ---------------------------------------------------------------------------
# Store


def jobs_db_path(repo):
    return os.path.join(repo, '.wiki', 'work', 'jobs.sqlite')


def open_jobs(repo, create=False):
    path = jobs_db_path(repo)
    if not create and not os.path.exists(path):
        raise WorkError('no work queue at .wiki/work/jobs.sqlite; run '
                        "'wiki work plan' first")
    if create:
        os.makedirs(os.path.dirname(path), exist_ok=True)
    con = sqlite3.connect(path, timeout=30.0, isolation_level=None)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA busy_timeout=30000')
    if create:
        con.execute('PRAGMA journal_mode=WAL')
        con.executescript(WORK_SCHEMA)
    return con


def now_epoch():
    return int(time.time())


def begin_immediate(con):
    con.execute('BEGIN IMMEDIATE')


def rollback(con):
    try:
        con.execute('ROLLBACK')
    except sqlite3.OperationalError:
        pass


def fetch_job(con, job_id):
    row = con.execute('SELECT * FROM jobs WHERE id=?', (job_id,)).fetchone()
    if row is None:
        raise WorkError('unknown job: %s' % job_id, exit_code=2)
    return row


def latest_attempt(con, job_id, open_only=False):
    sql = 'SELECT * FROM attempts WHERE job_id=?'
    if open_only:
        sql += ' AND ended_epoch IS NULL'
    return con.execute(sql + ' ORDER BY id DESC LIMIT 1',
                       (job_id,)).fetchone()


def touch(con, job_id, **fields):
    assignments = ', '.join('%s=?' % key for key in fields)
    values = list(fields.values()) + [now_epoch(), job_id]
    con.execute('UPDATE jobs SET %s, updated_epoch=? WHERE id=?' % assignments,
                values)


def load_work_config(repo):
    config = dict(evidence.load_config(repo))
    config.update(WORK_DEFAULTS)
    path = os.path.join(repo, '.wiki', 'config.json')
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as handle:
                data = json.load(handle)
        except (OSError, ValueError):
            data = None
        if isinstance(data, dict):
            for key in WORK_DEFAULTS:
                value = data.get(key)
                if isinstance(value, int) and value > 0:
                    config[key] = value
    return config


def default_budget(config):
    return {
        'brief_max_bytes': config['work_brief_max_bytes'],
        'checkpoint_max_bytes': config['work_checkpoint_max_bytes'],
        'attempt_max_bytes': config['evidence_attempt_max_bytes'],
        'run_allowance_bytes': config['work_run_allowance_bytes'],
        'retries': config['work_attempt_max_retries'],
        'used_bytes': 0,
        'pinned': False,
    }


def job_budget(job):
    try:
        budget = json.loads(job['budget_json'] or '{}')
    except ValueError:
        budget = {}
    return budget if isinstance(budget, dict) else {}


def current_revision(repo):
    scope = discovery.ScopePolicy(discovery.load_scope(repo))
    return discovery.compute_revision(repo, scope)


def safe_revision(repo):
    try:
        return current_revision(repo)
    except (discovery.DiscoveryError, OSError):
        return None


def attempt_identity(job_id, attempt_id):
    return 'job:%s#%d' % (job_id, attempt_id)


def attempts_dir(repo, attempt_id):
    path = os.path.join(repo, '.wiki', 'work', 'attempts', str(attempt_id))
    os.makedirs(path, exist_ok=True)
    return path


def emit(payload):
    print(json.dumps(payload, ensure_ascii=True))


def fail(message, revision, exit_code=1):
    emit({'error': message, 'revision': revision})
    raise SystemExit(exit_code)


# ---------------------------------------------------------------------------
# Maintenance scans. Each caller wraps these inside its own
# BEGIN IMMEDIATE transaction.


def recover_expired_leases(con, now):
    rows = con.execute(
        "SELECT id, lease_owner FROM jobs WHERE status IN ('leased', "
        "'in_progress') AND (lease_expires_epoch IS NULL OR "
        'lease_expires_epoch < ?)', (now,)).fetchall()
    recovered = []
    for row in rows:
        con.execute(
            "UPDATE jobs SET status='queued', lease_owner=NULL, "
            'lease_expires_epoch=NULL, updated_epoch=? WHERE id=?',
            (now, row['id']))
        attempt = latest_attempt(con, row['id'], open_only=True)
        if attempt is not None:
            con.execute(
                'UPDATE attempts SET ended_epoch=?, outcome=? WHERE id=?',
                (now, 'lease_expired', attempt['id']))
        recovered.append(row['id'])
    return recovered


def auto_unblock(con, now):
    """Blocked jobs whose blocked_on names an accepted job return to
    queued. prerequisite:* blocks need an explicit operator unblock."""
    rows = con.execute(
        "SELECT id, blocked_on FROM jobs WHERE status='blocked' AND "
        "blocked_on LIKE 'job:%'").fetchall()
    unblocked = []
    for row in rows:
        target = row['blocked_on'][len('job:'):]
        state = con.execute('SELECT status FROM jobs WHERE id=?',
                            (target,)).fetchone()
        if state is not None and state['status'] == 'accepted':
            touch(con, row['id'], status='queued', blocked_reason=None,
                  blocked_on=None)
            unblocked.append(row['id'])
    return unblocked


def stale_check(con, repo, now):
    """Accepted jobs whose input revision moved go stale and requeue at the
    current revision; accepted dependents cascade."""
    try:
        revision = current_revision(repo)
    except (discovery.DiscoveryError, OSError) as exc:
        raise WorkError('cannot compute revision: %s' % exc)
    rows = con.execute("SELECT id, input_revision FROM jobs WHERE "
                       "status='accepted'").fetchall()
    requeued = []
    pending = [row['id'] for row in rows
               if row['input_revision'] != revision]
    seen = set()
    while pending:
        job_id = pending.pop(0)
        if job_id in seen:
            continue
        seen.add(job_id)
        touch(con, job_id, status='queued', input_revision=revision)
        requeued.append(job_id)
        dependents = con.execute(
            'SELECT id, dependencies FROM jobs WHERE status=?',
            ('accepted',)).fetchall()
        for dep in dependents:
            try:
                deps = json.loads(dep['dependencies'] or '[]')
            except ValueError:
                deps = []
            if job_id in deps:
                pending.append(dep['id'])
    return requeued


def maintenance(con, repo):
    now = now_epoch()
    recovered = recover_expired_leases(con, now)
    unblocked = auto_unblock(con, now)
    requeued = stale_check(con, repo, now)
    return recovered, unblocked, requeued


# ---------------------------------------------------------------------------
# work plan


def slugify(text, limit=32):
    slug = re.sub(r'[^a-z0-9]+', '-', str(text).lower()).strip('-')
    return slug[:limit].rstrip('-') or 'job'


def next_job_id(con, job_type, slug):
    key = 'job:%s-%s' % (job_type, slug)
    con.execute('INSERT INTO counters (name, value) VALUES (?, 0) '
                'ON CONFLICT(name) DO NOTHING', (key,))
    con.execute('UPDATE counters SET value = value + 1 WHERE name=?', (key,))
    value = con.execute('SELECT value FROM counters WHERE name=?',
                        (key,)).fetchone()[0]
    return '%s-%s-%d' % (job_type, slug, value)


SCOPE_PATH_TOKEN = re.compile(
    r'\.?[A-Za-z0-9_][A-Za-z0-9_.-]*\.[A-Za-z0-9]{1,4}')


def scope_path_tokens(scope):
    """Path-like tokens in a capability scope: any token holding a slash
    plus plain filenames with a short extension. Scopes that name no paths
    (ids, plain words) yield no tokens and skip the disk check."""
    tokens = []
    for token in re.split(r'[,\s]+', str(scope or '')):
        if not token:
            continue
        if '/' in token or SCOPE_PATH_TOKEN.fullmatch(token):
            tokens.append(token)
    return tokens


def validate_map(mapping, repo=None):
    if not isinstance(mapping, dict):
        raise WorkError('map must be a JSON object')
    if mapping.get('version') != 1:
        raise WorkError('unsupported map version: %r (expected 1)'
                        % mapping.get('version'))
    for key in ('domains', 'capabilities', 'questions'):
        if not isinstance(mapping.get(key, []), list):
            raise WorkError('map %s must be a list' % key)
    seen = set()
    for entry in mapping.get('capabilities', []):
        if not isinstance(entry, dict) or not entry.get('id'):
            raise WorkError('map capability entries need an id')
        ref = entry['id']
        if not re.fullmatch(r'[A-Za-z0-9._-]+', str(ref)):
            raise WorkError('invalid map capability id: %r' % (ref,))
        if ref in seen:
            raise WorkError('duplicate map capability id: %s' % ref)
        seen.add(ref)
        if not entry.get('name'):
            raise WorkError('map capability %s needs a name' % ref)
        if entry.get('type') and entry['type'] not in JOB_TYPES:
            raise WorkError('map capability %s has an invalid type %r'
                            % (ref, entry['type']))
        if repo is not None:
            paths = scope_path_tokens(entry.get('scope'))
            if paths and not any(os.path.exists(os.path.join(repo, path))
                                 for path in paths):
                raise WorkError(
                    'map capability %s scope names paths that do not exist '
                    'on disk: %s' % (ref, ', '.join(paths)))
    cap_ids = {e.get('id') for e in mapping.get('capabilities', [])}
    for entry in mapping.get('questions', []):
        if not isinstance(entry, dict) or not entry.get('question'):
            raise WorkError('map question entries need a question')
        if entry.get('type') and entry['type'] not in JOB_TYPES:
            raise WorkError('map question has an invalid type %r'
                            % (entry.get('type'),))
    for entry in mapping.get('domains', []):
        if not isinstance(entry, dict) or not entry.get('id'):
            raise WorkError('map domain entries need an id')
        if not entry.get('name') or not entry.get('purpose'):
            raise WorkError('map domain %s needs a name and purpose'
                            % entry['id'])
        for ref in entry.get('capabilities', []):
            if ref not in cap_ids:
                raise WorkError('map domain %s references unknown capability:'
                                ' %s' % (entry['id'], ref))
    for section in ('capabilities', 'questions'):
        for entry in mapping.get(section, []):
            for dep in entry.get('dependencies', []) or []:
                if dep not in cap_ids:
                    raise WorkError('dependency of %r is not a map capability'
                                    ' id: %s' % (entry.get('id') or
                                                 entry.get('question'), dep))


def merge_budget(existing, entry, config):
    budget = dict(existing) if existing else default_budget(config)
    used = budget.get('used_bytes', 0)
    override = entry.get('budget') if isinstance(entry, dict) else None
    if isinstance(override, dict):
        for key in ('brief_max_bytes', 'checkpoint_max_bytes',
                    'attempt_max_bytes', 'run_allowance_bytes', 'retries'):
            value = override.get(key)
            if isinstance(value, int) and value > 0:
                budget[key] = value
        budget['pinned'] = True
    elif not budget.get('pinned'):
        fresh = default_budget(config)
        for key in ('brief_max_bytes', 'checkpoint_max_bytes',
                    'attempt_max_bytes', 'run_allowance_bytes', 'retries'):
            budget[key] = fresh[key]
    budget['used_bytes'] = used
    return budget


def seed_job(con, job_type, question, scope, priority, config, now,
             slug_source, revision):
    existing = con.execute(
        'SELECT id FROM jobs WHERE type=? AND question=?',
        (job_type, question)).fetchone()
    if existing is not None:
        return existing['id'], False
    job_id = next_job_id(con, job_type, slugify(slug_source))
    con.execute(
        'INSERT INTO jobs (id, type, question, scope, priority, '
        'dependencies, input_revision, budget_json, evidence_ids, '
        'candidate_path, status, lease_owner, lease_expires_epoch, '
        'attempt_count, created_epoch, updated_epoch) VALUES '
        '(?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,0,?,?)',
        (job_id, job_type, question, scope, priority, '[]',
         revision, json.dumps(default_budget(config)),
         '[]', None, 'queued', now, now))
    return job_id, True


def cmd_plan(args):
    repo = os.path.abspath(args.repo)
    try:
        with open(args.map, encoding='utf-8') as handle:
            mapping = json.load(handle)
    except OSError as exc:
        raise WorkError('cannot read map: %s' % exc)
    except ValueError as exc:
        raise WorkError('map is not valid JSON: %s' % exc)
    validate_map(mapping, repo)
    config = load_work_config(repo)
    revision = current_revision(repo)
    con = open_jobs(repo, create=True)
    created, updated = [], []
    try:
        begin_immediate(con)
        now = now_epoch()
        entries = []
        for entry in mapping.get('domains', []):
            entries.append(('plan', 'Produce the documentation map for '
                             'domain %s (%s)' % (entry['id'], entry['name']),
                             entry.get('scope') or entry['id'],
                             entry.get('priority', 5), entry['id'], entry))
        for entry in mapping.get('capabilities', []):
            entries.append((entry.get('type', 'author'),
                            entry.get('question') or
                            'Document capability %s (%s)' % (entry['id'],
                                                             entry['name']),
                            entry.get('scope') or entry['id'],
                            entry.get('priority', 5), entry['id'], entry))
        for entry in mapping.get('questions', []):
            entries.append((entry.get('type', 'synthesize'),
                            entry['question'], entry.get('scope') or '',
                            entry.get('priority', 5),
                            entry['question'], entry))
        ids_by_cap = {}
        for job_type, question, scope, priority, slug_source, entry in entries:
            job_id, fresh = seed_job(con, job_type, question, scope,
                                     priority, config, now, slug_source,
                                     revision)
            if fresh:
                created.append(job_id)
            else:
                budget = merge_budget(job_budget(fetch_job(con, job_id)),
                                      entry, config)
                touch(con, job_id, priority=priority, scope=scope,
                      budget_json=json.dumps(budget))
                updated.append(job_id)
            if entry.get('id'):
                ids_by_cap[entry['id']] = job_id
        # second pass: resolve dependency references to job ids
        for job_type, question, scope, priority, slug_source, entry in entries:
            deps = [ids_by_cap[dep] for dep in entry.get('dependencies', [])
                    or [] if dep in ids_by_cap]
            job_id = con.execute('SELECT id FROM jobs WHERE type=? AND '
                                 'question=?', (job_type, question)).fetchone()
            if job_id is not None and deps:
                touch(con, job_id['id'], dependencies=json.dumps(deps))
        # splits: a child inherits the parent's remaining allowance
        for job_type, question, scope, priority, slug_source, entry in entries:
            parent_ref = entry.get('split_of')
            if not parent_ref:
                continue
            child = con.execute('SELECT id FROM jobs WHERE type=? AND '
                                'question=?', (job_type, question)).fetchone()
            parent = con.execute('SELECT id FROM jobs WHERE id=?',
                                 (parent_ref,)).fetchone()
            if child is None or parent is None:
                raise WorkError('split_of %r does not name a job created by '
                                'this or a previous plan run' % parent_ref)
            parent_budget = job_budget(fetch_job(con, parent['id']))
            remaining = max(0, parent_budget.get('run_allowance_bytes', 0)
                            - parent_budget.get('used_bytes', 0))
            child_budget = merge_budget(job_budget(fetch_job(con, child['id'])),
                                        entry, config)
            child_budget['run_allowance_bytes'] = remaining
            child_budget['used_bytes'] = 0
            child_budget['pinned'] = True
            touch(con, child['id'], budget_json=json.dumps(child_budget))
            parent_budget['run_allowance_bytes'] = \
                parent_budget.get('used_bytes', 0)
            open_attempt = latest_attempt(con, parent['id'], open_only=True)
            if open_attempt is not None:
                con.execute('UPDATE attempts SET ended_epoch=?, outcome=? '
                            'WHERE id=?',
                            (now, 'superseded_by_split', open_attempt['id']))
            touch(con, parent['id'],
                  budget_json=json.dumps(parent_budget),
                  status='blocked',
                  blocked_reason='split into child job %s' % child['id'],
                  blocked_on='prerequisite:operator review of split parent',
                  lease_owner=None, lease_expires_epoch=None)
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    jobs_total = con.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]
    con.close()
    emit({'created': created, 'updated': updated,
          'jobs_total': jobs_total, 'revision': revision})
    return 0


# ---------------------------------------------------------------------------
# work next


def checkpoint_summary(repo, con, job_id):
    row = con.execute(
        'SELECT checkpoint_path FROM attempts WHERE job_id=? AND '
        'checkpoint_path IS NOT NULL ORDER BY id DESC LIMIT 1',
        (job_id,)).fetchone()
    if row is None or not os.path.exists(row['checkpoint_path']):
        return None
    try:
        with open(row['checkpoint_path'], encoding='utf-8') as handle:
            body = json.load(handle)
    except (OSError, ValueError):
        return None
    if not isinstance(body, dict):
        return None

    def bounded(key, count):
        values = body.get(key, [])
        return values[:count] if isinstance(values, list) else []

    summary = {'decisions': bounded('decisions', 5),
               'evidence_refs': bounded('evidence_refs', 10),
               'unknowns': bounded('unknowns', 5),
               'next_actions': bounded('next_actions', 5),
               'source': row['checkpoint_path']}
    return summary


def build_brief(repo, con, job, attempt_id, config):
    budget = job_budget(job)
    brief = {
        'job': {'id': job['id'], 'type': job['type'],
                'question': job['question'], 'scope': job['scope'],
                'priority': job['priority'],
                'dependencies': json.loads(job['dependencies'] or '[]')},
        'revision': job['input_revision'],
        'attempt': attempt_id,
        'budget': {key: budget.get(key) for key in
                   ('attempt_max_bytes', 'run_allowance_bytes', 'retries',
                    'used_bytes')},
        'evidence_cmd': 'wiki work evidence <repo> --job %s span <path> '
                        '<start> [end]' % job['id'],
        'checkpoint_cmd': 'wiki work checkpoint <repo> --job %s --file '
                          '<path>' % job['id'],
        'submit_cmd': 'wiki work submit <repo> --job %s --candidate '
                      '<path>' % job['id'],
    }
    summary = checkpoint_summary(repo, con, job['id'])
    if summary is not None:
        brief['checkpoint_summary'] = summary
    cap = config['work_brief_max_bytes']
    payload = json.dumps(brief, ensure_ascii=True)
    truncated = False
    while len(payload.encode('utf-8')) > cap:
        truncated = True
        summary = brief.get('checkpoint_summary')
        if summary:
            shrunk = False
            for key in ('decisions', 'evidence_refs', 'unknowns',
                        'next_actions'):
                if len(summary[key]) > 1:
                    summary[key] = summary[key][:len(summary[key]) // 2]
                    shrunk = True
            if not shrunk:
                brief.pop('checkpoint_summary', None)
        elif len(brief['job']['question']) > 64:
            brief['job']['question'] = brief['job']['question'][:64] + '...'
        else:
            break
        payload = json.dumps(brief, ensure_ascii=True)
    if truncated:
        brief['brief_truncated'] = True
        payload = json.dumps(brief, ensure_ascii=True)
    return brief, len(payload.encode('utf-8'))


def cmd_next(args):
    repo = os.path.abspath(args.repo)
    config = load_work_config(repo)
    con = open_jobs(repo, create=True)
    try:
        # Stamp the lease at the CURRENT revision: a job planned at an
        # older revision must become submittable by re-leasing (its own
        # stale error names "take a fresh lease" as the remedy).
        lease_revision = safe_revision(repo)
        begin_immediate(con)
        maintenance(con, repo)
        accepted = {row['id'] for row in con.execute(
            "SELECT id FROM jobs WHERE status='accepted'")}
        row = None
        for candidate in con.execute(
                "SELECT * FROM jobs WHERE status='queued' ORDER BY priority "
                'ASC, created_epoch ASC, id ASC'):
            try:
                deps = json.loads(candidate['dependencies'] or '[]')
            except ValueError:
                deps = []
            if all(dep in accepted for dep in deps):
                row = candidate
                break
        if row is None:
            con.execute('COMMIT')
            con.close()
            emit({'job': None, 'reason': 'no eligible jobs',
                  'revision': safe_revision(repo)})
            return 0
        owner = 'w-%d-%s' % (os.getpid(), secrets.token_hex(4))
        now = now_epoch()
        expires = now + config['work_lease_seconds']
        touch(con, row['id'], status='leased', lease_owner=owner,
              lease_expires_epoch=expires,
              attempt_count=row['attempt_count'] + 1,
              input_revision=lease_revision)
        cursor = con.execute(
            'INSERT INTO attempts (job_id, lease_owner, started_epoch, '
            'evidence_ids, bytes_delivered) VALUES (?,?,?,?,0)',
            (row['id'], owner, now, '[]'))
        attempt_id = cursor.lastrowid
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    job = fetch_job(con, row['id'])
    brief, brief_bytes = build_brief(repo, con, job, attempt_id, config)
    brief_path = os.path.join(attempts_dir(repo, attempt_id), 'brief.json')
    with open(brief_path, 'w', encoding='utf-8') as handle:
        json.dump(brief, handle, ensure_ascii=True, indent=2)
    con.close()
    emit({'job': row['id'], 'brief': brief, 'brief_bytes': brief_bytes,
          'attempt': attempt_id, 'lease_owner': owner,
          'lease_expires_epoch': expires,
          'revision': job['input_revision']})
    return 0


# ---------------------------------------------------------------------------
# lease guard shared by evidence / checkpoint / submit


def lease_guard(con, job, owner, now):
    status = job['status']
    if status == 'queued':
        raise WorkError('late operation: the lease for job %s expired and '
                        'was recovered to queued' % job['id'], exit_code=2)
    if status not in ('leased', 'in_progress'):
        raise WorkError('job %s is %s, not held by a worker lease'
                        % (job['id'], status), exit_code=2)
    if (job['lease_expires_epoch'] or 0) < now:
        recover_expired_leases(con, now)
        raise WorkError('late operation: the lease for job %s expired at %d'
                        % (job['id'], job['lease_expires_epoch']),
                        exit_code=2)
    if owner and job['lease_owner'] != owner:
        raise WorkError('job %s is leased by %s, not %r'
                        % (job['id'], job['lease_owner'], owner),
                        exit_code=2)
    if status == 'leased':
        touch(con, job['id'], status='in_progress')


def block_on_exhaustion(con, job, attempt, reason, now):
    if attempt is not None:
        con.execute('UPDATE attempts SET ended_epoch=?, outcome=? WHERE id=?',
                    (now, 'budget_exhausted', attempt['id']))
    touch(con, job['id'], status='blocked', blocked_reason=reason,
          blocked_on='prerequisite:explicit budget increase',
          lease_owner=None, lease_expires_epoch=None)


# ---------------------------------------------------------------------------
# work evidence


def evidence_namespace(args):
    return args


def run_evidence_query(repo, args, identity):
    """Delegate to the Phase 1 evidence layer with the attempt identity so
    the cumulative per-attempt budget refusal actually fires."""
    con = discovery.open_index(repo)
    try:
        revision = discovery.index_meta(con, 'revision')
    finally:
        con.close()
    config = evidence.load_config(repo)
    args.attempt = identity
    if args.kind == 'span':
        return revision, evidence.span_query(repo, revision, args, config)
    if args.kind == 'graph':
        return revision, evidence.graph_query(repo, revision, args, config)
    if args.kind in discovery.LIST_QUERIES:
        result = discovery.run_list_query(repo, args.kind, args, config)
        evidence.Usage(repo, revision).append(
            op=args.kind, evidence_id=None,
            bytes_count=result['accounted_bytes'], cached=False,
            attempt=identity)
        return revision, result
    raise WorkError('unknown evidence kind %r (files|symbols|relations|'
                    'candidates|span|graph)' % args.kind, exit_code=64)


def cmd_evidence(args):
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    now = now_epoch()
    try:
        begin_immediate(con)
        job = fetch_job(con, args.job)
        lease_guard(con, job, args.owner, now)
        attempt = latest_attempt(con, job['id'], open_only=True) or \
            latest_attempt(con, job['id'])
        if attempt is None:
            raise WorkError('job %s has no attempt row to account against'
                            % job['id'])
        budget = job_budget(fetch_job(con, job['id']))
        if budget.get('used_bytes', 0) >= budget.get(
                'run_allowance_bytes', 0):
            block_on_exhaustion(
                con, fetch_job(con, job['id']), attempt,
                'run allowance exhausted', now)
            con.execute('COMMIT')
            fail('run allowance exhausted for job %s: used %d of %d bytes; '
                 'checkpoint the partial work and record an explicit budget '
                 'increase or split the job' % (
                     job['id'], budget.get('used_bytes', 0),
                     budget.get('run_allowance_bytes', 0)),
                 safe_revision(repo))
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    identity = attempt_identity(job['id'], attempt['id'])
    try:
        revision, result = run_evidence_query(repo, args, identity)
    except evidence.EvidenceError as exc:
        con.close()
        if 'budget exhausted' in str(exc):
            con = open_jobs(repo)
            try:
                begin_immediate(con)
                fresh = fetch_job(con, job['id'])
                fresh_attempt = latest_attempt(con, job['id'])
                used = job_budget(fresh).get('used_bytes', 0)
                allowance = job_budget(fresh).get('run_allowance_bytes', 0)
                reason = ('run allowance exhausted' if used >= allowance
                          else 'attempt evidence budget exhausted; '
                               'checkpoint and split the question or record '
                               'an explicit budget increase')
                block_on_exhaustion(con, fresh, fresh_attempt, reason,
                                    now_epoch())
                con.execute('COMMIT')
            except BaseException:
                rollback(con)
                raise
            finally:
                con.close()
        fail(str(exc), safe_revision(repo), exc.exit_code)
    accounted = result.get('accounted_bytes', 0)
    try:
        begin_immediate(con)
        fresh = fetch_job(con, job['id'])
        ids = json.loads(fresh['evidence_ids'] or '[]')
        for item in result.get('items', []):
            evidence_id = item.get('evidence_id')
            if evidence_id and evidence_id not in ids:
                ids.append(evidence_id)
        budget = job_budget(fresh)
        budget['used_bytes'] = budget.get('used_bytes', 0) + accounted
        touch(con, job['id'], evidence_ids=json.dumps(ids),
              budget_json=json.dumps(budget))
        con.execute('UPDATE attempts SET bytes_delivered=COALESCE('
                    'bytes_delivered,0)+?, evidence_ids=? WHERE id=?',
                    (accounted, json.dumps(ids), attempt['id']))
        total = con.execute(
            "SELECT value FROM meta WHERE key='run_allowance_used_bytes'"
        ).fetchone()
        used_total = int(total[0]) if total else 0
        con.execute('INSERT INTO meta (key, value) VALUES '
                    "('run_allowance_used_bytes', ?) ON CONFLICT(key) DO "
                    'UPDATE SET value=excluded.value',
                    (str(used_total + accounted),))
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit(result)
    return 0


# ---------------------------------------------------------------------------
# work checkpoint


def read_checkpoint_file(path, cap):
    try:
        raw = open(path, 'rb').read()
    except OSError as exc:
        raise WorkError('cannot read checkpoint: %s' % exc)
    if len(raw) > cap:
        raise WorkError('checkpoint is %d bytes; the cap is %d; shrink the '
                        'checkpoint before saving' % (len(raw), cap))
    try:
        body = json.loads(raw.decode('utf-8'))
    except ValueError as exc:
        raise WorkError('checkpoint is not valid JSON: %s' % exc)
    if not isinstance(body, dict):
        raise WorkError('checkpoint must be a JSON object with decisions, '
                        'evidence_refs, unknowns and next_actions')
    for key in ('decisions', 'evidence_refs', 'unknowns', 'next_actions'):
        if not isinstance(body.get(key, []), list):
            raise WorkError('checkpoint %s must be a list' % key)
    return body


def persist_checkpoint(repo, attempt_id, body):
    path = os.path.join(attempts_dir(repo, attempt_id), 'checkpoint.json')
    with open(path, 'w', encoding='utf-8') as handle:
        json.dump(body, handle, ensure_ascii=True, indent=2)
    return path


def cmd_checkpoint(args):
    repo = os.path.abspath(args.repo)
    config = load_work_config(repo)
    body = read_checkpoint_file(args.file, config['work_checkpoint_max_bytes'])
    con = open_jobs(repo, create=True)
    now = now_epoch()
    try:
        begin_immediate(con)
        maintenance(con, repo)
        job = fetch_job(con, args.job)
        if job['status'] in ('queued', 'blocked'):
            attempt = latest_attempt(con, job['id'])
            if attempt is None:
                raise WorkError('job %s has no attempt to attach a '
                                'checkpoint to' % job['id'], exit_code=2)
            path = persist_checkpoint(repo, attempt['id'], body)
            con.execute('UPDATE attempts SET checkpoint_path=? WHERE id=?',
                        (path, attempt['id']))
            con.execute('COMMIT')
            con.close()
            if job['status'] == 'blocked':
                emit({'job': job['id'], 'status': 'blocked',
                      'checkpoint': path,
                      'note': 'checkpoint preserved; job stays paused (%s)'
                              % job['blocked_reason']})
                return 0
            fail('late checkpoint: the lease for job %s expired and was '
                 'recovered; checkpoint retained for reference at %s'
                 % (job['id'], path), safe_revision(repo), exit_code=2)
        lease_guard(con, job, args.owner, now)
        attempt = latest_attempt(con, job['id'], open_only=True) or \
            latest_attempt(con, job['id'])
        path = persist_checkpoint(repo, attempt['id'], body)
        con.execute('UPDATE attempts SET checkpoint_path=?, ended_epoch=?, '
                    'outcome=? WHERE id=?',
                    (path, now, 'checkpointed', attempt['id']))
        if args.blocked:
            if not args.blocked_reason:
                raise WorkError('--blocked needs --reason')
            target = args.blocked_on or 'prerequisite:unspecified'
            if not target.startswith(('job:', 'prerequisite:')):
                target = 'prerequisite:' + target
            if target.startswith('job:') and con.execute(
                    'SELECT 1 FROM jobs WHERE id=?',
                    (target[len('job:'):],)).fetchone() is None:
                raise WorkError('--on names no known job: %s' % target)
            touch(con, job['id'], status='blocked',
                  blocked_reason=args.blocked_reason, blocked_on=target,
                  lease_owner=None, lease_expires_epoch=None)
            status = 'blocked'
        else:
            touch(con, job['id'], status='queued', lease_owner=None,
                  lease_expires_epoch=None)
            status = 'queued'
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'status': status, 'checkpoint': path,
          'attempt': attempt['id']})
    return 0


# ---------------------------------------------------------------------------
# work submit / review


def cmd_submit(args):
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    now = now_epoch()
    try:
        begin_immediate(con)
        maintenance(con, repo)
        job = fetch_job(con, args.job)
        lease_guard(con, job, args.owner, now)
        revision = current_revision(repo)
        if job['input_revision'] != revision:
            con.execute('COMMIT')
            fail('stale submission: job %s was planned at revision %s but '
                 'the repository is at %s; checkpoint the partial work and '
                 'take a fresh lease' % (job['id'], job['input_revision'],
                                         revision), revision, exit_code=2)
        try:
            with open(args.candidate, encoding='utf-8') as handle:
                candidate = json.load(handle)
        except OSError as exc:
            raise WorkError('cannot read candidate: %s' % exc)
        except ValueError as exc:
            raise WorkError('candidate is not valid JSON: %s' % exc)
        if not isinstance(candidate, dict):
            raise WorkError('candidate must be a JSON object')
        # Shape-check at submit with the exact planner promotion uses:
        # a candidate that cannot be planned must fail HERE (job stays
        # leased), never crash at promotion after acceptance.
        try:
            knowledge.plan_candidate_writes(repo, candidate)
        except ValueError as exc:
            fail('invalid candidate (would fail promotion): %s' % exc,
                 revision, exit_code=2)
        attempt = latest_attempt(con, job['id'], open_only=True) or \
            latest_attempt(con, job['id'])
        target = os.path.join(attempts_dir(repo, attempt['id']),
                              'candidate.json')
        with open(target, 'w', encoding='utf-8') as handle:
            json.dump(candidate, handle, ensure_ascii=True, indent=2)
        con.execute('UPDATE attempts SET candidate_path=? WHERE id=?',
                    (target, attempt['id']))
        touch(con, job['id'], status='awaiting_review',
              candidate_path=target, lease_owner=None,
              lease_expires_epoch=None)
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'status': 'awaiting_review',
          'attempt': attempt['id'], 'candidate': target,
          'revision': revision})
    return 0


def cmd_review(args):
    if args.decision not in REVIEW_DECISIONS:
        raise WorkError('decision must be one of %s'
                        % '|'.join(REVIEW_DECISIONS), exit_code=64)
    repo = os.path.abspath(args.repo)
    try:
        with open(args.findings, encoding='utf-8') as handle:
            findings_text = handle.read()
    except OSError as exc:
        raise WorkError('cannot read findings: %s' % exc)
    try:
        findings = json.loads(findings_text)
    except ValueError as exc:
        raise WorkError('findings must be valid JSON: %s' % exc)
    if not isinstance(findings, dict) or not isinstance(
            findings.get('findings', []), list):
        raise WorkError('findings must be an object with a findings list')
    con = open_jobs(repo, create=True)
    now = now_epoch()
    try:
        begin_immediate(con)
        job = fetch_job(con, args.job)
        if job['status'] != 'awaiting_review':
            raise WorkError('job %s is %s, not awaiting_review'
                            % (job['id'], job['status']), exit_code=2)
        attempt = latest_attempt(con, job['id'])
        con.execute(
            'INSERT INTO reviews (job_id, attempt_id, decision, findings, '
            'evidence_ids, reviewer_epoch) VALUES (?,?,?,?,?,?)',
            (job['id'], attempt['id'], args.decision, findings_text,
             json.dumps(findings.get('evidence_ids', [])), now))
        findings_path = os.path.join(attempts_dir(repo, attempt['id']),
                                     'findings.json')
        with open(findings_path, 'w', encoding='utf-8') as handle:
            handle.write(findings_text)
        if args.decision == 'accepted':
            touch(con, job['id'], status='accepted')
            con.execute('UPDATE attempts SET ended_epoch=?, outcome=? '
                        'WHERE id=?', (now, 'accepted', attempt['id']))
            con.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) "
                'ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                ('accept:%s:revision' % job['id'], job['input_revision']))
            con.execute(
                "INSERT INTO meta (key, value) VALUES (?, ?) "
                'ON CONFLICT(key) DO UPDATE SET value=excluded.value',
                ('accept:%s:knowledge_digest' % job['id'],
                 knowledge.knowledge_state_digest(repo)))
            status = 'accepted'
        elif args.decision == 'revision_requested':
            prior = con.execute(
                "SELECT COUNT(*) FROM reviews WHERE job_id=? AND "
                "decision='revision_requested'", (job['id'],)).fetchone()[0]
            con.execute('UPDATE attempts SET ended_epoch=?, outcome=? '
                        'WHERE id=?',
                        (now, 'revision_requested', attempt['id']))
            retries = job_budget(job).get('retries', 2)
            if prior <= retries:
                touch(con, job['id'], status='queued')
                status = 'queued'
            else:
                touch(con, job['id'], status='blocked',
                      blocked_reason='revision retry limit reached (%d '
                                     'automatic requeues used)' % retries,
                      blocked_on='prerequisite:reviewer findings')
                status = 'blocked'
        else:
            touch(con, job['id'], status='rejected')
            con.execute('UPDATE attempts SET ended_epoch=?, outcome=? '
                        'WHERE id=?', (now, 'rejected', attempt['id']))
            status = 'rejected'
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'decision': args.decision, 'status': status,
          'attempt': attempt['id'], 'findings': findings_path})
    return 0


# ---------------------------------------------------------------------------
# work promote: journal-first, backups, crash recovery


def run_edit_hook(script, path):
    """Run the repo edit hooks around promotion writes. Best effort when
    the hook script is absent (non-CFN machines); failures abort."""
    hook = os.path.join(os.path.expanduser('~'), '.claude', 'hooks', script)
    if not os.path.exists(hook):
        return None
    proc = subprocess.run(['bash', hook, path, '--agent-id',
                           EDIT_HOOK_AGENT], capture_output=True, text=True)
    if proc.returncode != 0:
        raise WorkError('edit hook %s failed for %s: %s'
                        % (script, path, proc.stderr.strip()))
    return proc.stdout.strip()


def apply_write(repo, relpath, content):
    target = os.path.join(repo, relpath.replace('/', os.sep))
    os.makedirs(os.path.dirname(target), exist_ok=True)
    tmp = target + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(content, handle, ensure_ascii=True, indent=2)
        handle.write('\n')
    existed = os.path.exists(target)
    if existed:
        run_edit_hook('cfn-invoke-pre-edit.sh', target)
    os.replace(tmp, target)
    if existed:
        run_edit_hook('cfn-invoke-post-edit.sh', target)
    return existed


def meta_get(con, key):
    row = con.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
    return row[0] if row else None


def recover_promotions(repo, con):
    """Re-apply any pending promotion journals idempotently. An interrupted
    promotion must recover on the next run and never leave a partially
    referenced model."""
    recovered = []
    rows = con.execute("SELECT * FROM promotions WHERE state='pending' "
                       'ORDER BY id').fetchall()
    for row in rows:
        plan = json.loads(row['plan_json'])
        backups = json.loads(row['backup_paths'] or '{}')
        for step in plan:
            apply_write(repo, step['path'], step['content'])
        try:
            knowledge.load_knowledge(repo)
        except ValueError as exc:
            _restore_backups(repo, backups)
            con.execute('UPDATE promotions SET state=? WHERE id=?',
                        ('rolled_back', row['id']))
            raise WorkError('pending promotion %d failed verification '
                            'after recovery and was rolled back: %s'
                            % (row['id'], exc))
        con.execute('UPDATE promotions SET state=? WHERE id=?',
                    ('committed', row['id']))
        # the completed writes moved the tree revision; record the new
        # revision so the accepted job is not marked stale by its own
        # promotion
        con.execute('UPDATE jobs SET input_revision=?, updated_epoch=? '
                    'WHERE id=?',
                    (current_revision(repo), now_epoch(), row['job_id']))
        recovered.append(row['id'])
    return recovered


def _restore_backups(repo, backups):
    for relpath, backup in backups.items():
        target = os.path.join(repo, relpath.replace('/', os.sep))
        if backup and os.path.exists(backup):
            run_edit_hook('cfn-invoke-pre-edit.sh', target)
            shutil.copyfile(backup, target)
            run_edit_hook('cfn-invoke-post-edit.sh', target)
        elif os.path.exists(target):
            os.remove(target)


def cmd_promote(args):
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    recovered = []
    try:
        begin_immediate(con)
        # no maintenance scan here: the freshness recheck below is the whole
        # point, and a stale scan would requeue accepted jobs (including
        # ones whose revision moved only through their own promotion
        # writes) before the recheck could name the reason
        recovered = recover_promotions(repo, con)
        job = fetch_job(con, args.job)
        if job['status'] != 'accepted':
            raise WorkError('job %s is %s; only accepted work can be '
                            'promoted' % (job['id'], job['status']),
                            exit_code=2)
        committed = con.execute(
            'SELECT id FROM promotions WHERE job_id=? AND state=?',
            (job['id'], 'committed')).fetchone()
        if committed is not None:
            con.execute('COMMIT')
            con.close()
            emit({'job': job['id'], 'state': 'committed',
                  'promotion': committed['id'],
                  'recovered': recovered or None,
                  'note': 'an earlier promotion already committed; '
                          'nothing to apply'})
            return 0
        revision = current_revision(repo)
        if job['input_revision'] != revision:
            con.execute('COMMIT')
            fail('promotion refused: source changed since acceptance; job '
                 'revision %s, current revision %s; the candidate must be '
                 're-reviewed against the new revision'
                 % (job['input_revision'], revision), revision, exit_code=2)
        digest = knowledge.knowledge_state_digest(repo)
        accepted_digest = meta_get(con, 'accept:%s:knowledge_digest'
                                   % job['id'])
        if accepted_digest is not None and digest != accepted_digest:
            con.execute('COMMIT')
            fail('promotion refused: the knowledge manifest changed since '
                 'acceptance (digest %s, now %s); re-review before '
                 'promoting' % (accepted_digest[:12], digest[:12]),
                 revision, exit_code=2)
        attempt = latest_attempt(con, job['id'])
        candidate_path = attempt['candidate_path'] or job['candidate_path']
        if not candidate_path or not os.path.exists(candidate_path):
            raise WorkError('job %s has no candidate file to promote'
                            % job['id'], exit_code=2)
        with open(candidate_path, encoding='utf-8') as handle:
            candidate = json.load(handle)
        steps = knowledge.plan_candidate_writes(repo, candidate)
        now = now_epoch()
        backup_dir = os.path.join(repo, '.wiki', 'backups',
                                  'promote-%s-%d' % (job['id'], now))
        backups = {}
        for step in steps:
            target = os.path.join(repo, step['path'].replace('/', os.sep))
            if os.path.exists(target):
                os.makedirs(backup_dir, exist_ok=True)
                backup_file = os.path.join(
                    backup_dir, step['path'].replace('/', '__'))
                shutil.copyfile(target, backup_file)
                backups[step['path']] = backup_file
            else:
                backups[step['path']] = None
        cursor = con.execute(
            'INSERT INTO promotions (job_id, attempt_id, state, plan_json, '
            'backup_paths, epoch) VALUES (?,?,?,?,?,?)',
            (job['id'], attempt['id'], 'pending', json.dumps(steps),
             json.dumps(backups), now))
        promotion_id = cursor.lastrowid
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise

    crash_after = os.environ.get('CFN_WIKI_PROMOTE_CRASH_AFTER')
    crash_after = int(crash_after) if crash_after else None
    writes_done = 0
    try:
        for step in steps:
            apply_write(repo, step['path'], step['content'])
            writes_done += 1
            if crash_after is not None and writes_done >= crash_after:
                sys.stderr.write('simulated crash after %d writes\n'
                                 % writes_done)
                os._exit(70)
        try:
            knowledge.load_knowledge(repo)
        except ValueError as exc:
            begin_immediate(con)
            _restore_backups(repo, backups)
            con.execute('UPDATE promotions SET state=? WHERE id=?',
                        ('rolled_back', promotion_id))
            con.execute('COMMIT')
            raise WorkError('candidate produced an invalid knowledge model '
                            'and was rolled back: %s' % exc)
        begin_immediate(con)
        con.execute('UPDATE promotions SET state=? WHERE id=?',
                    ('committed', promotion_id))
        # record the post-write revision: the accepted explanation now
        # reflects the tree including its own promoted writes
        con.execute('UPDATE jobs SET input_revision=?, updated_epoch=? '
                    'WHERE id=?',
                    (current_revision(repo), now_epoch(), job['id']))
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'state': 'committed', 'promotion': promotion_id,
          'attempt': attempt['id'], 'writes': [s['path'] for s in steps],
          'recovered': recovered or None})
    return 0


# ---------------------------------------------------------------------------
# work status / unblock / export / import


def cmd_status(args):
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    try:
        begin_immediate(con)
        maintenance(con, repo)
        by_status = dict(con.execute(
            'SELECT status, COUNT(*) FROM jobs GROUP BY status').fetchall())
        by_type = dict(con.execute(
            'SELECT type, COUNT(*) FROM jobs GROUP BY type').fetchall())
        oldest = con.execute(
            "SELECT MIN(created_epoch) FROM jobs WHERE status='queued'"
        ).fetchone()[0]
        blocked_rows = con.execute(
            "SELECT id, status, blocked_reason, blocked_on FROM jobs WHERE "
            "status IN ('blocked', 'rejected') ORDER BY updated_epoch DESC "
            'LIMIT ?', (STATUS_BLOCKED_CAP,)).fetchall()
        total_blocked = con.execute(
            "SELECT COUNT(*) FROM jobs WHERE status IN ('blocked', "
            "'rejected')").fetchone()[0]
        pending = [row[0] for row in con.execute(
            "SELECT job_id FROM promotions WHERE state='pending'")]
        total = con.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    blocked = []
    for row in blocked_rows:
        reason = row['blocked_reason']
        if row['status'] == 'rejected':
            reason = 'rejected by review (terminal)'
        blocked.append({'job': row['id'], 'reason': reason,
                        'on': row['blocked_on']})
    emit({
        'revision': safe_revision(repo),
        'jobs_total': total,
        'counts': {'status': by_status, 'type': by_type},
        'oldest_queued_epoch': oldest,
        'blocked': blocked,
        'blocked_truncated': total_blocked > STATUS_BLOCKED_CAP,
        'pending_promotions': pending,
    })
    return 0


def cmd_unblock(args):
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    try:
        begin_immediate(con)
        job = fetch_job(con, args.job)
        if job['status'] != 'blocked':
            raise WorkError('job %s is %s, not blocked'
                            % (job['id'], job['status']), exit_code=2)
        touch(con, job['id'], status='queued', blocked_reason=None,
              blocked_on=None)
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'status': 'queued',
          'unblock_reason': args.reason or 'operator unblock'})
    return 0


def cmd_release(args):
    """Safe release of a stray lease: leased/in_progress returns to queued
    with the lease cleared, the open attempt ended and any checkpoint kept
    on the attempt row (contracts section 5, operator path)."""
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    now = now_epoch()
    try:
        begin_immediate(con)
        job = fetch_job(con, args.job)
        if job['status'] not in ('leased', 'in_progress'):
            raise WorkError('job %s is %s, not held by a lease; nothing to '
                            'release' % (job['id'], job['status']),
                            exit_code=2)
        if args.owner and job['lease_owner'] != args.owner:
            raise WorkError('job %s is leased by %s, not %r; refusing to '
                            'release' % (job['id'], job['lease_owner'],
                                         args.owner), exit_code=2)
        attempt = latest_attempt(con, job['id'], open_only=True)
        checkpoint = attempt['checkpoint_path'] if attempt is not None else None
        if attempt is not None:
            con.execute('UPDATE attempts SET ended_epoch=?, outcome=? '
                        'WHERE id=?', (now, 'released', attempt['id']))
        touch(con, job['id'], status='queued', lease_owner=None,
              lease_expires_epoch=None)
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'status': 'queued',
          'attempt': attempt['id'] if attempt is not None else None,
          'checkpoint': checkpoint,
          'note': 'lease released safely; checkpoint retained on the '
                  'attempt row'})
    return 0


def cmd_requeue(args):
    """Operator path for accepted-but-unpromotable jobs: promotion was
    refused and rolled back, so the job sits accepted with no lease back.
    Requeue returns it to queued with the reason recorded; a job whose
    promotion committed is never touched."""
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo, create=True)
    try:
        begin_immediate(con)
        job = fetch_job(con, args.job)
        if job['status'] != 'accepted':
            raise WorkError('job %s is %s, not accepted; requeue is the '
                            'operator path for accepted-but-unpromotable '
                            'jobs' % (job['id'], job['status']), exit_code=2)
        committed = con.execute(
            'SELECT id FROM promotions WHERE job_id=? AND state=?',
            (job['id'], 'committed')).fetchone()
        if committed is not None:
            raise WorkError('job %s has a committed promotion (%d) whose '
                            'writes are live in readme/wiki; requeue never '
                            'touches promoted work'
                            % (job['id'], committed['id']), exit_code=2)
        attempt_count = job['attempt_count']
        touch(con, job['id'], status='queued', blocked_reason=args.reason,
              blocked_on=None, lease_owner=None, lease_expires_epoch=None)
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()
    emit({'job': job['id'], 'status': 'queued', 'reason': args.reason,
          'attempt_count': attempt_count,
          'note': 'accepted-but-unpromotable job requeued; the reason stays '
                  'recorded on the row for the audit trail'})
    return 0


def rows_as_dicts(con, table):
    return [dict(row) for row in con.execute('SELECT * FROM %s' % table)]


def repo_identity(repo):
    head = None
    if discovery.is_git_repo(repo):
        proc = discovery._git(repo, 'rev-parse', 'HEAD')
        if proc.returncode == 0:
            head = proc.stdout.decode('utf-8', 'replace').strip()
    return {'basename': os.path.basename(os.path.abspath(repo)),
            'git_head': head, 'revision': current_revision(repo)}


def cmd_export(args):
    repo = os.path.abspath(args.repo)
    con = open_jobs(repo)
    archive = {
        'format': 'cfn-wiki-work-archive/1',
        'created_epoch': now_epoch(),
        'repo_identity': repo_identity(repo),
        'jobs': rows_as_dicts(con, 'jobs'),
        'attempts': rows_as_dicts(con, 'attempts'),
        'reviews': rows_as_dicts(con, 'reviews'),
        'promotions': rows_as_dicts(con, 'promotions'),
        'counters': rows_as_dicts(con, 'counters'),
        'meta': rows_as_dicts(con, 'meta'),
        'evidence_packets': [],
        'usage': evidence.read_usage(repo),
    }
    con.close()
    packet_dir = os.path.join(repo, '.wiki', 'work', 'evidence')
    if os.path.isdir(packet_dir):
        for name in sorted(os.listdir(packet_dir)):
            if name.endswith('.json'):
                with open(os.path.join(packet_dir, name),
                          encoding='utf-8') as handle:
                    archive['evidence_packets'].append(json.load(handle))
    out = args.out
    tmp = out + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(archive, handle, ensure_ascii=True)
    os.replace(tmp, out)
    emit({'out': out, 'jobs': len(archive['jobs']),
          'attempts': len(archive['attempts']),
          'reviews': len(archive['reviews']),
          'evidence_packets': len(archive['evidence_packets']),
          'usage_lines': len(archive['usage'])})
    return 0


def cmd_import(args):
    repo = os.path.abspath(args.repo)
    try:
        with open(args.file, encoding='utf-8') as handle:
            archive = json.load(handle)
    except (OSError, ValueError) as exc:
        raise WorkError('cannot read archive: %s' % exc)
    if archive.get('format') != 'cfn-wiki-work-archive/1':
        raise WorkError('not a cfn-wiki work archive: %r'
                        % archive.get('format'))
    theirs = archive.get('repo_identity') or {}
    mine = repo_identity(repo)
    if theirs.get('git_head') and mine.get('git_head') and \
            theirs['git_head'] != mine['git_head']:
        raise WorkError('repository identity mismatch: archive came from '
                        'commit %s, this checkout is at %s'
                        % (theirs['git_head'][:12], mine['git_head'][:12]),
                        exit_code=2)
    if theirs.get('revision') and mine.get('revision') and \
            theirs['revision'] != mine['revision']:
        raise WorkError('repository identity mismatch: archive came from '
                        'revision %s, this checkout is at %s; align the '
                        'checkouts (discover both) before transferring work'
                        % (theirs['revision'], mine['revision']), exit_code=2)
    con = open_jobs(repo, create=True)
    imported, skipped = [], []
    job_columns = [row[1] for row in con.execute('PRAGMA table_info(jobs)')]
    try:
        begin_immediate(con)
        for row in archive.get('jobs', []):
            local = con.execute('SELECT updated_epoch FROM jobs WHERE id=?',
                                (row.get('id'),)).fetchone()
            if local is not None and local['updated_epoch'] > \
                    row.get('updated_epoch', 0):
                skipped.append({
                    'job': row.get('id'),
                    'reason': 'local row is newer (local updated_epoch %d '
                              '>= archive %d)' % (local['updated_epoch'],
                                                  row.get('updated_epoch',
                                                          0))})
                continue
            columns = [c for c in job_columns if c in row]
            assignments = ', '.join('%s=?' % c for c in columns)
            values = [row[c] for c in columns]
            con.execute('INSERT INTO jobs (%s) VALUES (%s) ON CONFLICT(id) '
                        'DO UPDATE SET %s' % (
                            ', '.join(columns),
                            ', '.join('?' * len(columns)), assignments),
                        values + values)
            imported.append(row.get('id'))
        known_jobs = {row['id'] for row in con.execute('SELECT id FROM jobs')}
        for table in ('attempts', 'reviews', 'promotions'):
            key = 'job_id'
            count = 0
            for row in archive.get(table, []):
                if row.get(key) not in known_jobs:
                    skipped.append({'job': row.get(key),
                                    'reason': '%s row %r references a job '
                                              'absent locally' % (table,
                                              row.get('id'))})
                    continue
                exists = con.execute(
                    'SELECT 1 FROM %s WHERE id=?' % table,
                    (row.get('id'),)).fetchone()
                if exists is not None:
                    continue
                columns = [c for c in
                           [r[1] for r in con.execute(
                               'PRAGMA table_info(%s)' % table)]
                           if c in row]
                con.execute('INSERT INTO %s (%s) VALUES (%s)' % (
                    table, ', '.join(columns),
                    ', '.join('?' * len(columns))),
                    [row[c] for c in columns])
                count += 1
        for row in archive.get('counters', []):
            con.execute('INSERT INTO counters (name, value) VALUES (?, ?) '
                        'ON CONFLICT(name) DO UPDATE SET value=MAX('
                        'excluded.value, counters.value)',
                        (row.get('name'), row.get('value', 0)))
        for row in archive.get('meta', []):
            con.execute('INSERT INTO meta (key, value) VALUES (?, ?) '
                        'ON CONFLICT(key) DO NOTHING',
                        (row.get('key'), row.get('value')))
        con.execute('COMMIT')
    except BaseException:
        rollback(con)
        con.close()
        raise
    con.close()

    packets_written = 0
    for packet in archive.get('evidence_packets', []):
        target = evidence.packet_path(repo, packet.get('id'))
        if not os.path.exists(target):
            evidence.store_packet(repo, packet)
            packets_written += 1
    usage_appended = 0
    existing = {json.dumps(row, sort_keys=True) for row in
                evidence.read_usage(repo)}
    usage_rows = archive.get('usage', [])
    if usage_rows:
        with open(evidence.usage_path(repo), 'a', encoding='utf-8') as handle:
            for row in usage_rows:
                fingerprint = json.dumps(row, sort_keys=True)
                if fingerprint not in existing:
                    handle.write(json.dumps(row, ensure_ascii=True) + '\n')
                    usage_appended += 1
    emit({'imported_jobs': imported, 'skipped': skipped,
          'evidence_packets_written': packets_written,
          'usage_lines_appended': usage_appended,
          'identity': mine})
    return 0


# ---------------------------------------------------------------------------
# migrate (delegates to knowledge) and coverage

# Capped name samples for the portal coverage view: lists stay bounded while
# still naming areas instead of showing bare counts.
NAME_SAMPLE_CAP = 20


def cmd_migrate(args):
    repo = os.path.abspath(args.repo)
    if str(args.to) != '2':
        raise WorkError('this skill supports migrating to version 2 only '
                        '(got --to %s)' % args.to, exit_code=64)
    try:
        result = knowledge.migrate_to_v2(repo)
    except ValueError as exc:
        fail('migration refused: %s' % exc, safe_revision(repo))
    emit(result)
    return 0


def coverage_report(repo):
    report = {'revision': safe_revision(repo)}

    def class_paths(con, file_class):
        # capped, deterministically ordered name sample for the portal lists
        rows = con.execute(
            'SELECT path FROM files WHERE class = ? ORDER BY path LIMIT ?',
            (file_class, NAME_SAMPLE_CAP + 1)).fetchall()
        return ([r[0] for r in rows[:NAME_SAMPLE_CAP]],
                len(rows) > NAME_SAMPLE_CAP)

    index = discovery.index_path(repo)
    if os.path.exists(index):
        con = discovery.open_index(repo)
        try:
            by_class = dict(con.execute(
                'SELECT class, COUNT(*) FROM files GROUP BY class'
            ).fetchall())
            total = sum(by_class.values())
            excluded_paths, excluded_more = class_paths(con, 'excluded')
            unclassified_paths, unclassified_more = class_paths(con, 'unknown')
        finally:
            con.close()
        excluded = by_class.get('excluded', 0)
        in_scope = total - excluded
        unclassified = by_class.get('unknown', 0)
        report['inventory'] = {
            'covered': in_scope - unclassified, 'denominator': total,
            'in_scope': in_scope, 'excluded': excluded,
            'unclassified': unclassified, 'by_class': by_class,
            'excluded_paths': excluded_paths,
            'excluded_paths_truncated': excluded_more,
            'unclassified_paths': unclassified_paths,
            'unclassified_paths_truncated': unclassified_more,
            'measure': 'classified in-scope files'}
        report['exclusions'] = {
            'excluded_files': excluded,
            'note': 'excluded files are never read; reasons live in the '
                    'discovery index'}
    else:
        report['inventory'] = {
            'error': 'no discovery index; run wiki discover first'}
        report['exclusions'] = {'excluded_files': None}
    try:
        model = knowledge.load_knowledge(repo)
        authored = model.get('capabilities', [])
        reviewed = [c for c in authored if not c.get('needs_review')
                    and c.get('reviewed_at')]
        explained = len(authored)
    except (ValueError, OSError) as exc:
        model = None
        explained = 0
        reviewed = []
        authored = []
        report['knowledge_error'] = str(exc)
    report['explanation'] = {
        'covered': explained, 'denominator': explained,
        'measure': 'explained capabilities from the reviewed map'}
    report['review'] = {
        'covered': len(reviewed), 'denominator': explained,
        'measure': 'currently reviewed explained capabilities'}
    blocked_areas = []
    if os.path.exists(jobs_db_path(repo)):
        con = open_jobs(repo)
        try:
            for row in con.execute(
                    "SELECT id, status, blocked_reason FROM jobs WHERE "
                    "status IN ('blocked', 'rejected') ORDER BY id LIMIT ?",
                    (STATUS_BLOCKED_CAP,)):
                blocked_areas.append({
                    'job': row['id'],
                    'reason': row['blocked_reason'] or
                              'rejected by review (terminal)'})
            if con.execute("SELECT COUNT(*) FROM jobs WHERE type='author'"
                           ).fetchone()[0] > 0:
                mapped = con.execute(
                    "SELECT COUNT(*) FROM jobs WHERE type='author'"
                ).fetchone()[0]
                report['explanation']['denominator'] = mapped
        finally:
            con.close()
    report['blocked_areas'] = blocked_areas
    report['stale_areas'] = [
        {'capability': c['fid'],
         'reason': 'sources changed since the explanation was reviewed'}
        for c in authored if c.get('needs_review')]
    return report


def cmd_coverage(args):
    repo = os.path.abspath(args.repo)
    report = coverage_report(repo)
    if args.json:
        emit(report)
        return 0
    inventory = report['inventory']
    lines = ['wiki coverage for %s (revision %s)' % (repo,
                                                     report['revision'])]
    if 'error' in inventory:
        lines.append('inventory: unavailable (%s)' % inventory['error'])
    else:
        lines.append('inventory: %d/%d in-scope files classified '
                     '(%d unclassified), %d excluded by policy'
                     % (inventory['covered'], inventory['denominator'],
                        inventory['unclassified'], inventory['excluded']))
    explanation = report['explanation']
    lines.append('explanation: %d capabilities explained / %d in the '
                 'reviewed map' % (explanation['covered'],
                                   explanation['denominator']))
    review = report['review']
    lines.append('review: %d of %d explained capabilities currently reviewed'
                 % (review['covered'], review['denominator']))
    if report['blocked_areas']:
        lines.append('blocked areas: %d' % len(report['blocked_areas']))
        for area in report['blocked_areas']:
            lines.append('  %s: %s' % (area['job'], area['reason']))
    print('\n'.join(lines))
    return 0


# ---------------------------------------------------------------------------
# CLI


def build_parser():
    parser = argparse.ArgumentParser(prog='work.py')
    sub = parser.add_subparsers(dest='command', required=True)

    plan = sub.add_parser('plan')
    plan.add_argument('repo')
    plan.add_argument('--map', required=True)

    nxt = sub.add_parser('next')
    nxt.add_argument('repo')

    ev = sub.add_parser('evidence')
    ev.add_argument('repo')
    ev.add_argument('--job', required=True)
    ev.add_argument('--owner')
    ev.add_argument('kind')
    ev.add_argument('span_path', nargs='?')
    ev.add_argument('span_start', nargs='?', type=int)
    ev.add_argument('span_end', nargs='?', type=int)
    for flag in ('class', 'lang', 'adapter', 'name', 'path', 'src-path',
                 'src-symbol', 'dst', 'status', 'like', 'symbol',
                 'from-packet', 'cursor'):
        ev.add_argument('--' + flag)
    ev.add_argument('--kind', dest='filter_kind')
    ev.add_argument('--limit', type=int)
    ev.add_argument('--direction', default='both',
                    choices=['outgoing', 'incoming', 'both'])
    ev.add_argument('--depth', type=int, default=1)

    cp = sub.add_parser('checkpoint')
    cp.add_argument('repo')
    cp.add_argument('--job', required=True)
    cp.add_argument('--file', required=True)
    cp.add_argument('--owner')
    cp.add_argument('--blocked', action='store_true')
    cp.add_argument('--reason', dest='blocked_reason')
    cp.add_argument('--on', dest='blocked_on')

    sub_parser = sub.add_parser('submit')
    sub_parser.add_argument('repo')
    sub_parser.add_argument('--job', required=True)
    sub_parser.add_argument('--candidate', required=True)
    sub_parser.add_argument('--owner')

    rev = sub.add_parser('review')
    rev.add_argument('repo')
    rev.add_argument('--job', required=True)
    rev.add_argument('--decision', required=True)
    rev.add_argument('--findings', required=True)

    promo = sub.add_parser('promote')
    promo.add_argument('repo')
    promo.add_argument('--job', required=True)

    status = sub.add_parser('status')
    status.add_argument('repo')

    unblock = sub.add_parser('unblock')
    unblock.add_argument('repo')
    unblock.add_argument('--job', required=True)
    unblock.add_argument('--reason')

    release = sub.add_parser('release')
    release.add_argument('repo')
    release.add_argument('--job', required=True)
    release.add_argument('--owner')

    requeue = sub.add_parser('requeue')
    requeue.add_argument('repo')
    requeue.add_argument('--job', required=True)
    requeue.add_argument('--reason', required=True)

    export = sub.add_parser('export')
    export.add_argument('repo')
    export.add_argument('--out', required=True)

    imp = sub.add_parser('import')
    imp.add_argument('repo')
    imp.add_argument('--file', required=True)

    migrate = sub.add_parser('migrate')
    migrate.add_argument('repo')
    migrate.add_argument('--to', default='2')

    coverage = sub.add_parser('coverage')
    coverage.add_argument('repo')
    coverage.add_argument('--json', action='store_true')

    return parser


COMMANDS = {
    'plan': cmd_plan, 'next': cmd_next, 'evidence': cmd_evidence,
    'checkpoint': cmd_checkpoint, 'submit': cmd_submit,
    'review': cmd_review, 'promote': cmd_promote, 'status': cmd_status,
    'unblock': cmd_unblock, 'release': cmd_release, 'requeue': cmd_requeue,
    'export': cmd_export, 'import': cmd_import,
    'migrate': cmd_migrate, 'coverage': cmd_coverage,
}


def main(argv=None):
    args = build_parser().parse_args(argv)
    handler = COMMANDS.get(args.command)
    try:
        return handler(args)
    except WorkError as exc:
        fail(str(exc), safe_revision(args.repo), exc.exit_code)
    except discovery.DiscoveryError as exc:
        fail(str(exc), safe_revision(args.repo), exc.exit_code)
    except evidence.EvidenceError as exc:
        fail(str(exc), safe_revision(args.repo), exc.exit_code)


if __name__ == '__main__':
    sys.exit(main() or 0)
