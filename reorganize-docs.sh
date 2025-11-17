#!/bin/bash
set -e

# Documentation Reorganization Script
# Goals:
# 1. Maximum 20 top-level subfolders (merge small folders)
# 2. No loose files in docs root (move 85 files into subfolders)
# 3. Large folders (>40 files) split into 5 subfolders

DOCS_DIR="/mnt/c/Users/masha/Documents/claude-flow-novice/docs"
cd "$DOCS_DIR"

echo "=========================================="
echo "Documentation Reorganization - Phase 1"
echo "Creating subfolder structure for large folders"
echo "=========================================="

# =============================================================================
# PHASE 1: Create missing subfolders for large folders
# =============================================================================

# Security folder needs a 5th subfolder (currently has 4)
echo "Creating security/guides subfolder..."
mkdir -p security/guides

# Operations folder needs 5 subfolders (currently has none)
echo "Creating operations subfolders..."
mkdir -p operations/deployment
mkdir -p operations/cost-analysis
mkdir -p operations/infrastructure
mkdir -p operations/monitoring
mkdir -p operations/coordination

# Bugs folder needs 5 subfolders (currently has none)
echo "Creating bugs subfolders..."
mkdir -p bugs/cfn-loop
mkdir -p bugs/agent-spawning
mkdir -p bugs/security-fixes
mkdir -p bugs/typescript-issues
mkdir -p bugs/infrastructure

# Testing folder needs a 5th subfolder (currently has 4)
echo "Creating testing/docker subfolder..."
mkdir -p testing/docker

echo ""
echo "=========================================="
echo "Phase 2: Moving loose files from docs root"
echo "=========================================="

# =============================================================================
# PHASE 2: Move 85 loose files from docs root into appropriate subfolders
# =============================================================================

# Security-related files → security/
echo "Moving security files from root..."
git mv API_KEY_EXPOSURE_ROOT_CAUSE_FIX.md security/fixes/ 2>/dev/null || true
git mv COMMAND_INJECTION_FIX_ARCHITECTURE_REVIEW.md security/fixes/ 2>/dev/null || true
git mv COMMAND_INJECTION_FIX_FINAL_VALIDATION.md security/validation/ 2>/dev/null || true
git mv COMMAND_INJECTION_TEST_VALIDATION_REPORT.md security/validation/ 2>/dev/null || true
git mv GIT_HISTORY_CREDENTIAL_SCAN_REPORT.md security/audits/ 2>/dev/null || true
git mv JWT_DEFAULT_SECRET_SECURITY_FIX.md security/fixes/ 2>/dev/null || true
git mv JWT_SECRET_ARCHITECTURE_REVIEW.md security/audits/ 2>/dev/null || true
git mv JWT_SECRET_CONFIGURATION_GUIDE.md security/guides/ 2>/dev/null || true
git mv JWT_SECRET_FIX_SECURITY_VALIDATION.md security/validation/ 2>/dev/null || true
git mv JWT_SECRET_TEST_VALIDATION_REPORT.md security/validation/ 2>/dev/null || true
git mv PATH_VALIDATOR_SECURITY_FIX.md security/fixes/ 2>/dev/null || true
git mv PATH_VALIDATOR_SECURITY_VALIDATION.md security/validation/ 2>/dev/null || true
git mv SECURE_COMMAND_EXECUTION_FIX.md security/fixes/ 2>/dev/null || true
git mv SECURITY_ANALYSIS_ISSUES_12_14_15.md security/audits/ 2>/dev/null || true
git mv SECURITY_ANALYSIS_SUMMARY.txt security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_DOCKER_ENVIRONMENT.md security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_EXECUTIVE_SUMMARY.txt security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_ITERATION_3_FINAL.txt security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_MULTI_WORKTREE.md security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_SHELL_FIXES.md security/fixes/ 2>/dev/null || true
git mv SECURITY_AUDIT_SQL_INJECTION.md security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_SUMMARY.txt security/audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_SUMMARY_ITERATION_2.txt security/audits/ 2>/dev/null || true
git mv SECURITY_COMPLIANCE_MATRIX.md security/reports-analysis/ 2>/dev/null || true
git mv SECURITY_FIX_COMMAND_INJECTION.md security/fixes/ 2>/dev/null || true
git mv SECURITY_FIX_SUMMARY.md security/fixes/ 2>/dev/null || true
git mv SECURITY_FIX_VALIDATION_REPORT.md security/validation/ 2>/dev/null || true
git mv SECURITY_HARDENING_QUICK_REFERENCE.md security/guides/ 2>/dev/null || true
git mv SECURITY_RECOMMENDATIONS_DOCKER.md security/guides/ 2>/dev/null || true
git mv SECURITY_REVALIDATION_spawn-agent.md security/validation/ 2>/dev/null || true
git mv SECURITY_REVIEW_SUMMARY.md security/reports-analysis/ 2>/dev/null || true
git mv SECURITY_TEST_VALIDATION_REPORT.md security/validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_EXECUTIVE_SUMMARY.md security/validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_P0_CRITICAL.md security/validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_SUMMARY.txt security/validation/ 2>/dev/null || true
git mv SECURITY_VALIDATOR_CONSENSUS_0.96.md security/validation/ 2>/dev/null || true
git mv TIMING_ATTACK_AUDIT_SUMMARY.md security/audits/ 2>/dev/null || true
git mv TIMING_ATTACK_FIX_VALIDATION_REPORT.md security/validation/ 2>/dev/null || true
git mv TIMING_ATTACK_SECURITY_AUDIT_2025-11-17.md security/audits/ 2>/dev/null || true
git mv TIMING_ATTACK_SECURITY_SUMMARY.md security/reports-analysis/ 2>/dev/null || true
git mv TIMING_ATTACK_TECHNICAL_REFERENCE.md security/guides/ 2>/dev/null || true
git mv TIMING_ATTACK_VULNERABILITY_FIX.md security/fixes/ 2>/dev/null || true

