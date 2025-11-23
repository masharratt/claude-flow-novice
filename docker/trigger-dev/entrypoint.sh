#!/bin/bash
# ==============================================================================
# CFN Trigger.dev Worker Entrypoint (Phase 1.1)
# ==============================================================================
# Purpose: Agent initialization and environment setup for trigger.dev workers
#
# Responsibilities:
# 1. Validate AGENT_TYPE environment variable
# 2. Resolve agent profile path (.claude/agents/cfn-dev-team/{type}/*.md)
# 3. Parse PROVIDER_PARAMETERS frontmatter (YAML-like format)
# 4. Extract provider and model configuration
# 5. Set up provider-specific environment variables
# 6. Default to Z.ai + glm-4.6 if no provider specified
# 7. Execute agent task with proper error handling
#
# Environment Variables (Required):
#   AGENT_TYPE         - Agent specialization (e.g., backend-developer)
#
# Environment Variables (Optional):
#   TRIGGER_API_KEY    - Trigger.dev API key
#   CFN_TASK_ID        - Task identifier for coordination
#   CFN_WORKSPACE      - Workspace directory (default: /workspace)
#
# Provider Environment Variables (Set by this script):
#   ZAI_API_KEY        - Z.ai API key (if provider=zai)
#   ZAI_BASE_URL       - Z.ai base URL (if provider=zai)
#   KIMI_API_KEY       - Kimi API key (if provider=kimi)
#   ANTHROPIC_API_KEY  - Anthropic API key (if provider=anthropic)
#
# Exit Codes:
#   0 - Successful initialization and execution
#   1 - Invalid AGENT_TYPE or missing agent profile
#   2 - Provider configuration error
#   3 - Environment variable validation failure
#
# ==============================================================================

set -euo pipefail

# ==============================================================================
# Logging Functions
# ==============================================================================

log_step() {
  echo "[ENTRYPOINT] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_error() {
  echo "[ENTRYPOINT ERROR] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
}

log_debug() {
  if [[ "${DEBUG:-false}" == "true" ]]; then
    echo "[ENTRYPOINT DEBUG] $(date '+%Y-%m-%d %H:%M:%S') :: $*" >&2
  fi
}

# ==============================================================================
# Configuration
# ==============================================================================

# Agent configuration
AGENT_TYPE="${AGENT_TYPE:-}"
AGENT_PROFILES_ROOT="${AGENT_PROFILES_ROOT:-/triggerdotdev/.claude/agents/cfn-dev-team}"
CFN_WORKSPACE="${CFN_WORKSPACE:-/workspace}"

# Provider defaults
DEFAULT_PROVIDER="zai"
DEFAULT_MODEL="glm-4.6"

# Resolved values (populated by functions)
AGENT_PROFILE_PATH=""
PROVIDER=""
PROVIDER_MODEL=""

# Environment variable whitelist for security (Phase 1.2a)
ENV_WHITELIST=(
  "AGENT_TYPE"
  "CFN_CUSTOM_ROUTING"
  "ANTHROPIC_API_KEY"
  "ZAI_API_KEY"
  "KIMI_API_KEY"
  "GEMINI_API_KEY"
  "XAI_API_KEY"
  "OPENROUTER_API_KEY"
  "ZAI_BASE_URL"
  "CFN_REDIS_PORT"
  "CFN_POSTGRES_PORT"
  "COMPOSE_PROJECT_NAME"
  "WORKTREE_BRANCH"
  "DOCKER_HOST"
  "AGENT_PROFILES_ROOT"
  "CFN_WORKSPACE"
  "TRIGGER_API_KEY"
  "CFN_TASK_ID"
  "DEBUG"
  "NODE_ENV"
  "PATH"
  "HOME"
  "USER"
  "SHELL"
  "TERM"
  "LANG"
  "LC_ALL"
)

# ==============================================================================
# Security Functions
# ==============================================================================

