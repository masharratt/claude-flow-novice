# Per-evidence invalidation for the cfn-wiki work queue

Date: 2026-09-14. Implements the section 5 amendment in
CONTRACTS_work-knowledge-v2.md ("The stale cascade compares each accepted
job's input_revision against the WHOLE-TREE revision..."). TDD: red tests in
tests/test-wiki-work.py first, then lib/work.py.

## Design as shipped (work.py)

- Acceptance (`work review --decision accepted`) now also records
  `accept:<job>:source_hashes` in meta: a JSON list of `[path, sha256]`
  taken from the candidate's `capabilities[].sources[]` (reviewed sha256
  verbatim) plus entity `source` path:line paths hashed canonically at
  accept time. Deduplicated on (path, sha). Unreadable candidate: empty
  list. The existing `accept:<job>:revision` and
  `accept:<job>:knowledge_digest` rows are unchanged.
- `stale_check` (maintenance cascade): an accepted job goes stale ONLY when
  a recorded path's current canonical hash (git index blob via
  knowledge.canonical_digest, worktree fallback in non-git repos) differs
  from its recorded hash, or the path vanished. Dependent cascade kept: a
  staled job still requeues its accepted dependents.
- `work promote` freshness recheck: the whole-tree revision comparison is
  replaced by (a) the same per-evidence hash check and (b) the existing
  knowledge_state_digest comparison. The refusal error names the changed
  cited paths (capped at 5).
- Untouched: revision pinning for QUEUED/LEASED jobs and submissions
  (`input_revision` stamped at plan/lease, checked at submit).

## Tests (tests/test-wiki-work.py)

Rewritten: `test_accepted_job_goes_stale_on_cited_source_change` (was
`..._on_revision_change`, asserted the old whole-tree behavior). New:
`test_accepted_job_survives_unrelated_tree_change`,
`test_accepted_job_goes_stale_when_cited_path_vanishes`,
`test_acceptance_records_cited_source_hashes` (capability plus entity
citation), `test_promote_succeeds_after_unrelated_tree_change`,
`test_promoted_job_survives_subsequent_promotion` (two committed v2 jobs).
Extended `test_promote_rejects_knowledge_manifest_change_after_acceptance`
to assert the refused job stays accepted. Red phase: 4 failures against
the old lib. Green: work 64/64, knowledge 29/29. Logs:
/tmp/test-claude-flow-novice-1789421463.txt and -1789421525.txt.

## Behavior changes

- An unrelated tree change (file the candidate never cited) no longer
  stales an accepted job and no longer refuses its promotion.
- A promotion's own tracked knowledge writes no longer re-stale previously
  promoted jobs; the interim operator input_revision refresh is no longer
  needed (the post-commit stamp remains as bookkeeping only).
- A knowledge-model change between acceptance and promotion still refuses
  promotion via the digest, but the job stays accepted (unless its cited
  sources include the changed knowledge files, which the hash check
  catches).
- Accepted jobs with no recorded citations (empty-source candidates,
  imported archives without candidate files) never stale via the cascade;
  the digest gate still guards their promotion.
