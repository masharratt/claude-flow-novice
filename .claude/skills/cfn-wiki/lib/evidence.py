#!/usr/bin/env python3
"""cfn-wiki Phase 1: bounded evidence packets, cache keys and accounting.

Content-addressed packets under .wiki/work/evidence/, canonical keys per
contract section 5, delivery accounting in .wiki/work/usage.jsonl and the
caller-facing evidence_budget_state() helper. Stdlib only; no em dashes.
"""
import hashlib
import json
import os
import sqlite3
import time
from collections import deque

import discovery

DEFAULTS = {
    'evidence_span_max_bytes': 8192,
    'evidence_span_max_lines': 120,
    'evidence_list_max_results': 40,
    'evidence_list_max_bytes': 8192,
    'evidence_attempt_max_bytes': 65536,
}

GIANT_LINE_CHARS = 2000


class EvidenceError(Exception):
    """Bounded error carrying an exit code for the CLI envelope."""

    def __init__(self, message, exit_code=1):
        super().__init__(message)
        self.exit_code = exit_code


def load_config(repo):
    config = dict(DEFAULTS)
    path = os.path.join(repo, '.wiki', 'config.json')
    if not os.path.exists(path):
        return config
    try:
        with open(path, encoding='utf-8') as handle:
            data = json.load(handle)
    except (OSError, ValueError):
        return config
    if not isinstance(data, dict):
        return config
    for key in DEFAULTS:
        value = data.get(key)
        if isinstance(value, int) and value > 0:
            config[key] = value
    return config


def evidence_dir(repo):
    path = os.path.join(repo, '.wiki', 'work', 'evidence')
    os.makedirs(path, exist_ok=True)
    return path


def usage_path(repo):
    return os.path.join(repo, '.wiki', 'work', 'usage.jsonl')


def canonical_key(key_dict):
    return json.dumps(key_dict, sort_keys=True, separators=(',', ':'),
                      ensure_ascii=True)


def packet_id_for(key_dict):
    return hashlib.sha256(
        canonical_key(key_dict).encode('utf-8')).hexdigest()[:32]


def packet_path(repo, evidence_id):
    return os.path.join(evidence_dir(repo), evidence_id + '.json')


def load_packet(repo, evidence_id):
    path = packet_path(repo, evidence_id)
    if not os.path.exists(path):
        return None
    with open(path, encoding='utf-8') as handle:
        return json.load(handle)


def store_packet(repo, packet):
    write_json_atomic(packet_path(repo, packet['id']), packet)


def write_json_atomic(path, data):
    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as handle:
        json.dump(data, handle, ensure_ascii=True)
    os.replace(tmp, path)


# ---------------------------------------------------------------------------
# Usage accounting


class Usage:
    """Appends one line per delivered retrieval or list page."""

    def __init__(self, repo, revision):
        self.repo = repo
        self.revision = revision

    def append(self, op, evidence_id, bytes_count, cached, attempt):
        os.makedirs(os.path.dirname(usage_path(self.repo)), exist_ok=True)
        line = {
            'ts': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
            'op': op,
            'revision': self.revision,
            'evidence_id': evidence_id,
            'bytes': bytes_count,
            'estimated_tokens': bytes_count // 4,  # estimate, never billing
            'cached': cached,
            'attempt': attempt,
        }
        with open(usage_path(self.repo), 'a', encoding='utf-8') as handle:
            handle.write(json.dumps(line, ensure_ascii=True) + '\n')


def read_usage(repo):
    path = usage_path(repo)
    if not os.path.exists(path):
        return []
    rows = []
    with open(path, encoding='utf-8') as handle:
        for line in handle:
            line = line.strip()
            if not line:
                continue
            try:
                rows.append(json.loads(line))
            except ValueError:
                continue
    return rows


def evidence_budget_state(repo, attempt=None):
    """Cumulative delivered evidence bytes for one attempt (or all usage
    when attempt is None). Callers enforce the ceiling."""
    config = load_config(repo)
    rows = read_usage(repo)
    selected = [row for row in rows
                if attempt is None or row.get('attempt') == attempt]
    used = sum(row.get('bytes', 0) for row in selected)
    ceiling = config['evidence_attempt_max_bytes']
    return {
        'attempt_max_bytes': ceiling,
        'used_bytes': used,
        'remaining_bytes': max(0, ceiling - used),
        'retrievals': sum(1 for row in selected
                          if row.get('op') in ('span', 'graph')),
    }


def enforce_budget(repo, config, attempt, additional_bytes):
    if attempt is None:
        return
    state = evidence_budget_state(repo, attempt=attempt)
    if state['used_bytes'] + additional_bytes > state['attempt_max_bytes']:
        raise EvidenceError(
            'evidence budget exhausted for attempt %r: used %d of %d '
            'bytes, requested %d more; checkpoint and split the question '
            'or record an explicit budget increase' % (
                attempt, state['used_bytes'], state['attempt_max_bytes'],
                additional_bytes))