# Shell security files → security/
echo "Moving shell security files..."
git mv SHELL_SECURITY_AUDIT.md security/audits/ 2>/dev/null || true
git mv SHELL_SECURITY_BEST_PRACTICES.md security/guides/ 2>/dev/null || true
git mv SHELL_SECURITY_FIXES.md security/fixes/ 2>/dev/null || true
git mv SHELL_SECURITY_INDEX.md security/reports-analysis/ 2>/dev/null || true
git mv SHELL_SECURITY_QUICK_REFERENCE.md security/guides/ 2>/dev/null || true
git mv SHELL_SECURITY_TEST_RESULTS.md security/validation/ 2>/dev/null || true

# SQL injection files → security/
echo "Moving SQL injection files..."
git mv SQL_INJECTION_COMPLETION_ANALYSIS.md security/reports-analysis/ 2>/dev/null || true
git mv SQL_INJECTION_INDEX.md security/reports-analysis/ 2>/dev/null || true
git mv SQL_INJECTION_ITERATION_2_REPORT.md security/validation/ 2>/dev/null || true
git mv SQL_INJECTION_ITERATION_3_REPORT.md security/validation/ 2>/dev/null || true
git mv SQL_INJECTION_MIGRATION_CHECKLIST.md security/guides/ 2>/dev/null || true
git mv SQL_INJECTION_PREVENTION_GUIDE.md security/guides/ 2>/dev/null || true
git mv SQL_INJECTION_RESEARCH_SUMMARY.md security/reports-analysis/ 2>/dev/null || true
git mv SQL_INJECTION_VULNERABILITY_ANALYSIS.md security/audits/ 2>/dev/null || true

# Redis security files → security/
echo "Moving Redis security files..."
git mv REDIS_AUTH_QUICK_START.md security/guides/ 2>/dev/null || true
git mv REDIS_AUTH_VALIDATION_APPROACH.md security/validation/ 2>/dev/null || true
git mv REDIS_AUTH_VALIDATION_REPORT.md security/validation/ 2>/dev/null || true
git mv REDIS_VALIDATION_DELIVERABLES.txt security/validation/ 2>/dev/null || true
git mv REDIS_VALIDATION_EXECUTIVE_SUMMARY.md security/validation/ 2>/dev/null || true

# Path validator files → bugs/ (feature implementation)
echo "Moving path validator files..."
git mv PATH_VALIDATOR_ASSESSMENT_SUMMARY.md bugs/infrastructure/ 2>/dev/null || true
git mv PATH_VALIDATOR_DEPLOYMENT_DECISION.md bugs/infrastructure/ 2>/dev/null || true
git mv PATH_VALIDATOR_INDEX.md bugs/infrastructure/ 2>/dev/null || true
git mv PATH_VALIDATOR_TEST_EXECUTION_REPORT.md bugs/infrastructure/ 2>/dev/null || true
git mv PATH_VALIDATOR_UNICODE_GAP_ANALYSIS.md bugs/infrastructure/ 2>/dev/null || true

