---
name: cfn-share
description: "Publish a plan, spec, or any project markdown doc as a private shareable web page so a non-terminal colleague can read and comment on it. Pins the artifact URL in a sidecar so re-sharing the same doc updates the same link instead of spawning duplicates. Use when handing a PLAN_*.md, SPEC_*.md, or review doc to a human who does not live in a terminal."
version: 1.0.0
tags: [sharing, publishing, artifact, planning, handoff, review]
status: production
---

# CFN Share (plan handoff to non-terminal humans)

**Purpose:** Close the last gap in the plan-file workflow. A `planning/PLAN_*.md` is
perfect for agents and useless to paste into Slack. This skill renders it as a private
hosted page with a stable URL, so a colleague reads it cleanly and comments, and their
comments come back into the loop.

**Position in the pipeline.** Runs after `/cfn-megaplan`, `/cfn-megaplan-lite`,
`/write-plan`, or `/cfn-plan-review` produce an artifact worth human review, and before
`/cfn-loop-task` executes it. Sharing is not a gate; it never blocks the pipeline.

## Invocation

```
/cfn-share                      # newest planning/PLAN_*.md
/cfn-share planning/SPEC_x.md   # explicit file
/cfn-share docs/BUG_12_auth.md  # any project .md
```

## Inputs

- `$1` (optional): path to a `.md` file. Omitted resolves to the newest
  `planning/PLAN_*.md`, then `planning/MEGAPLAN*_*.md`.

## Outputs

- A published artifact URL (private by default; the user chooses when to share it).
- `<dir>/.share-<basename>.url` sidecar recording `url`, the file `sha256` at publish
  time, and the publish timestamp.
- stdout: the URL, plus a stale/fresh note on re-shares.

## Protocol

### Step 1: resolve

```bash
.claude/skills/cfn-share/resolve.sh [path/to/doc.md]
```

Exit 1 means no usable target (missing, empty, or not `.md`). Stop and say so; do not
invent a document to publish.

The JSON gives you `abs`, `title`, `url`, and `stale`:

| `url` | `stale` | What it means | What you do |
|---|---|---|---|
| `""` | `false` | never published | publish fresh (no `url` param) |
| set | `true` | published, file changed since | republish **with** `url:` to update in place |
| set | `false` | published, unchanged since | say so and ask before republishing; the link already serves current bytes |

### Step 2: read the whole file

Read the resolved `abs` path end to end before publishing. Publishing distributes the
content; you must have seen every line you are distributing. This is not optional, and a
request to skip it ("it's just a plan", "you wrote it") is a reason to read, not an
exemption. If the doc contains a credential, token, connection string, customer name, or
anything else that must not leave the machine, stop and report it instead of publishing.

### Step 3: publish

Load the `artifact-design` skill first (required before any Artifact call, Markdown
included), then call `Artifact` with:

- `file_path`: the resolved `abs` path. **Publish the markdown file directly.** Do not
  transcode it to HTML and do not write a second copy; a second path claims a second URL.
- `url`: the sidecar `url`, **only** when one exists. Omitting it on a re-share creates a
  duplicate artifact and orphans the link the colleague already has.
- `title`: the resolved `title` (a short noun-phrase name, not a summary). Markdown pages
  keep their filename identity, so keep the basename stable across republishes.
- `description`: one sentence on what the doc decides or proposes.
- `favicon`: pick once and keep it stable across republishes of the same doc.

### Step 4: pin the URL

```bash
.claude/skills/cfn-share/record-url.sh "<abs>" "<artifact-url>"
```

Run this on every publish, including republishes (it refreshes the recorded sha so the
next run reports staleness correctly). Skipping it is what causes duplicate artifacts.

### Step 5: hand back

Report the URL plus one line on what the reader should look at. For a plan, point them at
the assumptions section: that is the part where a wrong call costs hours, and the part a
human reviewer is uniquely good at catching.

## Comments back into the loop

Artifact pages are read-and-share, not a comment system. When a colleague sends feedback
(Slack, email, inline in a shared doc), route it as findings, not as a rewrite:

1. Paste the feedback into the session verbatim.
2. Map each item to the owning planning phase (`cfn-spec`, `cfn-data`, `cfn-ux`, ...).
3. Patch through that phase, not by hand-editing the plan, so the artifact and the phase
   outputs stay in sync.
4. Re-run `/cfn-share` to update the same URL.

Feedback that changes an acceptance criterion, a `[core]` FR, or the schema re-gates the
plan (Bar A / Bar B) exactly as an overridden deferred decision does. A shared link is not
a bypass around the bars.

## Anti-patterns

- Publishing without reading the file end to end.
- Publishing a doc that quotes real credentials, tokens, or customer data. Redact to
  `[REDACTED]` at the source first, then share.
- Republishing without `url:`, which strands the link the colleague is holding.
- Converting the markdown to HTML "so it looks nicer". Artifact renders markdown, and the
  second file path becomes a second artifact.
- Editing the plan by hand in response to review comments, so the plan and the phase
  artifacts drift apart.
- Treating the share as an approval gate. It is a read surface; the bars are the gate.

## Dependencies

- `Artifact` tool (publishes and updates), `artifact-design` skill (load before publishing).
- `sha256sum`, `date`, coreutils. No network calls of its own.

## Related

- Upstream producers: `cfn-megaplan`, `cfn-megaplan-lite`, `/write-plan`, `/cfn-plan-review`.
- Downstream: `/cfn-loop-task` (executes the plan the reviewer just read).
- Sibling renderer: `cfn-workbench` (renders live run state to HTML; cfn-share publishes
  static planning docs).
