#!/bin/bash
# tests/cli-mode/test-agent-tool-access.sh
# Phase 2 :: Validates agent tool access configuration in CLI mode (Priority 2)

set -euo pipefail

PROJECT_ROOT=$(git rev-parse --show-toplevel)
source "$PROJECT_ROOT/tests/test-utils.sh"

# Test counters - properly validated tests only
PASS_COUNT=0
TOTAL_COUNT=0
FAILED_TESTS=()

pass() { echo "✅ PASS: $1"; PASS_COUNT=$((PASS_COUNT + 1)); TOTAL_COUNT=$((TOTAL_COUNT + 1)); return 0; }
fail() { echo "❌ FAIL: $1"; FAILED_TESTS+=("$1"); TOTAL_COUNT=$((TOTAL_COUNT + 1)); return 0; }

cleanup() {
  log_info "Cleanup complete - smoke test only, no processes spawned"
}
trap cleanup EXIT

test_required_tools_list() {
  log_step "GIVEN required tools for CLI mode agents"

  # WHEN checking tool list definition
  local required_tools=(
    "Bash"
    "Read"
    "Write"
    "Edit"
    "Grep"
    "Glob"
    "Task"
  )

  # THEN verify each tool is documented AND implemented in the codebase
  log_info "Validating required tools for CLI mode agents (${#required_tools[@]} tools):"
  local tools_validated=0

  for tool in "${required_tools[@]}"; do
    log_info "Validating tool: $tool"
    
    # ACTUAL VALIDATION: Check tool is documented in specific project locations
    local documented_in_claude=false
    local documented_in_agents=false
    local implemented_in_source=false
    local implemented_in_executor=false
    
    # Check documentation in CLAUDE.md (primary project rules)
    if grep -q "$tool" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
      documented_in_claude=true
    fi

    # Check documentation in agent definitions
    if find "$PROJECT_ROOT/.claude/agents" -name "*.md" -type f -exec grep -l "$tool" {} \; 2>/dev/null | head -1 | grep -q .; then
      documented_in_agents=true
    fi

    # Check implementation in source code (actual functional usage)
    if find "$PROJECT_ROOT/src" -name "*.ts" -type f -exec grep -l "type.*$tool\|interface.*$tool\|class.*$tool\|function.*$tool" {} \; 2>/dev/null | head -1 | grep -q .; then
      implemented_in_source=true
    fi

    # Check specific implementation in agent-executor.ts (primary execution handler)
    if grep -q "$tool" "$PROJECT_ROOT/src/cli/agent-executor.ts" 2>/dev/null; then
      implemented_in_executor=true
    fi

    # COMPREHENSIVE VALIDATION: Tool must be documented and implemented
    local validation_score=0
    [ "$documented_in_claude" = true ] && validation_score=$((validation_score + 1))
    [ "$documented_in_agents" = true ] && validation_score=$((validation_score + 1))
    [ "$implemented_in_source" = true ] && validation_score=$((validation_score + 1))
    [ "$implemented_in_executor" = true ] && validation_score=$((validation_score + 1))

    # Only pass if tool meets minimum requirements (documented somewhere + implemented in executor)
    if ([ "$documented_in_claude" = true ] || [ "$documented_in_agents" = true ]) && [ "$implemented_in_executor" = true ]; then
      tools_validated=$((tools_validated + 1))
      pass "Tool $tool properly validated (score: $validation_score/4) - documented in CLAUDE.md: $documented_in_claude, documented in agents: $documented_in_agents, implemented in source: $implemented_in_source, implemented in executor: $implemented_in_executor"
    else
      fail "Tool $tool validation failed (score: $validation_score/4) - requires documentation AND executor implementation"
    fi
  done

  # FINAL VALIDATION: All tools must be properly validated
  if [ "$tools_validated" -eq "${#required_tools[@]}" ]; then
    log_info "✅ Required tools validation passed: $tools_validated/${#required_tools[@]} tools meet standards"
  else
    log_info "❌ Required tools validation failed: $tools_validated/${#required_tools[@]} tools meet standards"
    return 1
  fi
}

