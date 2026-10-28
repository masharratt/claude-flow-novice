# Test Database and Fixture Safety

Load when: writing test setup/teardown, fixtures, or any test that touches a database or deletes files. The always-loaded summary (no unscoped DELETE, no real-entity fixtures) is in CLAUDE.md §2. `cfn-careful-guard.sh` catches destructive shell commands only, never deletes inside test code.

- **Never write unscoped DELETE/TRUNCATE in test setup or teardown.** Every `DELETE FROM` in test code MUST have a WHERE clause targeting only test-created rows. Unscoped deletes wipe production data on a shared database.
- **Identify test data by convention.** Marker values: test article URLs contain `example.com`, test workspace slugs start with `test-workspace-`, test emails match `integration-test%` or `test-%@integration.test`.
- **Never disable FK checks (`session_replication_role = 'replica'`) to work around cleanup ordering.** Needing that means the cleanup is too broad; scoped deletes with CASCADE handle ordering.
- **Test databases are not isolated.** Assume any `DATABASE_URL` in `.env` points at production data. A clean slate = insert known test rows, delete only those.
- **DELETE/TRUNCATE requires explicit user approval.** Explain what rows are removed and why, trace the FK cascade chain (every affected table + cascade rule), state estimated row count impact, wait for confirmation.
- **Test fixtures MUST NOT name a real entity.** Never import or hardcode a production user id, account id, email, workspace slug, or org id into test code — not as a fixture, not as a constant, not read-only. Invent a synthetic uuid: any execution path reaching the teardown deletes real data.
- **Destructive teardown MUST assert it is not pointed at production.** Before any DELETE, assert the fixture id differs from the known production id (`assert_ne!(TEST_USER_ID, PRODUCTION_USER_ID, "REFUSING TO RUN: ...")`). Tripwire for a fixture later repointed at real data.
- **Test filesystem cleanup deletes only what the test created under the temp dir.** Never `remove_dir_all` / `rmtree` / `rm -rf` a path derived from the project tree: in a worktree it may be a symlink to shared data, and no shell hook sees a delete inside a test binary (MDTWII 2026-10-16, 7.5 GB wiped 4x). Keep linked shared data read-only (list in `.zai-fence-readonly`, then `~/.claude/cfn-scripts/readonly-data.sh lock`); review fails cleanup that can reach a non-temp path.
- **`#[ignore]` / test tags are a speed bump, NOT a safety mechanism.** An explicitly-invoked `--ignored` run bypasses them entirely. Safety = synthetic fixtures + teardown assertions above.
