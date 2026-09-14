"""Shared model for authored capabilities and legacy directory enrichment."""
import hashlib
import json
import os
import shutil
import time
from pathlib import Path
import re
import subprocess

STATUSES = ('prod', 'beta', 'dev', 'stub', 'deprecated')
KNOWLEDGE_PATH = 'readme/wiki/knowledge.json'


def digest(path):
    try:
        return hashlib.sha256(Path(path).read_bytes()).hexdigest()
    except OSError:
        return 'missing'


def source_path(repo, name):
    path = (repo / name).resolve()
    if not path.is_relative_to(repo.resolve()) or Path(name).is_absolute():
        raise ValueError('wiki source must be inside repository: ' + name)
    return path


def load_knowledge(repo):
    path = Path(repo) / KNOWLEDGE_PATH
    if not path.exists():
        return {'version': 1, 'capabilities': [], 'entities': []}
    doc = json.loads(path.read_text())
    version = doc.get('version')
    if version == 2:
        return _load_v2(repo, doc)
    if version != 1:
        raise ValueError('unsupported wiki knowledge version')
    return _load_v1(repo, doc)


def canonical_digest(repo, rel):
    """Hash the git index blob for a tracked path: identical bytes on
    every machine for the same commit. Worktree bytes can differ from the
    blob via CRLF normalization or unstaged edits, which made freshness
    machine-dependent (CI red 2026-09-14). Falls back to the worktree
    read for non-git repos and untracked paths."""
    try:
        blob = subprocess.run(
            ['git', '-C', str(repo), 'cat-file', 'blob', ':%s' % rel],
            capture_output=True, check=True).stdout
        return hashlib.sha256(blob).hexdigest()
    except (OSError, subprocess.CalledProcessError):
        return digest(Path(repo) / rel)


def verify_sources(repo, fid, sources):
    """Verify authored sources against the canonical (committed) content.
    Mutates each source dict with needs_review and excerpt; returns the
    evidence dict keyed by path. Shared by the version 1 and version 2
    loaders."""
    evidence = {}
    for src in sources:
        if not isinstance(src.get('line'), int) or src['line'] < 1 or not src.get('claim'):
            raise ValueError(fid + ': source requires positive line and claim')
        if not re.fullmatch(r'[0-9a-f]{64}', src.get('sha256', '')):
            raise ValueError(fid + ': source requires reviewed sha256')
        path = source_path(Path(repo), src['path'])
        current = canonical_digest(repo, src['path'])
        src['needs_review'] = current != src['sha256']
        if current != 'missing' and src['line'] > len(path.read_text(errors='replace').splitlines()):
            src['needs_review'] = True
        if current != 'missing':
            lines = path.read_text(errors='replace').splitlines()
            start = max(0, src['line'] - 1)
            src['excerpt'] = '\n'.join(f'{i + 1}: {lines[i]}' for i in range(start, min(start + 24, len(lines))))
        evidence[src['path']] = src
    return evidence


def verify_flow(repo, fid, flow, evidence):
    """Validate flow steps and attach line defaults plus excerpts."""
    for step in flow:
        if not step.get('title') or not step.get('detail') or step.get('source') not in evidence:
            raise ValueError(fid + ': flow needs title, detail and cited source')
    for step in flow:
        step.setdefault('line', evidence[step['source']]['line'])
        if not isinstance(step['line'], int) or step['line'] < 1:
            raise ValueError(fid + ': flow source line must be positive')
        path = source_path(Path(repo), step['source'])
        if path.exists():
            lines = path.read_text(errors='replace').splitlines()
            start = step['line'] - 1
            if start >= len(lines): evidence[step['source']]['needs_review'] = True
            step['excerpt'] = '\n'.join(f'{i + 1}: {lines[i]}' for i in range(start, min(start + 24, len(lines))))


