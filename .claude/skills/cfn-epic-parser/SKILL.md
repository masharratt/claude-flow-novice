# Parse with auto-detected mode
./.claude/skills/cfn-epic-parser/parse.sh planning/my-epic

# Force MDAP mode
./.claude/skills/cfn-epic-parser/parse.sh planning/my-epic --execution mdap

# Force CFN Loop mode
./.claude/skills/cfn-epic-parser/parse.sh planning/my-epic --execution cfn-loop

# With validation
./.claude/skills/cfn-epic-parser/parse.sh planning/my-epic --validate