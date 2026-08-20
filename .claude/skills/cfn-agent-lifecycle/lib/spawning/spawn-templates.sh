#!/usr/bin/env bash

##############################################################################
# ⚠️  DEPRECATED - This bash script is deprecated
#
# Deprecation Date: 2025-11-20
# Removal Date: 2026-02-20 (90 days)
# Replacement: dist/cli/spawn-agent-cli.js
#
# This script will be removed in 90 days. Please migrate to TypeScript.
#
# Migration Guide: See docs/BASH_DEPRECATION_NOTICE.md
# TypeScript Benefits:
#   - Type safety (zero runtime type errors)
#   - 90%+ test coverage
#   - Better performance
#   - Comprehensive documentation
#
# Automatic Migration:
#   Set USE_TYPESCRIPT=true to use TypeScript implementation automatically
#
##############################################################################


# Agent Spawning Templates
# Reusable CLI invocation patterns for common multi-agent scenarios
#
# Usage:
#   source .claude/skills/cfn-agent-spawning/spawn-templates.sh
#   spawn_feature_development "Implement user authentication"
#   spawn_security_audit "Audit payment processing system"
#
# All templates use:
# - Explicit --agents flag with typed agents
# - z.ai provider for cost optimization
# - Redis coordination channels
# - Appropriate topology for task complexity

set -euo pipefail

# Base directory for spawn-workers.js
SPAWN_CLI="node src/cli/hybrid-routing/spawn-workers.js"

# Default provider (cost-optimized)
DEFAULT_PROVIDER="zai"

# ============================================================================
# CORE DEVELOPMENT PATTERNS
# ============================================================================