def normalize_capability(repo, c):
    """Shared v1/v2 normalization: verified sources, flow excerpts,
    needs_review, files, kind and entrypoints. Version 2 capabilities may
    carry an empty flow; entrypoints then stay empty."""
    evidence = verify_sources(repo, c['fid'], c['sources'])
    flow = c.get('flow') or []
    verify_flow(repo, c['fid'], flow, evidence)
    c['flow'] = flow
    c['needs_review'] = any(s['needs_review'] for s in c['sources'])
    c['files'] = sorted(evidence)
    c['kind'] = 'capability'
    c['entrypoints'] = [flow[0]['source']] if flow else []
    return c


def _load_v1(repo, doc):
    ids = set()
    for c in doc.get('capabilities', []):
        fid = c.get('fid', '')
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', fid) or fid in ids:
            raise ValueError('invalid or duplicate capability id: ' + fid)
        ids.add(fid)
        for key in ('name', 'description', 'purpose', 'status', 'status_reason', 'sources', 'flow', 'failures', 'change_guidance'):
            if not c.get(key):
                raise ValueError(fid + ': missing ' + key)
        if c['status'] not in STATUSES:
            raise ValueError(fid + ': invalid status')
        normalize_capability(repo, c)
    doc.setdefault('entities', [])
    for e in doc['entities']:
        if e.get('capability') not in ids or not e.get('name') or not e.get('source'):
            raise ValueError('entity requires capability, name and source')
        path, separator, line = e['source'].rpartition(':')
        cap = next(c for c in doc['capabilities'] if c['fid'] == e['capability'])
        if not separator or not line.isdigit() or int(line) < 1 or path not in cap['files']:
            raise ValueError(e['name'] + ': entity source must cite a capability source at a positive line')
        states = e.get('states', [])
        if not states or not e.get('transitions'):
            raise ValueError(e['name'] + ': missing states or transitions')
        for t in e['transitions']:
            if t.get('from') not in states + ['[*]'] or t.get('to') not in states + ['[*]']:
                raise ValueError(e['name'] + ': unknown transition state')
            if not t.get('trigger') or not t.get('guard'):
                raise ValueError(e['name'] + ': transition needs trigger and guard')
    return doc


V2_COLLECTIONS = ('domains', 'capabilities', 'entities')
SHARD_ID = re.compile(r'[A-Za-z0-9._-]+')


def shard_path(repo, collection, ref):
    return Path(repo) / 'readme' / 'wiki' / collection / (ref + '.json')


def _load_v2_shards(repo, doc, base):
    """Load exactly the shards the manifest references. Duplicate ids,
    escaping references and missing shards are hard errors naming the id."""
    seen = {}
    shards = {collection: [] for collection in V2_COLLECTIONS}
    for collection in V2_COLLECTIONS:
        refs = doc.get(collection, [])
        if not isinstance(refs, list):
            raise ValueError('manifest %s must be a list of ids' % collection)
        for ref in refs:
            if not isinstance(ref, str) or not SHARD_ID.fullmatch(ref):
                raise ValueError('invalid %s shard reference (separators are not allowed): %r'
                                 % (collection, ref))
            if ref in seen:
                raise ValueError('duplicate id in knowledge manifest: %s' % ref)
            path = base / collection / (ref + '.json')
            if not path.exists():
                raise ValueError('%s shard listed in the manifest but absent on disk: %s'
                                 % (collection, ref))
            try:
                shard = json.loads(path.read_text())
            except ValueError as exc:
                raise ValueError('%s shard %s is not valid JSON: %s' % (collection, ref, exc))
            if not isinstance(shard, dict):
                raise ValueError('%s shard %s must be a JSON object' % (collection, ref))
            if shard.get('id') != ref:
                raise ValueError('shard id mismatch: %s holds id %r' % (ref, shard.get('id')))
            seen[ref] = collection
            shards[collection].append(shard)
    return shards


