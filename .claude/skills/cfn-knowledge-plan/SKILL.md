---
name: cfn-knowledge-plan
description: "Planning pipeline for deep NON-CODE deliverables: strategy docs, product specs, competitive analysis, board updates, proposals, research memos. Runs plan-for-the-plan first (source inventory, deliverable brief, extraction plan) so the model never drafts straight from a prompt, then mines each source into cited evidence and gates the draft on Bar K (every claim traceable) plus the shared weasel-phrase scan. Use instead of cfn-megaplan when the deliverable is a document, not a build."
version: 1.0.0
tags: [planning, knowledge-work, research, synthesis, non-code, strategy, grounding]
status: production
---

# CFN Knowledge Plan (non-code deliverables)

**Purpose:** `cfn-megaplan` plans builds. This plans documents. Same discipline, different
artifact: intent locked before work starts, assumptions made explicit, and a mechanical
gate that refuses output which cannot be checked.

**The core move: plan for the plan.** Asking a model for a deliverable directly gets you
the shallow version, because producing something plausible is the cheapest way to satisfy
the request. Asking it to first plan *how it will produce* the deliverable, then executing
that plan, gets the deep version every time. Levels 1-3 below are that plan. **Do not
write a single sentence of the deliverable before `KPLAN_<slug>.md` exists and is
approved.** That rule is the whole skill; everything else is scaffolding around it.

## When to use

Use for a deliverable whose output is prose and whose quality depends on synthesising
sources: strategy docs, product proposals, competitive analysis, board updates, research
memos, positioning docs, post-mortems, org plans, conference talks.

**Do not use when:**

| Situation | Use instead |
|---|---|
| The output is code, schema, or config | `/cfn-megaplan` (or `-lite` for 3-7 files) |
| The doc's purpose is to specify a build | `/cfn-megaplan` (its spec phase already does this) |
| A single source, one question, no synthesis | just ask; a pipeline is overhead |
| The deliverable is a plan for code work | `/write-plan` |

Mixed asks ("write the strategy doc, then build the prototype") split: knowledge-plan the
doc, then hand its conclusions to `/cfn-megaplan` as research input.

## Invocation

```
/cfn-knowledge-plan "<deliverable>"           # sources named inline or attached
/cfn-knowledge-plan "<deliverable>" --quick   # 4 levels, single extract pass, Bar K 1 round
```

`--quick` is for a one-audience memo off two or three sources. Anything that will be read
by people who did not commission it runs the full pipeline.

## Artifacts

All land in `planning/`, slug-suffixed like every other CFN phase:

| File | Level | What it holds |
|---|---|---|
| `KSOURCES_<slug>.md` | L1 | every source with an `SRC-n` id, format, how to read it, what it is expected to answer |
| `KBRIEF_<slug>.md` | L2 | audience, the decision the doc must support, format, length, done-looks-like, out-of-scope |
| `KPLAN_<slug>.md` | L3 | the plan for the plan: per-source extraction questions plus the deliverable outline with claim slots |
| `KEVIDENCE_<slug>__SRC-n.md` | L4 | one per source: verbatim quotes with locators, no paraphrase |
| `KDOC_<slug>.md` | L6 | the deliverable, carrying its Claims Ledger |

## Pipeline shape (7 levels)

Only `intake` and `brief` are hard gates. `--quick` collapses L3 into L2 and L5 into L6.

```
L1 intake         opus, HARD BARRIER; inventory + SRC-ids; refuses to guess at a source it cannot read
L2 brief          opus, HARD BARRIER; who reads it, what they decide, what done looks like
                  └─ BRIEF GATE: 1 AskUserQuestion round, then advance
L3 extract_plan ∥ outline   sonnet; per-source questions ∥ section skeleton with claim slots
                  └─ PLAN GATE: user approves KPLAN before any drafting
L4 extract        sonnet, one agent PER SOURCE, fully parallel; verbatim quotes + locators only
L5 synthesis      opus; merge evidence into the outline, surface conflicts, build the Claims Ledger
L6 draft          opus; write KDOC against the ledger
L7 Bar K + Bar B  check-grounding.sh + megaplan's check-haiku-static.sh; 2 rounds
```

Node dependencies (do not spawn a node before its deps return):

| Node | Deps |
|---|---|
| intake | (none) |
| brief | intake |
| extract_plan | intake, brief |
| outline | brief |
| extract | extract_plan (one node per `SRC-n`) |
| synthesis | extract (all), outline |
| draft | synthesis |

## Model policy

- **opus:** `intake`, `brief`, `synthesis`, `draft`. Intake decides what evidence exists at
  all; brief decides what the doc is for; synthesis resolves conflicts between sources;
  draft is taste. An error in any of those is invisible and expensive.
- **sonnet:** `extract_plan`, `outline`, and every `extract` node. Extraction is
  transcription against an already-decided question list, which is what sonnet is good at
  and what parallelises cleanly.
- **Escalation:** if two or more extract nodes return paraphrase instead of verbatim quotes
  with locators, re-run those nodes at opus with the verbatim rule restated. Paraphrase at
  extraction time is what makes Bar K unfixable later, because the locator is already lost.

