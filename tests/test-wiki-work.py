#!/usr/bin/env python3
"""Phase 2 durable work queue and sharded knowledge regressions.

Covers every acceptance item in
planning/cfn-wiki/CONTRACTS_work-knowledge-v2.md section 5 plus the
work CLI contracts in section 3 and the budget rules in section 4.
All fixtures live under tempfile.mkdtemp(); the real repository tree
is never written to.

Run: python3 tests/test-wiki-work.py
"""
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / '.claude' / 'skills' / 'cfn-wiki' / 'lib'
WORK = LIB / 'work.py'
WIKI_SH = LIB / 'wiki.sh'
sys.path.insert(0, str(LIB))

PY = sys.executable or 'python3'


def jrun(args, env_extra=None, cwd=None):
    """Run work.py, return (returncode, parsed_json_or_None, stderr)."""
    env = dict(os.environ)
    if env_extra:
        env.update(env_extra)
    proc = subprocess.run(
        [PY, str(WORK)] + [str(a) for a in args],
        capture_output=True, text=True, env=env, cwd=str(cwd) if cwd else None)
    try:
        data = json.loads(proc.stdout)
    except (ValueError, UnicodeDecodeError):
        data = None
    return proc.returncode, data, proc.stderr


class Fixture(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='wiki-work-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name) / 'repo'
        (self.repo / 'src').mkdir(parents=True)
        (self.repo / 'src' / 'core.py').write_text(
            'def run_check():\n    return "ok"\n', encoding='utf-8')

    # -- helpers -----------------------------------------------------------
    def write(self, rel, text):
        target = self.repo / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(text, encoding='utf-8')
        return target

    def run_work(self, *args, **kw):
        return jrun(list(args), env_extra=kw.pop('env', None))

    def discover(self):
        proc = subprocess.run(
            [PY, str(LIB / 'discovery.py'), 'discover', str(self.repo)],
            capture_output=True, text=True)
        assert proc.returncode == 0, proc.stderr
        return json.loads(proc.stdout)

    def jobs_db(self):
        return self.repo / '.wiki' / 'work' / 'jobs.sqlite'

    def sql(self, query, params=()):
        con = sqlite3.connect('file:%s?mode=ro' % self.jobs_db(), uri=True)
        try:
            return con.execute(query, params).fetchall()
        finally:
            con.close()

    def job_row(self, job_id):
        cols = [r[1] for r in self.sql('PRAGMA table_info(jobs)')]
        rows = self.sql('SELECT * FROM jobs WHERE id=?', (job_id,))
        return dict(zip(cols, rows[0])) if rows else None

    def simple_map(self, caps=(('cap-alpha', 'Explain alpha'),
                               ('cap-beta', 'Explain beta'))):
        return {
            'version': 1,
            'domains': [],
            'capabilities': [
                {'id': cid, 'name': name, 'priority': 5 + i}
                for i, (cid, name) in enumerate(caps)],
            'questions': [],
        }

    def plan(self, mapping=None):
        mapping = mapping if mapping is not None else self.simple_map()
        path = Path(self.temp.name) / 'map.json'
        path.write_text(json.dumps(mapping), encoding='utf-8')
        return self.run_work('plan', self.repo, '--map', path)

    def next_job(self):
        return self.run_work('next', self.repo)

    def checkpoint(self, job_id, owner, body=None, *extra):
        body = body or {'decisions': ['d1'], 'evidence_refs': [],
                        'unknowns': [], 'next_actions': ['continue']}
        path = Path(self.temp.name) / ('cp-%s.json' % time.time_ns())
        path.write_text(json.dumps(body), encoding='utf-8')
        return self.run_work('checkpoint', self.repo, '--job', job_id,
                             '--file', path, *extra)

    def candidate(self, capabilities=None, entities=None):
        return {
            'capabilities': capabilities if capabilities is not None else [],
            'entities': entities if entities is not None else [],
            'domains': [],
        }

    def author_flow(self, cap_id='cap-alpha', decision='accepted'):
        """plan -> next -> submit -> review, returns the job id."""
        self.plan()
        rc, leased, _ = self.next_job()
        assert rc == 0 and leased['job'], leased
        job_id = leased['job']
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(self.candidate(
            capabilities=[{
                'fid': cap_id, 'name': 'Cap %s' % cap_id, 'status': 'dev',
                'status_reason': 'fixture', 'description': 'd',
                'purpose': 'p', 'sources': [{
                    'path': 'src/core.py', 'line': 1,
                    'claim': 'run_check exists',
                    'sha256': __import__('hashlib').sha256(
                        (self.repo / 'src/core.py').read_bytes()).hexdigest()}],
                'flow': [{'title': 'Run', 'detail': 'calls run_check',
                          'source': 'src/core.py'}],
                'failures': ['None known.'],
                'change_guidance': ['Edit src/core.py.']}])),
            encoding='utf-8')
        rc, submit, _ = self.run_work('submit', self.repo, '--job', job_id,
                                      '--candidate', cand)
        assert rc == 0, submit
        findings = Path(self.temp.name) / 'findings.json'
        findings.write_text(json.dumps(
            {'findings': ['looks grounded'], 'evidence_ids': []}),
            encoding='utf-8')
        rc, review, _ = self.run_work(
            'review', self.repo, '--job', job_id, '--decision', decision,
            '--findings', findings)
        assert rc == 0, review
        return job_id

    def v2_repo(self):
        """Fixture repo already migrated to knowledge version 2."""
        import hashlib
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        manifest = {'version': 2, 'overview': {'title': 'T', 'summary': 's',
                                               'coverage': 'c', 'questions': []},
                    'domains': [], 'capabilities': ['cap-seed'],
                    'entities': []}
        self.write('readme/wiki/knowledge.json', json.dumps(manifest, indent=2))
        self.write('readme/wiki/capabilities/cap-seed.json', json.dumps({
            'id': 'cap-seed', 'fid': 'cap-seed', 'name': 'Seed',
            'status': 'dev', 'status_reason': 'r', 'description': 'd',
            'purpose': 'p', 'reviewed_at': '2026-09-13', 'dependencies': '',
            'sources': [{'path': 'src/core.py', 'line': 1,
                         'claim': 'seed source', 'sha256': digest}],
            'evidence': [], 'domains': [], 'unknowns': []}, indent=2))

    def accept_candidate(self, capabilities):
        """Full pipeline ending in an accepted job for one capability."""
        self.discover()
        mapping = self.simple_map(
            caps=(('cap-new', 'Explain the new thing'),))
        self.plan(mapping)
        rc, leased, _ = self.next_job()
        job = leased['job']
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(
            self.candidate(capabilities=capabilities)), encoding='utf-8')
        rc, submit, _ = self.run_work('submit', self.repo, '--job', job,
                                      '--candidate', cand)
        self.assertEqual(rc, 0, submit)
        findings = Path(self.temp.name) / 'f.json'
        findings.write_text(json.dumps({'findings': [], 'evidence_ids': []}),
                            encoding='utf-8')
        rc, review, _ = self.run_work(
            'review', self.repo, '--job', job, '--decision', 'accepted',
            '--findings', findings)
        self.assertEqual(rc, 0, review)
        return job