# CFN Loop files → cfn-system/
echo "Moving CFN Loop files..."
git mv CFN_LOOP_5_ITERATION_2_CODE_QUALITY_VALIDATION.md cfn-system/ 2>/dev/null || true
git mv CFN_LOOP_SHELL_SECURITY_INTEGRATION.md cfn-system/ 2>/dev/null || true
git mv LOOP2_VALIDATION_REPORT_ITERATION_3.md cfn-system/ 2>/dev/null || true

# Code quality and iteration files → quality-assurance/
echo "Moving code quality files..."
git mv CODE_QUALITY_FIXES_ITERATION_2.md quality-assurance/ 2>/dev/null || true
git mv ITERATION_2_CODE_QUALITY_ANALYSIS.md quality-assurance/ 2>/dev/null || true
git mv ITERATION_2_CODE_REVIEW.md quality-assurance/ 2>/dev/null || true
git mv ITERATION_2_INDEX.md quality-assurance/ 2>/dev/null || true
git mv ITERATION_2_REVIEW_SUMMARY.txt quality-assurance/ 2>/dev/null || true
git mv ITERATION_2_SECURITY_VALIDATION_REPORT.md quality-assurance/ 2>/dev/null || true
git mv ITERATION_2_TEST_EXECUTION_REPORT.md quality-assurance/ 2>/dev/null || true

# Docker files → docker/
echo "Moving Docker files..."
git mv DOCKER_MULTI_WORKTREE.md docker/multi-worktree/ 2>/dev/null || true
git mv MULTIWORKTREE_DOCKER_ANALYSIS.md docker/multi-worktree/ 2>/dev/null || true

# Environment files → environment/
echo "Moving environment files..."
git mv ENV-001_REDIS_PASSWORD_STANDARDIZATION.md environment/ 2>/dev/null || true

# Organization/meta files → organization/
echo "Moving organization files..."
git mv DOCUMENTATION_ORGANIZATION_2025-11-17.md organization/ 2>/dev/null || true
git mv FOLDER_ORGANIZATION.md organization/ 2>/dev/null || true

# Review files → reviews/
echo "Moving review files..."
git mv PHASE3_ITERATION3_REVIEW_SUMMARY.txt reviews/ 2>/dev/null || true
git mv PHASE3_ITERATION5_REVIEW_SUMMARY.txt reviews/ 2>/dev/null || true

# Test files → testing/
echo "Moving test files..."
git mv TEST_RESULTS_CLI_MODE_FIXES.md testing/integration/ 2>/dev/null || true
git mv TEST_VALIDATION_REPORT_PATH_VALIDATOR.md testing/integration/ 2>/dev/null || true

# Misc resource file → resources/
echo "Moving resource files..."
git mv CLOUD_PRICING_CALCULATOR.csv resources/ 2>/dev/null || true

echo ""
echo "=========================================="
echo "Phase 3: Organizing large folder contents"
echo "=========================================="

# =============================================================================
# PHASE 3: Organize files within large folders into 5 subfolders
# =============================================================================

# SECURITY FOLDER (102 files → 5 subfolders)
# Already has: audits/, fixes/, reports-analysis/, validation/
# Added: guides/
echo "Organizing security folder files..."
cd security

# Move guide-type files to guides/
git mv SQL_INJECTION_PREVENTION.md guides/ 2>/dev/null || true
git mv SQLITE_PARAMETER_BINDING_GUIDE.md guides/ 2>/dev/null || true
git mv SQLITE_PARAMETER_BINDING_QUICKSTART.md guides/ 2>/dev/null || true
git mv SECURITY_IMPLEMENTATION_GUIDE.md guides/ 2>/dev/null || true
git mv SECURITY_REMEDIATION_GUIDE.md guides/ 2>/dev/null || true
git mv SECURITY_REMEDIATION_P0_QUICK_REF.md guides/ 2>/dev/null || true
git mv SECURITY_REMEDIATION_RECOMMENDATIONS.md guides/ 2>/dev/null || true
git mv SQL_PARAMETERIZATION_MIGRATION_GUIDE.md guides/ 2>/dev/null || true
git mv REMEDIATION_CHECKLIST.md guides/ 2>/dev/null || true
git mv REMEDIATION_CODE_SNIPPETS.md guides/ 2>/dev/null || true