filter_environment_variables() {
  log_step "Filtering environment variables (Phase 1.2a security hardening)"

  local filtered_count=0
  local retained_count=0
  local injection_attempts=0

  # Get all current environment variables
  local current_env
  current_env=$(env | cut -d= -f1)

  # Build whitelist lookup for fast checking
  local whitelist_lookup
  whitelist_lookup=$(printf '%s\n' "${ENV_WHITELIST[@]}" | sort -u)

  # Check each environment variable
  while IFS= read -r var_name; do
    # Skip empty lines
    [[ -z "$var_name" ]] && continue

    # Check if variable is whitelisted
    if echo "$whitelist_lookup" | grep -qxF "$var_name"; then
      # Variable is whitelisted - validate format
      local var_value="${!var_name}"

      # Check for injection attempts (newlines, null bytes, suspicious patterns)
      if [[ "$var_value" =~ $'\n'|$'\0'|';'[[:space:]]*'rm'|';'[[:space:]]*'curl' ]]; then
        log_error "Injection attempt detected in $var_name (filtered)"
        unset "$var_name"
        injection_attempts=$((injection_attempts + 1))
        filtered_count=$((filtered_count + 1))
      else
        # Variable is safe and whitelisted
        log_debug "Retained whitelisted variable: $var_name"
        retained_count=$((retained_count + 1))
      fi
    else
      # Variable is not whitelisted - remove it
      log_debug "Filtered non-whitelisted variable: $var_name"
      unset "$var_name" 2>/dev/null || true
      filtered_count=$((filtered_count + 1))
    fi
  done <<< "$current_env"

  # Log summary
  log_step "Environment filtering complete:"
  log_step "  Retained: $retained_count variables"
  log_step "  Filtered: $filtered_count variables"

  if [[ $injection_attempts -gt 0 ]]; then
    log_error "  Injection attempts blocked: $injection_attempts"
  fi

  return 0
}

# ==============================================================================
# Validation Functions
# ==============================================================================

validate_agent_type() {
  log_step "Validating AGENT_TYPE: '$AGENT_TYPE'"

  if [[ -z "$AGENT_TYPE" ]]; then
    log_error "AGENT_TYPE environment variable is not set"
    return 1
  fi

  if [[ ! "$AGENT_TYPE" =~ ^[a-z0-9_-]+$ ]]; then
    log_error "AGENT_TYPE contains invalid characters: $AGENT_TYPE"
    log_error "Must contain only lowercase letters, numbers, hyphens, underscores"
    return 1
  fi

  log_step "AGENT_TYPE validation passed: $AGENT_TYPE"
  return 0
}

# ==============================================================================
# Agent Profile Resolution Functions
# ==============================================================================

resolve_agent_profile_path() {
  log_step "Resolving agent profile path for: $AGENT_TYPE"

  if [[ ! -d "$AGENT_PROFILES_ROOT" ]]; then
    log_error "Agent profiles root directory not found: $AGENT_PROFILES_ROOT"
    return 1
  fi

  # Search for agent profile in all subdirectories
  # Pattern: .claude/agents/cfn-dev-team/{category}/{agent-type}.md
  local matching_files
  matching_files=$(find "$AGENT_PROFILES_ROOT" -type f -name "${AGENT_TYPE}.md" 2>/dev/null || true)

  if [[ -z "$matching_files" ]]; then
    log_error "No agent profile found for AGENT_TYPE: $AGENT_TYPE"
    log_error "Searched in: $AGENT_PROFILES_ROOT"
    return 1
  fi

  # Count matches (should be exactly 1)
  local count
  count=$(echo "$matching_files" | wc -l)

  if [[ $count -gt 1 ]]; then
    log_error "Multiple agent profiles found for AGENT_TYPE: $AGENT_TYPE"
    log_error "$matching_files"
    return 1
  fi

  AGENT_PROFILE_PATH="$matching_files"
  log_step "Agent profile resolved: $AGENT_PROFILE_PATH"
  return 0
}

validate_agent_profile_exists() {
  log_step "Validating agent profile file exists"

  if [[ ! -f "$AGENT_PROFILE_PATH" ]]; then
    log_error "Agent profile file does not exist: $AGENT_PROFILE_PATH"
    return 1
  fi

  log_step "Agent profile file validated: $AGENT_PROFILE_PATH"
  return 0
}

