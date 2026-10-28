# Git Workflow Detail

Load when: deciding whether to commit without asking, or checking whether a repo has active CI. The always-loaded summary is in `~/.claude/CLAUDE.md` §Git Workflow.

## Branching (full text)

- **Work from the main branch (main/master) by default.** Commit directly to it. Do NOT auto-create a feature branch. This overrides Claude Code's default "if on the default branch, branch first" behavior.
- **Only create a branch when explicitly told to.** If the user asks for a branch/PR, branch; otherwise stay on main.

## Commit without asking when CI is off: detection

If the repo has no active CI, commit when necessary and do not ask.

- Absence of CI config files (`.github/workflows/`, `.circleci/`, `Jenkinsfile`, `.gitlab-ci.yml`, etc.) is a sufficient filesystem signal.
- If workflow files exist but Actions look disabled at settings level, confirm with `gh api repos/{owner}/{repo}/actions/permissions --jq '.enabled'` (= `false`) before treating as off.
- Cannot reliably detect for local-only or non-GitHub repos; default to checking for workflow files.