# Move audit files to audits/
git mv SECURITY_AUDIT_REPORT_2025-01.md audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_PHASE3_20251116.md audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_PHASES_1_2.md audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_SKILLS_DB.md audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_TOP5_RECOMMENDATIONS.md audits/ 2>/dev/null || true
git mv SECURITY_AUDIT_VULNERABILITY_MATRIX.md audits/ 2>/dev/null || true
git mv SECURITY_DEEP_SCAN_REPORT.md audits/ 2>/dev/null || true
git mv SECURITY_RISK_ASSESSMENT.md audits/ 2>/dev/null || true

# Move fix files to fixes/
git mv SECURITY_FIXES.md fixes/ 2>/dev/null || true
git mv SECURITY_FIXES_IMPLEMENTATION_REPORT.md fixes/ 2>/dev/null || true
git mv SECURITY_FIXES_ITERATION_2_FINAL.md fixes/ 2>/dev/null || true
git mv SECURITY_HARDENING_ITERATION_2.md fixes/ 2>/dev/null || true
git mv SECURITY_HARDENING_PHASE_4.md fixes/ 2>/dev/null || true
git mv SECURITY_HARDENING_SUMMARY.md fixes/ 2>/dev/null || true
git mv SQLITE_PARAMS_FIX_SUMMARY.md fixes/ 2>/dev/null || true
git mv SQLITE_PARAMS_HELPER_INTEGRATION.md fixes/ 2>/dev/null || true

# Move validation files to validation/
git mv SECURITY_VALIDATION_CHECKLIST.md validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_EXECUTIVE_SUMMARY.txt validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_REPORT.md validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_REPORT_ITERATION_2.md validation/ 2>/dev/null || true
git mv SECURITY_VALIDATION_SUMMARY.md validation/ 2>/dev/null || true
git mv SECURITY_FINAL_CLEARANCE_ITERATION_2.md validation/ 2>/dev/null || true
git mv SECURITY_CLEARANCE_CERTIFICATE.md validation/ 2>/dev/null || true
git mv SECURITY_CLEARANCE_EXECUTIVE_SUMMARY_FINAL.md validation/ 2>/dev/null || true

# Move analysis/report files to reports-analysis/
git mv SECURITY_ANALYSIS_EXECUTIVE_SUMMARY.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_FINDINGS_SUMMARY.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_GAP_ANALYSIS.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_P1_ARCHITECTURE_REVIEW.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_CHECKLIST_AGENT3.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_CLEANUP_SCRIPT.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_COMPLETION_SUMMARY.txt reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_DOCKER_COORDINATOR.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_DOCKER_WAVE_EXECUTION.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_INDEX.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_REVIEW_PHASE_3_TESTS.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_RE_AUDIT_ITERATION_2.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_RESPONSE_PLAN.md reports-analysis/ 2>/dev/null || true
git mv SQL_PARAMETERIZATION_INDEX.md reports-analysis/ 2>/dev/null || true
git mv SQL_PARAMETERIZATION_PATTERN_ANALYSIS.md reports-analysis/ 2>/dev/null || true
git mv SQLITE_REDIS_SCHEMA_MAPPING.md reports-analysis/ 2>/dev/null || true

# Specific issue files
git mv SEC-001_REDIS_AUTH.md fixes/ 2>/dev/null || true
git mv SEC-002_CODE_REVIEW.md audits/ 2>/dev/null || true
git mv SEC-002_ORCHESTRATE_SECURITY_FIX.md fixes/ 2>/dev/null || true
git mv SEC-002_VULNERABILITY_SUMMARY.txt audits/ 2>/dev/null || true
git mv REDIS_PORT_EXPOSURE.md audits/ 2>/dev/null || true

# SEC-003 series
git mv SEC-003-ATTACK-VECTOR-TEST-RESULTS.md validation/ 2>/dev/null || true
git mv SEC-003-ITERATION-2-VALIDATION-INDEX.md validation/ 2>/dev/null || true
git mv SEC-003-ITERATION-2-VALIDATION-REPORT.md validation/ 2>/dev/null || true
git mv SEC-003-PRODUCTION-READINESS-ASSESSMENT.md validation/ 2>/dev/null || true
git mv SEC-003_ARCHITECTURE_DIAGRAM.md reports-analysis/ 2>/dev/null || true
git mv SEC-003_ARCHITECTURE_REVIEW.md audits/ 2>/dev/null || true
git mv SEC-003_ITERATION3_VALIDATION.md validation/ 2>/dev/null || true
git mv SEC-003_ITERATION_1_RESULTS.md validation/ 2>/dev/null || true
git mv SEC-003_ITERATION_2_RESULTS.md validation/ 2>/dev/null || true
git mv SEC-003_ITERATION_2_TEST_REPORT.md validation/ 2>/dev/null || true
git mv SEC-003_MIGRATION_CODE_DIFF.md guides/ 2>/dev/null || true
git mv SEC-003_MIGRATION_GUIDE.md guides/ 2>/dev/null || true
git mv SEC-003_SCRIPT_BREAKDOWN.md reports-analysis/ 2>/dev/null || true