class PlanTests(Fixture):
    def test_plan_seeds_idempotent_jobs(self):
        rc, first, _ = self.plan()
        self.assertEqual(rc, 0, first)
        self.assertEqual(len(first['created']), 2)
        self.assertTrue(all(j.startswith('author-') for j in first['created']))
        rc, again, _ = self.plan()
        self.assertEqual(rc, 0, again)
        self.assertEqual(again['created'], [])
        self.assertEqual(len(again['updated']), 2)

    def test_plan_rerun_updates_priority_never_duplicates(self):
        self.plan()
        mapping = self.simple_map()
        mapping['capabilities'][0]['priority'] = 1
        path = Path(self.temp.name) / 'map2.json'
        path.write_text(json.dumps(mapping), encoding='utf-8')
        rc, updated, _ = self.run_work('plan', self.repo, '--map', path)
        self.assertEqual(rc, 0, updated)
        total = self.sql('SELECT COUNT(*) FROM jobs')[0][0]
        self.assertEqual(total, 2)
        job = [j for j in updated['updated'] if 'alpha' in j][0]
        self.assertEqual(self.job_row(job)['priority'], 1)

    def test_plan_validates_map_and_seeds_nothing(self):
        bad = self.simple_map(caps=(('bad id!', 'x'),))
        rc, data, _ = self.plan(bad)
        self.assertNotEqual(rc, 0)
        self.assertIn('error', data)
        total = self.sql('SELECT COUNT(*) FROM jobs')[0][0] \
            if self.jobs_db().exists() else 0
        self.assertEqual(total, 0)

    def test_plan_domain_referencing_unknown_capability_fails(self):
        mapping = self.simple_map(caps=(('cap-alpha', 'a'),))
        mapping['domains'] = [{
            'id': 'dom-1', 'name': 'D', 'purpose': 'p',
            'capabilities': ['cap-missing'], 'entities': [],
            'shared_contracts': [], 'unknowns': []}]
        rc, data, _ = self.plan(mapping)
        self.assertNotEqual(rc, 0)
        self.assertIn('cap-missing', data['error'])

    def test_plan_dependencies_resolve_to_job_ids(self):
        mapping = self.simple_map()
        mapping['capabilities'][1]['dependencies'] = ['cap-alpha']
        rc, data, _ = self.plan(mapping)
        self.assertEqual(rc, 0, data)
        beta = [j for j in data['created'] if 'beta' in j][0]
        alpha = [j for j in data['created'] if 'alpha' in j][0]
        deps = json.loads(self.job_row(beta)['dependencies'])
        self.assertEqual(deps, [alpha])

    def test_job_ids_use_monotonic_counter(self):
        self.plan()
        first = sorted(j for j in self.sql('SELECT id FROM jobs'))
        # remove one job by plan of a fresh map with a slug collision
        mapping = self.simple_map(caps=(('cap-alpha', 'other question'),))
        rc, data, _ = self.plan(mapping)
        self.assertEqual(rc, 0, data)
        ids = [j[0] for j in self.sql('SELECT id FROM jobs ORDER BY id')]
        self.assertEqual(len(ids), 3)
        suffixes = [i.rsplit('-', 1)[1] for i in ids]
        self.assertEqual(sorted(set(suffixes)), ['1', '2'])

    def test_plan_split_inherits_remaining_allowance(self):
        self.plan()
        rc, leased, _ = self.next_job()
        parent = leased['job']
        row = self.job_row(parent)
        budget = json.loads(row['budget_json'])
        budget['used_bytes'] = 1000
        con = sqlite3.connect(self.jobs_db())
        con.execute('UPDATE jobs SET budget_json=? WHERE id=?',
                    (json.dumps(budget), parent))
        con.commit()
        con.close()
        mapping = {
            'version': 1, 'domains': [],
            'capabilities': [{'id': 'cap-alpha-part-b', 'name': 'Split part',
                              'split_of': parent}],
            'questions': []}
        rc, data, _ = self.plan(mapping)
        self.assertEqual(rc, 0, data)
        child = [j for j in data['created'] if 'part-b' in j][0]
        child_budget = json.loads(self.job_row(child)['budget_json'])
        self.assertEqual(child_budget['run_allowance_bytes'],
                         budget['run_allowance_bytes'] - 1000)
        self.assertEqual(child_budget['used_bytes'], 0)
        parent_budget = json.loads(self.job_row(parent)['budget_json'])
        self.assertEqual(parent_budget['run_allowance_bytes'], 1000)
        self.assertEqual(self.job_row(parent)['status'], 'blocked')

    def test_plan_rejects_capability_scope_citing_no_existing_path(self):
        # Regression (pilot): a shipped map cited .claude/edit-safety.sh,
        # a file that never existed; a reviewer caught it late. Plan must
        # refuse at plan time, naming the capability and the phantom paths.
        mapping = self.simple_map(caps=(('cap-alpha', 'a'),))
        mapping['capabilities'][0]['scope'] = '.claude/edit-safety.sh'
        rc, data, _ = self.plan(mapping)
        self.assertNotEqual(rc, 0)
        self.assertIn('cap-alpha', data['error'])
        self.assertIn('.claude/edit-safety.sh', data['error'])
        total = self.sql('SELECT COUNT(*) FROM jobs')[0][0] \
            if self.jobs_db().exists() else 0
        self.assertEqual(total, 0)

    def test_plan_accepts_scope_when_one_named_path_exists(self):
        mapping = self.simple_map(caps=(('cap-alpha', 'a'),))
        mapping['capabilities'][0]['scope'] = \
            '.claude/missing-helper.sh, src/core.py'
        rc, data, _ = self.plan(mapping)
        self.assertEqual(rc, 0, data)
        self.assertEqual(len(data['created']), 1)

    def test_plan_scope_without_path_tokens_skips_disk_check(self):
        # scopes that name no paths (ids, words) must not trip the check
        mapping = self.simple_map(caps=(('cap-alpha', 'a'),))
        mapping['capabilities'][0]['scope'] = 'auth middleware'
        rc, data, _ = self.plan(mapping)
        self.assertEqual(rc, 0, data)