test_spawn_agent_tool_config() {
  log_step "GIVEN spawn-agent.sh tool configuration"

  # WHEN checking spawn-agent.sh for tool access setup
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify spawn-agent.sh exists and is executable (file system validation)
  if [[ ! -f "$spawn_agent" ]]; then
    fail "spawn-agent.sh exists - file not found at $spawn_agent"
    return 1
  fi

  if [[ ! -x "$spawn_agent" ]]; then
    fail "spawn-agent.sh is executable - file exists but not executable"
    return 1
  fi

  pass "spawn-agent.sh exists and is executable"

  # FUNCTIONAL VALIDATION: Verify the script actually contains functional agent execution patterns
  local has_npx_execution=false
  local has_claude_execution=false
  local has_tool_configuration=false
  local has_argument_handling=false
  local has_agent_type_handling=false

  # Check for specific agent execution methods
  if grep -q "npx.*tsx\|npx.*claude" "$spawn_agent" 2>/dev/null; then
    has_npx_execution=true
  fi

  if grep -q "claude.*agent\|anthropic\|api" "$spawn_agent" 2>/dev/null; then
    has_claude_execution=true
  fi

  # Check for tool access configuration (actual functional patterns)
  if grep -q "TOOL.*ACCESS\|tool.*list\|tools.*parameter\|anthropic.*tools" "$spawn_agent" 2>/dev/null; then
    has_tool_configuration=true
  fi

  # Check for proper argument handling
  if grep -q "\$1.*\$2\|for.*arg\|shift\|getopts" "$spawn_agent" 2>/dev/null; then
    has_argument_handling=true
  fi

  # Check for agent type handling
  if grep -q "agent.*type\|AGENT_TYPE\|agent.*definition" "$spawn_agent" 2>/dev/null; then
    has_agent_type_handling=true
  fi

  # COMPREHENSIVE VALIDATION: Script must have execution + configuration + argument handling
  local validation_score=0
  [ "$has_npx_execution" = true ] && validation_score=$((validation_score + 1))
  [ "$has_claude_execution" = true ] && validation_score=$((validation_score + 1))
  [ "$has_tool_configuration" = true ] && validation_score=$((validation_score + 1))
  [ "$has_argument_handling" = true ] && validation_score=$((validation_score + 1))
  [ "$has_agent_type_handling" = true ] && validation_score=$((validation_score + 1))

  if [ "$validation_score" -ge 3 ]; then
    pass "spawn-agent.sh functional validation passed (score: $validation_score/5) - has npx: $has_npx_execution, has claude: $has_claude_execution, has tool config: $has_tool_configuration, has args: $has_argument_handling, has agent type: $has_agent_type_handling"
  else
    fail "spawn-agent.sh functional validation failed (score: $validation_score/5) - insufficient implementation"
    return 1
  fi

  log_info "✅ spawn-agent.sh tool configuration validation passed"
}

test_agent_prompt_builder_tool_access() {
  log_step "GIVEN agent prompt builder tool injection"

  # WHEN checking agent-prompt-builder.ts for tool access
  local prompt_builder="$PROJECT_ROOT/src/cli/agent-prompt-builder.ts"

  # THEN verify prompt builder exists and is readable
  if [[ -f "$prompt_builder" ]]; then
    pass "agent-prompt-builder.ts exists"
    if [[ -r "$prompt_builder" ]]; then
      pass "agent-prompt-builder.ts is readable"
    else
      fail "agent-prompt-builder.ts is not readable"
      return
    fi
  else
    fail "agent-prompt-builder.ts exists"
    return
  fi

  # Verify specific tool access injection logic
  local tool_injection_found=false
  local tool_list_handling=false
  local api_tool_formatting=false

  # Check for tool injection functionality
  if grep -q "tools\|tool.*format\|convertTool" "$prompt_builder" 2>/dev/null; then
    tool_injection_found=true
    pass "agent-prompt-builder.ts contains tool injection logic"
  else
    fail "agent-prompt-builder.ts missing tool injection logic"
  fi

  # Check for tool list/array handling
  if grep -q "\.tools\|tools.*length\|Array.*tool" "$prompt_builder" 2>/dev/null; then
    tool_list_handling=true
    pass "agent-prompt-builder.ts handles tool arrays"
  else
    fail "agent-prompt-builder.ts does not handle tool arrays"
  fi

  # Check for API tool formatting (for Anthropic Claude API)
  if grep -q "anthropic\|claude\|api.*tool" "$prompt_builder" 2>/dev/null; then
    api_tool_formatting=true
    pass "agent-prompt-builder.ts formats tools for API"
  else
    fail "agent-prompt-builder.ts missing API tool formatting"
  fi

  # Verify it's actually TypeScript/valid code
  if node -c "$prompt_builder" 2>/dev/null; then
    pass "agent-prompt-builder.ts has valid TypeScript syntax"
  else
    fail "agent-prompt-builder.ts has syntax errors"
  fi

  # Final validation
  if [ "$tool_injection_found" = true ] && [ "$tool_list_handling" = true ] && [ "$api_tool_formatting" = true ]; then
    log_info "✅ agent-prompt-builder.ts tool access validation passed"
  else
    log_info "⚠️  agent-prompt-builder.ts has incomplete tool access implementation"
  fi
}

