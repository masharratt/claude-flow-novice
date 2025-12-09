# For Docker issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --docker

# For CLI mode issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --cli

# For orchestration issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --cfn-loop

# For MDAP/Trigger.dev issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --all

# Combine contexts as needed
bash .claude/skills/cfn-mdap-context-injection/inject.sh --docker --cfn-loop

## Known Issues

- ⚠️ **Outdated Paths**: The inject.sh script exists but references files that may not exist at the specified paths
- ⚠️ **Path Verification Needed**: Many of the paths referenced in the documentation (CLI agent spawning, orchestration scripts) may be outdated
- ⚠️ **Verify Before Use**: Users should verify file paths before using this skill
- ⚠️ **Update Required**: This skill needs to be updated to match the current project structure
