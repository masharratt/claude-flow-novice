#!/usr/bin/env python3
"""Mechanical lane + wave derivation for cfn-loop-task PHASE 2.

Implements cfn-loop-task.md LANE DERIVATION steps 2-6 as a deterministic
computation instead of model reasoning. Measured 2026-08-20: a coordinator
re-derived lanes for a 165-step plan across 14 python heredocs in main chat,
~53k tokens of context, for a graph problem with one right answer.

Pipeline order (each stage feeds the next):
  1  parse step rows out of every plan table that has a File column
  2  one base lane per step-number major
  3  LANE_CAP merge (smallest lane into its smaller neighbour)
  4  hub detection (a file written by many steps across >1 major)
  5  wide-phase split by owned-file cluster, with min-sublane folding
  6  exclusive file ownership (lanes sharing a file merge)
  7  produce/consume edges, duplicate-producer blockers
  8  cycle merge (SCC)
  9  topological waves, each chunked to LANE_CAP concurrency

Called through derive-lanes.sh. See tests/test-derive-lanes.sh.
"""
import argparse
import json
import re
import sys
from collections import defaultdict

STEP_RE = re.compile(r"^[0-9]+\.[0-9]+[a-z]?$")
# Markdown escapes a literal pipe inside a cell as \| . Splitting on a bare
# pipe shifts every column after a Change cell like `"a" \| "b"`, which is how
# the sibling awk-based bars mis-read Produces and Consumes.
CELL_SPLIT_RE = re.compile(r"(?<!\\)\|")
SEP_RE = re.compile(r"^[\s|:-]+$")


def split_cells(line):
    parts = CELL_SPLIT_RE.split(line)
    if parts and not parts[0].strip():
        parts = parts[1:]
    if parts and not parts[-1].strip():
        parts = parts[:-1]
    return [p.strip() for p in parts]


def split_list(cell):
    """A File / Produces / Consumes cell into its items."""
    if not cell or cell.strip() in ("-", ""):
        return []
    cell = cell.replace("<br/>", "<br>").replace("<br />", "<br>")
    out = []
    for chunk in re.split(r"<br>|,|\n", cell):
        chunk = chunk.replace("`", "").replace("\\|", "|").strip()
        chunk = chunk.strip("*_ ")
        if chunk and chunk != "-":
            out.append(chunk)
    return out


def parse_plan(path):
    """-> (rows, phase_of_major). Each row: dict(step, major, files, produces, consumes)."""
    rows = []
    phase_of_major = {}
    phase = ""
    cols = None
    with open(path, encoding="utf-8", errors="replace") as fh:
        for line in fh:
            line = line.rstrip("\n")
            if line.startswith("## "):
                phase = line[3:].strip()
                cols = None
                continue
            if not line.lstrip().startswith("|"):
                continue
            if SEP_RE.match(line):
                continue
            cells = split_cells(line)
            if not cells:
                continue
            # Header row: remember where the columns we need actually are.
            lowered = [c.lower() for c in cells]
            if any(c.startswith("file") for c in lowered) and not STEP_RE.match(cells[0]):
                cols = {
                    "file": next((i for i, c in enumerate(lowered) if c.startswith("file")), 1),
                    "produces": next((i for i, c in enumerate(lowered) if c.startswith("produces")), None),
                    "consumes": next((i for i, c in enumerate(lowered) if c.startswith("consumes")), None),
                }
                continue
            if not STEP_RE.match(cells[0]):
                continue
            c = cols or {"file": 1, "produces": 3, "consumes": 4}

            def cell(key):
                i = c.get(key)
                return cells[i] if i is not None and i < len(cells) else ""

            major = cells[0].split(".", 1)[0]
            phase_of_major.setdefault(major, phase)
            rows.append({
                "step": cells[0],
                "major": major,
                "files": split_list(cell("file")),
                "produces": split_list(cell("produces")),
                "consumes": split_list(cell("consumes")),
            })
    return rows, phase_of_major