class LeaseTests(Fixture):
    def test_next_leases_one_job_and_gates_on_dependencies(self):
        mapping = self.simple_map()
        mapping['capabilities'][1]['dependencies'] = ['cap-alpha']
        self.plan(mapping)
        rc, data, _ = self.next_job()
        self.assertEqual(rc, 0, data)
        self.assertIn('alpha', data['job'])
        self.assertLessEqual(data['brief_bytes'], 8192)
        rc, second, _ = self.next_job()
        self.assertEqual(rc, 0, second)
        self.assertIsNone(second['job'])  # beta waits for alpha acceptance

    def test_two_processes_never_lease_the_same_job(self):
        mapping = self.simple_map(caps=tuple(
            ('cap-%d' % i, 'Question number %d' % i) for i in range(4)))
        self.plan(mapping)
        env = dict(os.environ)
        procs = [subprocess.Popen(
            [PY, str(WORK), 'next', str(self.repo)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
            for _ in range(2)]
        outs = []
        for proc in procs:
            out, err = proc.communicate(timeout=60)
            self.assertEqual(proc.returncode, 0, err)
            outs.append(json.loads(out))
        jobs = [o['job'] for o in outs]
        self.assertEqual(len(set(jobs)), 2, 'two workers leased %r' % jobs)
        owners = [o['lease_owner'] for o in outs]
        self.assertEqual(len(set(owners)), 2)

    def test_crash_mid_lease_recovers_to_queued_keeping_checkpoints(self):
        self.plan()
        rc, first, _ = self.next_job()
        job = first['job']
        rc, cp, _ = self.checkpoint(job, first['lease_owner'])
        self.assertEqual(rc, 0, cp)
        cp_path = cp['checkpoint']
        rc, second, _ = self.next_job()
        self.assertEqual(second['job'], job)  # requeued after checkpoint
        # simulate a worker crash: force lease expiry behind the CLI's back
        con = sqlite3.connect(self.jobs_db())
        con.execute('UPDATE jobs SET lease_expires_epoch=1 WHERE id=?', (job,))
        con.commit()
        con.close()
        rc, status, _ = self.run_work('status', self.repo)
        self.assertEqual(rc, 0, status)
        self.assertEqual(status['counts']['status'].get('leased', 0), 0)
        self.assertEqual(status['counts']['status'].get('in_progress', 0), 0)
        self.assertEqual(self.job_row(job)['status'], 'queued')
        # checkpoint file and attempt rows survive recovery
        self.assertTrue(Path(cp_path).exists())
        kept = self.sql(
            'SELECT checkpoint_path FROM attempts WHERE checkpoint_path '
            'IS NOT NULL')
        self.assertEqual(len(kept), 1)
        # attempt counter kept, not reset
        self.assertEqual(self.job_row(job)['attempt_count'], 2)

    def test_late_submission_from_expired_lease_rejected_exit_2(self):
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        con = sqlite3.connect(self.jobs_db())
        con.execute('UPDATE jobs SET lease_expires_epoch=1 WHERE id=?', (job,))
        con.commit()
        con.close()
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        rc, data, _ = self.run_work('submit', self.repo, '--job', job,
                                    '--candidate', cand)
        self.assertEqual(rc, 2)
        self.assertIn('expired', data['error'])

    def test_evidence_from_wrong_owner_rejected(self):
        self.plan()
        rc, leased, _ = self.next_job()
        rc, data, _ = self.run_work(
            'evidence', self.repo, '--job', leased['job'],
            '--owner', 'someone-else', 'span', 'src/core.py', 1, 1)
        self.assertNotEqual(rc, 0)


class EvidenceTests(Fixture):
    def test_evidence_accounts_to_lease_with_attempt_identity(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        rc, data, _ = self.run_work(
            'evidence', self.repo, '--job', job, 'span', 'src/core.py', 1, 2)
        self.assertEqual(rc, 0, data)
        attempt = self.sql(
            'SELECT id FROM attempts WHERE job_id=? ORDER BY id DESC '
            'LIMIT 1', (job,))[0][0]
        identity = 'job:%s#%d' % (job, attempt)
        usage = [json.loads(line) for line in
                 (self.repo / '.wiki/work/usage.jsonl').read_text()
                 .splitlines() if line.strip()]
        self.assertTrue(any(u.get('attempt') == identity for u in usage))
        ids = json.loads(self.job_row(job)['evidence_ids'])
        self.assertEqual(ids, [data['items'][0]['evidence_id']])

    def test_attempt_budget_refusal_blocks_job_without_restart_loop(self):
        self.discover()
        config = self.repo / '.wiki' / 'config.json'
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(json.dumps({'evidence_span_max_bytes': 4096,
                                      'evidence_attempt_max_bytes': 4096}),
                          encoding='utf-8')
        # a single-capability map: with a sibling job the "nothing to
        # lease" assertion below could pass for the wrong reason
        self.plan(self.simple_map(caps=(('cap-alpha', 'Explain alpha'),)))
        rc, leased, _ = self.next_job()
        job = leased['job']
        # lines just under the giant-line threshold: one delivery ~4KB
        big_line = 'x = "' + 'a' * 1990 + '"'
        self.write('src/big.py', '\n'.join([big_line] * 6) + '\n')
        self.discover()
        rc, data, _ = self.run_work(
            'evidence', self.repo, '--job', job, 'span', 'src/big.py', 1, 6)
        self.assertEqual(rc, 0, data)
        rc, data, _ = self.run_work(
            'evidence', self.repo, '--job', job, 'span', 'src/big.py', 1, 6)
        self.assertNotEqual(rc, 0)
        self.assertIn('budget', data['error'])
        row = self.job_row(job)
        self.assertEqual(row['status'], 'blocked')
        self.assertIn('exhausted', row['blocked_reason'])
        attempt = self.sql('SELECT outcome FROM attempts WHERE job_id=? '
                           'ORDER BY id DESC LIMIT 1', (job,))[0][0]
        self.assertEqual(attempt, 'budget_exhausted')
        # no restart loop: next leases nothing while blocked
        rc, nxt, _ = self.next_job()
        self.assertEqual(rc, 0, nxt)
        self.assertIsNone(nxt['job'])

    def test_run_allowance_exhaustion_blocks_with_contract_reason(self):
        self.discover()
        config = self.repo / '.wiki' / 'config.json'
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(json.dumps({'work_run_allowance_bytes': 50}),
                          encoding='utf-8')
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        refused = None
        for _ in range(10):
            rc, refused, _ = self.run_work(
                'evidence', self.repo, '--job', job, 'span',
                'src/core.py', 1, 2)
            if rc != 0:
                break
        self.assertNotEqual(rc, 0)
        self.assertEqual(
            self.job_row(job)['blocked_reason'], 'run allowance exhausted')

    def test_budget_resume_after_unblock_and_raise(self):
        self.discover()
        config = self.repo / '.wiki' / 'config.json'
        config.parent.mkdir(parents=True, exist_ok=True)
        config.write_text(json.dumps({'work_run_allowance_bytes': 1}),
                          encoding='utf-8')
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        rc, data, _ = self.run_work(
            'evidence', self.repo, '--job', job, 'span', 'src/core.py', 1, 2)
        self.assertEqual(rc, 0, data)  # first delivery allowed
        self.run_work('evidence', self.repo, '--job', job, 'span',
                      'src/core.py', 1, 2)
        self.assertEqual(self.job_row(job)['status'], 'blocked')
        # operator raises the allowance in config, reapplies the map (the
        # job budget is re-derived from config when not pinned by the map),
        # then unblocks the job
        config.write_text(json.dumps({'work_run_allowance_bytes': 100000}),
                          encoding='utf-8')
        self.plan()
        rc, unblocked, _ = self.run_work(
            'unblock', self.repo, '--job', job, '--reason', 'allowance raised')
        self.assertEqual(rc, 0, unblocked)
        rc, nxt, _ = self.next_job()
        self.assertEqual(nxt['job'], job)
        rc, data, _ = self.run_work(
            'evidence', self.repo, '--job', nxt['job'], 'span',
            'src/core.py', 1, 2)
        self.assertEqual(rc, 0, data)


class SubmitReviewTests(Fixture):
    def test_submit_records_attempt_and_moves_to_awaiting_review(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(self.candidate(capabilities=[{
            'fid': 'cap-alpha', 'name': 'A', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'sources': [], 'flow': [], 'failures': [],
            'change_guidance': []}])), encoding='utf-8')
        rc, data, _ = self.run_work('submit', self.repo, '--job', job,
                                    '--candidate', cand)
        self.assertEqual(rc, 0, data)
        self.assertEqual(data['status'], 'awaiting_review')
        self.assertTrue(self.job_row(job)['candidate_path'])
        attempt = self.sql('SELECT candidate_path FROM attempts WHERE job_id=?',
                           (job,))[0][0]
        self.assertTrue(attempt)

    def test_submit_rejects_stale_revision_exit_2(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        self.write('src/core.py', 'def run_check():\n    return "changed!!"\n')
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        rc, data, _ = self.run_work('submit', self.repo, '--job', job,
                                    '--candidate', cand)
        self.assertEqual(rc, 2)
        self.assertIn('revision', data['error'])

    def test_lease_refreshes_input_revision(self):
        # Regression (pilot): a job planned at an older revision could
        # never submit, because the lease did not restamp input_revision
        # even though the stale error says "take a fresh lease".
        self.discover()
        self.plan()
        self.write('src/late.py', 'def late(): pass\n')  # tree moves post-plan
        rc, leased, _ = self.next_job()
        self.assertEqual(rc, 0, leased)
        job = leased['job']
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        rc, data, _ = self.run_work('submit', self.repo, '--job', job,
                                    '--candidate', cand)
        self.assertEqual(rc, 0, data)
        self.assertEqual(data['status'], 'awaiting_review')
        # a tree move AFTER lease must still refuse
        self.write('src/later.py', 'def later(): pass\n')
        cand2 = Path(self.temp.name) / 'cand2.json'
        cand2.write_text(json.dumps(self.candidate()), encoding='utf-8')
        rc, data, _ = self.run_work('submit', self.repo, '--job', job,
                                    '--candidate', cand2)
        self.assertEqual(rc, 2)

    def test_schema_valid_candidate_alone_never_accepts(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        cand = Path(self.temp.name) / 'cand.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        self.run_work('submit', self.repo, '--job', job, '--candidate', cand)
        # no review decision: the job must sit in awaiting_review, never
        # accepted just because the candidate parses
        self.assertEqual(self.job_row(job)['status'], 'awaiting_review')

    def test_review_accepted_moves_job(self):
        self.discover()
        job = self.author_flow()
        self.assertEqual(self.job_row(job)['status'], 'accepted')

    def test_revision_requested_requeues_twice_then_blocks(self):
        self.discover()
        self.plan()
        outcomes = []
        for i in range(3):
            rc, leased, _ = self.next_job()
            self.assertEqual(rc, 0, leased)
            job = leased['job']
            cand = Path(self.temp.name) / ('c%d.json' % i)
            cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
            self.run_work('submit', self.repo, '--job', job,
                          '--candidate', cand)
            findings = Path(self.temp.name) / ('f%d.json' % i)
            findings.write_text(json.dumps(
                {'findings': ['needs work %d' % i], 'evidence_ids': []}),
                encoding='utf-8')
            rc, review, _ = self.run_work(
                'review', self.repo, '--job', job,
                '--decision', 'revision_requested', '--findings', findings)
            self.assertEqual(rc, 0, review)
            outcomes.append(self.job_row(job)['status'])
        self.assertEqual(outcomes, ['queued', 'queued', 'blocked'])
        self.assertIn('retry', self.job_row(job)['blocked_reason'])
        findings_rows = self.sql(
            'SELECT decision, findings FROM reviews WHERE job_id=?', (job,))
        self.assertEqual(len(findings_rows), 3)
        self.assertIn('needs work 2', findings_rows[-1][1])

    def test_review_rejected_is_terminal_and_never_leased(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        cand = Path(self.temp.name) / 'c.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        self.run_work('submit', self.repo, '--job', job, '--candidate', cand)
        findings = Path(self.temp.name) / 'f.json'
        findings.write_text(json.dumps({'findings': ['unsupported'],
                                        'evidence_ids': []}), encoding='utf-8')
        rc, review, _ = self.run_work(
            'review', self.repo, '--job', job, '--decision', 'rejected',
            '--findings', findings)
        self.assertEqual(rc, 0, review)
        self.assertEqual(self.job_row(job)['status'], 'rejected')
        rc, nxt, _ = self.next_job()
        self.assertNotEqual(nxt['job'], job)

    def test_blocked_job_resumes_when_dependency_accepts(self):
        self.discover()
        mapping = self.simple_map()
        mapping['capabilities'][1]['dependencies'] = ['cap-alpha']
        self.plan(mapping)
        beta = [j[0] for j in self.sql('SELECT id FROM jobs')
                if 'beta' in j[0]][0]
        alpha = [j[0] for j in self.sql('SELECT id FROM jobs')
                 if 'alpha' in j[0]][0]
        # a beta worker reported a missing prerequisite naming alpha's job
        con = sqlite3.connect(self.jobs_db())
        con.execute(
            "UPDATE jobs SET status='blocked', blocked_reason='waiting', "
            "blocked_on=? WHERE id=?", ('job:%s' % alpha, beta))
        con.commit()
        con.close()
        # alpha is only queued: beta must stay blocked
        rc, status, _ = self.run_work('status', self.repo)
        self.assertEqual(self.job_row(beta)['status'], 'blocked')
        # push alpha through to accepted
        rc, leased, _ = self.next_job()
        self.assertEqual(leased['job'], alpha)
        cand = Path(self.temp.name) / 'c.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        self.run_work('submit', self.repo, '--job', alpha,
                      '--candidate', cand)
        findings = Path(self.temp.name) / 'f.json'
        findings.write_text(json.dumps({'findings': [], 'evidence_ids': []}),
                            encoding='utf-8')
        self.run_work('review', self.repo, '--job', alpha,
                      '--decision', 'accepted', '--findings', findings)
        rc, status, _ = self.run_work('status', self.repo)
        self.assertEqual(self.job_row(beta)['status'], 'queued')

    def test_accepted_job_goes_stale_on_revision_change(self):
        self.discover()
        job = self.author_flow()
        self.write('src/core.py', 'def run_check():\n    return "different"\n')
        rc, status, _ = self.run_work('status', self.repo)
        self.assertEqual(self.job_row(job)['status'], 'queued')


class CheckpointTests(Fixture):
    def test_checkpoint_releases_lease_and_persists_bounded_json(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        rc, cp, _ = self.checkpoint(job, leased['lease_owner'])
        self.assertEqual(rc, 0, cp)
        self.assertEqual(cp['status'], 'queued')
        self.assertLessEqual(Path(cp['checkpoint']).stat().st_size, 8192)
        self.assertEqual(self.job_row(job)['status'], 'queued')
        self.assertIsNone(self.job_row(job)['lease_owner'])

    def test_checkpoint_rejects_oversized_file(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        body = {'decisions': ['d' * 100] * 200, 'evidence_refs': [],
                'unknowns': [], 'next_actions': []}
        rc, data, _ = self.checkpoint(leased['job'],
                                      leased['lease_owner'], body)
        self.assertNotEqual(rc, 0)
        self.assertIn('8192', data['error'])

    def test_checkpoint_can_block_on_prerequisite(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        rc, cp, _ = self.checkpoint(
            leased['job'], leased['lease_owner'], None,
            '--blocked', '--reason', 'need human decision',
            '--on', 'prerequisite:human decision on scope')
        self.assertEqual(rc, 0, cp)
        row = self.job_row(leased['job'])
        self.assertEqual(row['status'], 'blocked')
        self.assertEqual(row['blocked_on'], 'prerequisite:human decision on scope')
        self.assertEqual(row['blocked_reason'], 'need human decision')

    def test_brief_includes_bounded_checkpoint_summary(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        self.checkpoint(leased['job'], leased['lease_owner'])
        rc, second, _ = self.next_job()
        self.assertEqual(rc, 0, second)
        self.assertIn('checkpoint_summary', second['brief'])
        self.assertEqual(second['brief']['checkpoint_summary']
                         ['next_actions'], ['continue'])
        self.assertLessEqual(second['brief_bytes'], 8192)


class PromoteTests(Fixture):
    def test_submit_rejects_unpromotable_candidate_shape(self):
        # Regression (pilot): submit accepted a candidate whose domains
        # entries were id strings; promotion then crashed in
        # plan_candidate_writes. Submit must run the same shape check
        # promotion will, and leave the job leased, not awaiting_review.
        self.discover()
        self.v2_repo()
        self.plan()
        rc, leased, _ = self.next_job()
        self.assertEqual(rc, 0, leased)
        job = leased['job']
        bad = Path(self.temp.name) / 'bad.json'
        # Bare capability shard exactly as the pilot author produced it:
        # top-level domains as id strings, which the v2 planner reads as
        # the domains COLLECTION and crashes on.
        bad.write_text(json.dumps({
            'id': 'cap-x', 'fid': 'cap-x', 'name': 'X', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'sources': [], 'domains': ['some-domain']}),
            encoding='utf-8')
        rc, data, _ = self.run_work('submit', self.repo, '--job', job,
                                    '--candidate', bad)
        self.assertEqual(rc, 2)
        self.assertIn('promotion', data['error'])
        self.assertEqual(self.job_row(job)['status'], 'leased')

    def test_promote_rejects_source_change_after_acceptance(self):
        self.discover()
        job = self.author_flow()
        self.write('src/core.py', 'def run_check():\n    return "moved on"\n')
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertEqual(rc, 2)
        self.assertIn('source changed', data['error'])

    def test_promote_rejects_knowledge_manifest_change_after_acceptance(self):
        self.discover()
        # a knowledge file exists at acceptance time so its later change is
        # detectable independently of the tree revision (non-git revisions
        # hash path+size, so the edit is same-size)
        initial = json.dumps(
            {'version': 1, 'overview': {'note': 'aaaa'},
             'capabilities': [], 'entities': []})
        self.write('readme/wiki/knowledge.json', initial)
        job = self.author_flow()
        later = json.dumps(
            {'version': 1, 'overview': {'note': 'bbbb'},
             'capabilities': [], 'entities': []})
        self.assertEqual(len(initial), len(later))
        self.write('readme/wiki/knowledge.json', later)
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertEqual(rc, 2)
        self.assertIn('knowledge', data['error'])

    def test_promote_v2_writes_shard_manifest_and_journal(self):
        self.v2_repo()
        import hashlib
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        job = self.accept_candidate([{
            'fid': 'cap-new', 'name': 'New', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'reviewed_at': '2026-09-13', 'dependencies': '',
            'sources': [{'path': 'src/core.py', 'line': 1,
                         'claim': 'new claim', 'sha256': digest}],
            'flow': [], 'failures': [], 'change_guidance': []}])
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertEqual(rc, 0, data)
        self.assertEqual(data['state'], 'committed')
        shard = self.repo / 'readme/wiki/capabilities/cap-new.json'
        self.assertTrue(shard.exists())
        manifest = json.loads(
            (self.repo / 'readme/wiki/knowledge.json').read_text())
        self.assertIn('cap-new', manifest['capabilities'])
        state = self.sql('SELECT state FROM promotions WHERE job_id=?',
                         (job,))[0][0]
        self.assertEqual(state, 'committed')
        backups = json.loads(self.sql(
            'SELECT backup_paths FROM promotions WHERE job_id=?',
            (job,))[0][0])
        self.assertTrue(backups)
        import knowledge
        model = knowledge.load_knowledge(self.repo)
        self.assertEqual(model['version'], 2)
        fids = [c['fid'] for c in model['capabilities']]
        self.assertEqual(sorted(fids), ['cap-new', 'cap-seed'])

    def test_interrupted_promotion_recovers_to_consistent_model(self):
        self.v2_repo()
        import hashlib
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        job = self.accept_candidate([{
            'fid': 'cap-new', 'name': 'New', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'reviewed_at': '2026-09-13', 'dependencies': '',
            'sources': [{'path': 'src/core.py', 'line': 1,
                         'claim': 'new claim', 'sha256': digest}],
            'flow': [], 'failures': [], 'change_guidance': []}])
        rc, data, _ = self.run_work(
            'promote', self.repo, '--job', job,
            env={'CFN_WIKI_PROMOTE_CRASH_AFTER': '1'})
        self.assertNotEqual(rc, 0)
        state = self.sql('SELECT state FROM promotions WHERE job_id=?',
                         (job,))[0][0]
        self.assertEqual(state, 'pending')
        # crash after the shard write but before the manifest: the model on
        # disk must never be partially referenced
        import knowledge
        model = knowledge.load_knowledge(self.repo)
        self.assertNotIn('cap-new',
                         [c['fid'] for c in model['capabilities']])
        # recovery on the next run
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertEqual(rc, 0, data)
        self.assertEqual(data['state'], 'committed')
        model = knowledge.load_knowledge(self.repo)
        self.assertIn('cap-new', [c['fid'] for c in model['capabilities']])
        states = [r[0] for r in self.sql(
            'SELECT state FROM promotions WHERE job_id=?', (job,))]
        self.assertEqual(states, ['committed'])

    def test_promote_v1_merges_capability_with_backup(self):
        self.discover()
        import hashlib
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        knowledge_v1 = {'version': 1, 'overview': {'note': 'x'},
                        'capabilities': [], 'entities': []}
        self.write('readme/wiki/knowledge.json', json.dumps(knowledge_v1))
        job = self.accept_candidate([{
            'fid': 'cap-new', 'name': 'New', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'sources': [{'path': 'src/core.py', 'line': 1,
                         'claim': 'claim', 'sha256': digest}],
            'flow': [{'title': 'Run', 'detail': 'calls run_check',
                      'source': 'src/core.py'}],
            'failures': ['None known.'],
            'change_guidance': ['Edit src/core.py.']}])
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertEqual(rc, 0, data)
        doc = json.loads(
            (self.repo / 'readme/wiki/knowledge.json').read_text())
        self.assertEqual(doc['version'], 1)
        self.assertEqual([c['fid'] for c in doc['capabilities']], ['cap-new'])
        backups = json.loads(self.sql(
            'SELECT backup_paths FROM promotions WHERE job_id=?',
            (job,))[0][0])
        # backup_paths maps repo-relative target -> backup file path
        backup_files = [Path(v) for v in backups.values()]
        self.assertTrue(any(p.exists() for p in backup_files))

    def test_promote_requires_accepted_status(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        rc, data, _ = self.run_work('promote', self.repo,
                                    '--job', leased['job'])
        self.assertNotEqual(rc, 0)
        self.assertIn('accepted', data['error'])


class ReleaseTests(Fixture):
    def test_release_moves_leased_job_to_queued_keeping_checkpoints(self):
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        attempt = leased['attempt']
        # a mid-flight checkpoint sits on the open attempt row, as a worker
        # that crashed after checkpointing but before the lease cleared
        cp_dir = self.repo / '.wiki' / 'work' / 'attempts' / str(attempt)
        cp_dir.mkdir(parents=True, exist_ok=True)
        cp_file = cp_dir / 'checkpoint.json'
        cp_file.write_text(json.dumps(
            {'decisions': ['mid-flight'], 'evidence_refs': [],
             'unknowns': [], 'next_actions': []}), encoding='utf-8')
        con = sqlite3.connect(self.jobs_db())
        con.execute('UPDATE attempts SET checkpoint_path=? WHERE id=?',
                    (str(cp_file), attempt))
        con.commit()
        con.close()
        rc, data, _ = self.run_work('release', self.repo, '--job', job)
        self.assertEqual(rc, 0, data)
        row = self.job_row(job)
        self.assertEqual(row['status'], 'queued')
        self.assertIsNone(row['lease_owner'])
        self.assertIsNone(row['lease_expires_epoch'])
        # attempt ended with the release outcome, checkpoint retained
        ended, outcome, kept = self.sql(
            'SELECT ended_epoch, outcome, checkpoint_path FROM attempts '
            'WHERE id=?', (attempt,))[0]
        self.assertIsNotNone(ended)
        self.assertEqual(outcome, 'released')
        self.assertEqual(kept, str(cp_file))
        self.assertTrue(cp_file.exists())
        # attempt counter kept, not reset and not advanced
        self.assertEqual(row['attempt_count'], 1)
        # the job is immediately leasable again and the checkpoint surfaces
        rc, nxt, _ = self.next_job()
        self.assertEqual(rc, 0, nxt)
        self.assertEqual(nxt['job'], job)
        self.assertEqual(
            nxt['brief']['checkpoint_summary']['decisions'], ['mid-flight'])

    def test_release_refuses_job_without_lease_exit_2(self):
        self.plan()
        job = self.sql('SELECT id FROM jobs')[0][0]
        rc, data, _ = self.run_work('release', self.repo, '--job', job)
        self.assertEqual(rc, 2)
        self.assertIn('lease', data['error'])
        self.assertEqual(self.job_row(job)['status'], 'queued')
        # accepted jobs are equally unleasable: nothing to release
        self.discover()
        accepted = self.author_flow()
        rc, data, _ = self.run_work('release', self.repo, '--job', accepted)
        self.assertEqual(rc, 2)
        self.assertEqual(self.job_row(accepted)['status'], 'accepted')

    def test_release_owner_must_match_when_given(self):
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        rc, data, _ = self.run_work('release', self.repo, '--job', job,
                                    '--owner', 'someone-else')
        self.assertEqual(rc, 2)
        self.assertIn('someone-else', data['error'])
        self.assertEqual(self.job_row(job)['status'], 'leased')
        rc, data, _ = self.run_work('release', self.repo, '--job', job,
                                    '--owner', leased['lease_owner'])
        self.assertEqual(rc, 0, data)
        self.assertEqual(self.job_row(job)['status'], 'queued')


class RequeueTests(Fixture):
    def unpromotable_job(self):
        """Accepted job whose promotion was refused and rolled back: the
        candidate cites a domain shard that does not exist, so promotion
        fails the loader check, restores backups and leaves the job
        accepted with no lease path back."""
        import hashlib
        self.v2_repo()
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        return self.accept_candidate([{
            'id': 'cap-new', 'fid': 'cap-new', 'name': 'New',
            'status': 'dev', 'status_reason': 'r', 'description': 'd',
            'purpose': 'p', 'reviewed_at': '2026-09-13', 'dependencies': '',
            'sources': [{'path': 'src/core.py', 'line': 1,
                         'claim': 'new claim', 'sha256': digest}],
            'domains': ['missing-domain'], 'unknowns': []}])

    def test_requeue_accepted_unpromotable_job(self):
        job = self.unpromotable_job()
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertNotEqual(rc, 0)
        self.assertIn('rolled back', data['error'])
        self.assertEqual(self.job_row(job)['status'], 'accepted')
        self.assertEqual(
            self.sql('SELECT state FROM promotions WHERE job_id=?',
                     (job,))[0][0], 'rolled_back')
        rc, data, _ = self.run_work(
            'requeue', self.repo, '--job', job,
            '--reason', 'promotion refused: unknown domain reference')
        self.assertEqual(rc, 0, data)
        row = self.job_row(job)
        self.assertEqual(row['status'], 'queued')
        self.assertEqual(row['blocked_reason'],
                         'promotion refused: unknown domain reference')
        self.assertIsNone(row['lease_owner'])
        self.assertEqual(data['attempt_count'], row['attempt_count'])
        # the job rejoins the loop: leasable again with the counter kept
        rc, nxt, _ = self.next_job()
        self.assertEqual(rc, 0, nxt)
        self.assertEqual(nxt['job'], job)
        self.assertEqual(self.job_row(job)['attempt_count'],
                         row['attempt_count'] + 1)

    def test_requeue_refuses_non_accepted_status(self):
        self.plan()
        job = self.sql('SELECT id FROM jobs')[0][0]
        rc, data, _ = self.run_work('requeue', self.repo, '--job', job,
                                    '--reason', 'operator retry')
        self.assertEqual(rc, 2)
        self.assertIn('accepted', data['error'])
        self.assertEqual(self.job_row(job)['status'], 'queued')

    def test_requeue_never_touches_committed_promotion(self):
        import hashlib
        self.v2_repo()
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        job = self.accept_candidate([{
            'fid': 'cap-new', 'name': 'New', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'reviewed_at': '2026-09-13', 'dependencies': '',
            'sources': [{'path': 'src/core.py', 'line': 1,
                         'claim': 'new claim', 'sha256': digest}],
            'flow': [], 'failures': [], 'change_guidance': []}])
        rc, data, _ = self.run_work('promote', self.repo, '--job', job)
        self.assertEqual(rc, 0, data)
        self.assertEqual(data['state'], 'committed')
        rc, data, _ = self.run_work('requeue', self.repo, '--job', job,
                                    '--reason', 'operator retry')
        self.assertEqual(rc, 2)
        self.assertIn('committed', data['error'])
        row = self.job_row(job)
        self.assertEqual(row['status'], 'accepted')
        self.assertEqual(
            self.sql('SELECT state FROM promotions WHERE job_id=?',
                     (job,))[0][0], 'committed')


class StatusTests(Fixture):
    def test_status_envelope_is_bounded(self):
        self.discover()
        self.plan()
        rc, status, _ = self.run_work('status', self.repo)
        self.assertEqual(rc, 0, status)
        self.assertIn('revision', status)
        self.assertEqual(status['counts']['status']['queued'], 2)
        self.assertEqual(status['counts']['type']['author'], 2)
        self.assertIn('oldest_queued_epoch', status)
        self.assertIn('blocked', status)
        serialized = json.dumps(status)
        self.assertLess(len(serialized), 4096)
        self.assertNotIn('"question"', serialized)  # never dumps jobs

    def test_status_lists_blocked_reasons(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        self.checkpoint(leased['job'], leased['lease_owner'], None,
                        '--blocked', '--reason', 'missing prerequisite',
                        '--on', 'prerequisite:database access')
        rc, status, _ = self.run_work('status', self.repo)
        blocked = status['blocked']
        self.assertEqual(len(blocked), 1)
        self.assertEqual(blocked[0]['reason'], 'missing prerequisite')


class ExportImportTests(Fixture):
    def build_source_repo(self):
        self.discover()
        self.plan()
        self.author_flow()  # one accepted job with candidate and review
        rc, leased, _ = self.next_job()  # the second job
        self.run_work('evidence', self.repo, '--job', leased['job'],
                      'span', 'src/core.py', 1, 2)
        self.checkpoint(leased['job'], None)  # safe release, work retained

    def test_export_import_survives_relocation_to_fresh_checkout(self):
        self.build_source_repo()
        out = Path(self.temp.name) / 'archive.json'
        rc, exported, _ = self.run_work('export', self.repo, '--out', out)
        self.assertEqual(rc, 0, exported)
        archive = json.loads(out.read_text())
        self.assertTrue(archive['jobs'])
        # fresh checkout: same content at a different path
        clone = Path(self.temp.name) / 'clone'
        shutil.copytree(self.repo, clone,
                        ignore=shutil.ignore_patterns('.wiki'))
        rc, imported, _ = self.run_work('import', clone, '--file', out)
        self.assertEqual(rc, 0, imported)
        self.assertEqual(len(imported['imported_jobs']),
                         len(archive['jobs']))
        con = sqlite3.connect(clone / '.wiki/work/jobs.sqlite')
        rows = con.execute('SELECT COUNT(*) FROM jobs').fetchone()[0]
        accepted = con.execute(
            "SELECT COUNT(*) FROM jobs WHERE status='accepted'").fetchone()[0]
        con.close()
        self.assertEqual(rows, len(archive['jobs']))
        self.assertGreaterEqual(accepted, 1)
        # the relocated queue keeps working: next leases the remaining job
        rc, nxt, _ = self.run_work('next', clone)
        self.assertEqual(rc, 0, nxt)
        self.assertIsNotNone(nxt['job'])
        # evidence packets travel with the archive
        packets = list((clone / '.wiki/work/evidence').glob('*.json'))
        self.assertEqual(len(packets), len(
            list((self.repo / '.wiki/work/evidence').glob('*.json'))))

    def test_import_skips_conflicting_newer_rows_by_name(self):
        self.discover()
        self.plan()
        out = Path(self.temp.name) / 'archive.json'
        self.run_work('export', self.repo, '--out', out)
        # locally advance one job after the export
        con = sqlite3.connect(self.jobs_db())
        con.execute("UPDATE jobs SET updated_epoch=9999999999 WHERE id=("
                    "SELECT id FROM jobs LIMIT 1)")
        con.commit()
        con.close()
        rc, imported, _ = self.run_work('import', self.repo, '--file', out)
        self.assertEqual(rc, 0, imported)
        self.assertEqual(len(imported['skipped']), 1)
        self.assertTrue(imported['skipped'][0]['job'])
        self.assertIn('newer', imported['skipped'][0]['reason'])

    def test_import_rejects_foreign_repository_identity(self):
        self.discover()
        self.plan()
        out = Path(self.temp.name) / 'archive.json'
        self.run_work('export', self.repo, '--out', out)
        other = Path(self.temp.name) / 'other-repo'
        other.mkdir()
        (other / 'src').mkdir()
        (other / 'src/core.py').write_text(
            'def totally_different():\n    pass\n', encoding='utf-8')
        rc, data, _ = self.run_work('import', other, '--file', out)
        self.assertNotEqual(rc, 0)
        self.assertIn('identity', data['error'])


class CoverageTests(Fixture):
    def test_coverage_reports_three_measures_with_denominators(self):
        self.discover()
        self.plan()
        rc, cov, _ = self.run_work('coverage', self.repo, '--json')
        self.assertEqual(rc, 0, cov)
        for measure in ('inventory', 'explanation', 'review'):
            self.assertIn(measure, cov)
            self.assertIn('covered', cov[measure])
            self.assertIn('denominator', cov[measure])
        self.assertGreater(cov['inventory']['denominator'], 0)
        self.assertIn('exclusions', cov)

    def test_coverage_surfaces_rejected_job_as_blocked_area(self):
        self.discover()
        self.plan()
        rc, leased, _ = self.next_job()
        job = leased['job']
        cand = Path(self.temp.name) / 'c.json'
        cand.write_text(json.dumps(self.candidate()), encoding='utf-8')
        self.run_work('submit', self.repo, '--job', job, '--candidate', cand)
        findings = Path(self.temp.name) / 'f.json'
        findings.write_text(json.dumps({'findings': ['no'],
                                        'evidence_ids': []}), encoding='utf-8')
        self.run_work('review', self.repo, '--job', job,
                      '--decision', 'rejected', '--findings', findings)
        rc, cov, _ = self.run_work('coverage', self.repo, '--json')
        blocked_jobs = [b['job'] for b in cov['blocked_areas']]
        self.assertIn(job, blocked_jobs)

    def test_coverage_text_mode_is_readable(self):
        self.discover()
        self.plan()
        proc = subprocess.run(
            [PY, str(WORK), 'coverage', str(self.repo)],
            capture_output=True, text=True)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('inventory:', proc.stdout)
        self.assertIn('explanation:', proc.stdout)
        self.assertIn('review:', proc.stdout)


class ShellWrapperTests(Fixture):
    def sh(self, *args):
        return subprocess.run(
            ['bash', str(WIKI_SH)] + [str(a) for a in args],
            capture_output=True, text=True, cwd=str(self.repo))

    def test_wiki_sh_work_plan_and_next(self):
        mapping = self.simple_map()
        path = Path(self.temp.name) / 'map.json'
        path.write_text(json.dumps(mapping), encoding='utf-8')
        proc = self.sh('work', 'plan', self.repo, '--map', path)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(json.loads(proc.stdout)['created'])
        proc = self.sh('work', 'next', self.repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIsNotNone(json.loads(proc.stdout)['job'])

    def test_wiki_sh_work_release_and_requeue(self):
        mapping = self.simple_map(caps=(('cap-alpha', 'a'),))
        path = Path(self.temp.name) / 'map.json'
        path.write_text(json.dumps(mapping), encoding='utf-8')
        self.assertEqual(self.sh('work', 'plan', self.repo,
                                 '--map', path).returncode, 0)
        proc = self.sh('work', 'next', self.repo)
        job = json.loads(proc.stdout)['job']
        proc = self.sh('work', 'release', self.repo, '--job', job)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertEqual(json.loads(proc.stdout)['status'], 'queued')
        # requeue routes through the wrapper too: refusal on a queued job
        # must come back as exit 2 JSON, not a usage error
        proc = self.sh('work', 'requeue', self.repo, '--job', job,
                       '--reason', 'wrapper probe')
        self.assertEqual(proc.returncode, 2, proc.stderr)
        self.assertIn('accepted', json.loads(proc.stdout)['error'])

    def test_wiki_sh_migrate_wrapper(self):
        import hashlib
        digest = hashlib.sha256(
            (self.repo / 'src/core.py').read_bytes()).hexdigest()
        doc = {'version': 1, 'overview': {}, 'capabilities': [{
            'fid': 'cap-x', 'name': 'X', 'status': 'dev',
            'status_reason': 'r', 'description': 'd', 'purpose': 'p',
            'sources': [{'path': 'src/core.py', 'line': 1, 'claim': 'c',
                         'sha256': digest}],
            'flow': [{'title': 'Run', 'detail': 'calls run_check',
                      'source': 'src/core.py'}],
            'failures': ['None known.'],
            'change_guidance': ['Edit src/core.py.']}],
            'entities': []}
        self.write('readme/wiki/knowledge.json', json.dumps(doc))
        proc = self.sh('migrate', self.repo, '--to', '2')
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertTrue(json.loads(proc.stdout)['migrated'])

    def test_wiki_sh_coverage_wrapper(self):
        self.discover()
        proc = self.sh('coverage', self.repo)
        self.assertEqual(proc.returncode, 0, proc.stderr)
        self.assertIn('inventory:', proc.stdout)


class SchemaTests(Fixture):
    def test_jobs_sqlite_matches_contract_tables(self):
        self.plan()
        tables = {r[0] for r in self.sql(
            "SELECT name FROM sqlite_master WHERE type='table'")}
        for table in ('jobs', 'attempts', 'reviews', 'promotions'):
            self.assertIn(table, tables)
        job_cols = [r[1] for r in self.sql('PRAGMA table_info(jobs)')]
        self.assertEqual(job_cols, [
            'id', 'type', 'question', 'scope', 'priority', 'dependencies',
            'input_revision', 'budget_json', 'evidence_ids',
            'candidate_path', 'status', 'lease_owner',
            'lease_expires_epoch', 'attempt_count', 'blocked_reason',
            'blocked_on', 'created_epoch', 'updated_epoch'])
        for table, cols in (
                ('attempts', ['id', 'job_id', 'lease_owner', 'started_epoch',
                              'ended_epoch', 'outcome', 'evidence_ids',
                              'bytes_delivered', 'candidate_path',
                              'checkpoint_path']),
                ('reviews', ['id', 'job_id', 'attempt_id', 'decision',
                             'findings', 'evidence_ids', 'reviewer_epoch']),
                ('promotions', ['id', 'job_id', 'attempt_id', 'state',
                                'plan_json', 'backup_paths', 'epoch'])):
            self.assertEqual([r[1] for r in
                              self.sql('PRAGMA table_info(%s)' % table)],
                             cols, table)

    def test_job_types_and_ids_match_contract(self):
        mapping = {
            'version': 1,
            'domains': [{'id': 'dom-1', 'name': 'D', 'purpose': 'p',
                         'capabilities': ['cap-alpha'], 'entities': [],
                         'shared_contracts': [], 'unknowns': []}],
            'capabilities': [{'id': 'cap-alpha', 'name': 'A'}],
            'questions': [{'question': 'Why does checkout fail?'}]}
        rc, data, _ = self.plan(mapping)
        self.assertEqual(rc, 0, data)
        types = dict(self.sql('SELECT type, COUNT(*) FROM jobs GROUP BY type'))
        self.assertEqual(types, {'plan': 1, 'author': 1, 'synthesize': 1})
        ids = [j[0] for j in self.sql('SELECT id FROM jobs')]
        for job_id in ids:
            kind, _, number = job_id.rpartition('-')
            self.assertTrue(kind)
            self.assertTrue(number.isdigit())


if __name__ == '__main__':
    unittest.main(verbosity=2)