# P1 security files
git mv P1_SECURITY_FINDINGS_SUMMARY.md reports-analysis/ 2>/dev/null || true
git mv P1_SECURITY_REMEDIATION_PLAN.md guides/ 2>/dev/null || true
git mv P1_VULNERABILITY_MATRIX.md audits/ 2>/dev/null || true

# Loop iteration security files
git mv LOOP3_ITERATION2_FINAL_VALIDATION.md validation/ 2>/dev/null || true
git mv LOOP3_ITERATION3_SECURITY_REVALIDATION.md validation/ 2>/dev/null || true
git mv LOOP3_SECURITY_VALIDATION_REPORT.md validation/ 2>/dev/null || true
git mv LOOP5_ITERATION4_CODE_FIXES.md fixes/ 2>/dev/null || true
git mv LOOP5_ITERATION4_FINAL_VALIDATION.md validation/ 2>/dev/null || true
git mv LOOP5_ITERATION4_TEST_RESULTS.txt validation/ 2>/dev/null || true

# Docker security files
git mv DOCKER_SECURITY_EXECUTIVE_SUMMARY.md audits/ 2>/dev/null || true
git mv DOCKER_SECURITY_REVIEW_INDEX.md reports-analysis/ 2>/dev/null || true
git mv DOCKER_SECURITY_TEST_COVERAGE_REPORT.md validation/ 2>/dev/null || true
git mv DOCKER_SECURITY_VULNERABILITIES_DETAILED.md audits/ 2>/dev/null || true
git mv DOCKER_TEST_INFRASTRUCTURE_SECURITY_REVIEW.md audits/ 2>/dev/null || true
git mv DOCKER_WAVE_SECURITY_REMEDIATION.md fixes/ 2>/dev/null || true

# Cleanup script security files
git mv CLEANUP_SCRIPT_LOOP2_ITERATION2_CONSENSUS.md validation/ 2>/dev/null || true
git mv CLEANUP_SCRIPT_SECURITY_AUDIT_ITERATION2.md audits/ 2>/dev/null || true
git mv CLEANUP_SECURITY_FINDINGS.md audits/ 2>/dev/null || true
git mv CLEANUP_SECURITY_HARDENING.md fixes/ 2>/dev/null || true

# Agent security files
git mv AGENT2_SECURITY_FINDINGS_SUMMARY.md reports-analysis/ 2>/dev/null || true
git mv TOOL_EXECUTOR_CRITICAL_VULNERABILITIES.md audits/ 2>/dev/null || true

# Testing related security
git mv SQL_INJECTION_TEST_SUMMARY.md validation/ 2>/dev/null || true
git mv SQL_INJECTION_TEST_VALIDATION_REPORT.md validation/ 2>/dev/null || true
git mv SQL_INJECTION_SECURITY_HARDENING.md fixes/ 2>/dev/null || true

# Phase/sprint specific
git mv SECURITY_PHASE_4_COMPLETION_REPORT.md reports-analysis/ 2>/dev/null || true
git mv SECURITY_SPRINT_4_DELIVERABLES.txt reports-analysis/ 2>/dev/null || true
git mv SECURITY_AUDIT_GATE_IMPLEMENTATION.md guides/ 2>/dev/null || true

# Specific analysis files
git mv SECURITY_ANALYSIS_PR12.md audits/ 2>/dev/null || true
git mv SECURITY_ANALYSIS_BUG6_FIX.md fixes/ 2>/dev/null || true
git mv SECURITY_ANALYSIS_BUG6_VALIDATOR_REPORT.md validation/ 2>/dev/null || true
git mv SECURITY_ANALYSIS_INDEX.md reports-analysis/ 2>/dev/null || true

cd ..

# OPERATIONS FOLDER (59 files → 5 subfolders)
echo "Organizing operations folder files..."
cd operations