# ---------------------------------------------------------------------------
# Span evidence


def read_span_source(repo, path):
    full = os.path.join(repo, path.replace('/', os.sep))
    with open(full, 'rb') as handle:
        raw = handle.read()
    digest = hashlib.sha256(raw).hexdigest()
    lines = raw.decode('utf-8', 'replace').split('\n')
    return digest, lines


def _truncate_giant_lines(lines, start_line):
    processed = []
    truncations = []
    for offset, line in enumerate(lines):
        number = start_line + offset
        if len(line) <= GIANT_LINE_CHARS:
            processed.append(line)
            continue
        original_bytes = len(line.encode('utf-8'))
        cut = line[:GIANT_LINE_CHARS]
        removed = original_bytes - len(cut.encode('utf-8'))
        processed.append(cut + '... [truncated %d bytes]' % removed)
        truncations.append({'line': number, 'original_bytes': original_bytes})
    return processed, truncations


def _span_item(evidence_id, path, start, end, content, content_bytes,
               cached, source_sha256):
    return {
        'evidence_id': evidence_id,
        'kind': 'span',
        'path': path,
        'start_line': start,
        'end_line': end,
        'content': content,
        'content_bytes': content_bytes,
        'cached': cached,
        'source_sha256': source_sha256,
    }


def span_query(repo, revision, args, config):
    path = args.span_path
    if not path or args.span_start is None:
        raise EvidenceError('span requires: <path> <start_line> [end_line]')
    start = args.span_start
    end = args.span_end if args.span_end is not None else start
    if start < 1 or end < start:
        raise EvidenceError('invalid span bounds %r-%r' % (start, end))

    con = discovery.open_index(repo)
    try:
        row = con.execute(
            'SELECT class, reason FROM files WHERE path=?',
            (path,)).fetchone()
    finally:
        con.close()
    if row is None:
        raise EvidenceError(
            'path %r not present in the discovery index' % path)
    if row[0] == 'excluded':
        raise EvidenceError(
            'path is excluded (%s); excluded content is never read' % row[1])

    try:
        source_sha256, lines = read_span_source(repo, path)
    except OSError as exc:
        raise EvidenceError('cannot read %s: %s' % (path, exc))

    max_lines = config['evidence_span_max_lines']
    max_bytes = config['evidence_span_max_bytes']
    capped_end = min(end, start + max_lines - 1)
    line_capped = end > capped_end
    selected = lines[start - 1:capped_end]
    processed, truncations = _truncate_giant_lines(selected, start)
    byte_capped = False
    while processed:
        content = '\n'.join(processed)
        if len(content.encode('utf-8')) <= max_bytes:
            break
        processed.pop()
        byte_capped = True
    content = '\n'.join(processed)
    content_bytes = len(content.encode('utf-8'))
    delivered_end = start + len(processed) - 1

    if args.from_packet:
        return _deliver_from_packet(repo, revision, args, 'span',
                                    source_sha256)

    key = {
        'repo': str(repo),
        'path': path,
        'start_line': start,
        'end_line': end,
        'source_sha256': source_sha256,
        'adapter_version': discovery.ADAPTER_VERSION,
    }
    evidence_id = packet_id_for(key)
    existing = load_packet(repo, evidence_id)
    if existing is not None:
        cached = True
        content = existing['content']
        content_bytes = existing['content_bytes']
        delivered_start = existing.get('delivered_start', start)
        delivered_end = existing.get('delivered_end', delivered_end)
    else:
        cached = False
        delivered_start = start
        store_packet(repo, {
            'id': evidence_id,
            'kind': 'span',
            'repo_root': str(repo),
            'revision': revision,
            'key': key,
            'content': content,
            'content_bytes': content_bytes,
            'source_sha256': source_sha256,
            'created_at_epoch': time.time(),
            'truncations': truncations,
            'delivered_start': delivered_start,
            'delivered_end': delivered_end,
        })
    enforce_budget(repo, config, args.attempt, content_bytes)
    Usage(repo, revision).append(op='span', evidence_id=evidence_id,
                                 bytes_count=content_bytes, cached=cached,
                                 attempt=args.attempt)
    truncated = line_capped or byte_capped
    # Line cap maps onto the max_results vocabulary (count of delivered
    # lines); byte cap onto max_bytes. Documented contract deviation note:
    # spans have no separate reason token, so count caps report max_results.
    reason = 'max_bytes' if byte_capped else (
        'max_results' if line_capped else None)
    item = _span_item(evidence_id, path, delivered_start, delivered_end,
                      content, content_bytes, cached, source_sha256)
    return discovery.envelope([item], None, None, truncated, reason,
                              revision, content_bytes)


