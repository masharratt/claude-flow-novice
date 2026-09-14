"""Reader-model regressions. All generated data stays in temporary repositories."""
import copy
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
LIB = ROOT / '.claude/skills/cfn-wiki/lib'
sys.path.insert(0, str(LIB))
from knowledge import load_knowledge, model, digest


def call(name, func, *args):
    result = subprocess.run(['bash', '-c', 'source "$1"; shift; "$@"', '_', str(LIB / name), func, *map(str, args)], capture_output=True, text=True)
    if result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result.stdout


class WikiKnowledge(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='wiki-knowledge-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        (self.repo / 'api').mkdir()
        (self.repo / 'api/server.py').write_text('def execute():\n    return "done"\n')
        self.source = self.repo / 'api/server.py'
        self.store = self.repo / '.wiki/store.json'
        self.knowledge = self.repo / 'readme/wiki/knowledge.json'
        self.knowledge.parent.mkdir(parents=True)
        self.doc = {'version':1,'capabilities':[{'fid':'task-result','name':'Check task results','status':'beta','status_reason':'Fixture verified.', 'description':'Check a task.', 'purpose':'Decide whether work completed.', 'sources':[{'path':'api/server.py','line':1,'claim':'Returns the result.', 'sha256':digest(self.source)}], 'flow':[{'title':'Execute','detail':'Returns done.','source':'api/server.py'}], 'failures':['Missing results remain unresolved.'], 'change_guidance':['Change execute and its tests.']}], 'entities':[{'name':'Task result','capability':'task-result','source':'api/server.py:1','states':['queued','done'],'transitions':[{'from':'queued','to':'done','trigger':'execute','guard':'result exists'}]}]}
        self.knowledge.write_text(json.dumps(self.doc))
        call('extract-features.sh','wiki_extract',self.repo)
    def generate(self):
        call('gen-projections.sh','wiki_gen_projections',self.store,self.repo)
        call('gen-pages.sh','wiki_gen_pages',self.store,self.repo)
    def test_real_entities_replace_maturity_lifecycles(self):
        self.generate()
        state=json.loads(call('view-state.sh','wiki_view_state',self.store))
        self.assertEqual([e['name'] for e in state['entities']],['Task result'])
        self.assertEqual(state['entities'][0]['states'],['queued','done'])
    def test_appendix_does_not_contaminate_last_entity(self):
        self.generate()
        path=self.repo/'readme/state-machines.md'
        with path.open('a') as f:
            f.write('\n## Appendix. Legacy\n**Source:** wrong.py:1\n### States\n| State | Meaning |\n|---|---|\n| unrelated | bad |\n')
        state=json.loads(call('view-state.sh','wiki_view_state',self.store))
        self.assertEqual(state['entities'][0]['states'],['queued','done'])
        self.assertEqual(state['entities'][0]['source'],'api/server.py:1')
    def test_content_edit_invalidates_but_preserves_explanation(self):
        before=json.loads(self.store.read_text())['meta']['fingerprint']
        self.source.write_text('def execute():\n    return "failed"\n')
        call('extract-features.sh','wiki_extract',self.repo)
        self.assertNotEqual(before,json.loads(self.store.read_text())['meta']['fingerprint'])
        cap=model(self.store)['features'][0]
        self.assertTrue(cap['needs_review'])
        self.assertEqual(cap['flow'][0]['detail'],'Returns done.')
    def test_crlf_worktree_does_not_flag_needs_review(self):
        # Regression (CI red 2026-09-14): verify_sources hashed WORKTREE
        # bytes, so a CRLF worktree over LF blobs flagged reviewed sources
        # as changed on some machines and not others. Freshness must
        # compare the recorded hash against the git blob.
        import knowledge as K
        for args in (['git','-C',str(self.repo),'init','-q'],
                     ['git','-C',str(self.repo),'add','api/server.py'],
                     ['git','-C',str(self.repo),'-c','user.email=t@e.c',
                      '-c','user.name=T','commit','-qm','x']):
            subprocess.run(args, check=True, capture_output=True)
        blob = subprocess.run(['git','-C',str(self.repo),'show','HEAD:api/server.py'],capture_output=True,check=True).stdout
        src = {'path':'api/server.py','line':1,'claim':'Returns the result.',
               'sha256':hashlib.sha256(blob).hexdigest()}
        self.source.write_bytes(blob.replace(b'\n', b'\r\n'))
        K.verify_sources(self.repo, 'task-result', [src])
        self.assertFalse(src['needs_review'],
                         'CRLF worktree over LF blob must not flag the source')
    def test_markdown_and_portal_agree_on_status(self):
        self.generate()
        cap=model(self.store)['features'][0]
        self.assertEqual(cap['status'],'beta')
        self.assertIn('| Check task results | beta |',(self.repo/'readme/feature-status.md').read_text())
        self.assertIn('**Status:** beta',(self.repo/'readme/wiki/task-result/wiki.md').read_text())
    def test_resolved_prose_wins_over_import_source(self):
        p=self.repo/'.wiki/enrich/blocks';p.mkdir(parents=True)
        (p/'api.md').write_text('**Status:** stub\n**Description:** Old import\n')
        self.generate()
        f=self.repo/'readme/feature-status.md'
        f.write_text(f.read_text().replace('**Status:** stub','**Status:** beta').replace('**Description:** Old import','**Description:** Corrected explanation'))
        call('gen-projections.sh','wiki_gen_projections',self.store,self.repo)
        feature=next(f for f in model(self.store)['features'] if f['fid']=='api')
        self.assertEqual(feature['description'],'Corrected explanation')
        self.assertEqual(feature['status'],'beta')
    def test_source_change_does_not_erase_legacy_prose(self):
        p=self.repo/'.wiki/enrich/blocks';p.mkdir(parents=True)
        (p/'api.md').write_text('**Description:** Carefully reviewed behavior\n')
        self.generate()
        self.source.write_text('def execute():\n    return "changed"\n')
        call('extract-features.sh','wiki_extract',self.repo)
        self.generate(); self.generate()
        feature=next(f for f in model(self.store)['features'] if f['fid']=='api')
        self.assertEqual(feature['description'],'Carefully reviewed behavior')
        self.assertTrue(feature['needs_review'])
    def test_without_authored_states_no_fake_models(self):
        self.knowledge.unlink()
        self.generate()
        self.assertEqual(json.loads(call('view-state.sh','wiki_view_state',self.store))['entities'],[])
    def test_invalid_transition_rejected(self):
        self.doc['entities'][0]['transitions'][0]['to']='invented'
        self.knowledge.write_text(json.dumps(self.doc))
        with self.assertRaises(ValueError): load_knowledge(self.repo)
    def test_missing_source_flagged(self):
        self.source.unlink()
        self.assertTrue(load_knowledge(self.repo)['capabilities'][0]['needs_review'])
    def test_escaping_source_rejected(self):
        self.doc['capabilities'][0]['sources'][0]['path']='../secret'
        self.knowledge.write_text(json.dumps(self.doc))
        with self.assertRaises(ValueError): load_knowledge(self.repo)
    def test_notes_do_not_silently_become_facts(self):
        (self.repo/'.wiki/annotations.json').write_text(json.dumps({'annotations':{'feature:task-result':{'note':'This is prod now'}}}))
        self.assertEqual(model(self.store)['features'][0]['status'],'beta')
    def test_authored_evidence_present_in_reader_payload(self):
        cap=model(self.store)['features'][0]
        self.assertIn('def execute',cap['sources'][0]['excerpt'])
        self.assertTrue(cap['change_guidance'])
    def test_knowledge_edit_invalidates_store(self):
        before=json.loads(self.store.read_text())['meta']['fingerprint']
        self.doc['capabilities'][0]['purpose']='An improved explanation.'
        self.knowledge.write_text(json.dumps(self.doc))
        call('extract-features.sh','wiki_extract',self.repo)
        self.assertNotEqual(before,json.loads(self.store.read_text())['meta']['fingerprint'])

REAL_KNOWLEDGE = ROOT / 'readme' / 'wiki' / 'knowledge.json'


class WikiKnowledgeV2(unittest.TestCase):
    """Version 2 shard loading and explicit migration."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='wiki-knowledge2-')
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        (self.repo / 'api').mkdir()
        self.source = self.repo / 'api/server.py'
        self.source.write_text('def execute():\n    return "done"\n')
        self.knowledge = self.repo / 'readme/wiki/knowledge.json'
        self.knowledge.parent.mkdir(parents=True)

    def v1_doc(self):
        return {'version': 1, 'overview': {'title': 'T', 'summary': 's',
                                          'coverage': 'c', 'questions': ['q']},
                'capabilities': [{
                    'fid': 'task-result', 'name': 'Check task results',
                    'status': 'beta', 'status_reason': 'Fixture verified.',
                    'description': 'Check a task.', 'purpose': 'Decide.',
                    'reviewed_at': '2026-09-13',
                    'dependencies': 'Bash.',
                    'sources': [{'path': 'api/server.py', 'line': 1,
                                 'claim': 'Returns the result.',
                                 'sha256': digest(self.source)}],
                    'flow': [{'title': 'Execute', 'detail': 'Returns done.',
                              'source': 'api/server.py'}],
                    'failures': ['Missing results remain unresolved.'],
                    'change_guidance': ['Change execute and its tests.']}],
                'entities': [{
                    'name': 'Task result', 'capability': 'task-result',
                    'source': 'api/server.py:1', 'states': ['queued', 'done'],
                    'transitions': [{'from': 'queued', 'to': 'done',
                                     'trigger': 'execute',
                                     'guard': 'result exists'}]}]}

    def migrate(self):
        from knowledge import migrate_to_v2
        return migrate_to_v2(self.repo)

    def test_migration_preserves_ids_and_text_verbatim(self):
        doc = self.v1_doc()
        self.knowledge.write_text(json.dumps(doc))
        result = self.migrate()
        self.assertTrue(result['migrated'])
        manifest = json.loads(self.knowledge.read_text())
        self.assertEqual(manifest['version'], 2)
        self.assertEqual(manifest['capabilities'], ['task-result'])
        self.assertEqual(manifest['entities'], ['task-result-entity'])
        self.assertEqual(manifest['domains'], [])
        self.assertEqual(manifest['overview'], doc['overview'])
        shard = json.loads((self.repo / 'readme/wiki/capabilities'
                            '/task-result.json').read_text())
        original = doc['capabilities'][0]
        for key in ('fid', 'name', 'status', 'status_reason', 'description',
                    'purpose', 'reviewed_at', 'dependencies', 'flow',
                    'failures', 'change_guidance'):
            self.assertEqual(shard[key], original[key], key)
        self.assertEqual([(s['path'], s['line'], s['claim'], s['sha256'])
                          for s in shard['sources']],
                         [(s['path'], s['line'], s['claim'], s['sha256'])
                          for s in original['sources']])
        entity = json.loads((self.repo / 'readme/wiki/entities'
                             '/task-result-entity.json').read_text())
        self.assertEqual(entity['name'], doc['entities'][0]['name'])
        self.assertEqual(entity['states'], ['queued', 'done'])
        self.assertEqual(entity['transitions'],
                         doc['entities'][0]['transitions'])
        self.assertEqual(entity['capability_refs'], ['task-result'])

    def test_cfn_task_verification_survives_byte_for_byte(self):
        # The original v1 exemplar never existed in committed history (the
        # v2 migration landed in the same commit that first tracked the
        # file); the migration backup is frozen as a fixture so this test
        # no longer depends on the live repository's knowledge version.
        # Every cited source file is copied from the repository so the
        # stored hashes apply.
        fixture = ROOT / 'tests/fixtures/wiki-knowledge/knowledge-v1.json'
        raw = json.loads(fixture.read_text())
        for cap in raw['capabilities']:
            for src in cap['sources']:
                target = self.repo / src['path']
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes((ROOT / src['path']).read_bytes())
        self.knowledge.write_bytes(fixture.read_bytes())
        v1 = load_knowledge(self.repo)
        result = self.migrate()
        self.assertTrue(result['migrated'])
        v2 = load_knowledge(self.repo)
        self.assertEqual(v2['version'], 2)
        self.assertEqual(len(v2['capabilities']), 1)
        before, after = v1['capabilities'][0], v2['capabilities'][0]
        for key in ('fid', 'name', 'status', 'status_reason', 'description',
                    'purpose', 'reviewed_at', 'dependencies', 'files',
                    'needs_review', 'entrypoints'):
            self.assertEqual(after[key], before[key], key)
        self.assertEqual([(s['path'], s['line'], s['claim'], s['sha256'])
                          for s in after['sources']],
                         [(s['path'], s['line'], s['claim'], s['sha256'])
                          for s in before['sources']])
        self.assertEqual([(s['title'], s['detail'], s['source'])
                          for s in after['flow']],
                         [(s['title'], s['detail'], s['source'])
                          for s in before['flow']])
        self.assertEqual(v2['entities'][0]['states'],
                         v1['entities'][0]['states'])
        self.assertEqual(v2['entities'][0]['transitions'],
                         v1['entities'][0]['transitions'])
        self.assertEqual(v2['entities'][0]['source'],
                         v1['entities'][0]['source'])

    def test_migration_backs_up_v1_and_is_idempotent(self):
        doc = self.v1_doc()
        raw = json.dumps(doc)
        self.knowledge.write_text(raw)
        first = self.migrate()
        self.assertTrue(first['migrated'])
        backup = Path(first['backup'])
        self.assertTrue(backup.exists())
        self.assertEqual(backup.read_text(), raw)
        self.assertTrue(backup.parent == self.repo / '.wiki' / 'backups')
        second = self.migrate()
        self.assertFalse(second['migrated'])
        self.assertIn('already', second['reason'])
        manifest = json.loads(self.knowledge.read_text())
        self.assertEqual(manifest['version'], 2)

    def test_migration_refuses_invalid_v1_and_writes_nothing(self):
        doc = self.v1_doc()
        doc['capabilities'][0]['status'] = 'shipped'
        raw = json.dumps(doc)
        self.knowledge.write_text(raw)
        with self.assertRaises(ValueError):
            self.migrate()
        self.assertEqual(self.knowledge.read_text(), raw)
        self.assertFalse((self.repo / 'readme/wiki/capabilities').exists())

    def test_v1_path_loads_unchanged_without_mutation(self):
        raw = json.dumps(self.v1_doc())
        self.knowledge.write_text(raw)
        doc = load_knowledge(self.repo)
        self.assertEqual(doc['version'], 1)
        self.assertEqual(self.knowledge.read_text(), raw)

    def write_manifest(self, capabilities, entities=(), domains=()):
        manifest = {'version': 2,
                    'overview': {'title': 'T', 'summary': 's',
                                 'coverage': 'c', 'questions': []},
                    'domains': list(domains), 'capabilities': list(capabilities),
                    'entities': list(entities)}
        self.knowledge.write_text(json.dumps(manifest))

    def write_capability_shard(self, shard):
        path = self.repo / 'readme/wiki/capabilities' / (shard['id'] + '.json')
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(shard))

    def minimal_shard(self, shard_id='cap-a', fid=None):
        return {'id': shard_id, 'fid': fid or shard_id, 'name': 'A',
                'status': 'dev', 'status_reason': 'r', 'description': 'd',
                'purpose': 'p', 'reviewed_at': '2026-09-13',
                'dependencies': '', 'sources': [
                    {'path': 'api/server.py', 'line': 1, 'claim': 'c',
                     'sha256': digest(self.source)}],
                'evidence': [], 'domains': [], 'unknowns': []}

    def test_v2_loads_only_referenced_shards(self):
        self.write_manifest(['cap-a'])
        self.write_capability_shard(self.minimal_shard())
        # an unreferenced shard on disk is never loaded
        self.write_capability_shard(self.minimal_shard('cap-orphan'))
        doc = load_knowledge(self.repo)
        self.assertEqual(doc['version'], 2)
        self.assertEqual([c['fid'] for c in doc['capabilities']], ['cap-a'])
        self.assertEqual(doc['capabilities'][0]['kind'], 'capability')
        self.assertFalse(doc['capabilities'][0]['needs_review'])

    def test_v2_rejects_duplicate_ids_everywhere(self):
        self.write_manifest(['cap-a', 'cap-a'])
        self.write_capability_shard(self.minimal_shard())
        with self.assertRaises(ValueError) as ctx:
            load_knowledge(self.repo)
        self.assertIn('cap-a', str(ctx.exception))
        self.write_manifest(['cap-a'])
        self.write_capability_shard(self.minimal_shard())
        # same id reused across collections is also a duplicate
        entity = {'id': 'cap-a', 'name': 'E', 'source': 'api/server.py:1',
                  'states': ['queued'], 'transitions': [],
                  'capability_refs': ['cap-a']}
        path = self.repo / 'readme/wiki/entities/cap-a.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(entity))
        manifest = json.loads(self.knowledge.read_text())
        manifest['entities'] = ['cap-a']
        self.knowledge.write_text(json.dumps(manifest))
        with self.assertRaises(ValueError) as ctx:
            load_knowledge(self.repo)
        self.assertIn('cap-a', str(ctx.exception))

    def test_v2_rejects_escaping_references(self):
        self.write_manifest(['../escape'])
        with self.assertRaises(ValueError) as ctx:
            load_knowledge(self.repo)
        self.assertIn('../escape', str(ctx.exception))
        self.write_manifest(['sub/door'])
        with self.assertRaises(ValueError):
            load_knowledge(self.repo)

    def test_v2_rejects_manifest_id_missing_on_disk(self):
        self.write_manifest(['cap-missing'])
        with self.assertRaises(ValueError) as ctx:
            load_knowledge(self.repo)
        self.assertIn('cap-missing', str(ctx.exception))

    def test_v2_rejects_shard_id_mismatch(self):
        self.write_manifest(['cap-a'])
        shard = self.minimal_shard()
        shard['id'] = 'cap-b'
        self.write_capability_shard(shard)
        with self.assertRaises(ValueError):
            load_knowledge(self.repo)

    def test_v2_rejects_domain_referencing_unknown_capability(self):
        self.write_manifest(['cap-a'], domains=['dom-1'])
        self.write_capability_shard(self.minimal_shard())
        domain = {'id': 'dom-1', 'name': 'D', 'purpose': 'p',
                  'capabilities': ['cap-ghost'], 'entities': [],
                  'shared_contracts': [], 'unknowns': []}
        path = self.repo / 'readme/wiki/domains/dom-1.json'
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(domain))
        with self.assertRaises(ValueError) as ctx:
            load_knowledge(self.repo)
        self.assertIn('cap-ghost', str(ctx.exception))

    def test_v2_domain_and_entity_resolution(self):
        shard = self.minimal_shard('cap-a')
        self.write_manifest(['cap-a'], entities=['ent-a'], domains=['dom-1'])
        self.write_capability_shard(shard)
        entity = {'id': 'ent-a', 'name': 'Task result',
                  'source': 'api/server.py:1', 'states': ['queued', 'done'],
                  'transitions': [{'from': 'queued', 'to': 'done',
                                   'trigger': 'execute',
                                   'guard': 'result exists'}],
                  'capability_refs': ['cap-a']}
        (self.repo / 'readme/wiki/entities').mkdir(parents=True)
        (self.repo / 'readme/wiki/entities/ent-a.json').write_text(
            json.dumps(entity))
        domain = {'id': 'dom-1', 'name': 'D', 'purpose': 'p',
                  'capabilities': ['cap-a'], 'entities': ['ent-a'],
                  'shared_contracts': [{'id': 'sc-1', 'name': 'Contract',
                                        'canonical_ref': 'api/server.py:1'}],
                  'unknowns': ['how retries behave']}
        (self.repo / 'readme/wiki/domains').mkdir(parents=True)
        (self.repo / 'readme/wiki/domains/dom-1.json').write_text(
            json.dumps(domain))
        doc = load_knowledge(self.repo)
        self.assertEqual(doc['domains'][0]['id'], 'dom-1')
        self.assertEqual(doc['entities'][0]['states'], ['queued', 'done'])
        self.assertEqual(doc['entities'][0]['capability'], 'cap-a')
        self.assertEqual(doc['capabilities'][0]['needs_review'], False)

    def test_v2_capability_without_flow_gets_empty_entrypoints(self):
        shard = self.minimal_shard('cap-a')
        self.write_manifest(['cap-a'])
        self.write_capability_shard(shard)
        doc = load_knowledge(self.repo)
        cap = doc['capabilities'][0]
        self.assertEqual(cap['flow'], [])
        self.assertEqual(cap['entrypoints'], [])
        from knowledge import capability_markdown
        self.assertIn('## Purpose', capability_markdown(cap))

    def test_v2_source_hash_mismatch_flags_review_not_error(self):
        self.write_manifest(['cap-a'])
        shard = self.minimal_shard()
        shard['sources'][0]['sha256'] = '0' * 64
        self.write_capability_shard(shard)
        doc = load_knowledge(self.repo)
        self.assertTrue(doc['capabilities'][0]['needs_review'])

    def test_v2_loader_rejects_missing_required_fields(self):
        self.write_manifest(['cap-a'])
        shard = self.minimal_shard()
        del shard['purpose']
        self.write_capability_shard(shard)
        with self.assertRaises(ValueError) as ctx:
            load_knowledge(self.repo)
        self.assertIn('purpose', str(ctx.exception))


if __name__ == '__main__': unittest.main(verbosity=2)