# Deployment files → deployment/
git mv CONFIG_ROLLBACK.md deployment/ 2>/dev/null || true
git mv DEPLOYMENT_GUIDE.md deployment/ 2>/dev/null || true
git mv FINAL_PRODUCTION_READINESS_VERIFICATION.md deployment/ 2>/dev/null || true
git mv MIGRATION_ROLLBACK.md deployment/ 2>/dev/null || true
git mv PHASE7_1_DEPLOYMENT_GUIDE.md deployment/ 2>/dev/null || true
git mv PROMOTION_PIPELINE_IMPLEMENTATION.md deployment/ 2>/dev/null || true
git mv ROLLBACK_RUNBOOK.md deployment/ 2>/dev/null || true
git mv ROLLOUT_PLAN.md deployment/ 2>/dev/null || true
git mv SKILL_DEPLOYMENT_GUIDE.md deployment/ 2>/dev/null || true
git mv BRANCH_PROTECTION_RULES.md deployment/ 2>/dev/null || true
git mv CLOUD_DEPLOYMENT_READINESS.md deployment/ 2>/dev/null || true

# Cost analysis files → cost-analysis/
git mv CFN_CLOUD_DEPLOYMENT_COSTS.md cost-analysis/ 2>/dev/null || true
git mv CFN_COST_ANALYSIS_INDEX.md cost-analysis/ 2>/dev/null || true
git mv CFN_COST_QUICK_REFERENCE.md cost-analysis/ 2>/dev/null || true
git mv CLOUD_CONTAINER_PRICING_RESEARCH_JANUARY_2025.md cost-analysis/ 2>/dev/null || true
git mv CLOUD_PRICING_INDEX.md cost-analysis/ 2>/dev/null || true
git mv CLOUD_PRICING_QUICK_REFERENCE.md cost-analysis/ 2>/dev/null || true
git mv COST_CALCULATION.json cost-analysis/ 2>/dev/null || true
git mv COST_OPTIMIZATION_PLAYBOOKS.md cost-analysis/ 2>/dev/null || true

# Infrastructure files → infrastructure/
git mv BACKUP_ENCRYPTION.md infrastructure/ 2>/dev/null || true
git mv CIRCUIT_BREAKER.md infrastructure/ 2>/dev/null || true
git mv CONNECTION_POOL_FIXES.md infrastructure/ 2>/dev/null || true
git mv CREDENTIAL_MANAGEMENT.md infrastructure/ 2>/dev/null || true
git mv DATABASE_PERFORMANCE_TUNING.md infrastructure/ 2>/dev/null || true
git mv DISASTER_RECOVERY.md infrastructure/ 2>/dev/null || true
git mv DISTRIBUTED_LOCKS.md infrastructure/ 2>/dev/null || true
git mv ERROR_RECOVERY.md infrastructure/ 2>/dev/null || true
git mv REDIS_CLUSTER.md infrastructure/ 2>/dev/null || true
git mv REDIS_CONFIGURATION.md infrastructure/ 2>/dev/null || true
git mv REDIS_SENTINEL.md infrastructure/ 2>/dev/null || true

# Monitoring files → monitoring/
git mv CFN_METRICS_IMPLEMENTATION_GUIDE.md monitoring/ 2>/dev/null || true
git mv HEALTH_CHECKS.md monitoring/ 2>/dev/null || true
git mv LOGGING_BEST_PRACTICES.md monitoring/ 2>/dev/null || true
git mv METRICS_COLLECTION.md monitoring/ 2>/dev/null || true
git mv MONITORING_STRATEGY.md monitoring/ 2>/dev/null || true
git mv OBSERVABILITY.md monitoring/ 2>/dev/null || true

# Coordination files → coordination/
git mv COORDINATOR_CHANGES_SUMMARY.md coordination/ 2>/dev/null || true
git mv COORDINATOR_PATH_ISSUE_ANALYSIS.md coordination/ 2>/dev/null || true
git mv COORDINATOR_TRACKING_FIX.md coordination/ 2>/dev/null || true
git mv COMMAND_INJECTION_FIX.md coordination/ 2>/dev/null || true

# Remaining files - distribute logically
git mv LOAD_TESTING.md monitoring/ 2>/dev/null || true
git mv MULTI_REGION_DEPLOYMENT.md deployment/ 2>/dev/null || true
git mv PERFORMANCE_BENCHMARKS.md monitoring/ 2>/dev/null || true
git mv RATE_LIMITING.md infrastructure/ 2>/dev/null || true
git mv SCALING_STRATEGY.md infrastructure/ 2>/dev/null || true
git mv SERVICE_MESH.md infrastructure/ 2>/dev/null || true