def step_key(s):
    m = re.match(r"^([0-9]+)\.([0-9]+)([a-z]?)$", s)
    return (int(m.group(1)), int(m.group(2)), m.group(3)) if m else (0, 0, s)


def lane_key(lid):
    m = re.match(r"^([0-9]+)(.*)$", lid)
    return (int(m.group(1)), m.group(2)) if m else (0, lid)


class Lanes:
    """Ordered lane table. A lane is {id, phase, steps:[step-id]}."""

    def __init__(self, rows, phase_of_major):
        self.row_of = {r["step"]: r for r in rows}
        self.lanes = {}
        for major in sorted({r["major"] for r in rows}, key=int):
            steps = sorted([r["step"] for r in rows if r["major"] == major], key=step_key)
            self.lanes[major] = {"id": major, "phase": phase_of_major.get(major, ""), "steps": steps}
        self.order = sorted(self.lanes, key=lane_key)

    def ids(self):
        return list(self.order)

    def steps(self, lid):
        return self.lanes[lid]["steps"]

    def files(self, lid, exclude=frozenset()):
        out = set()
        for s in self.steps(lid):
            out |= {f for f in self.row_of[s]["files"] if f not in exclude}
        return out

    def merge(self, keep, drop):
        self.lanes[keep]["steps"] = sorted(
            set(self.lanes[keep]["steps"]) | set(self.lanes[drop]["steps"]), key=step_key)
        del self.lanes[drop]
        self.order = [x for x in self.order if x != drop]

    def replace(self, lid, new_lanes):
        """Swap one lane for its sub-lanes, keeping position."""
        i = self.order.index(lid)
        phase = self.lanes[lid]["phase"]
        del self.lanes[lid]
        self.order[i:i + 1] = [nl["id"] for nl in new_lanes]
        for nl in new_lanes:
            self.lanes[nl["id"]] = {"id": nl["id"], "phase": phase, "steps": nl["steps"]}


def cluster_steps_by_file(steps, files_of, min_sublane, consumes_of, produces_of):
    """Transitive co-write clusters, then fold clusters under min_sublane.

    A cluster under min_sublane folds into whichever surviving cluster it
    exchanges the most Produces/Consumes identifiers with; with no exchange it
    is bin-packed with other undersized clusters. Never split below
    min_sublane: serial learning and coordination overhead eat the win.
    """
    parent = {s: s for s in steps}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb, key=step_key)] = min(ra, rb, key=step_key)

    owner = {}
    for s in steps:
        for f in files_of(s):
            if f in owner:
                union(owner[f], s)
            else:
                owner[f] = s

    groups = defaultdict(list)
    for s in steps:
        groups[find(s)].append(s)
    clusters = [sorted(v, key=step_key) for v in groups.values()]
    clusters.sort(key=lambda c: (-len(c), step_key(c[0])))

    big = [c for c in clusters if len(c) >= min_sublane]
    small = [c for c in clusters if len(c) < min_sublane]

    def exchange(cluster, other):
        a_p = set().union(*[produces_of(s) for s in cluster]) if cluster else set()
        a_c = set().union(*[consumes_of(s) for s in cluster]) if cluster else set()
        b_p = set().union(*[produces_of(s) for s in other]) if other else set()
        b_c = set().union(*[consumes_of(s) for s in other]) if other else set()
        return len(a_c & b_p) + len(a_p & b_c)

    leftover = []
    for c in small:
        best, score = None, 0
        for other in big:
            sc = exchange(c, other)
            if sc > score:
                best, score = other, sc
        if best is not None:
            best.extend(c)
            best.sort(key=step_key)
        else:
            leftover.append(c)

    # Bin-pack the unattached remainder so it does not all land in one lane.
    flat = sorted([s for c in leftover for s in c], key=step_key)
    if flat:
        if big and len(flat) < min_sublane:
            big[0].extend(flat)
            big[0].sort(key=step_key)
        else:
            packs, cur = [], []
            for s in flat:
                cur.append(s)
                if len(cur) >= min_sublane:
                    packs.append(cur)
                    cur = []
            if cur:
                if packs:
                    packs[-1].extend(cur)
                else:
                    packs.append(cur)
            big.extend(packs)

    big.sort(key=lambda c: step_key(c[0]))
    return big