def _deliver_from_packet(repo, revision, args, kind, source_sha256):
    packet = load_packet(repo, args.from_packet)
    if packet is None:
        raise EvidenceError('packet %s not found' % args.from_packet)
    if packet['revision'] != revision:
        raise EvidenceError(
            'packet revision mismatch: packet was captured at revision %s '
            'but the index is at revision %s; the packet is stale, re-query '
            'from the current revision' % (packet['revision'], revision),
            exit_code=2)
    if kind == 'span' and packet.get('source_sha256') != source_sha256:
        raise EvidenceError(
            'source file changed since packet capture (sha256 differs); '
            'the packet no longer matches %s' % packet['key'].get('path'))
    config = load_config(repo)
    content_bytes = packet['content_bytes']
    enforce_budget(repo, config, args.attempt, content_bytes)
    Usage(repo, revision).append(
        op=kind, evidence_id=packet['id'], bytes_count=content_bytes,
        cached=True, attempt=args.attempt)
    if kind == 'span':
        item = _span_item(packet['id'], packet['key']['path'],
                          packet.get('delivered_start',
                                     packet['key']['start_line']),
                          packet.get('delivered_end',
                                     packet['key']['end_line']),
                          packet['content'], content_bytes, True,
                          packet.get('source_sha256'))
    else:
        item = {
            'evidence_id': packet['id'],
            'kind': 'graph',
            'root': packet['key'].get('root_symbol') or
            packet['key'].get('root_path'),
            'direction': packet['key']['direction'],
            'depth': packet['key']['depth'],
            'content': packet['content'],
            'content_bytes': content_bytes,
            'cached': True,
        }
    return discovery.envelope([item], None, None, False, None, revision,
                              content_bytes)


# ---------------------------------------------------------------------------
# Graph evidence


def _symbol_key(path, name):
    return '%s::%s' % (path, name)