# Feature Development (4 agents)
# Use for: Standard feature implementation with design, code, and validation
spawn_feature_development() {
  local task="$1"
  local channel="${2:-swarm:feature}"

  $SPAWN_CLI "$task" \
    --agents=architect,coder,tester,reviewer \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Complex Feature Development (5 agents with analysis)
# Use for: Complex features requiring upfront analysis
spawn_complex_feature() {
  local task="$1"
  local channel="${2:-swarm:complex-feature}"

  $SPAWN_CLI "$task" \
    --agents=analyst,architect,coder,tester,reviewer \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Rapid Prototyping (3 agents)
# Use for: Quick MVPs and proof-of-concepts
spawn_rapid_prototype() {
  local task="$1"
  local channel="${2:-swarm:prototype}"

  $SPAWN_CLI "$task" \
    --agents=architect,coder,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# SECURITY PATTERNS
# ============================================================================

# Security Audit (4 agents)
# Use for: Comprehensive security assessment
spawn_security_audit() {
  local task="$1"
  local channel="${2:-swarm:security-audit}"

  $SPAWN_CLI "$task" \
    --agents=security-specialist,code-analyzer,tester,production-validator \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Security-Critical Feature (5 agents)
# Use for: Features handling sensitive data or authentication
spawn_security_feature() {
  local task="$1"
  local channel="${2:-swarm:security-feature}"

  $SPAWN_CLI "$task" \
    --agents=architect,backend-dev,security-specialist,tester,production-validator \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# PERFORMANCE PATTERNS
# ============================================================================

# Performance Optimization (4 agents)
# Use for: Identifying and fixing performance bottlenecks
spawn_performance_optimization() {
  local task="$1"
  local channel="${2:-swarm:perf-optimization}"

  $SPAWN_CLI "$task" \
    --agents=perf-analyzer,code-booster,backend-dev,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# High-Performance Feature (5 agents)
# Use for: Performance-critical feature development
spawn_high_performance_feature() {
  local task="$1"
  local channel="${2:-swarm:high-perf-feature}"

  $SPAWN_CLI "$task" \
    --agents=architect,coder,perf-analyzer,code-booster,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# ARCHITECTURE PATTERNS
# ============================================================================

# System Architecture Design (4 agents)
# Use for: Large-scale system design and planning
spawn_system_architecture() {
  local task="$1"
  local channel="${2:-swarm:architecture}"

  $SPAWN_CLI "$task" \
    --agents=system-architect,architect,devops-engineer,security-architect-persona \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology collaborative \
    --timeout 360000
}

# Architecture Review (3 agents)
# Use for: Reviewing existing architecture
spawn_architecture_review() {
  local task="$1"
  local channel="${2:-swarm:arch-review}"

  $SPAWN_CLI "$task" \
    --agents=system-architect,code-analyzer,perf-analyzer \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology bidirectional \
    --timeout 300000
}

# ============================================================================
# API DEVELOPMENT PATTERNS
# ============================================================================

# API Development (5 agents)
# Use for: Comprehensive API design, implementation, and documentation
spawn_api_development() {
  local task="$1"
  local channel="${2:-swarm:api-dev}"

  $SPAWN_CLI "$task" \
    --agents=system-architect,backend-dev,api-docs,security-specialist,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# API Enhancement (4 agents)
# Use for: Improving existing APIs
spawn_api_enhancement() {
  local task="$1"
  local channel="${2:-swarm:api-enhancement}"

  $SPAWN_CLI "$task" \
    --agents=backend-dev,api-docs,security-specialist,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# MOBILE DEVELOPMENT PATTERNS
# ============================================================================

# Mobile Development (4 agents)
# Use for: React Native or cross-platform mobile apps
spawn_mobile_development() {
  local task="$1"
  local channel="${2:-swarm:mobile-dev}"

  $SPAWN_CLI "$task" \
    --agents=mobile-dev,react-frontend-engineer,ui-designer,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Mobile Feature (3 agents)
# Use for: Quick mobile feature implementation
spawn_mobile_feature() {
  local task="$1"
  local channel="${2:-swarm:mobile-feature}"

  $SPAWN_CLI "$task" \
    --agents=mobile-dev,react-frontend-engineer,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# INFRASTRUCTURE PATTERNS
# ============================================================================

# Infrastructure Setup (4 agents)
# Use for: Setting up cloud infrastructure, containers, CI/CD
spawn_infrastructure_setup() {
  local task="$1"
  local channel="${2:-swarm:infrastructure}"

  $SPAWN_CLI "$task" \
    --agents=devops-engineer,system-architect,security-specialist,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Production Deployment (4 agents)
# Use for: Deploying to production with validation gates
spawn_production_deployment() {
  local task="$1"
  local channel="${2:-swarm:production-deploy}"

  $SPAWN_CLI "$task" \
    --agents=devops-engineer,security-specialist,production-validator,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology release-gate \
    --timeout 360000
}

# ============================================================================
# QUALITY ASSURANCE PATTERNS
# ============================================================================

# Code Quality Review (3 agents)
# Use for: Comprehensive code quality assessment
spawn_code_quality_review() {
  local task="$1"
  local channel="${2:-swarm:quality-review}"

  $SPAWN_CLI "$task" \
    --agents=code-analyzer,code-quality-validator,perf-analyzer \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Test Suite Development (3 agents)
# Use for: Creating comprehensive test coverage
spawn_test_suite_development() {
  local task="$1"
  local channel="${2:-swarm:test-suite}"

  $SPAWN_CLI "$task" \
    --agents=tester,playwright-tester,interaction-tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# FRONTEND DEVELOPMENT PATTERNS
# ============================================================================

# Frontend Feature (4 agents)
# Use for: React/frontend feature with UI design
spawn_frontend_feature() {
  local task="$1"
  local channel="${2:-swarm:frontend-feature}"

  $SPAWN_CLI "$task" \
    --agents=react-frontend-engineer,ui-designer,state-architect,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# UI Component Library (4 agents)
# Use for: Building reusable UI component systems
spawn_ui_component_library() {
  local task="$1"
  local channel="${2:-swarm:ui-components}"

  $SPAWN_CLI "$task" \
    --agents=ui-designer,react-frontend-engineer,accessibility-advocate-persona,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# BACKEND DEVELOPMENT PATTERNS
# ============================================================================

# Backend Service (4 agents)
# Use for: Standalone backend service development
spawn_backend_service() {
  local task="$1"
  local channel="${2:-swarm:backend-service}"

  $SPAWN_CLI "$task" \
    --agents=architect,backend-dev,security-specialist,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Database Schema Design (4 agents)
# Use for: Database schema and migration planning
spawn_database_schema() {
  local task="$1"
  local channel="${2:-swarm:database-schema}"

  $SPAWN_CLI "$task" \
    --agents=architect,backend-dev,perf-analyzer,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology collaborative \
    --timeout 360000
}

# ============================================================================
# SPECIALIZED PATTERNS
# ============================================================================

# Rust Development (3 agents)
# Use for: Rust projects with performance requirements
spawn_rust_development() {
  local task="$1"
  local channel="${2:-swarm:rust-dev}"

  $SPAWN_CLI "$task" \
    --agents=rust-developer,perf-analyzer,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# Blockchain Feature (4 agents)
# Use for: Blockchain/distributed consensus features
spawn_blockchain_feature() {
  local task="$1"
  local channel="${2:-swarm:blockchain}"

  $SPAWN_CLI "$task" \
    --agents=security-manager,consensus-builder,backend-dev,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology collaborative \
    --timeout 360000
}

# Documentation Generation (3 agents)
# Use for: Comprehensive documentation creation
spawn_documentation_generation() {
  local task="$1"
  local channel="${2:-swarm:documentation}"

  $SPAWN_CLI "$task" \
    --agents=api-docs,researcher,reviewer \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# ============================================================================
# CFN LOOP PATTERNS
# ============================================================================

# CFN Loop MVP (3 agents)
# Use for: Rapid prototyping with MVP quality gates
spawn_cfn_mvp() {
  local task="$1"
  local channel="${2:-swarm:cfn-mvp}"

  $SPAWN_CLI "$task" \
    --agents=cfn-coordinator-mvp,coder,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# CFN Loop Standard (5 agents)
# Use for: Standard development with balanced quality gates
spawn_cfn_standard() {
  local task="$1"
  local channel="${2:-swarm:cfn-standard}"

  $SPAWN_CLI "$task" \
    --agents=cfn-coordinator-standard,architect,coder,security-specialist,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology sequential
}

# CFN Loop Enterprise (6 agents)
# Use for: Enterprise-grade development with full compliance
spawn_cfn_enterprise() {
  local task="$1"
  local channel="${2:-swarm:cfn-enterprise}"

  $SPAWN_CLI "$task" \
    --agents=cfn-coordinator-enterprise,system-architect,backend-dev,security-specialist,devops-engineer,production-validator \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology collaborative \
    --timeout 360000
}

# ============================================================================
# MULTI-AGENT COORDINATION PATTERNS
# ============================================================================

# Enterprise System (6 agents)
# Use for: Large-scale enterprise system development
spawn_enterprise_system() {
  local task="$1"
  local channel="${2:-swarm:enterprise}"

  $SPAWN_CLI "$task" \
    --agents=system-architect,architect,backend-dev,security-specialist,devops-engineer,production-validator \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology collaborative \
    --timeout 360000
}

# Research and Implementation (4 agents)
# Use for: Tasks requiring research before implementation
spawn_research_and_implementation() {
  local task="$1"
  local channel="${2:-swarm:research-impl}"

  $SPAWN_CLI "$task" \
    --agents=researcher,analyst,coder,tester \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology bidirectional \
    --timeout 300000
}

# Legacy System Refactoring (5 agents)
# Use for: Refactoring legacy codebases
spawn_legacy_refactoring() {
  local task="$1"
  local channel="${2:-swarm:refactoring}"

  $SPAWN_CLI "$task" \
    --agents=code-analyzer,architect,code-booster,tester,reviewer \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology bidirectional \
    --timeout 300000
}

# ============================================================================
# UTILITY FUNCTIONS
# ============================================================================

# Custom Agent Spawning
# Use for: Non-standard agent combinations
spawn_custom() {
  local task="$1"
  local agents="$2"
  local channel="${3:-swarm:custom}"
  local topology="${4:-sequential}"

  $SPAWN_CLI "$task" \
    --agents="$agents" \
    --provider $DEFAULT_PROVIDER \
    --redis-channel "$channel" \
    --topology "$topology"
}

# List Available Templates
list_spawn_templates() {
  echo "Available Spawn Templates:"
  echo ""
  echo "Core Development:"
  echo "  spawn_feature_development"
  echo "  spawn_complex_feature"
  echo "  spawn_rapid_prototype"
  echo ""
  echo "Security:"
  echo "  spawn_security_audit"
  echo "  spawn_security_feature"
  echo ""
  echo "Performance:"
  echo "  spawn_performance_optimization"
  echo "  spawn_high_performance_feature"
  echo ""
  echo "Architecture:"
  echo "  spawn_system_architecture"
  echo "  spawn_architecture_review"
  echo ""
  echo "API Development:"
  echo "  spawn_api_development"
  echo "  spawn_api_enhancement"
  echo ""
  echo "Mobile Development:"
  echo "  spawn_mobile_development"
  echo "  spawn_mobile_feature"
  echo ""
  echo "Infrastructure:"
  echo "  spawn_infrastructure_setup"
  echo "  spawn_production_deployment"
  echo ""
  echo "Quality Assurance:"
  echo "  spawn_code_quality_review"
  echo "  spawn_test_suite_development"
  echo ""
  echo "Frontend Development:"
  echo "  spawn_frontend_feature"
  echo "  spawn_ui_component_library"
  echo ""
  echo "Backend Development:"
  echo "  spawn_backend_service"
  echo "  spawn_database_schema"
  echo ""
  echo "Specialized:"
  echo "  spawn_rust_development"
  echo "  spawn_blockchain_feature"
  echo "  spawn_documentation_generation"
  echo ""
  echo "CFN Loop:"
  echo "  spawn_cfn_mvp"
  echo "  spawn_cfn_standard"
  echo "  spawn_cfn_enterprise"
  echo ""
  echo "Multi-Agent Coordination:"
  echo "  spawn_enterprise_system"
  echo "  spawn_research_and_implementation"
  echo "  spawn_legacy_refactoring"
  echo ""
  echo "Utility:"
  echo "  spawn_custom <task> <agents> [channel] [topology]"
  echo "  list_spawn_templates"
}

# Print template usage information
print_template_info() {
  local template="$1"

  case "$template" in
    spawn_feature_development)
      echo "Feature Development (4 agents)"
      echo "Agents: architect, coder, tester, reviewer"
      echo "Topology: sequential"
      echo "Use for: Standard feature implementation with design, code, and validation"
      echo "Example: spawn_feature_development 'Implement user authentication' swarm:auth"
      ;;
    spawn_security_audit)
      echo "Security Audit (4 agents)"
      echo "Agents: security-specialist, code-analyzer, tester, production-validator"
      echo "Topology: sequential"
      echo "Use for: Comprehensive security assessment"
      echo "Example: spawn_security_audit 'Audit payment processing system' swarm:security"
      ;;
    spawn_system_architecture)
      echo "System Architecture Design (4 agents)"
      echo "Agents: system-architect, architect, devops-engineer, security-architect-persona"
      echo "Topology: collaborative (6 minutes timeout)"
      echo "Use for: Large-scale system design and planning"
      echo "Example: spawn_system_architecture 'Design microservices architecture' swarm:architecture"
      ;;
    *)
      echo "Unknown template: $template"
      echo "Run list_spawn_templates to see all available templates"
      ;;
  esac
}

# ============================================================================
# EXECUTION
# ============================================================================

# If script is executed directly, show help
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  echo "Agent Spawning Templates"
  echo "========================"
  echo ""
  echo "This script provides reusable templates for common multi-agent spawning patterns."
  echo ""
  echo "Usage:"
  echo "  source $HOME/.claude/skills/cfn-agent-spawning/spawn-templates.sh"
  echo "  spawn_feature_development 'Implement user authentication'"
  echo ""
  echo "For a complete list of templates:"
  echo "  list_spawn_templates"
  echo ""
  echo "For template information:"
  echo "  print_template_info spawn_feature_development"
fi