def _validate_domain(domain, cap_ids, ent_ids):
    for key in ('id', 'name', 'purpose'):
        if not domain.get(key):
            raise ValueError('domain %s: missing %s' % (domain.get('id', '?'), key))
    for key in ('capabilities', 'entities', 'shared_contracts', 'unknowns'):
        if key not in domain:
            raise ValueError('domain %s: missing %s' % (domain['id'], key))
    for ref in domain['capabilities']:
        if ref not in cap_ids:
            raise ValueError('domain %s references unknown capability: %s' % (domain['id'], ref))
    for ref in domain['entities']:
        if ref not in ent_ids:
            raise ValueError('domain %s references unknown entity: %s' % (domain['id'], ref))
    for contract in domain['shared_contracts']:
        if not contract.get('id') or not contract.get('name') or not contract.get('canonical_ref'):
            raise ValueError('domain %s: shared contract requires id, name and canonical_ref'
                             % domain['id'])


def _validate_v2_capability(repo, shard, domain_ids):
    fid = shard.get('fid', '')
    if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', fid):
        raise ValueError('invalid capability id: ' + fid)
    for key in ('id', 'fid', 'name', 'status', 'status_reason', 'description',
                'purpose', 'reviewed_at', 'dependencies', 'sources',
                'evidence', 'domains', 'unknowns'):
        if key not in shard:
            raise ValueError(fid + ': missing ' + key)
    if shard['status'] not in STATUSES:
        raise ValueError(fid + ': invalid status')
    for ref in shard['domains']:
        if ref not in domain_ids:
            raise ValueError('%s references unknown domain: %s' % (fid, ref))
    normalize_capability(repo, shard)


def _validate_v2_entity(entity, cap_ids, capability_files):
    for key in ('id', 'name', 'source', 'states', 'transitions', 'capability_refs'):
        if key not in entity:
            raise ValueError('entity %s: missing %s' % (entity.get('name', '?'), key))
    refs = entity['capability_refs']
    if not refs or any(ref not in cap_ids for ref in refs):
        raise ValueError(entity['name'] + ': capability_refs must reference known capabilities')
    entity['capability'] = refs[0]  # normalized-model compatibility
    path, separator, line = entity['source'].rpartition(':')
    if not separator or not line.isdigit() or int(line) < 1 or path not in capability_files[refs[0]]:
        raise ValueError(entity['name'] + ': entity source must cite a capability source at a positive line')
    states = entity['states']
    if not states:
        raise ValueError(entity['name'] + ': missing states')
    for t in entity['transitions']:
        if t.get('from') not in states + ['[*]'] or t.get('to') not in states + ['[*]']:
            raise ValueError(entity['name'] + ': unknown transition state')
        if not t.get('trigger') or not t.get('guard'):
            raise ValueError(entity['name'] + ': transition needs trigger and guard')


def _load_v2(repo, doc, base=None):
    """Version 2 manifest plus explicitly referenced shards, normalized to
    the same model shape as version 1 (plus domains)."""
    repo = Path(repo)
    base = base if base is not None else repo / 'readme' / 'wiki'
    shards = _load_v2_shards(repo, doc, base)
    domain_ids = set(doc.get('domains', []))
    cap_ids, capability_files = set(), {}
    for shard in shards['capabilities']:
        _validate_v2_capability(repo, shard, domain_ids)
        cap_ids.add(shard['fid'])
        capability_files[shard['fid']] = set(shard['files'])
    for domain in shards['domains']:
        _validate_domain(domain, cap_ids, {e['id'] for e in shards['entities']})
    for entity in shards['entities']:
        _validate_v2_entity(entity, cap_ids, capability_files)
    return {'version': 2, 'overview': doc.get('overview', {}),
            'domains': shards['domains'], 'capabilities': shards['capabilities'],
            'entities': shards['entities']}


def entity_slug(name, taken):
    """Deterministic, collision-free shard id for a migrated entity."""
    slug = re.sub(r'[^a-z0-9]+', '-', str(name).lower()).strip('-') or 'entity'
    candidate = slug + '-entity'
    suffix = 2
    while candidate in taken:
        candidate = '%s-entity-%d' % (slug, suffix)
        suffix += 1
    return candidate