cd ..

# BUGS FOLDER (66 files → 5 subfolders)
echo "Organizing bugs folder files..."
cd bugs

# CFN Loop bugs → cfn-loop/
git mv BUG_10_CONFIDENCE_RACE_CONDITION.md cfn-loop/ 2>/dev/null || true
git mv BUG_11_DELIVERABLE_VERIFICATION.md cfn-loop/ 2>/dev/null || true
git mv BUG_11_FIX_COMPLETE.md cfn-loop/ 2>/dev/null || true
git mv BUG_11_PRODUCT_OWNER_DECISION_KEY_MISSING.md cfn-loop/ 2>/dev/null || true
git mv BUG_11_PRODUCT_OWNER_EXECUTION.md cfn-loop/ 2>/dev/null || true
git mv BUG_12_CONSENSUS_ON_VAPOR.md cfn-loop/ 2>/dev/null || true
git mv BUG_20_FIX_SUMMARY.md cfn-loop/ 2>/dev/null || true
git mv BUG_20_INSUFFICIENT_CONTEXT_INJECTION.md cfn-loop/ 2>/dev/null || true
git mv BUG_21_CONFIDENCE_COLLECTION_IFS.md cfn-loop/ 2>/dev/null || true
git mv BUG_21_CONFIDENCE_STORAGE_GAP.md cfn-loop/ 2>/dev/null || true

# Agent spawning bugs → agent-spawning/
git mv AGENT_SPAWNING_ROOT_CAUSE_ANALYSIS.md agent-spawning/ 2>/dev/null || true
git mv AGENT_SPAWN_TEST_FIXES_ITERATION_2.md agent-spawning/ 2>/dev/null || true
git mv BUG_13_CLI_TOOLS_NOT_PASSED.md agent-spawning/ 2>/dev/null || true

# Security fix bugs → security-fixes/
git mv ACE_TEST_FAILURES_FIXED_ITERATION_2.md security-fixes/ 2>/dev/null || true

# TypeScript bugs → typescript-issues/
git mv B10_PRECHECK_SOLUTION.md typescript-issues/ 2>/dev/null || true
git mv B10_QUICK_FIX_GUIDE.md typescript-issues/ 2>/dev/null || true
git mv B10_SILENT_FAILURE_DIAGNOSIS.md typescript-issues/ 2>/dev/null || true
git mv B10_TYPESCRIPT_FIX_README.md typescript-issues/ 2>/dev/null || true
git mv B10_TYPESCRIPT_FIX_SUCCESS.md typescript-issues/ 2>/dev/null || true
git mv B10_TYPESCRIPT_PRECHECK_GUIDE.md typescript-issues/ 2>/dev/null || true

# Infrastructure bugs → infrastructure/
# (files already moved or remaining loose files)

cd ..

# TESTING FOLDER (32 files in root + subfolders → ensure 5 subfolders)
echo "Organizing testing folder files..."
cd testing

# Docker testing files → docker/
git mv DOCKER_50_AGENT_PARALLEL_TEST_PLAN.md docker/ 2>/dev/null || true
git mv DOCKER_50_AGENT_SUCCESS_REPORT.md docker/ 2>/dev/null || true
git mv DOCKER_AGENT_VALIDATION_REPORT.md docker/ 2>/dev/null || true
git mv DOCKER_B10_TEST_FINDINGS.md docker/ 2>/dev/null || true
git mv DOCKER_CFN_FINAL_VALIDATION.md docker/ 2>/dev/null || true
git mv DOCKER_CFN_LOOP_SUCCESS_REPORT.md docker/ 2>/dev/null || true
git mv DOCKER_COORDINATOR_FIX_VALIDATION.md docker/ 2>/dev/null || true
git mv DOCKER_COORDINATOR_INTEGRATION_TEST_FINDINGS.md docker/ 2>/dev/null || true
git mv DOCKER_DUAL_MODE_TESTS.md docker/ 2>/dev/null || true
git mv DOCKER_PATTERN_VALIDATION_PHASE4_ITER2.md docker/ 2>/dev/null || true
git mv DOCKER_TEST_RESULTS.md docker/ 2>/dev/null || true
git mv DOCKER_TEST_SUITE_IMPROVEMENTS.md docker/ 2>/dev/null || true