## Bar K: grounding (the non-code verifiable-done)

Bar A asks "can this acceptance criterion be run?". Bar K asks "can this claim be traced?".

```bash
.claude/skills/cfn-knowledge-plan/bars/check-grounding.sh \
  "planning/KDOC_${SLUG}.md" "planning/KSOURCES_${SLUG}.md"
```

Exit 0 = clean, 1 = error findings, 2 = usage error. Findings are JSON with a `rule` code:

| Rule | Finding |
|---|---|
| G1 | prose cites `[C-n]` with no ledger row |
| G2 | EVIDENCE row with no Source or no Locator |
| G3 | ledger row never cited in the prose (dead claim) |
| G4 | row cites an `SRC-n` absent from `KSOURCES` |
| G5 | duplicate claim id |
| G6 | Type outside `EVIDENCE\|INFERENCE\|ASSUMPTION` |
| G7 | no `## Claims Ledger` section at all |
| G8 | Confidence outside `high\|medium\|low` |
| G9 | INFERENCE row naming no upstream `C-id` |

Every finding routes to its owning level: G1/G3 to `draft`, G2/G4/G9 to `synthesis`, G5/G6/G8
to whichever wrote the row. Cap 2 rounds; a surviving finding stops the pipeline and
surfaces via `AskUserQuestion` (accept with the claim relabelled `ASSUMPTION` / keep
iterating / go back and find a real source).

**Relabelling to ASSUMPTION is a legitimate exit, not a cheat** — an assumption stated on
the page is honest, an unmarked assertion is not. What Bar K forbids is prose that reads
as fact with nothing behind it.

## Bar B: weasel scan (inherited from megaplan)

```bash
.claude/skills/cfn-megaplan/bars/check-haiku-static.sh "planning/KDOC_${SLUG}.md"
```

Same script, same `weasel-phrases.txt`, unmodified. The optional-DI half of that script
targets code interfaces and no-ops here (pass no second argument). The weasel half is what
matters: "appropriately", "as needed", "TBD", "etc." in a strategy doc mean the thinking
did not finish.

## Claims Ledger format

`KDOC_<slug>.md` carries a `## Claims Ledger` section. Prose cites `[C-n]` inline; the
ledger holds the trace. This is what makes the doc checkable at all.

```markdown
## Claims Ledger

| ID | Claim | Type | Source | Locator | Confidence |
|---|---|---|---|---|---|
| C-1 | Adoption stalls at the ops handoff | EVIDENCE | SRC-1 | p.42 | high |
| C-2 | The ops lead is the wedge buyer | INFERENCE | C-1, C-4 | - | medium |
| C-3 | Budget survives through Q4 | ASSUMPTION | - | - | low |
```

- **EVIDENCE** needs a `SRC-n` and a real locator: page, timestamp, section, URL anchor.
- **INFERENCE** needs the upstream `C-id`s it was derived from. This is what lets a reader
  attack your reasoning instead of only your facts.
- **ASSUMPTION** needs no source but must be phrased as a testable statement, same rule as
  the plan-mode assumption registry. "Budget survives through Q4" is testable. "Budget is
  fine" is not.

## Protocol

### Step 0: scope check

1. Is the output a document? If it is code, schema, or config, stop and route to
   `/cfn-megaplan`.
2. Query prior work so you do not re-derive a settled conclusion:
   ```bash
   .claude/skills/decision-log/query.sh '<entities>' 5 <project>
   .claude/skills/decision-log/decisions.sh search '<entities>'
   ```
3. If the ask has open unknowns that no named source covers, run `cfn-research` first and
   register its output as a source in L1.

### Step 1: slug

```bash
SLUG=$(echo "$TASK" | tr '[:upper:] ' '[:lower:]_' | tr -cd '[:alnum:]_-' | cut -c1-60)
```

### Step 2: L1 intake (opus, hard barrier)

Inventory every source before reading any of them in depth. For each: an `SRC-n` id, what
it is, its format, how to read it (file path, URL, CLI command), and the one question it
is expected to answer.

**Hand it the raw material, not a summary.** A raw meeting transcript with the tangents
still in it outperforms a cleaned summary, because the extraction step can see what the
speaker actually emphasised and how they hedged. Summarising first destroys exactly the
signal L4 exists to mine.

If a source cannot actually be read (paywalled, a file that does not exist, a video with no
transcript), say so in `KSOURCES` and mark it `UNREADABLE`. Do not let the pipeline proceed
pretending to have evidence it never obtained. For video, `glm-video-ingest` turns a
recording into a timestamped transcript that becomes a readable source.

### Step 3: L2 brief (opus, hard barrier)

Write `KBRIEF_<slug>.md`: audience, the decision this doc must support, format, length
ceiling, what "good" looks like, and an explicit out-of-scope list. Then run the **brief
gate**: one `AskUserQuestion` round on whatever is genuinely ambiguous about audience or
purpose. One round, then advance.