def migrate_to_v2(repo):
    """Explicit one-way migration of readme/wiki/knowledge.json to the
    sharded version 2 layout. Preserves all ids and text verbatim, backs
    the v1 file up under .wiki/backups/, validates before any replace and
    is idempotent (a second run reports a no-op)."""
    repo = Path(repo)
    path = repo / KNOWLEDGE_PATH
    if not path.exists():
        raise ValueError('no readme/wiki/knowledge.json to migrate')
    raw = path.read_bytes()
    doc = json.loads(raw.decode('utf-8'))
    if doc.get('version') == 2:
        return {'migrated': False,
                'reason': 'knowledge is already at version 2',
                'manifest': str(path)}
    if doc.get('version') != 1:
        raise ValueError('unsupported wiki knowledge version')
    _load_v1(repo, json.loads(raw.decode('utf-8')))  # validate before writing

    taken = set()
    capability_ids = []
    for capability in doc.get('capabilities', []):
        capability_ids.append(capability['fid'])
        taken.add(capability['fid'])
    entity_ids, entity_shards = [], []
    for entity in doc.get('entities', []):
        ref = entity_slug(entity.get('name', ''), taken)
        taken.add(ref)
        entity_ids.append(ref)
        entity_shards.append(dict(entity, id=ref,
                                  capability_refs=[entity['capability']]))
    capability_shards = []
    for capability in doc.get('capabilities', []):
        shard = dict(capability, id=capability['fid'])
        # v1 never required these fields; version 2 does. Empty labels are
        # added, existing text is never rewritten.
        shard.setdefault('reviewed_at', '')
        shard.setdefault('dependencies', '')
        shard.setdefault('evidence', [])
        shard.setdefault('domains', [])
        shard.setdefault('unknowns', [])
        capability_shards.append(shard)
    manifest = {'version': 2, 'overview': doc.get('overview', {}),
                'domains': [], 'capabilities': capability_ids,
                'entities': entity_ids}

    staging = repo / '.wiki' / 'work' / ('migrate-v2-%d' % os.getpid())
    if staging.exists():
        shutil.rmtree(staging)
    (staging / 'capabilities').mkdir(parents=True)
    (staging / 'entities').mkdir(parents=True)
    for shard in capability_shards:
        target = staging / 'capabilities' / (shard['id'] + '.json')
        target.write_text(json.dumps(shard, indent=2, ensure_ascii=True) + '\n',
                          encoding='utf-8')
    for shard in entity_shards:
        target = staging / 'entities' / (shard['id'] + '.json')
        target.write_text(json.dumps(shard, indent=2, ensure_ascii=True) + '\n',
                          encoding='utf-8')
    (staging / 'knowledge.json').write_text(
        json.dumps(manifest, indent=2, ensure_ascii=True) + '\n', encoding='utf-8')
    # validate the complete staged layout before touching the real tree
    _load_v2(repo, manifest, staging)

    backup_dir = repo / '.wiki' / 'backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    backup = backup_dir / ('knowledge-v1-%d.json' % int(time.time()))
    backup.write_bytes(raw)

    for shard in capability_shards:
        _replace_file(staging / 'capabilities' / (shard['id'] + '.json'),
                      repo / 'readme' / 'wiki' / 'capabilities' / (shard['id'] + '.json'))
    for shard in entity_shards:
        _replace_file(staging / 'entities' / (shard['id'] + '.json'),
                      repo / 'readme' / 'wiki' / 'entities' / (shard['id'] + '.json'))
    # the manifest moves last: an interrupted apply keeps a complete v1 model
    _replace_file(staging / 'knowledge.json', path)
    shutil.rmtree(staging, ignore_errors=True)
    return {'migrated': True, 'backup': str(backup),
            'capabilities': capability_ids, 'entities': entity_ids,
            'domains': []}