def tarjan_scc(nodes, edges_out):
    index, stack, on_stack = {}, [], set()
    low, counter, result = {}, [0], []

    def strong(v):
        # Iterative: a 109-step co-write chain overflows the recursion limit.
        work = [(v, iter(edges_out.get(v, ())))]
        index[v] = low[v] = counter[0]
        counter[0] += 1
        stack.append(v)
        on_stack.add(v)
        while work:
            node, it = work[-1]
            advanced = False
            for w in it:
                if w not in index:
                    index[w] = low[w] = counter[0]
                    counter[0] += 1
                    stack.append(w)
                    on_stack.add(w)
                    work.append((w, iter(edges_out.get(w, ()))))
                    advanced = True
                    break
                if w in on_stack:
                    low[node] = min(low[node], index[w])
            if advanced:
                continue
            work.pop()
            if work:
                low[work[-1][0]] = min(low[work[-1][0]], low[node])
            if low[node] == index[node]:
                comp = []
                while True:
                    w = stack.pop()
                    on_stack.discard(w)
                    comp.append(w)
                    if w == node:
                        break
                result.append(comp)

    for v in nodes:
        if v not in index:
            strong(v)
    return result


def derive(path, lane_cap, max_steps, max_files, min_sublane, hub_min_steps,
           hub_split, soft_ownership):
    rows, phase_of_major = parse_plan(path)
    if not rows:
        print(f"derive-lanes: no step rows found in {path}", file=sys.stderr)
        return None, 2

    logs, blockers = [], []
    L = Lanes(rows, phase_of_major)
    row_of = L.row_of

    def produces_of(s):
        return set(row_of[s]["produces"])

    def consumes_of(s):
        return set(row_of[s]["consumes"])

    # ---- 3. LANE_CAP merge on base phase lanes -------------------------------
    while len(L.ids()) > lane_cap:
        ids = L.ids()
        victim = min(ids, key=lambda x: (len(L.steps(x)), lane_key(x)))
        i = ids.index(victim)
        neighbours = [n for n in (ids[i - 1] if i > 0 else None,
                                  ids[i + 1] if i + 1 < len(ids) else None) if n]
        target = min(neighbours, key=lambda x: (len(L.steps(x)), lane_key(x)))
        keep, drop = sorted([victim, target], key=lane_key)
        logs.append(f"cap-merge: lane {drop} into lane {keep} (LANE_CAP={lane_cap})")
        L.merge(keep, drop)

    # ---- 4. hub detection ----------------------------------------------------
    writers = defaultdict(set)
    majors_of_file = defaultdict(set)
    for r in rows:
        for f in r["files"]:
            writers[f].add(r["step"])
            majors_of_file[f].add(r["major"])
    hubs = []
    for f in sorted(writers):
        if len(writers[f]) >= hub_min_steps and len(majors_of_file[f]) > 1:
            hubs.append({
                "file": f,
                "written_by_steps": len(writers[f]),
                "phases": sorted(majors_of_file[f], key=int),
            })
    for h in hubs:
        logs.append(
            f"hub: {h['file']} written by {h['written_by_steps']} steps across "
            f"{len(h['phases'])} phases (majors {','.join(h['phases'])}) -> exclusive "
            f"ownership forces those phases into one serial lane; --hub-split trades "
            f"strict exclusivity for parallelism")
    hub_files = {h["file"] for h in hubs} if (hub_split or soft_ownership) else set()

    def own_files(step):
        return [f for f in row_of[step]["files"] if f not in hub_files]

    # ---- 5. wide-phase split by owned-file cluster ---------------------------
    for lid in list(L.ids()):
        steps = L.steps(lid)
        nfiles = len(L.files(lid, exclude=hub_files))
        if len(steps) <= max_steps and nfiles <= max_files:
            continue
        clusters = cluster_steps_by_file(steps, own_files, min_sublane, consumes_of, produces_of)
        if len(clusters) < 2:
            logs.append(f"phase-split: {lid} unsplittable (co-write chain), "
                        f"{len(steps)} steps stay in one lane")
            continue
        subs = [{"id": f"{lid}{chr(ord('a') + i)}", "steps": c} for i, c in enumerate(clusters)]
        logs.append("phase-split: " + lid + " -> " +
                    " ".join(f"{s['id']}:{len(s['steps'])}" for s in subs))
        L.replace(lid, subs)

    # ---- 6. file ownership ---------------------------------------------------
    # strict (default): a file in two lanes merges them -- the documented invariant.
    # --hub-split:      only hub-class files get one owner; the rest still merge.
    # --soft-ownership: every multi-lane file gets one owner and the other writers
    #                   are chained behind it, so no two lanes that write the same
    #                   file can ever land in the same wave slot. Trades the
    #                   exclusive-ownership invariant for parallelism.
    file_owner = {}      # file -> owning lane id (soft files only)
    soft_files = set()   # files exempted from the merge rule

    def writers_of(f):
        return [lid for lid in L.ids()
                if any(f in row_of[s2]["files"] for s2 in L.steps(lid))]

    def write_count(lid, f):
        return sum(1 for s2 in L.steps(lid) if f in row_of[s2]["files"])

    def earliest(lid):
        return step_key(L.steps(lid)[0]) if L.steps(lid) else (0, 0, "")

    def assign_owner(f, pool):
        producers = [lid for lid in pool
                     if any(p.split(":", 1)[0] == f
                            for s2 in L.steps(lid) for p in produces_of(s2))]
        cands = producers or pool
        return max(cands, key=lambda lid: (write_count(lid, f), -earliest(lid)[1]))

    if soft_ownership:
        all_files = sorted({f for r in rows for f in r["files"]})
        for f in all_files:
            w = writers_of(f)
            if len(w) < 2:
                continue
            soft_files.add(f)
            owner = assign_owner(f, w)
            file_owner[f] = owner
            logs.append(f"soft-own: {f} owned by lane {owner}; "
                        f"{len(w) - 1} co-writer lane(s) chained behind it")
    elif hub_split:
        for h in hubs:
            f = h["file"]
            w = writers_of(f)
            if len(w) < 2:
                continue
            soft_files.add(f)
            owner = assign_owner(f, w)
            file_owner[f] = owner
            logs.append(f"hub-split: {f} owned by lane {owner}; "
                        f"{len(w) - 1} lane(s) append behind it via an ordering edge "
                        f"(not exclusive ownership)")

    def lane_own_files(lid):
        out = set()
        for s2 in L.steps(lid):
            for f in row_of[s2]["files"]:
                if f in soft_files:
                    if file_owner.get(f) == lid:
                        out.add(f)
                else:
                    out.add(f)
        return out

    def lane_shared_files(lid):
        return sorted({f for s2 in L.steps(lid) for f in row_of[s2]["files"]
                       if f in soft_files and file_owner.get(f) != lid})

    changed = True
    while changed:
        changed = False
        seen = {}
        for lid in L.ids():
            for f in sorted(lane_own_files(lid)):
                if f in seen and seen[f] != lid:
                    keep, drop = sorted([seen[f], lid], key=lane_key)
                    logs.append(f"file-merge: lane {drop} into lane {keep} (both write {f})")
                    for sf, own in list(file_owner.items()):
                        if own == drop:
                            file_owner[sf] = keep
                    L.merge(keep, drop)
                    changed = True
                    break
                seen[f] = lid
            if changed:
                break

    # ---- 7. edges + duplicate-producer blockers -----------------------------
    lane_of_step = {s: lid for lid in L.ids() for s in L.steps(lid)}
    producer_lanes = defaultdict(set)
    for s, lid in lane_of_step.items():
        for p in produces_of(s):
            producer_lanes[p].add(lid)
    for ident in sorted(producer_lanes):
        if len(producer_lanes[ident]) > 1:
            blockers.append({
                "kind": "duplicate_producer",
                "id": ident,
                "lanes": sorted(producer_lanes[ident], key=lane_key),
            })

    edges = set()
    for s, lid in lane_of_step.items():
        for c in consumes_of(s):
            if c not in producer_lanes:
                logs.append(f"warn: dangling consume {c} (step {s}) - treated as pre-existing")
                continue
            for src in producer_lanes[c]:
                if src != lid:
                    edges.add((src, lid))
    # A soft file's writers form a total order (owner first, then plan order) so two
    # lanes that write the same file can never be spawned in the same wave slot.
    for f in sorted(soft_files):
        owner = file_owner.get(f)
        chain = [lid for lid in L.ids()
                 if any(f in row_of[s]["files"] for s in L.steps(lid))]
        if owner in chain:
            chain = [owner] + sorted((c for c in chain if c != owner), key=earliest)
        else:
            chain = sorted(chain, key=earliest)
        for a, b in zip(chain, chain[1:]):
            edges.add((a, b))

    # ---- 8. cycle merge -----------------------------------------------------
    def build_out(edge_set):
        out = defaultdict(list)
        for a, b in edge_set:
            out[a].append(b)
        return out

    for comp in tarjan_scc(L.ids(), build_out(edges)):
        if len(comp) < 2:
            continue
        comp = sorted(comp, key=lane_key)
        logs.append(f"cycle-merge: {'+'.join(comp)} -> {comp[0]} (run sequentially)")
        for drop in comp[1:]:
            for sf, own in list(file_owner.items()):
                if own == drop:
                    file_owner[sf] = comp[0]
            L.merge(comp[0], drop)
        remap = {d: comp[0] for d in comp[1:]}
        edges = {(remap.get(a, a), remap.get(b, b)) for a, b in edges}
        edges = {(a, b) for a, b in edges if a != b}

    # ---- 9. topological waves, chunked to LANE_CAP concurrency -------------
    ids = L.ids()
    out_e = build_out(edges)
    indeg = {lid: 0 for lid in ids}
    for _, b in edges:
        indeg[b] += 1
    waves, remaining = [], set(ids)
    while remaining:
        ready = sorted([lid for lid in remaining if indeg[lid] == 0], key=lane_key)
        if not ready:  # unreachable after SCC merge; fail loud rather than hang
            print("derive-lanes: internal error - residual cycle after SCC merge: "
                  f"{sorted(remaining, key=lane_key)}", file=sys.stderr)
            return None, 2
        for i in range(0, len(ready), lane_cap):
            waves.append(ready[i:i + lane_cap])
        for lid in ready:
            remaining.discard(lid)
            for w in out_e.get(lid, ()):
                indeg[w] -= 1
    for i, w in enumerate(waves, 1):
        logs.append(f"wave {i}: lanes [{', '.join(w)}]")

    lanes_out = []
    for lid in L.ids():
        steps = L.steps(lid)
        lanes_out.append({
            "id": lid,
            "phase": L.lanes[lid]["phase"],
            "steps": steps,
            "files": sorted(lane_own_files(lid)),
            "shared_files": lane_shared_files(lid),
            "produces": sorted(set().union(*[produces_of(s) for s in steps]) if steps else set()),
            "consumes": sorted(set().union(*[consumes_of(s) for s in steps]) if steps else set()),
        })

    # ---- separability advisory ---------------------------------------------
    # Lane math cannot parallelise a plan whose steps all write the same files.
    # Say so mechanically so the coordinator escalates to a replan instead of
    # quietly running one lane of N steps and calling it a wave.
    total_steps = len(rows)
    longest = max((len(l["steps"]) for l in lanes_out), default=0)
    critical_path = sum(max((len(L.steps(lid)) for lid in slot), default=0) for slot in waves)
    co_written = sorted(f for f in writers if len({
        lane_of_step[s] for s in writers[f] if s in lane_of_step}) > 1)
    advisory = None
    if longest > max_steps * 2:
        advisory = (
            f"not lane-separable: longest lane is {longest} of {total_steps} steps "
            f"(cap {max_steps}). Serial critical path is {critical_path} steps. "
            f"{len(hubs)} hub file(s) and {len(co_written)} co-written file(s) tie the "
            f"phases together. Escalate: re-run /write-plan with phase-local file sets, "
            f"or accept the serial run explicitly. Cleverer lane math cannot fix this.")
        logs.append(advisory)
    separability = {
        "total_steps": total_steps,
        "lanes": len(lanes_out),
        "waves": len(waves),
        "longest_lane_steps": longest,
        "critical_path_steps": critical_path,
        "parallel_speedup": round(total_steps / critical_path, 2) if critical_path else 1.0,
        "co_written_files": co_written,
        "advisory": advisory,
    }

    result = {
        "plan": path,
        "lane_cap": lane_cap,
        "lanes": lanes_out,
        "edges": sorted([list(e) for e in edges]),
        "waves": waves,
        "logs": logs,
        "blockers": blockers,
        "hubs": hubs,
        "separability": separability,
    }
    return result, (1 if blockers else 0)