# ==============================================================================
# Provider Parameters Parsing Functions
# ==============================================================================

parse_provider_parameters() {
  log_step "Parsing PROVIDER_PARAMETERS from agent profile"

  # Extract PROVIDER_PARAMETERS block from HTML comment
  # Format: <!-- PROVIDER_PARAMETERS
  #         provider: zai
  #         model: glm-4.6
  #         -->

  local provider_block
  provider_block=$(sed -n '/<!-- PROVIDER_PARAMETERS/,/-->/p' "$AGENT_PROFILE_PATH" 2>/dev/null || true)

  if [[ -z "$provider_block" ]]; then
    log_step "No PROVIDER_PARAMETERS block found, using defaults"
    PROVIDER="$DEFAULT_PROVIDER"
    PROVIDER_MODEL="$DEFAULT_MODEL"
    return 0
  fi

  log_debug "PROVIDER_PARAMETERS block found:"
  log_debug "$provider_block"

  # Extract provider: value
  PROVIDER=$(echo "$provider_block" | grep -oP '^\s*provider:\s*\K[a-z0-9._-]+' | head -1 || true)
  if [[ -z "$PROVIDER" ]]; then
    log_step "No provider specified in PROVIDER_PARAMETERS, using default: $DEFAULT_PROVIDER"
    PROVIDER="$DEFAULT_PROVIDER"
  fi

  # Extract model: value
  PROVIDER_MODEL=$(echo "$provider_block" | grep -oP '^\s*model:\s*\K[a-z0-9._-]+' | head -1 || true)
  if [[ -z "$PROVIDER_MODEL" ]]; then
    log_step "No model specified in PROVIDER_PARAMETERS, using default: $DEFAULT_MODEL"
    PROVIDER_MODEL="$DEFAULT_MODEL"
  fi

  log_step "Parsed provider: $PROVIDER, model: $PROVIDER_MODEL"
  return 0
}

# ==============================================================================
# Docker Secrets Loading (Phase 1.2a) - Credential Encryption Support
# ==============================================================================

load_secrets_or_env() {
  # Load a secret from Docker secrets or fall back to environment variable
  #
  # Priority:
  # 1. /run/secrets/{SECRET_NAME} (Docker secrets mount)
  # 2. ${SECRET_NAME} environment variable
  # 3. Default value (if provided as second arg)
  #
  # Usage:
  #   load_secrets_or_env "ANTHROPIC_API_KEY"
  #   load_secrets_or_env "API_KEY" "sk-default-value"
  #
  # Returns:
  #   0 - Secret loaded successfully
  #   1 - Secret not found
  #

  local secret_name="$1"
  local default_value="${2:-}"

  # Try Docker secrets first (production with docker-compose secrets)
  if [[ -f "/run/secrets/${secret_name}" ]]; then
    log_debug "Loading $secret_name from Docker secrets: /run/secrets/${secret_name}"

    # Read secret file (should be single value, no newlines)
    local secret_value
    secret_value=$(cat "/run/secrets/${secret_name}" 2>/dev/null | tr -d '\n\r')

    if [[ -z "$secret_value" ]]; then
      log_error "$secret_name secret file exists but is empty: /run/secrets/${secret_name}"
      return 1
    fi

    # Export the secret as environment variable
    export "${secret_name}=${secret_value}"
    log_step "Loaded $secret_name from Docker secrets"
    return 0
  fi

  # Fall back to environment variable
  local env_var="${!secret_name:-}"
  if [[ -n "$env_var" ]]; then
    log_debug "Loading $secret_name from environment variable"
    log_step "Using $secret_name from environment variable"
    return 0
  fi

  # Use default if provided
  if [[ -n "$default_value" ]]; then
    log_debug "Loading $secret_name from default value"
    export "${secret_name}=${default_value}"
    log_step "Using $secret_name with provided default value"
    return 0
  fi

  # Secret not found
  log_error "$secret_name not found in:"
  log_error "  1. Docker secrets: /run/secrets/${secret_name}"
  log_error "  2. Environment variable: \${${secret_name}}"
  log_error "  3. No default value provided"
  return 1
}