def _replace_file(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    os.replace(source, target)


def knowledge_state_digest(repo):
    """Digest over the knowledge manifest and every referenced shard. Used
    by promotion to detect concurrent knowledge edits since acceptance."""
    repo = Path(repo)
    parts = []
    path = repo / KNOWLEDGE_PATH
    if not path.exists():
        return hashlib.sha256(b'absent').hexdigest()
    parts.append(b'knowledge.json\0' + path.read_bytes())
    try:
        doc = json.loads(path.read_text())
    except ValueError:
        return hashlib.sha256(b'invalid').hexdigest()
    if doc.get('version') == 2:
        for collection in V2_COLLECTIONS:
            for ref in doc.get(collection, []):
                shard = shard_path(repo, collection, ref)
                payload = shard.read_bytes() if shard.exists() else b'missing'
                parts.append(('%s/%s\0' % (collection, ref)).encode('utf-8') + payload)
    return hashlib.sha256(b'\0'.join(parts)).hexdigest()


def plan_candidate_writes(repo, candidate):
    """Ordered write plan that applies a review-accepted candidate to
    readme/wiki/**. Version 2 targets get shard writes with the manifest
    last; version 1 targets get a merged single-file write. All generated
    paths stay inside readme/wiki/."""
    repo = Path(repo)
    for key in ('capabilities', 'entities', 'domains'):
        if not isinstance(candidate.get(key, []), list):
            raise ValueError('candidate %s must be a list' % key)
    path = repo / KNOWLEDGE_PATH
    doc = json.loads(path.read_text()) if path.exists() else {
        'version': 1, 'capabilities': [], 'entities': []}
    steps = []
    if doc.get('version') == 2:
        manifest = json.loads(json.dumps(doc))
        refs = {collection: list(manifest.get(collection, []))
                for collection in V2_COLLECTIONS}
        for collection in V2_COLLECTIONS:
            for entry in candidate.get(collection, []):
                if not isinstance(entry, dict):
                    raise ValueError('candidate %s entries must be objects' % collection)
                ref = entry.get('id') or entry.get('fid')
                if not ref or not SHARD_ID.fullmatch(str(ref)):
                    raise ValueError('candidate entry has an invalid id: %r' % (ref,))
                shard = dict(entry)
                shard['id'] = ref
                if collection == 'capabilities':
                    if 'fid' not in shard:
                        shard['fid'] = ref
                    shard.setdefault('evidence', [])
                    shard.setdefault('domains', [])
                    shard.setdefault('unknowns', [])
                if collection == 'entities' and 'capability_refs' not in shard \
                        and shard.get('capability'):
                    shard['capability_refs'] = [shard['capability']]
                steps.append({'path': 'readme/wiki/%s/%s.json' % (collection, ref),
                              'content': shard})
                if ref not in refs[collection]:
                    refs[collection].append(ref)
        if isinstance(candidate.get('overview'), dict):
            manifest['overview'] = candidate['overview']
        for collection in V2_COLLECTIONS:
            manifest[collection] = refs[collection]
        steps.append({'path': KNOWLEDGE_PATH, 'content': manifest})
    else:
        merged = json.loads(json.dumps(doc))
        by_fid = {c.get('fid'): c for c in merged.get('capabilities', [])}
        for entry in candidate.get('capabilities', []):
            if not isinstance(entry, dict) or not entry.get('fid'):
                raise ValueError('candidate capabilities need a fid')
            by_fid[entry['fid']] = entry
        merged['capabilities'] = list(by_fid.values())
        by_name = {e.get('name'): e for e in merged.get('entities', [])}
        for entry in candidate.get('entities', []):
            if not isinstance(entry, dict) or not entry.get('name'):
                raise ValueError('candidate entities need a name')
            by_name[entry['name']] = entry
        merged['entities'] = list(by_name.values())
        if isinstance(candidate.get('overview'), dict):
            merged['overview'] = candidate['overview']
        steps.append({'path': KNOWLEDGE_PATH, 'content': merged})
    for step in steps:
        normalized = step['path'].replace('\\', '/')
        if not normalized.startswith('readme/wiki/') or '..' in normalized.split('/'):
            raise ValueError('promotion writes must stay under readme/wiki/: ' + step['path'])
    return steps


def block_text(store_path, fid):
    base = Path(store_path).parent / 'enrich'
    for stage in ('resolved', 'extract', 'blocks'):
        p = base / stage / (fid + '.md')
        if p.exists():
            return p.read_text()
    return ''


def field(body, name, default=''):
    match = re.search(r'^\*\*' + re.escape(name) + r':\*\*\s*(.*?)$', body, re.M | re.I)
    return match[1].strip().strip('`') if match else default


def feature_fingerprint(f):
    value = {'fid': f['fid'], 'files': sorted(f.get('files', [])), 'entrypoints': sorted(f.get('entrypoints', []))}
    if 'content_hashes' in f:
        value['content_hashes'] = f['content_hashes']
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=True).encode()).hexdigest()