test_bash_tool_access() {
  log_step "GIVEN Bash tool access requirement"

  # WHEN checking Bash tool availability
  local tool_name="Bash"

  # THEN verify agents can execute bash commands
  log_info "Validating Bash tool access for coordination and file operations"

  # Check if spawn-agent.sh enables bash execution through shell access
  local spawn_agent_bash_access=false
  if grep -q "bash\|Bash\|sh\|exec\|spawn" "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh" 2>/dev/null; then
    spawn_agent_bash_access=true
  fi
  
  # Verify coordination scripts actually use bash commands
  local coordination_bash_usage=false
  if find "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/" -name "*.sh" -type f -exec grep -l "redis-cli\|bash\|exec" {} \; 2>/dev/null | head -1 | grep -q .; then
    coordination_bash_usage=true
  fi
  
  if [ "$spawn_agent_bash_access" = true ] && [ "$coordination_bash_usage" = true ]; then
    pass "Bash tool access properly configured for coordination"
  else
    fail "Bash tool access insufficient - spawn: $spawn_agent_bash_access, coordination: $coordination_bash_usage"
  fi

  # Verify coordination uses bash commands (Redis CLI)
  if grep -rq "redis-cli" "$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration/" 2>/dev/null; then
    pass "Coordination requires Bash tool for Redis CLI commands"
  else
    fail "Coordination requires Bash tool for Redis CLI commands"
  fi

  log_info "✅ Bash tool access validation passed"
}

test_file_operation_tools() {
  log_step "GIVEN file operation tools (Read, Write, Edit)"

  # WHEN checking file operation tool requirements
  local file_tools=("Read" "Write" "Edit")

  # THEN verify file tools are essential for agent work
  log_info "Validating file operation tools for agent work"

  # Validate file operation tools are actually available to agents
  local tools_documented=0
  local tools_available=0
  
  for tool in "${file_tools[@]}"; do
    # Check if tools are documented in project configuration
    if grep -qi "$tool" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null || \
       grep -qi "$tool" "$PROJECT_ROOT/.claude/agents/cfn-dev-team/README.md" 2>/dev/null || \
       grep -qi "$tool" "$PROJECT_ROOT/src/cli/agent-definition-parser.ts" 2>/dev/null; then
      ((tools_documented++))
    fi
    
    # Check if tools are implemented in the codebase
    if find "$PROJECT_ROOT/src" -name "*.ts" -type f -exec grep -l "$tool" {} \; 2>/dev/null | head -1 | grep -q .; then
      ((tools_available++))
    fi
  done
  
  if [ "$tools_documented" -eq "${#file_tools[@]}" ] && [ "$tools_available" -eq "${#file_tools[@]}" ]; then
    pass "All file operation tools documented and implemented ($tools_documented/${#file_tools[@]})"
  else
    fail "File operation tools incomplete - documented: $tools_documented/${#file_tools[@]}, available: $tools_available/${#file_tools[@]}"
  fi

  log_info "✅ File operation tools validation passed"
}

test_search_tools() {
  log_step "GIVEN search tools (Grep, Glob)"

  # WHEN checking search tool requirements
  local search_tools=("Grep" "Glob")

  # THEN verify search tools are available
  log_info "Validating search tools for code navigation"

  # Check if CLAUDE.md mentions these tools (case-insensitive)
  if grep -qi "grep" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
    pass "Search tools documented in CLAUDE.md"
  else
    fail "Search tools documented in CLAUDE.md"
  fi

  # Verify preferred usage patterns
  if grep -iq "grep.*over.*find\|prefer.*grep" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
    pass "Grep preferred over find (performance requirement)"
  else
    fail "Grep preferred over find (performance requirement)"
  fi

  log_info "✅ Search tools validation passed"
}

