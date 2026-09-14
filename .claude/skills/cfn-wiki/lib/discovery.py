#!/usr/bin/env python3
"""cfn-wiki Phase 1: repository discovery, scope policy and bounded queries.

Implements the frozen contracts in
planning/cfn-wiki/CONTRACTS_discovery-evidence.md: revision computation,
readme/wiki/scope.json policy, the .wiki/discovery.sqlite index (atomic
rebuild), CBM import adapter, deterministic language adapters and the query
envelope with revision-pinned cursors. Evidence packets and usage accounting
live in evidence.py.

Stdlib only. No em dashes in code or comments by repo rule.
"""
import argparse
import ast
import base64
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys

ADAPTER_VERSION = '1'
SCHEMA_VERSION = 1

DEFAULT_SCOPE = {
    'version': 1,
    'include_untracked': False,
    'include': [
        {'pattern': '.claude/skills/**',
         'reason': 'hidden implementation is in scope'},
    ],
    'exclude': [
        {'pattern': '.git/**', 'reason': 'repository metadata'},
        {'pattern': 'node_modules/**', 'reason': 'dependencies'},
        {'pattern': '.wiki/**', 'reason': 'wiki working state'},
        {'pattern': '**/__pycache__/**', 'reason': 'build cache'},
        {'pattern': '**/.venv/**', 'reason': 'environment'},
        {'pattern': '**/dist/**', 'reason': 'build output'},
        {'pattern': '**/build/**', 'reason': 'build output'},
        {'pattern': '.env', 'reason': 'credentials'},
        {'pattern': '.env.*', 'reason': 'credentials'},
        {'pattern': '**/*.pem', 'reason': 'credentials'},
    ],
    'policy_notes': (
        'Excluded-by-policy files are listed in the index with class '
        "'excluded' and their reason; their content is never read."),
}

EXT_LANG = {
    '.py': 'python', '.pyi': 'python',
    '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
    '.js': 'javascript', '.cjs': 'javascript', '.mjs': 'javascript',
    '.jsx': 'javascript', '.ts': 'typescript', '.tsx': 'typescript',
    '.go': 'go', '.rs': 'rust', '.java': 'java', '.rb': 'ruby',
    '.c': 'c', '.h': 'c', '.cpp': 'cpp', '.hpp': 'cpp', '.cc': 'cpp',
    '.cs': 'csharp', '.swift': 'swift', '.kt': 'kotlin', '.scala': 'scala',
    '.php': 'php', '.sql': 'sql',
    '.json': 'json', '.md': 'markdown', '.rst': 'markdown',
    '.adoc': 'markdown', '.txt': 'text',
    '.yaml': 'yaml', '.yml': 'yaml', '.toml': 'toml',
    '.ini': 'ini', '.cfg': 'ini',
    '.css': 'css', '.html': 'html',
}

LANG_ADAPTER = {
    'python': 'python-ast',
    'bash': 'bash-grep',
    'javascript': 'js-grep',
    'typescript': 'js-grep',
    'json': 'manifest-json',
}

MINIFY_CHECK_EXTS = {'.js', '.cjs', '.mjs', '.jsx', '.ts', '.tsx',
                     '.css', '.html', '.json'}
MINIFY_LINE_LIMIT = 500

LOCKFILE_NAMES = {
    'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', 'poetry.lock',
    'cargo.lock', 'uv.lock', 'flake.lock', 'composer.lock', 'gemfile.lock',
}

CONFIG_NAMES = {
    'dockerfile', 'makefile', '.gitignore', '.gitattributes',
    '.editorconfig', '.dockerignore', 'license', 'licence',
}
CONFIG_EXTS = {'.json', '.yaml', '.yml', '.toml', '.ini', '.cfg'}
DOCS_EXTS = {'.md', '.rst', '.adoc', '.txt'}
VENDORED_PARTS = {'vendor', 'third_party', 'vendored'}
ARCHIVE_PARTS = {'archive', 'archived'}
ARCHIVE_EXTS = {'.bak', '.old', '.orig'}
MINIFIED_SUFFIXES = ('.min.js', '.min.css')

CBM_LABEL_KIND = {
    'Function': 'function', 'Method': 'function', 'Class': 'class',
    'Interface': 'class', 'Route': 'route',
}
CBM_EDGE_KIND = {
    'CALLS': 'calls', 'IMPORTS': 'imports', 'TESTS': 'tests',
    'USAGE': 'usage', 'DEFINES': 'defines', 'DEFINES_METHOD': 'defines',
    'CONFIGURES': 'configures', 'WRITES': 'writes', 'RAISES': 'raises',
    'HANDLES': 'handles',
}

JS_FUNCTION_RE = re.compile(
    r'^[ \t]*(?:async[ \t]+)?function[ \t]+([A-Za-z_$][\w$]*)|'
    r'^[ \t]*(?:const|let|var)[ \t]+([A-Za-z_$][\w$]*)[ \t]*=[ \t]*'
    r'(?:async[ \t]*)?(?:\([^)]*\)|[\w$]+)[ \t]*=>',
    re.M)
JS_CLASS_RE = re.compile(r'^[ \t]*class[ \t]+([A-Za-z_$][\w$]*)', re.M)
JS_ROUTE_RE = re.compile(
    r'\b(?:app|router)\.(get|post|put|patch|delete|all)\(\s*[\'"]([^\'"]+)[\'"]')