def model(store_path):
    store_path = Path(store_path).resolve()
    store = json.loads(store_path.read_text())
    knowledge = load_knowledge(store_path.parent.parent)
    features = []
    authored = {c['fid'] for c in knowledge['capabilities']}
    for f in store.get('features', []):
        if f['fid'] in authored:
            continue
        body = block_text(store_path, f['fid'])
        status = field(body, 'Status', 'dev').lower()
        f = dict(f, status=status if status in STATUSES else 'dev',
                 description=field(body, 'Description'), kind='directory', body=body,
                 status_reason='Curated status' if field(body, 'Status') else 'Unassessed; dev is the documentation default.',
                 dependencies=field(body, 'Dependencies'), limitations=field(body, 'Known limitations'))
        fpfile = store_path.parent / 'enrich/resolved' / (f['fid'] + '.fp')
        f['needs_review'] = fpfile.exists() and fpfile.read_text().strip() != feature_fingerprint(f)
        features.append(f)
    features = knowledge['capabilities'] + features
    for f in features:
        f['coupling_count'] = sum(bool(set(f['files']).intersection(p['files'])) for p in store.get('coupling', []))
    return {'features': features, 'empty': not features, 'overview': knowledge.get('overview', {}),
            'entities': knowledge['entities'], 'knowledge': bool(authored),
            'domains': knowledge.get('domains', [])}


def capability_markdown(c):
    lines = ['## Purpose', '', c['purpose'], '', '## Execution flow', '']
    for i, step in enumerate(c['flow'], 1):
        lines += [f"{i}. **{step['title']}**: {step['detail']}", f"   Source: `{step['source']}:{step['line']}`", '']
    for title, key in (('Failures and recovery', 'failures'), ('Where to make a change', 'change_guidance'), ('Limits of this explanation', 'limitations')):
        lines += ['## ' + title, '']
        values = c.get(key, [])
        if isinstance(values, str): values = [values]
        lines += ['- ' + v for v in values] + ['']
    lines += ['## Evidence', '', 'Reviewed: ' + c.get('reviewed_at', 'not recorded'), '']
    for s in c['sources']:
        lines += [f"- `{s['path']}:{s['line']}`: {s['claim']}" + (' (source changed; review needed)' if s['needs_review'] else '')]
    return '\n'.join(lines)


def source_signature(repo):
    """Index freshness over tracked source inputs, excluding wiki projections."""
    repo = Path(repo)
    result = subprocess.run(['git', '-C', str(repo), 'ls-files', '-z'], capture_output=True)
    if result.returncode:
        paths = [str(p.relative_to(repo)) for p in repo.rglob('*') if p.is_file() and '.git' not in p.parts and '.wiki' not in p.parts]
    else:
        paths = result.stdout.decode(errors='surrogateescape').split('\0')
    extensions = {'.py', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.sh', '.md', '.sql', '.go', '.rs', '.java', '.c', '.h', '.cpp', '.cs', '.rb', '.php'}
    inputs = {}
    for name in sorted(set(paths)):
        if not name or name.startswith(('.wiki/', 'readme/wiki/')) or name in ('readme/feature-status.md', 'readme/state-machines.md'):
            continue
        if Path(name).suffix.lower() in extensions:
            inputs[name] = digest(repo / name)
    return hashlib.sha256(json.dumps(inputs, sort_keys=True).encode()).hexdigest()