# ==============================================================================
# Provider Environment Setup Functions
# ==============================================================================

setup_provider_environment() {
  log_step "Setting up environment for provider: $PROVIDER"

  case "$PROVIDER" in
    zai)
      setup_zai_environment
      ;;
    kimi)
      setup_kimi_environment
      ;;
    anthropic)
      setup_anthropic_environment
      ;;
    gemini)
      setup_gemini_environment
      ;;
    xai)
      setup_xai_environment
      ;;
    openrouter)
      setup_openrouter_environment
      ;;
    *)
      log_error "Unknown provider: $PROVIDER"
      return 2
      ;;
  esac

  return 0
}

setup_zai_environment() {
  log_step "Configuring Z.ai provider"

  # Load API key from Docker secrets or environment variable (Phase 1.2a)
  if ! load_secrets_or_env "ZAI_API_KEY"; then
    log_error "ZAI_API_KEY not found (required for Z.ai provider)"
    return 3
  fi

  # Z.ai configuration
  export ZAI_BASE_URL="${ZAI_BASE_URL:-https://api.z.ai/v1}"
  export ANTHROPIC_API_KEY="${ZAI_API_KEY}"
  export ANTHROPIC_BASE_URL="${ZAI_BASE_URL}"

  log_step "Z.ai environment configured"
  log_debug "ZAI_BASE_URL: $ZAI_BASE_URL"
  log_debug "Model: $PROVIDER_MODEL"

  return 0
}

setup_kimi_environment() {
  log_step "Configuring Kimi provider"

  # Load API key from Docker secrets or environment variable (Phase 1.2a)
  if ! load_secrets_or_env "KIMI_API_KEY"; then
    log_error "KIMI_API_KEY not found (required for Kimi provider)"
    return 3
  fi

  # Kimi configuration
  export ANTHROPIC_API_KEY="${KIMI_API_KEY}"
  export ANTHROPIC_BASE_URL="https://api.moonshot.cn/v1"

  log_step "Kimi environment configured"
  log_debug "Model: $PROVIDER_MODEL"

  return 0
}

setup_anthropic_environment() {
  log_step "Configuring Anthropic provider"

  # Load API key from Docker secrets or environment variable (Phase 1.2a)
  if ! load_secrets_or_env "ANTHROPIC_API_KEY"; then
    log_error "ANTHROPIC_API_KEY not found (required for Anthropic provider)"
    return 3
  fi

  # Anthropic configuration (native)
  # API key already set by load_secrets_or_env
  unset ANTHROPIC_BASE_URL  # Use Anthropic defaults

  log_step "Anthropic environment configured"
  log_debug "Model: $PROVIDER_MODEL"

  return 0
}

setup_gemini_environment() {
  log_step "Configuring Gemini provider"

  # Load API key from Docker secrets or environment variable (Phase 1.2a)
  if ! load_secrets_or_env "GEMINI_API_KEY"; then
    log_error "GEMINI_API_KEY not found (required for Gemini provider)"
    return 3
  fi

  # Gemini configuration (via OpenRouter)
  export ANTHROPIC_API_KEY="${GEMINI_API_KEY}"
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"

  log_step "Gemini environment configured"
  log_debug "Model: $PROVIDER_MODEL"

  return 0
}

setup_xai_environment() {
  log_step "Configuring XAi provider"

  # Load API key from Docker secrets or environment variable (Phase 1.2a)
  if ! load_secrets_or_env "XAI_API_KEY"; then
    log_error "XAI_API_KEY not found (required for XAi provider)"
    return 3
  fi

  # XAi configuration (Anthropic-compatible)
  export ANTHROPIC_API_KEY="${XAI_API_KEY}"
  export ANTHROPIC_BASE_URL="https://api.x.ai/v1"

  log_step "XAi environment configured"
  log_debug "Model: $PROVIDER_MODEL"

  return 0
}