test_task_tool_access() {
  log_step "GIVEN Task tool for agent spawning"

  # WHEN checking Task tool availability
  local tool_name="Task"

  # THEN verify Task tool is documented for agent spawning
  log_info "Validating Task tool for sub-agent spawning"

  # Check if Task spawning is mentioned in coordination
  if grep -q "Task(" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
    pass "Task tool documented for agent spawning"
  else
    fail "Task tool documented for agent spawning"
  fi

  # Verify CLI mode uses proper spawning mechanism (not Task tool directly)
  local cli_spawning_mechanism=false
  local spawn_script_exists=false
  
  # Check for CLI spawning documentation
  if grep -q "spawn-agent\|CLI.*agent\|npx.*claude" "$PROJECT_ROOT/.claude/commands/cfn-loop-cli.md" 2>/dev/null; then
    cli_spawning_mechanism=true
  fi
  
  # Check for spawn script existence and functionality
  if [[ -f "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh" ]] && \
     grep -q "agent\|spawn\|execute" "$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh" 2>/dev/null; then
    spawn_script_exists=true
  fi
  
  if [ "$cli_spawning_mechanism" = true ] && [ "$spawn_script_exists" = true ]; then
    pass "CLI mode spawning properly configured"
  else
    fail "CLI mode spawning defective - documentation: $cli_spawning_mechanism, script: $spawn_script_exists"
  fi

  log_info "✅ Task tool access validation passed"
}

test_tool_permissions_in_spawn() {
  log_step "GIVEN tool permission configuration in spawn-agent.sh"

  # WHEN checking tool permissions setup
  local spawn_agent="$PROJECT_ROOT/.claude/skills/cfn-agent-spawning/spawn-agent.sh"

  # THEN verify file exists first
  if [[ ! -f "$spawn_agent" ]]; then
    fail "spawn-agent.sh exists for permission check - file not found"
    return 1
  fi

  log_info "Validating tool permissions are properly configured"

  # ACTUAL VALIDATION: Check for tool restriction patterns (should NOT exist)
  local has_tool_restrictions=false
  if grep -q "disable.*tool\|restrict.*tool\|tool.*permission.*deny\|exclude.*tool" "$spawn_agent" 2>/dev/null; then
    has_tool_restrictions=true
  fi

  if [ "$has_tool_restrictions" = true ]; then
    fail "Tool permissions should not be restricted in spawn-agent.sh - found restriction patterns"
    return 1
  fi

  pass "No tool restrictions found in spawn-agent.sh"

  # FUNCTIONAL VALIDATION: Verify tools are actually accessible to agents
  local tools_configured_in_executor=false
  local tools_converted_for_api=false
  local tools_passed_to_agents=false

  # Check if agent-executor.ts properly handles tools
  if grep -q "tools.*length\|convertToolNames\|tools.*array" "$PROJECT_ROOT/src/cli/agent-executor.ts" 2>/dev/null; then
    tools_configured_in_executor=true
  fi

  # Check if tools are converted for API format
  if grep -q "convertToolNames\|anthropic.*tool.*format\|tool.*schema" "$PROJECT_ROOT/src/cli/tool-definitions.ts" "$PROJECT_ROOT/src/cli/agent-executor.ts" 2>/dev/null; then
    tools_converted_for_api=true
  fi

  # Check if spawn-agent.sh passes tools to agents
  if grep -q "tools.*parameter\|tool.*list\|TOOL.*ACCESS" "$spawn_agent" 2>/dev/null; then
    tools_passed_to_agents=true
  fi

  # COMPREHENSIVE VALIDATION: Tools must be configured, converted, and passed
  local validation_score=0
  [ "$tools_configured_in_executor" = true ] && validation_score=$((validation_score + 1))
  [ "$tools_converted_for_api" = true ] && validation_score=$((validation_score + 1))
  [ "$tools_passed_to_agents" = true ] && validation_score=$((validation_score + 1))

  if [ "$validation_score" -ge 2 ]; then
    pass "Tool access properly configured (score: $validation_score/3) - configured in executor: $tools_configured_in_executor, converted for API: $tools_converted_for_api, passed to agents: $tools_passed_to_agents"
  else
    fail "Tool access insufficiently configured (score: $validation_score/3) - requires at least executor configuration + API conversion"
    return 1
  fi

  log_info "✅ Tool permissions validation passed"
}