BASH_FUNC_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)[ \t]*\(\)[ \t]*\{', re.M)
BASH_CALL_RE = re.compile(r'^([A-Za-z_][A-Za-z0-9_]*)\b')


class DiscoveryError(Exception):
    """Bounded error carrying an exit code for the CLI envelope."""

    def __init__(self, message, exit_code=1):
        super().__init__(message)
        self.exit_code = exit_code


# ---------------------------------------------------------------------------
# Scope policy


def glob_regex(pattern):
    """Compile an anchored glob. ** crosses /, * and ? do not."""
    out = []
    i = 0
    while i < len(pattern):
        char = pattern[i]
        if char == '*':
            if pattern[i:i + 2] == '**':
                out.append('.*')
                i += 2
                continue
            out.append('[^/]*')
            i += 1
        elif char == '?':
            out.append('[^/]')
            i += 1
        else:
            out.append(re.escape(char))
            i += 1
    return re.compile('^' + ''.join(out) + r'\Z')


class ScopePolicy:
    """Include/exclude decision over repo-relative, /-separated paths."""

    def __init__(self, data):
        self.data = data
        self.includes = []
        self.excludes = []
        for rule in data.get('include', []) or []:
            self.includes.append(
                (rule['pattern'], glob_regex(rule['pattern']),
                 rule.get('reason', '')))
        for rule in data.get('exclude', []) or []:
            self.excludes.append(
                (rule['pattern'], glob_regex(rule['pattern']),
                 rule.get('reason', '')))

    @property
    def include_untracked(self):
        return bool(self.data.get('include_untracked', False))

    def decide(self, path):
        """Return (decision, pattern, reason). Longest pattern wins; equal
        length favors exclude. Unmatched paths default to include."""
        best = None  # (length, is_include, pattern, reason)
        for pattern, regex, reason in self.includes:
            if regex.match(path) and (best is None or len(pattern) > best[0]):
                best = (len(pattern), True, pattern, reason)
        for pattern, regex, reason in self.excludes:
            if regex.match(path):
                if best is None or len(pattern) > best[0]:
                    best = (len(pattern), False, pattern, reason)
                elif len(pattern) == best[0] and best[1]:
                    best = (len(pattern), False, pattern, reason)
        if best is None:
            return 'include', None, 'no rule matched (default include)'
        if best[1]:
            return 'include', best[2], best[3]
        return 'exclude', best[2], best[3]

    def prune_dir(self, rel_dir):
        """Best-effort walk pruning: True only when an anchored subtree
        exclude covers every descendant and no longer include pattern is
        anchored inside the directory. Conservative by design."""
        probe = rel_dir + '/__prune_probe__'
        decision, pattern, _ = self.decide(probe)
        if decision != 'exclude' or pattern is None:
            return False
        if not pattern.endswith('/**'):
            return False
        base = pattern[:-3]
        if '**' in base:
            # Unanchored subtree pattern (e.g. **/__pycache__/**): prune only
            # when the directory's own basename matches the literal tail.
            tail = base.rsplit('**/', 1)[-1]
            if not tail or os.path.basename(rel_dir) != tail:
                return False
        elif rel_dir != base and not rel_dir.startswith(base + '/'):
            return False
        for inc_pattern, _, _ in self.includes:
            if len(inc_pattern) <= len(pattern):
                continue
            anchored_under = (
                inc_pattern.startswith(rel_dir + '/')
                or inc_pattern.startswith('**/')
                or '**/' in inc_pattern
                or inc_pattern.startswith('*'))
            if anchored_under:
                return False
        return True


def load_scope(repo, create=False):
    """Read readme/wiki/scope.json; create with defaults when absent and
    create is set. Never rewrites an existing file."""
    path = os.path.join(repo, 'readme', 'wiki', 'scope.json')
    if os.path.exists(path):
        try:
            with open(path, encoding='utf-8') as handle:
                data = json.load(handle)
        except ValueError as exc:
            raise DiscoveryError('invalid scope.json: %s' % exc)
        if not isinstance(data, dict):
            raise DiscoveryError('invalid scope.json: expected an object')
        return data
    if not create:
        return json.loads(json.dumps(DEFAULT_SCOPE))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_json_atomic(path, DEFAULT_SCOPE)
    return json.loads(json.dumps(DEFAULT_SCOPE))


def write_json_atomic(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, indent=2, ensure_ascii=True)
        handle.write('\n')
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Revision


def is_git_repo(repo):
    return os.path.exists(os.path.join(repo, '.git'))


def _git(repo, *args):
    return subprocess.run(['git', '-C', repo] + list(args),
                          capture_output=True)


def git_revision(repo, scope):
    proc = _git(repo, 'rev-parse', 'HEAD')
    head = None
    if proc.returncode == 0:
        head = proc.stdout.decode('utf-8', 'replace').strip()
    status = _git(repo, 'status', '--porcelain', '-z',
                  '--untracked-files=all')
    if status.returncode != 0:
        # git present but status failed: fall back to the bounded walk.
        return walk_revision(repo, scope)
    entries = [entry for entry in status.stdout.split(b'\0') if entry]
    if not entries:
        return head if head else 'nocommit'
    digest = hashlib.sha256(b'\0'.join(sorted(entries))).hexdigest()[:16]
    return '%s-dirty-%s' % (head if head else 'nocommit', digest)


def walk_revision(repo, scope):
    """nogit-<r16>: sha256 over sorted path\\0size_bytes\\0 pairs of the
    bounded walk. Same-size edits are not detected (known limit)."""
    pairs = []
    for entry in enumerate_tree(repo, scope):
        pairs.append(os.fsencode(entry['path']) + b'\0' +
                     str(entry['size']).encode('ascii') + b'\0')
    digest = hashlib.sha256(b''.join(sorted(pairs))).hexdigest()[:16]
    return 'nogit-%s' % digest


def compute_revision(repo, scope):
    """Revision string per contract section 1."""
    if is_git_repo(repo):
        return git_revision(repo, scope)
    return walk_revision(repo, scope)


# ---------------------------------------------------------------------------
# Enumeration. Paths stay bytes until os.fsdecode (surrogateescape), so
# arbitrary filenames survive round trips.


def enumerate_tree(repo, scope):
    """Bounded filesystem walk. Yields one entry dict per surfaced path,
    including scope-excluded files (their content is never read; the
    caller records them as class 'excluded')."""
    root_bytes = os.fsencode(os.path.abspath(repo))
    visited_resolved = set()
    entries = []

    def rel_bytes(full_bytes):
        return full_bytes[len(root_bytes) + 1:]

    def record(rel, full, link=False):
        rel_str = os.fsdecode(rel.replace(os.sep.encode(), b'/'))
        if not link:
            entries.append({'path': rel_str,
                            'size': os.lstat(full).st_size,
                            'symlink': None})
            return
        resolved = os.path.realpath(full)
        if not resolved.startswith(root_bytes + os.sep.encode()):
            entries.append({'path': rel_str,
                            'size': os.lstat(full).st_size,
                            'symlink': 'out-of-root'})
            return
        if resolved in visited_resolved:
            return  # cycle or duplicate: first encounter wins
        visited_resolved.add(resolved)
        if os.path.isdir(resolved):
            # Walk the in-root directory target, recording alias paths
            # under the symlink prefix. The real path is enumerated by the
            # main walk; the visited set breaks cycles between symlinks.
            link_dir = rel_bytes(os.path.dirname(full))
            link_name = os.path.basename(full)
            resolved_rel = rel_bytes(resolved)
            for sub in walk_real(resolved):
                sub_rel = rel_bytes(sub)
                suffix = sub_rel[len(resolved_rel) + 1:] \
                    if sub_rel.startswith(resolved_rel + os.sep.encode()) \
                    else os.path.basename(sub_rel)
                mapped_rel = (link_dir + os.sep.encode() if link_dir
                              else b'') + link_name + os.sep.encode() + \
                    suffix
                entries.append({
                    'path': os.fsdecode(
                        mapped_rel.replace(os.sep.encode(), b'/')),
                    'size': os.lstat(sub).st_size,
                    'symlink': 'in-root',
                    'resolved': sub.decode('utf-8', 'surrogateescape')})
            return
        if not os.path.exists(resolved):
            entries.append({'path': rel_str,
                            'size': os.lstat(full).st_size,
                            'symlink': 'dangling'})
            return
        entries.append({'path': rel_str,
                        'size': os.stat(resolved).st_size,
                        'symlink': 'in-root',
                        'resolved': resolved.decode('utf-8',
                                                    'surrogateescape')})

    def walk_real(top_bytes):
        """Walk a real directory yielding regular-file paths (bytes)."""
        found = []
        for dirpath, dirnames, filenames in os.walk(top_bytes):
            rel_dir_bytes = rel_bytes(dirpath)
            rel_dir = os.fsdecode(
                rel_dir_bytes.replace(os.sep.encode(), b'/')) \
                if rel_dir_bytes else ''
            keep = []
            for name in list(dirnames):
                full = os.path.join(dirpath, name)
                rel_name = (rel_dir + '/' if rel_dir else '') + \
                    os.fsdecode(name)
                if name == b'.git' or scope.prune_dir(rel_name):
                    continue
                if os.path.islink(full):
                    record(rel_bytes(full), full, link=True)
                    continue
                keep.append(name)
            dirnames[:] = keep
            for name in filenames:
                full = os.path.join(dirpath, name)
                if os.path.islink(full):
                    record(rel_bytes(full), full, link=True)
                else:
                    found.append(full)
        return found

    for full in walk_real(root_bytes):
        record(rel_bytes(full), full)
    return entries


def enumerate_git(repo, include_untracked):
    """Tracked files via git ls-files -z, plus untracked-but-not-ignored
    files when include_untracked is set."""
    root_bytes = os.fsencode(os.path.abspath(repo))
    out = []
    seen = set()
    procs = [_git(repo, 'ls-files', '-z')]
    if include_untracked:
        procs.append(_git(repo, 'ls-files', '-z', '--others',
                          '--exclude-standard'))
    for proc in procs:
        if proc.returncode != 0:
            raise DiscoveryError('git ls-files failed in %s' % repo)
        for raw in proc.stdout.split(b'\0'):
            if not raw or raw in seen:
                continue
            seen.add(raw)
            full = os.path.join(root_bytes, raw)
            if not os.path.lexists(full):
                continue  # deleted from the worktree but still in the index
            rel_str = os.fsdecode(raw)
            if os.path.islink(full):
                resolved = os.path.realpath(full)
                in_root = resolved.startswith(
                    root_bytes + os.sep.encode())
                if in_root and os.path.isdir(resolved):
                    # Directory symlinks contribute no file entry here; any
                    # individually tracked files under the target appear as
                    # their own ls-files rows.
                    continue
                if in_root and os.path.exists(resolved):
                    out.append({
                        'path': rel_str,
                        'size': os.stat(resolved).st_size,
                        'symlink': 'in-root',
                        'resolved': resolved.decode(
                            'utf-8', 'surrogateescape')})
                else:
                    out.append({'path': rel_str,
                                'size': os.lstat(full).st_size,
                                'symlink': 'out-of-root'})
                continue
            if os.path.isdir(full):
                continue  # submodule or similar
            out.append({'path': rel_str,
                        'size': os.lstat(full).st_size,
                        'symlink': None})
    return out


def enumerate_repo(repo, scope):
    """Return (policy_name, entries) for the selected enumeration mode."""
    if is_git_repo(repo):
        if scope.include_untracked:
            return 'git+untracked', enumerate_git(repo, True)
        return 'git-tracked', enumerate_git(repo, False)
    return 'filesystem', enumerate_tree(repo, scope)


# ---------------------------------------------------------------------------
# Classification


def classify(repo, entry, scope):
    """Return (class, reason, lang). Excluded content is never read."""
    path = entry['path']
    if entry.get('symlink') == 'out-of-root':
        return 'excluded', 'symlink-out-of-root', None
    if entry.get('symlink') == 'dangling':
        return 'excluded', 'symlink target missing', None
    decision, pattern, reason = scope.decide(path)
    if decision == 'exclude':
        return 'excluded', 'scope policy %s' % reason, None
    base = path.rsplit('/', 1)[-1]
    lower = base.lower()
    ext = ''
    if '.' in base:
        ext = '.' + lower.rsplit('.', 1)[1]
    parts = path.split('/')
    lang = EXT_LANG.get(ext)
    if any(part in VENDORED_PARTS for part in parts[:-1]):
        return 'vendored', 'vendored path', lang
    if any(part in ARCHIVE_PARTS for part in parts[:-1]) or \
            ext in ARCHIVE_EXTS:
        return 'archived', 'archived path', lang
    if _is_test_path(parts, lower):
        return 'test', 'test path convention', lang
    if ext in DOCS_EXTS:
        return 'docs', 'extension %s' % ext, lang
    if base in LOCKFILE_NAMES or lower in LOCKFILE_NAMES:
        return 'generated', 'lockfile', lang
    if ext in CONFIG_EXTS:
        return 'config', 'extension %s' % ext, lang
    if lower in CONFIG_NAMES:
        return 'config', 'config filename', lang
    if ext in MINIFY_CHECK_EXTS:
        if base.endswith(MINIFIED_SUFFIXES):
            return 'generated', 'minified filename', lang
        if _has_minified_line(repo, entry):
            return 'generated', \
                'minified line > %d chars' % MINIFY_LINE_LIMIT, lang
    if lang is not None:
        return 'source', 'extension %s' % ext, lang
    return 'unknown', ('unrecognized extension %s' % ext) if ext else \
        'no extension', None


def _is_test_path(parts, lower_base):
    if any(part in ('tests', 'test', '__tests__', 'spec')
           for part in parts[:-1]):
        return True
    return (lower_base.startswith('test_') or lower_base.startswith('test-')
            or lower_base.endswith('_test.py')
            or lower_base.endswith('.test.js')
            or lower_base.endswith('.test.ts')
            or lower_base.endswith('.spec.js')
            or lower_base.endswith('.spec.ts'))


def read_source(repo, entry, limit=None):
    """Read file bytes for an in-scope entry via its resolved target."""
    full = os.path.join(repo, entry.get('resolved') or
                        entry['path'].replace('/', os.sep))
    with open(full, 'rb') as handle:
        return handle.read() if limit is None else handle.read(limit)


def _has_minified_line(repo, entry):
    try:
        head = read_source(repo, entry, limit=65536)
    except OSError:
        return False
    return any(len(line) > MINIFY_LINE_LIMIT for line in head.split(b'\n'))


# ---------------------------------------------------------------------------
# Adapters. Symbol row: (path, name, kind, line).
# Relation row: (src_path, src_symbol, dst, kind).


def adapter_python_ast(path, text):
    symbols = []
    relations = []
    try:
        tree = ast.parse(text)
    except SyntaxError:
        return symbols, relations
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            symbols.append((path, node.name, 'function', node.lineno))
        elif isinstance(node, ast.ClassDef):
            symbols.append((path, node.name, 'class', node.lineno))
        elif isinstance(node, ast.Import):
            for alias in node.names:
                relations.append((path, None, alias.name, 'imports'))
        elif isinstance(node, ast.ImportFrom):
            target = '.' * (node.level or 0) + (node.module or '')
            relations.append((path, None, target, 'imports'))
    return symbols, relations


def adapter_js_grep(path, text):
    symbols = []
    for match in JS_FUNCTION_RE.finditer(text):
        name = match.group(1) or match.group(2)
        if name:
            line = text.count('\n', 0, match.start()) + 1
            symbols.append((path, name, 'function', line))
    for match in JS_CLASS_RE.finditer(text):
        line = text.count('\n', 0, match.start()) + 1
        symbols.append((path, match.group(1), 'class', line))
    routes = []
    for match in JS_ROUTE_RE.finditer(text):
        line = text.count('\n', 0, match.start()) + 1
        name = '%s %s' % (match.group(1).upper(), match.group(2))
        symbols.append((path, name, 'route', line))
        routes.append(name)
    return symbols, [], routes


def adapter_bash_grep(path, text):
    symbols = []
    names = set()
    for match in BASH_FUNC_RE.finditer(text):
        name = match.group(1)
        line = text.count('\n', 0, match.start()) + 1
        symbols.append((path, name, 'command', line))
        names.add(name)
    relations = []
    for line_text in text.splitlines():
        if BASH_FUNC_RE.match(line_text):
            continue  # the definition line is not a call
        stripped = line_text.strip()
        if not stripped or stripped.startswith('#'):
            continue
        head = BASH_CALL_RE.match(stripped)
        if head and head.group(1) in names:
            relations.append((path, None, head.group(1), 'calls'))
    return symbols, relations


def adapter_manifest_json(path, text):
    symbols = []
    relations = []
    try:
        data = json.loads(text)
    except ValueError:
        return symbols, relations
    if not isinstance(data, dict):
        return symbols, relations
    name = data.get('name')
    if name:
        symbols.append((path, str(name), 'manifest', 1))
    for section in ('dependencies', 'devDependencies'):
        deps = data.get(section)
        if isinstance(deps, dict):
            for dep in sorted(deps):
                relations.append((path, None, dep, 'depends_on'))
    return symbols, relations


def adapter_for(lang):
    return LANG_ADAPTER.get(lang)


def import_cbm(repo, in_scope_paths):
    """Import symbols and edges from a CBM snapshot at .wiki/cache/cbm.db.
    Returns (symbols, relations, covered_paths). Rows whose file_path is
    not in the enumerated in-scope set are skipped (stale snapshot)."""
    snapshot = os.path.join(repo, '.wiki', 'cache', 'cbm.db')
    symbols = []
    relations = []
    covered = set()
    if not os.path.exists(snapshot):
        return symbols, relations, covered
    project = os.path.basename(os.path.abspath(repo))
    try:
        con = sqlite3.connect('file:%s?mode=ro' % snapshot, uri=True)
        # Real snapshots carry non-UTF-8 bytes in some node names (CP1252
        # text from parsed files); the default text_factory raises
        # mid-iteration and would silently discard the entire import.
        con.text_factory = lambda b: b.decode('utf-8', 'replace')
    except sqlite3.Error:
        return symbols, relations, covered
    try:
        nodes = {}
        for node_id, label, name, qualified, file_path, start_line in \
                con.execute(
                    'SELECT id, label, name, qualified_name, file_path, '
                    'start_line FROM nodes WHERE project=? AND file_path '
                    "IS NOT NULL AND file_path != '' AND start_line > 0",
                    (project,)):
            kind = CBM_LABEL_KIND.get(label)
            if kind is None or file_path not in in_scope_paths:
                continue
            display = name or label or qualified
            nodes[node_id] = (file_path, display)
            symbols.append((file_path, display, kind, start_line))
            covered.add(file_path)
        for edge_type, src_id, dst_id in con.execute(
                'SELECT type, source_id, target_id FROM edges '
                'WHERE project=?', (project,)):
            kind = CBM_EDGE_KIND.get(edge_type)
            if kind is None:
                continue
            src = nodes.get(src_id)
            if src is None:
                continue
            dst = nodes.get(dst_id)
            dst_name = dst[1] if dst else 'external:%s' % dst_id
            relations.append((src[0], src[1], dst_name, kind))
    except sqlite3.Error:
        return [], [], set()
    finally:
        con.close()
    return symbols, relations, covered


# ---------------------------------------------------------------------------
# Index build


INDEX_SCHEMA = """
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE files (
  path TEXT PRIMARY KEY, class TEXT NOT NULL, reason TEXT,
  size_bytes INTEGER, lang TEXT, adapter TEXT);
CREATE TABLE symbols (
  id INTEGER PRIMARY KEY, path TEXT NOT NULL, name TEXT NOT NULL,
  kind TEXT NOT NULL, line INTEGER, adapter TEXT NOT NULL);
CREATE TABLE relations (
  id INTEGER PRIMARY KEY, src_path TEXT, src_symbol TEXT, dst TEXT,
  kind TEXT, adapter TEXT NOT NULL);
CREATE TABLE candidates (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, name TEXT NOT NULL,
  path TEXT NOT NULL, line INTEGER,
  status TEXT NOT NULL DEFAULT 'candidate');
CREATE INDEX idx_files_class ON files(class);
CREATE INDEX idx_symbols_path ON symbols(path);
CREATE INDEX idx_symbols_name ON symbols(name);
CREATE INDEX idx_relations_src_path ON relations(src_path);
CREATE INDEX idx_candidates_kind_status ON candidates(kind, status);
"""


def index_path(repo):
    return os.path.join(repo, '.wiki', 'discovery.sqlite')


def read_index_revision(repo):
    path = index_path(repo)
    if not os.path.exists(path):
        return None
    try:
        con = sqlite3.connect('file:%s?mode=ro' % path, uri=True)
    except sqlite3.Error:
        return None
    try:
        row = con.execute(
            "SELECT value FROM meta WHERE key='revision'").fetchone()
        schema = con.execute(
            "SELECT value FROM meta WHERE key='schema_version'").fetchone()
        if not row or not schema or schema[0] != str(SCHEMA_VERSION):
            return None
        return row[0]
    except sqlite3.Error:
        return None
    finally:
        con.close()


def discover(repo):
    """Build (or reuse) the discovery index. Returns the bounded summary."""
    repo = os.path.abspath(repo)
    if not os.path.isdir(repo):
        raise DiscoveryError('not a directory: %s' % repo)
    scope_data = load_scope(repo, create=True)
    scope = ScopePolicy(scope_data)
    revision = compute_revision(repo, scope)
    if read_index_revision(repo) == revision:
        try:
            counts, totals = index_counts(repo)
        except sqlite3.DatabaseError:
            counts, totals = None, None
        if counts is not None:
            return {
                'revision': revision,
                'scope_policy': {
                    'path': 'readme/wiki/scope.json', 'created': False,
                    'include_untracked': scope.include_untracked},
                'enumeration': {'policy': None,
                                'files_seen': totals['files']},
                'counts': counts,
                'totals': totals,
                'index': {'path': '.wiki/discovery.sqlite',
                          'rebuilt': False,
                          'schema_version': SCHEMA_VERSION},
            }
    policy_name, entries = enumerate_repo(repo, scope)
    return rebuild_index(repo, scope, revision, policy_name, entries)


def rebuild_index(repo, scope, revision, policy_name, entries):
    classified = []
    for entry in entries:
        cls, reason, lang = classify(repo, entry, scope)
        classified.append((entry, cls, reason, lang))
    in_scope_paths = {e['path'] for e, cls, _, _ in classified
                      if cls != 'excluded'}

    symbol_rows = []
    relation_rows = []
    candidate_rows = []
    adapter_of = {}

    for entry, cls, reason, lang in classified:
        if cls == 'excluded':
            continue
        adapter_name = adapter_for(lang) if lang else None
        if adapter_name is None:
            continue
        path = entry['path']
        try:
            text = read_source(repo, entry).decode('utf-8', 'replace')
        except OSError:
            adapter_of[path] = 'none'
            continue
        adapter_of[path] = adapter_name
        if adapter_name == 'python-ast':
            symbols, relations = adapter_python_ast(path, text)
        elif adapter_name == 'bash-grep':
            symbols, relations = adapter_bash_grep(path, text)
        elif adapter_name == 'js-grep':
            symbols, relations, routes = adapter_js_grep(path, text)
            for route in routes:
                candidate_rows.append(('route', route, path, None))
        elif adapter_name == 'manifest-json':
            symbols, relations = adapter_manifest_json(path, text)
            if symbols:
                candidate_rows.append(('manifest', symbols[0][1], path, 1))
        symbol_rows.extend((p, n, k, ln, adapter_name)
                           for p, n, k, ln in symbols)
        relation_rows.extend((sp, ss, dst, k2, adapter_name)
                             for sp, ss, dst, k2 in relations)

    cbm_symbols, cbm_relations, cbm_covered = import_cbm(repo,
                                                         in_scope_paths)
    symbol_rows.extend((p, n, k, ln, 'cbm')
                       for p, n, k, ln in cbm_symbols)
    relation_rows.extend((sp, ss, dst, k2, 'cbm')
                         for sp, ss, dst, k2 in cbm_relations)

    # Workflow files become job candidates by path convention.
    for entry, cls, _, _ in classified:
        path = entry['path']
        if path.startswith('.github/workflows/') and \
                path.endswith(('.yml', '.yaml')):
            stem = path.rsplit('/', 1)[-1].rsplit('.', 1)[0]
            candidate_rows.append(('job', stem, path, None))

    counts = {}
    for _, cls, _, _ in classified:
        counts[cls] = counts.get(cls, 0) + 1

    tmp = index_path(repo) + '.tmp'
    os.makedirs(os.path.dirname(tmp), exist_ok=True)
    try:
        con = sqlite3.connect(tmp)
        con.executescript(INDEX_SCHEMA)
        for entry, cls, reason, lang in classified:
            adapter = adapter_of.get(entry['path'])
            if cls != 'excluded' and adapter is None:
                if entry['path'] in cbm_covered:
                    adapter = 'cbm'
                elif lang is not None:
                    adapter = 'none'
            con.execute('INSERT INTO files VALUES (?,?,?,?,?,?)',
                        (entry['path'], cls, reason, entry.get('size'),
                         lang, adapter))
        con.executemany(
            'INSERT INTO symbols (path,name,kind,line,adapter) '
            'VALUES (?,?,?,?,?)', symbol_rows)
        con.executemany(
            'INSERT INTO relations (src_path,src_symbol,dst,kind,adapter) '
            'VALUES (?,?,?,?,?)', relation_rows)
        con.executemany(
            "INSERT INTO candidates (kind,name,path,line,status) "
            "VALUES (?,?,?,?,'candidate')", candidate_rows)
        con.executemany('INSERT INTO meta VALUES (?,?)', [
            ('schema_version', str(SCHEMA_VERSION)),
            ('repo_root', str(repo)),
            ('revision', revision),
            ('generated_by', 'cfn-wiki discovery %d' % SCHEMA_VERSION),
        ])
        con.commit()
        con.close()
        os.replace(tmp, index_path(repo))
    finally:
        if os.path.exists(tmp):
            os.remove(tmp)

    return {
        'revision': revision,
        'scope_policy': {
            'path': 'readme/wiki/scope.json', 'created': False,
            'include_untracked': scope.include_untracked},
        'enumeration': {'policy': policy_name,
                        'files_seen': len(classified)},
        'counts': counts,
        'totals': {
            'files': len(classified),
            'symbols': len(symbol_rows),
            'relations': len(relation_rows),
            'candidates': len(candidate_rows),
        },
        'index': {'path': '.wiki/discovery.sqlite', 'rebuilt': True,
                  'schema_version': SCHEMA_VERSION},
    }


def index_counts(repo):
    con = sqlite3.connect('file:%s?mode=ro' % index_path(repo), uri=True)
    try:
        counts = dict(con.execute(
            'SELECT class, COUNT(*) FROM files GROUP BY class').fetchall())
        totals = {
            'files': con.execute(
                'SELECT COUNT(*) FROM files').fetchone()[0],
            'symbols': con.execute(
                'SELECT COUNT(*) FROM symbols').fetchone()[0],
            'relations': con.execute(
                'SELECT COUNT(*) FROM relations').fetchone()[0],
            'candidates': con.execute(
                'SELECT COUNT(*) FROM candidates').fetchone()[0],
        }
        return counts, totals
    finally:
        con.close()


# ---------------------------------------------------------------------------
# Query envelope


def envelope(items, next_cursor, total, truncated, truncation_reason,
             revision, accounted_bytes):
    return {
        'items': items,
        'next_cursor': next_cursor,
        'total': total,
        'truncated': truncated,
        'truncation_reason': truncation_reason,
        'revision': revision,
        'accounted_bytes': accounted_bytes,
    }


def encode_cursor(revision, last_sort_key):
    payload = json.dumps(
        {'revision': revision, 'last_sort_key': last_sort_key},
        separators=(',', ':'), ensure_ascii=True)
    return base64.b64encode(payload.encode('ascii')).decode('ascii')


def decode_cursor(blob, current_revision):
    try:
        payload = json.loads(
            base64.b64decode(blob.encode('ascii'), validate=True))
        revision = payload['revision']
        key = payload['last_sort_key']
    except Exception:
        raise DiscoveryError('malformed cursor', exit_code=2)
    if revision != current_revision:
        raise DiscoveryError(
            'cursor revision mismatch: cursor was captured at revision '
            '%s but the index is at revision %s; run discover and re-query '
            'from the first page' % (revision, current_revision), exit_code=2)
    return key


LIST_QUERIES = {
    'files': {
        'columns': ['path', 'class', 'reason', 'size_bytes', 'lang',
                    'adapter'],
        'filters': {'class': 'class = ?', 'lang': 'lang = ?',
                    'adapter': 'adapter = ?', 'path': 'path = ?'},
        'item': lambda r: {'path': r[0], 'class': r[1], 'reason': r[2],
                           'size_bytes': r[3], 'lang': r[4], 'adapter': r[5]},
        'keys': ['path'],
    },
    'symbols': {
        'columns': ['path', 'name', 'line', 'kind', 'adapter'],
        'filters': {'kind': 'kind = ?', 'name': 'name = ?',
                    'path': 'path = ?'},
        'item': lambda r: {'path': r[0], 'name': r[1], 'line': r[2],
                           'kind': r[3], 'adapter': r[4]},
        'keys': ['path', 'name', 'line'],
    },
    'relations': {
        'columns': ['id', 'src_path', 'src_symbol', 'dst', 'kind',
                    'adapter'],
        'filters': {'src_path': 'src_path = ?',
                    'src_symbol': 'src_symbol = ?', 'kind': 'kind = ?',
                    'dst': 'dst = ?'},
        'item': lambda r: {'src_path': r[1], 'src_symbol': r[2],
                           'dst': r[3], 'kind': r[4], 'adapter': r[5]},
        'keys': ['id'],
    },
    'candidates': {
        'columns': ['kind', 'name', 'path', 'line', 'status'],
        'filters': {'kind': 'kind = ?', 'status': 'status = ?',
                    'path': 'path = ?'},
        'item': lambda r: {'kind': r[0], 'name': r[1], 'path': r[2],
                           'line': r[3], 'status': r[4]},
        'keys': ['kind', 'name', 'path'],
    },
}


def open_index(repo):
    path = index_path(repo)
    if not os.path.exists(path):
        raise DiscoveryError(
            'no discovery index at .wiki/discovery.sqlite; run '
            "'wiki discover %s' first" % repo)
    return sqlite3.connect('file:%s?mode=ro' % path, uri=True)


def index_meta(con, key):
    row = con.execute('SELECT value FROM meta WHERE key=?',
                      (key,)).fetchone()
    if not row:
        raise DiscoveryError('index missing meta key %s' % key)
    return row[0]


def run_list_query(repo, kind, args, config):
    spec = LIST_QUERIES[kind]
    con = open_index(repo)
    try:
        revision = index_meta(con, 'revision')
        where = []
        params = []
        filter_attrs = {'kind': 'filter_kind'}
        # The shared parser accepts every flag for every kind, so a flag
        # this kind ignores must fail loudly instead of returning
        # unfiltered output (query files --name used to be a silent no-op).
        applicable = set(spec['filters'])
        if kind in ('files', 'symbols'):
            applicable.add('path_prefix')
        for name in ('class', 'lang', 'adapter', 'name', 'path', 'src_path',
                     'src_symbol', 'dst', 'status', 'filter_kind', 'like',
                     'path_prefix'):
            value = getattr(args, filter_attrs.get(name, name), None)
            if value is None:
                continue
            spec_key = 'kind' if name == 'filter_kind' else name
            if (spec_key not in applicable and name not in applicable
                    and name != 'like'):
                raise DiscoveryError(
                    '--%s is not a valid filter for %s queries'
                    % (name.replace('_', '-'), kind))
            if name == 'like':
                if kind != 'symbols':
                    raise DiscoveryError('--like is only valid for symbols')
                where.append('name LIKE ?')
                params.append('%' + value + '%')
            elif name == 'path_prefix':
                where.append('substr(path, 1, ?) = ?')
                params.extend([len(value), value])
            else:
                where.append(spec['filters'][spec_key])
                params.append(value)
        where_sql = ('WHERE ' + ' AND '.join(where)) if where else ''
        total = con.execute(
            'SELECT COUNT(*) FROM %s %s' % (kind, where_sql),
            params).fetchone()[0]
        cursor_key = None
        if args.cursor:
            cursor_key = decode_cursor(args.cursor, revision)
        row_params = list(params)
        if cursor_key is not None:
            keys = spec['keys']
            where_cursor = '(%s) > (%s)' % (
                ', '.join(keys), ', '.join('?' * len(keys)))
            row_where = (where_sql + ' AND ' + where_cursor) if where_sql \
                else 'WHERE ' + where_cursor
            if len(keys) == 1:
                row_params.append(cursor_key)
            else:
                row_params.extend(cursor_key)
        else:
            row_where = where_sql
        max_results = min(args.limit or config['evidence_list_max_results'],
                          config['evidence_list_max_results'])
        rows = con.execute(
            'SELECT %s FROM %s %s ORDER BY %s LIMIT %d' % (
                ', '.join(spec['columns']), kind, row_where,
                ', '.join(spec['keys']), max_results + 1),
            row_params).fetchall()
    finally:
        con.close()
    items, truncated, reason, last_key = cap_items(
        rows, spec['item'], max_results, config['evidence_list_max_bytes'],
        len(spec['keys']))
    next_cursor = encode_cursor(
        revision, last_key if len(spec['keys']) == 1 else list(last_key)) \
        if truncated and last_key is not None else None
    payload = json.dumps(items, ensure_ascii=True).encode('utf-8')
    return envelope(items, next_cursor, total, truncated, reason,
                    revision, len(payload))


def cap_items(rows, item_fn, max_results, max_bytes, key_count):
    """Apply result and byte caps to ordered rows. The byte cap always
    yields at least one item so a page is never empty."""
    items = []
    used = 0
    truncated = False
    reason = None
    last_key = None
    for row in rows:
        if len(items) >= max_results:
            truncated = True
            reason = 'max_results'
            break
        item = item_fn(row)
        size = len(json.dumps(item, ensure_ascii=True).encode('utf-8'))
        if items and used + size > max_bytes:
            truncated = True
            reason = 'max_bytes'
            break
        items.append(item)
        used += size
        last_key = row[0] if key_count == 1 else row[:key_count]
    return items, truncated, reason, last_key


# ---------------------------------------------------------------------------
# CLI


def emit(payload):
    print(json.dumps(payload, ensure_ascii=True))


def fail(message, revision, exit_code=1):
    emit({'error': message, 'revision': revision})
    raise SystemExit(exit_code)


def safe_revision(repo):
    try:
        return compute_revision(repo, ScopePolicy(load_scope(repo)))
    except (DiscoveryError, OSError):
        return None


def cmd_discover(args):
    try:
        summary = discover(args.repo)
    except DiscoveryError as exc:
        fail(str(exc), safe_revision(args.repo), exc.exit_code)
    emit(summary)
    return 0


def cmd_query(args):
    import evidence
    repo = os.path.abspath(args.repo)
    revision = None
    try:
        con = open_index(repo)
        revision = index_meta(con, 'revision')
        con.close()
        config = evidence.load_config(repo)
        if args.kind in LIST_QUERIES:
            result = run_list_query(repo, args.kind, args, config)
            evidence.Usage(repo, revision).append(
                op=args.kind, evidence_id=None,
                bytes_count=result['accounted_bytes'], cached=False,
                attempt=None)
        elif args.kind == 'span':
            result = evidence.span_query(repo, revision, args, config)
        elif args.kind == 'graph':
            result = evidence.graph_query(repo, revision, args, config)
        else:
            fail('unknown query kind %r (expected one of %s)' % (
                args.kind, ', '.join(list(LIST_QUERIES) + ['span', 'graph'])),
                revision, exit_code=64)
        emit(result)
        return 0
    except DiscoveryError as exc:
        fail(str(exc), revision or safe_revision(repo), exc.exit_code)
    except evidence.EvidenceError as exc:
        fail(str(exc), revision, exc.exit_code)


def build_parser():
    parser = argparse.ArgumentParser(prog='discovery.py')
    sub = parser.add_subparsers(dest='command', required=True)

    discover_parser = sub.add_parser('discover')
    discover_parser.add_argument('repo')

    query_parser = sub.add_parser('query')
    query_parser.add_argument('repo')
    query_parser.add_argument('kind')
    # Positional span arguments: query <repo> span <path> <start> [end]
    query_parser.add_argument('span_path', nargs='?')
    query_parser.add_argument('span_start', nargs='?', type=int)
    query_parser.add_argument('span_end', nargs='?', type=int)
    for flag in ('class', 'lang', 'adapter', 'name', 'path', 'src-path',
                 'src-symbol', 'dst', 'status', 'like', 'symbol',
                 'attempt', 'from-packet', 'cursor', 'path-prefix'):
        query_parser.add_argument('--' + flag)
    # --kind filters symbols/relations/candidates; the positional kind
    # selects the query, so the flag needs its own destination.
    query_parser.add_argument('--kind', dest='filter_kind')
    query_parser.add_argument('--limit', type=int)
    query_parser.add_argument('--direction', default='both',
                              choices=['outgoing', 'incoming', 'both'])
    query_parser.add_argument('--depth', type=int, default=1)
    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    if args.command == 'discover':
        return cmd_discover(args)
    return cmd_query(args)


if __name__ == '__main__':
    sys.exit(main() or 0)
