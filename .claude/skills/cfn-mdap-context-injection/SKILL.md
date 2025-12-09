# For Docker issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --docker

# For CLI mode issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --cli

# For orchestration issues
bash .claude/skills/cfn-mdap-context-injection/inject.sh --cfn-loop

# For full MDAP workflow
bash .claude/skills/cfn-mdap-context-injection/inject.sh --all

# Combine contexts as needed
bash .claude/skills/cfn-mdap-context-injection/inject.sh --docker --cfn-loop