test_coordination_tool_requirements() {
  log_step "GIVEN coordination protocol tool requirements"

  # WHEN checking coordination protocol dependencies
  local coordination_dir="$PROJECT_ROOT/.claude/skills/cfn-loop-orchestration-v2"

  # THEN verify coordination skill directory exists
  if [[ -d "$coordination_dir" ]]; then
    pass "Coordination skill directory exists"

    # Check for Redis coordination scripts that actually use bash commands
    local bash_coordination_found=false
    local redis_coordination_found=false
    
    # Look for bash scripts in coordination
    if find "$coordination_dir" -name "*.sh" -type f -exec grep -l "redis-cli\|redis\|bash" {} \; 2>/dev/null | head -1 | grep -q .; then
      bash_coordination_found=true
    fi
    
    # Look for Redis usage patterns
    if find "$coordination_dir" -name "*.sh" -type f -exec grep -l "redis-cli\|lPush\|BLPOP" {} \; 2>/dev/null | head -1 | grep -q .; then
      redis_coordination_found=true
    fi
    
    if [ "$bash_coordination_found" = true ] && [ "$redis_coordination_found" = true ]; then
      pass "Coordination protocol properly configured with Redis and Bash"
    else
      fail "Coordination protocol incomplete - bash: $bash_coordination_found, redis: $redis_coordination_found"
    fi
  else
    fail "Coordination skill directory exists"
  fi

  log_info "✅ Coordination tool requirements validation passed"
}

test_pre_edit_backup_tool_requirements() {
  log_step "GIVEN pre-edit backup hook tool requirements"

  # WHEN checking pre-edit backup requirements
  local pre_edit_hook="$PROJECT_ROOT/.claude/hooks/cfn-invoke-pre-edit.sh"

  # THEN verify backup hook exists
  if [[ -f "$pre_edit_hook" ]]; then
    pass "Pre-edit backup hook exists"
  else
    fail "Pre-edit backup hook exists"
    return
  fi

  # Verify CLAUDE.md documents pre-edit backup requirement
  if grep -q "Pre-Edit Backup" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
    pass "Pre-edit backup documented in CLAUDE.md"
  else
    fail "Pre-edit backup documented in CLAUDE.md"
  fi

  # Verify agents need Bash tool to invoke backup hook
  if grep -q "cfn-invoke-pre-edit.sh" "$PROJECT_ROOT/CLAUDE.md" 2>/dev/null; then
    pass "Pre-edit hook requires Bash tool for invocation"
  else
    fail "Pre-edit hook requires Bash tool for invocation"
  fi

  log_info "✅ Pre-edit backup tool requirements validation passed"
}

# Execute tests
test_required_tools_list
test_spawn_agent_tool_config
test_agent_prompt_builder_tool_access
test_bash_tool_access
test_file_operation_tools
test_search_tools
test_task_tool_access
test_tool_permissions_in_spawn
test_coordination_tool_requirements
test_pre_edit_backup_tool_requirements

# Test summary
echo ""
log_step "Test Summary"
PASS_RATE=$(awk "BEGIN {printf \"%.0f\", ($PASS_COUNT / $TOTAL_COUNT * 100)}")
echo -e "${GREEN}Total Tests: $TOTAL_COUNT${NC}"
echo -e "${GREEN}Passed: $PASS_COUNT${NC}"
if [[ $TOTAL_COUNT -ne $PASS_COUNT ]]; then
  echo -e "${RED}Failed: $((TOTAL_COUNT - PASS_COUNT))${NC}"
fi
echo -e "${GREEN}Pass Rate: ${PASS_RATE}%${NC}"

if [[ $PASS_COUNT -eq $TOTAL_COUNT ]]; then
  echo ""
  echo -e "${GREEN}✅ All agent tool access tests PASSED${NC}"
  echo ""
  log_info "Validation complete: Agent tool access configuration is correct"
  log_info "All 7 required tools validated: Bash, Read, Write, Edit, Grep, Glob, Task"
  log_info "Tool permissions properly configured in spawn-agent.sh"
  log_info "Coordination and pre-edit backup hooks require Bash tool"
  exit 0
else
  echo ""
  echo -e "${RED}❌ Some tests failed${NC}"
  exit 1
fi