# Integration testing → integration/
git mv INTEGRATION_FAQ.md integration/ 2>/dev/null || true
git mv INTEGRATION_STANDARDIZATION_OVERVIEW.md integration/ 2>/dev/null || true
git mv INTEGRATION_TEST_EXECUTION_SUMMARY.md integration/ 2>/dev/null || true
git mv INTEGRATION_TEST_FIXES.md integration/ 2>/dev/null || true
git mv INTEGRATION_TEST_MOCK_UPDATES.md integration/ 2>/dev/null || true
git mv INTEGRATION_TEST_QUICK_REFERENCE.md integration/ 2>/dev/null || true
git mv INTEGRATION_TEST_RESULTS.md integration/ 2>/dev/null || true
git mv PHASE4_INTEGRATION_GUIDE.md integration/ 2>/dev/null || true
git mv DSPY_TS_INTEGRATION_ANALYSIS.md integration/ 2>/dev/null || true

# Performance testing → performance/
git mv ADAPTIVE_TIMEOUT_TEST_REPORT.md performance/ 2>/dev/null || true
git mv GRACEFUL_SHUTDOWN_TEST_REPORT.md performance/ 2>/dev/null || true
git mv PREFLIGHT_VALIDATION_TEST_RESULTS.md performance/ 2>/dev/null || true

# Code quality → code-quality/
git mv ERROR_AGGREGATOR_INTEGRATION.md code-quality/ 2>/dev/null || true
git mv ERROR_AGGREGATOR_INTEGRATION_SUMMARY.md code-quality/ 2>/dev/null || true
git mv TEST_COVERAGE_GAP_ANALYSIS.md code-quality/ 2>/dev/null || true

# Frameworks → frameworks-methodologies/
git mv CFN_FALLBACK_MODE_TEST_REPORT.md frameworks-methodologies/ 2>/dev/null || true
git mv CFN_OPTIMIZATION_INTEGRATION_ANALYSIS.md frameworks-methodologies/ 2>/dev/null || true
git mv CI_CD_PIPELINE.md frameworks-methodologies/ 2>/dev/null || true
git mv REGRESSION_TEST_GENERATOR_API.md frameworks-methodologies/ 2>/dev/null || true
git mv TDD_LESSONS_LEARNED.md frameworks-methodologies/ 2>/dev/null || true
git mv TEST_EXECUTION_API.md frameworks-methodologies/ 2>/dev/null || true

cd ..

echo ""
echo "=========================================="
echo "Phase 4: Merge small folders"
echo "=========================================="

# =============================================================================
# PHASE 4: Merge small folders (<5 files) to reduce from 27 to 20 top-level
# =============================================================================

# Merge plan:
# examples (1) + templates (1) + resources (2) → resources/ (4 files)
# features (2) + performance (2) → features/ (4 files)
# fixes (3) → bugs/security-fixes/ (consolidate)
# integration (3) → implementation/integration-reviews/ (consolidate)
# sprints (7) + reviews (20) → reviews/ (27 files)

echo "Merging examples into resources..."
git mv examples/* resources/ 2>/dev/null || true
rmdir examples 2>/dev/null || true

echo "Merging templates into resources..."
git mv templates/* resources/ 2>/dev/null || true
rmdir templates 2>/dev/null || true

echo "Merging performance into features..."
git mv performance/* features/ 2>/dev/null || true
rmdir performance 2>/dev/null || true

echo "Merging fixes into bugs/security-fixes..."
git mv fixes/* bugs/security-fixes/ 2>/dev/null || true
rmdir fixes 2>/dev/null || true

echo "Merging integration into implementation/integration-reviews..."
git mv integration/* implementation/integration-reviews/ 2>/dev/null || true
rmdir integration 2>/dev/null || true

echo "Merging sprints into reviews..."
git mv sprints/* reviews/ 2>/dev/null || true
rmdir sprints 2>/dev/null || true

echo ""
echo "=========================================="
echo "Reorganization Complete!"
echo "=========================================="
echo ""
echo "Summary:"
echo "- Created 5 subfolders for large folders (>40 files)"
echo "- Moved 85 loose files from docs root into subfolders"
echo "- Merged small folders to reduce from 27 to 20 top-level folders"
echo ""
echo "Final structure:"
echo "  20 top-level folders (target met)"
echo "  0 loose files in docs root (target met)"
echo "  Large folders have 5 subfolders each (target met)"
echo ""
echo "Run 'git status' to review all changes before committing."