def graph_query(repo, revision, args, config):
    if not args.symbol and not args.path:
        raise EvidenceError('graph requires --symbol NAME or --path P')
    direction = args.direction or 'both'
    depth = args.depth if args.depth and args.depth > 0 else 1
    max_nodes = config['evidence_list_max_results']
    max_bytes = config['evidence_list_max_bytes']

    con = discovery.open_index(repo)
    try:
        file_paths = {row[0] for row in con.execute(
            "SELECT path FROM files WHERE class != 'excluded'")}
        if args.symbol:
            root_rows = con.execute(
                'SELECT path, name, kind, line FROM symbols WHERE name=? '
                'ORDER BY path, name', (args.symbol,)).fetchall()
        else:
            if args.path not in file_paths:
                raise EvidenceError(
                    'path %r not present in the discovery index' % args.path)
            root_rows = None
        symbol_index = {}
        for name, path in con.execute(
                'SELECT DISTINCT name, path FROM symbols ORDER BY path'):
            symbol_index.setdefault(name, []).append(
                _symbol_key(path, name))
    finally:
        con.close()

    nodes = {}
    adjacency = {}

    def add_node(key, meta):
        nodes[key] = meta

    def resolve_dst(dst):
        targets = []
        if dst in file_paths:
            targets.append(dst)
        elif dst + '.py' in file_paths:
            targets.append(dst + '.py')
        elif dst in symbol_index:
            targets.extend(symbol_index[dst])
        else:
            targets.append('ext:' + dst)
        return targets

    if args.symbol:
        roots = []
        for path, name, kind, line in root_rows or []:
            key = _symbol_key(path, name)
            add_node(key, {'path': path, 'name': name, 'kind': kind,
                           'line': line})
            roots.append(key)
        if not roots:
            payload = json.dumps([], ensure_ascii=True).encode('utf-8')
            Usage(repo, revision).append(op='graph', evidence_id=None,
                                         bytes_count=len(payload),
                                         cached=False, attempt=args.attempt)
            return discovery.envelope([], None, None, False, None,
                                      revision, len(payload))
    else:
        roots = [args.path]
        add_node(args.path, {'kind': 'file'})

    truncated_results = False
    queue = deque((key, 0) for key in roots)
    visited = set(roots)
    con = discovery.open_index(repo)
    try:
        while queue and not truncated_results:
            key, level = queue.popleft()
            adjacency.setdefault(key, [])
            seen_dst = set()
            edges = []
            if key in file_paths:
                src_path = key
                src_symbol = None
            else:
                src_path, _, src_symbol = key.partition('::')
            if direction in ('outgoing', 'both'):
                if src_symbol:
                    edges.extend(con.execute(
                        'SELECT dst, kind FROM relations WHERE src_path=? '
                        'AND (src_symbol IS NULL OR src_symbol=?) '
                        'ORDER BY id', (src_path, src_symbol)).fetchall())
                else:
                    edges.extend(con.execute(
                        'SELECT dst, kind FROM relations WHERE src_path=? '
                        'AND src_symbol IS NULL ORDER BY id',
                        (src_path,)).fetchall())
            if direction in ('incoming', 'both'):
                if src_symbol:
                    incoming = con.execute(
                        'SELECT src_path, src_symbol, kind FROM relations '
                        'WHERE dst=? OR dst=? ORDER BY id',
                        (src_symbol, src_path)).fetchall()
                else:
                    incoming = con.execute(
                        'SELECT src_path, src_symbol, kind FROM relations '
                        'WHERE dst=? ORDER BY id', (src_path,)).fetchall()
                for inc_path, inc_symbol, kind in incoming:
                    if inc_symbol:
                        neighbor = _symbol_key(inc_path, inc_symbol)
                        meta = {'path': inc_path, 'name': inc_symbol}
                    elif inc_path in file_paths:
                        neighbor = inc_path
                        meta = {'kind': 'file'}
                    else:
                        neighbor = 'ext:' + str(inc_path)
                        meta = {'kind': 'external'}
                    edges.append((neighbor, kind, meta))
            for edge in edges:
                dst, kind = edge[0], edge[1]
                meta = edge[2] if len(edge) > 2 else None
                if meta is not None:
                    neighbors = [(dst, meta)]
                else:
                    neighbors = [(target, None)
                                 for target in resolve_dst(dst)]
                for neighbor, node_meta in neighbors:
                    if neighbor in seen_dst:
                        continue
                    seen_dst.add(neighbor)
                    if neighbor not in nodes:
                        if len(nodes) >= max_nodes:
                            truncated_results = True
                            break
                        if node_meta is None:
                            if neighbor in file_paths:
                                node_meta = {'kind': 'file'}
                            elif neighbor.startswith('ext:'):
                                node_meta = {'kind': 'external'}
                            else:
                                n_path, _, n_name = neighbor.partition('::')
                                node_meta = {'path': n_path,
                                             'name': n_name}
                        add_node(neighbor, node_meta)
                        if level + 1 <= depth and \
                                not neighbor.startswith('ext:'):
                            if neighbor not in visited:
                                visited.add(neighbor)
                                queue.append((neighbor, level + 1))
                    adjacency.setdefault(key, []).append(neighbor)
                if truncated_results:
                    break
    finally:
        con.close()

    payload = {'root': roots, 'nodes': nodes, 'adjacency': adjacency}
    content = json.dumps(payload, ensure_ascii=True)
    byte_capped = False
    while len(content.encode('utf-8')) > max_bytes:
        trimmable = [k for k in nodes if k not in roots]
        if not trimmable:
            break
        dropped = trimmable[-1]
        del nodes[dropped]
        adjacency.pop(dropped, None)
        for values in adjacency.values():
            if dropped in values:
                values.remove(dropped)
        byte_capped = True
        content = json.dumps(payload, ensure_ascii=True)
    content_bytes = len(content.encode('utf-8'))

    if args.from_packet:
        return _deliver_from_packet(repo, revision, args, 'graph', None)

    key_dict = {
        'repo': str(repo),
        'root_symbol' if args.symbol else 'root_path':
            args.symbol if args.symbol else args.path,
        'direction': direction,
        'depth': depth,
        'revision': revision,
        'adapter_version': discovery.ADAPTER_VERSION,
    }
    evidence_id = packet_id_for(key_dict)
    existing = load_packet(repo, evidence_id)
    if existing is not None:
        cached = True
        content = existing['content']
        content_bytes = existing['content_bytes']
    else:
        cached = False
        store_packet(repo, {
            'id': evidence_id,
            'kind': 'graph',
            'repo_root': str(repo),
            'revision': revision,
            'key': key_dict,
            'content': content,
            'content_bytes': content_bytes,
            'source_sha256': None,
            'created_at_epoch': time.time(),
        })
    enforce_budget(repo, config, args.attempt, content_bytes)
    Usage(repo, revision).append(op='graph', evidence_id=evidence_id,
                                 bytes_count=content_bytes, cached=cached,
                                 attempt=args.attempt)
    truncated = truncated_results or byte_capped
    reason = 'max_results' if truncated_results else (
        'max_bytes' if byte_capped else None)
    item = {
        'evidence_id': evidence_id,
        'kind': 'graph',
        'root': args.symbol if args.symbol else args.path,
        'direction': direction,
        'depth': depth,
        'content': content,
        'content_bytes': content_bytes,
        'cached': cached,
    }
    return discovery.envelope([item], None, None, truncated, reason,
                              revision, content_bytes)