setup_openrouter_environment() {
  log_step "Configuring OpenRouter provider"

  # Load API key from Docker secrets or environment variable (Phase 1.2a)
  if ! load_secrets_or_env "OPENROUTER_API_KEY"; then
    log_error "OPENROUTER_API_KEY not found (required for OpenRouter provider)"
    return 3
  fi

  # OpenRouter configuration
  export ANTHROPIC_API_KEY="${OPENROUTER_API_KEY}"
  export ANTHROPIC_BASE_URL="https://openrouter.ai/api/v1"

  log_step "OpenRouter environment configured"
  log_debug "Model: $PROVIDER_MODEL"

  return 0
}

# ==============================================================================
# Agent Context Initialization
# ==============================================================================

initialize_agent_context() {
  log_step "Initializing agent context"

  # Export agent metadata for downstream execution
  export AGENT_TYPE="$AGENT_TYPE"
  export AGENT_PROFILE_PATH="$AGENT_PROFILE_PATH"
  export AGENT_PROVIDER="$PROVIDER"
  export AGENT_MODEL="$PROVIDER_MODEL"

  # Ensure workspace exists
  if [[ ! -d "$CFN_WORKSPACE" ]]; then
    log_step "Creating workspace directory: $CFN_WORKSPACE"
    mkdir -p "$CFN_WORKSPACE"
  fi

  export CFN_WORKSPACE="$CFN_WORKSPACE"

  # Log agent context
  log_step "Agent context initialized:"
  log_step "  AGENT_TYPE: $AGENT_TYPE"
  log_step "  AGENT_PROVIDER: $PROVIDER"
  log_step "  AGENT_MODEL: $PROVIDER_MODEL"
  log_step "  AGENT_PROFILE_PATH: $AGENT_PROFILE_PATH"
  log_step "  CFN_WORKSPACE: $CFN_WORKSPACE"
  log_step "  CFN_TASK_ID: ${CFN_TASK_ID:-[not set]}"

  return 0
}

# ==============================================================================
# Main Execution Flow
# ==============================================================================

main() {
  log_step "==================================================================="
  log_step "CFN Trigger.dev Worker Entrypoint (Phase 1.2a)"
  log_step "==================================================================="

  # Step 0: Filter environment variables (Phase 1.2a security hardening)
  if ! filter_environment_variables; then
    log_error "Environment variable filtering failed"
    exit 3
  fi

  # Step 1: Validate AGENT_TYPE
  if ! validate_agent_type; then
    log_error "AGENT_TYPE validation failed"
    exit 1
  fi

  # Step 2: Resolve agent profile path
  if ! resolve_agent_profile_path; then
    log_error "Agent profile resolution failed"
    exit 1
  fi

  # Step 3: Validate agent profile file exists
  if ! validate_agent_profile_exists; then
    log_error "Agent profile file validation failed"
    exit 1
  fi

  # Step 4: Parse PROVIDER_PARAMETERS from agent profile
  if ! parse_provider_parameters; then
    log_error "Provider parameters parsing failed"
    exit 2
  fi

  # Step 5: Setup provider-specific environment variables
  if ! setup_provider_environment; then
    log_error "Provider environment setup failed"
    exit 2
  fi

  # Step 6: Initialize agent context
  if ! initialize_agent_context; then
    log_error "Agent context initialization failed"
    exit 3
  fi

  log_step "==================================================================="
  log_step "Entrypoint initialization complete"
  log_step "==================================================================="

  # Step 7: Pass control to trigger.dev worker
  # The main trigger.dev entrypoint script continues from here
  # Agents execute within the trigger.dev job execution environment

  # For now, just echo the agent context
  # In production, this would spawn the actual agent task
  log_step "Agent '$AGENT_TYPE' with provider '$PROVIDER' ($PROVIDER_MODEL) ready for execution"

  return 0
}

# ==============================================================================
# Error Handling
# ==============================================================================

cleanup() {
  local exit_code=$?

  if [[ $exit_code -eq 0 ]]; then
    log_step "Entrypoint completed successfully"
  else
    log_error "Entrypoint failed with exit code: $exit_code"
  fi

  return $exit_code
}

trap cleanup EXIT

# ==============================================================================
# Script Execution
# ==============================================================================

main "$@"