A doc with no named decision behind it has no quality bar, and every later level will
optimise for sounding thorough instead of being useful.

### Step 4: L3 extract_plan ∥ outline (one message)

- `extract_plan`: per source, the specific questions to mine it for. Not "read the book" —
  "what does SRC-1 say about how to pick the bullseye customer when two segments look
  equally strong?"
- `outline`: the deliverable's section skeleton with empty claim slots, so synthesis knows
  what shape it is filling.

Together these are `KPLAN_<slug>.md`. **PLAN GATE:** surface it. This is the one artifact
worth a human reading in full, because it is short and it determines everything downstream.

### Step 5: L4 extract (sonnet, one agent per source, parallel)

Spawn every extract node in a single message. Each writes `KEVIDENCE_<slug>__SRC-n.md`
containing **verbatim quotes with locators only**. No paraphrase, no synthesis, no
conclusions. A node that returns tidy summary prose has destroyed the locator chain and
must be re-run.

Each node also reports what its source did **not** answer. An absent answer is a finding,
not a blank — it is how you learn the evidence base has a hole before the draft papers
over it.

### Step 6: L5 synthesis (opus)

Merge evidence into the outline and build the Claims Ledger. Two rules:

- **Surface conflicts, do not smooth them.** Two sources disagreeing is the most valuable
  thing in the pile. Record both as separate EVIDENCE rows and make the disagreement a
  visible section of the doc.
- **Every inference declares its parents.** If a conclusion rests on three claims, its
  Source cell names all three.

### Step 7: L6 draft (opus)

Write `KDOC_<slug>.md` against the ledger. Every load-bearing sentence carries its `[C-n]`.
Nothing enters the draft that is not in the ledger; if the draft needs a new claim, it goes
back to synthesis to be added with its trace, not asserted inline.

### Step 8: L7 bars (2 rounds)

Run Bar K then Bar B (above). Route findings to their owning level. After 2 rounds any
residual finding surfaces via `AskUserQuestion`.

### Step 9: hand off

```bash
for F in "KBRIEF_${SLUG}" "KPLAN_${SLUG}" "KDOC_${SLUG}"; do
  [ -f "planning/${F}.md" ] || echo "FATAL: missing planning/${F}.md"
done
```

Then share it with the humans who need to read it:

```
/cfn-share planning/KDOC_<slug>.md
```

If the doc concludes in a build, its conclusions become the research input to
`/cfn-megaplan`, and the resolved forks get recorded via
`.claude/skills/cfn-decisions/record.sh` so the build plan does not re-open them.

## Failure modes

| Failure | Recovery |
|---|---|
| a source turns out unreadable at L4 | mark it `UNREADABLE` in KSOURCES, re-run synthesis without it, and state the gap in the doc. Never let the draft imply coverage that does not exist. |
| extract nodes return paraphrase | re-run those nodes at opus with the verbatim rule restated. Do not try to recover locators at synthesis time; they are gone. |
| Bar K G3 storm (many dead claims) | the outline and the evidence diverged. Re-run synthesis against the current outline rather than patching rows one at a time. |
| the brief changes mid-pipeline | re-run from L2. A brief change invalidates the outline and usually the extraction questions; patching forward produces a doc aimed at two audiences. |
| sources all agree suspiciously | the source set is an echo chamber. Go back to L1 and add a source that would disconfirm the thesis. |
| deliverable balloons past the brief's length ceiling | cut at draft, not at synthesis. The ledger keeps the cut material traceable if it needs to come back. |

## Anti-patterns

- Drafting before `KPLAN_<slug>.md` exists. This is the failure the skill exists to prevent.
- Summarising a source before handing it to intake. Hand over the raw transcript, the whole
  PDF, the full thread.
- Paraphrasing during extraction "to save space". The locator is the product.
- Smoothing over two sources that disagree.
- Treating ASSUMPTION as a dumping ground to clear Bar K. If most of the ledger is
  assumption, the doc is an opinion piece; say so, or go get evidence.
- Running this on a build task because the prose phases feel pleasant. Route to megaplan.
- Reading the whole deliverable to check it. Read the brief and the Claims Ledger. The
  ledger is where a wrong call hides.

## Dependencies

- Bar K: `.claude/skills/cfn-knowledge-plan/bars/check-grounding.sh` (this skill).
- Bar B (inherited, unmodified): `.claude/skills/cfn-megaplan/bars/check-haiku-static.sh`
  and `.claude/skills/cfn-megaplan/bars/weasel-phrases.txt`.
- Optional inputs: `cfn-research` (unknowns), `glm-video-ingest` (video sources),
  `decision-log` (prior forks).
- Output: `cfn-share` (publish for human review), `cfn-decisions/record.sh` (register forks).
- `python3`, `awk`, coreutils.

## Related

- Build-side sibling: `cfn-megaplan` (and `cfn-megaplan-lite`). Same two-gate philosophy,
  code deliverables.
- `cfn-spec` is the build analogue of L2 brief; `cfn-research` is the analogue of L1 intake
  when the sources do not exist yet and have to be found.
