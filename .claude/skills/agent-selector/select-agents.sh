#!/bin/bash
set -e
set -o pipefail
set -u

# Agent Selector for CFN v3
# Usage: select-agents.sh --task-type TYPE --description "description"

TASK_TYPE=""
DESCRIPTION=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --task-type) TASK_TYPE="$2"; shift 2 ;;
    --description) DESCRIPTION="$2"; shift 2 ;;
    *) echo "Unknown: $1"; exit 1 ;;
  esac
done

if [ -z "$TASK_TYPE" ] || [ -z "$DESCRIPTION" ]; then
  echo "Usage: select-agents.sh --task-type TYPE --description 'text'" >&2
  exit 1
fi

DESC_LOWER=$(echo "$DESCRIPTION" | tr '[:upper:]' '[:lower:]')

# Helper function to check keyword
has_keyword() {
  local keyword="$1"
  echo "$DESC_LOWER" | grep -qi "$keyword"
  return $?
}

# Select agents based on task type
case "$TASK_TYPE" in
  "software-development")
    LOOP3_AGENTS='["backend-dev", "coder"]'

    # Add specialists based on keywords
    if has_keyword "security\|authentication\|jwt\|oauth"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["security-specialist"]')
    fi

    if has_keyword "database\|sql\|schema\|migration"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["backend-dev"]')  # Already have backend-dev
    fi

    if has_keyword "deploy\|ci/cd\|infrastructure\|docker\|kubernetes"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["devops-engineer"]')
    fi

    LOOP2_AGENTS='["reviewer", "tester", "security-auditor"]'
    LOOP4_AGENT="product-owner"
    REASONING="Software development with standard reviewer, tester, security validation"
    ;;

  "content-creation")
    LOOP3_AGENTS='["copywriter", "content-strategist"]'

    if has_keyword "seo\|search\|keywords"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["seo-specialist"]')
    fi

    LOOP2_AGENTS='["editor", "brand-reviewer", "compliance-checker"]'
    LOOP4_AGENT="product-owner"
    REASONING="Content creation with editorial, brand, and compliance review"
    ;;

  "research")
    LOOP3_AGENTS='["researcher", "data-analyst"]'

    if has_keyword "statistics\|statistical"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["data-analyst"]')  # Data analyst can handle stats
    fi

    LOOP2_AGENTS='["fact-checker", "methodology-reviewer", "reviewer"]'
    LOOP4_AGENT="product-owner"
    REASONING="Research with fact-checking, methodology, and peer review"
    ;;

  "design")
    LOOP3_AGENTS='["ui-designer", "ux-researcher"]'

    if has_keyword "visual\|branding"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["visual-designer"]')
    fi

    LOOP2_AGENTS='["accessibility-advocate", "design-critic", "user-tester"]'
    LOOP4_AGENT="product-owner"
    REASONING="Design with accessibility, critique, and user testing validation"
    ;;

  "infrastructure")
    LOOP3_AGENTS='["devops-engineer", "terraform-engineer"]'

    if has_keyword "kubernetes\|k8s\|container"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["devops-engineer"]')  # DevOps covers k8s
    fi

    LOOP2_AGENTS='["security-auditor", "cost-optimizer", "compliance-checker"]'
    LOOP4_AGENT="product-owner"
    REASONING="Infrastructure with security, cost, and compliance validation"
    ;;

  "data-engineering")
    LOOP3_AGENTS='["data-engineer", "pipeline-builder"]'

    if has_keyword "etl\|transformation"; then
      LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq '. + ["data-engineer"]')  # Data engineer handles ETL
    fi

    LOOP2_AGENTS='["data-quality-validator", "schema-reviewer", "performance-tester"]'
    LOOP4_AGENT="product-owner"
    REASONING="Data engineering with quality, schema, and performance validation"
    ;;

  *)
    # Default to software development
    LOOP3_AGENTS='["backend-dev", "coder"]'
    LOOP2_AGENTS='["reviewer", "tester"]'
    LOOP4_AGENT="product-owner"
    REASONING="Unknown task type, defaulting to software development agents"
    ;;
esac

# Deduplicate agents
LOOP3_AGENTS=$(echo "$LOOP3_AGENTS" | jq 'unique')

# Build output JSON
cat <<EOF
{
  "loop3": $LOOP3_AGENTS,
  "loop2": $LOOP2_AGENTS,
  "loop4": "$LOOP4_AGENT",
  "reasoning": "$REASONING"
}
EOF