def main():
    ap = argparse.ArgumentParser(add_help=False)
    ap.add_argument("plan", nargs="?")
    ap.add_argument("--lane-cap", type=int, default=8)
    ap.add_argument("--max-steps", type=int, default=15)
    ap.add_argument("--max-files", type=int, default=8)
    ap.add_argument("--min-sublane", type=int, default=5)
    ap.add_argument("--hub-min-steps", type=int, default=10)
    ap.add_argument("--hub-split", action="store_true")
    ap.add_argument("--soft-ownership", action="store_true")
    ap.add_argument("--quiet", action="store_true")
    try:
        args = ap.parse_args()
    except SystemExit:
        return 2
    if not args.plan:
        print("usage: derive-lanes.sh <planning/<slug>/PLAN_<slug>.md> [--lane-cap N] "
              "[--max-steps N] [--max-files M] [--min-sublane N] [--hub-split] "
              "[--soft-ownership]", file=sys.stderr)
        return 2
    try:
        open(args.plan, "rb").close()
    except OSError:
        print(f"error: file not found: {args.plan}", file=sys.stderr)
        return 2

    result, rc = derive(args.plan, args.lane_cap, args.max_steps, args.max_files,
                        args.min_sublane, args.hub_min_steps, args.hub_split,
                        args.soft_ownership)
    if result is None:
        return rc
    if not args.quiet:
        for line in result["logs"]:
            print(f"derive-lanes: {line}", file=sys.stderr)
        for b in result["blockers"]:
            print(f"derive-lanes: BLOCKER {b['kind']} {b['id']} in lanes "
                  f"{','.join(b['lanes'])} - AskUserQuestion which lane owns it",
                  file=sys.stderr)
        sep = result["separability"]
        print(f"derive-lanes: {len(result['lanes'])} lane(s), {len(result['waves'])} wave(s), "
              f"{len(result['edges'])} edge(s), {len(result['blockers'])} blocker(s); "
              f"critical path {sep['critical_path_steps']}/{sep['total_steps']} steps "
              f"({sep['parallel_speedup']}x)", file=sys.stderr)
    print(json.dumps(result, indent=2))
    return rc


if __name__ == "__main__":
    sys.exit(main())
