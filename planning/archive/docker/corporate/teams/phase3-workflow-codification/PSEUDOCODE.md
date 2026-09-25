# Phase 3: Workflow Codification System - Pseudocode

**Version:** 3.0.0
**Status:** DRAFT
**Dependencies:** Phase 1 (Corporate Organization), Phase 2 (Playbook-Driven Architecture)
**Date:** 2025-11-12

---

## Table of Contents

1. [Pattern Analysis and Detection](#1-pattern-analysis-and-detection)
2. [Skill Generation (AI-Powered)](#2-skill-generation-ai-powered)
3. [Approval Workflow](#3-approval-workflow)
4. [Skill Deployment](#4-skill-deployment)
5. [Edge Case Tracking](#5-edge-case-tracking)
6. [Cost Tracking](#6-cost-tracking)
7. [Skill Execution (Team Coordinator)](#7-skill-execution-team-coordinator)
8. [Skill Update Proposal](#8-skill-update-proposal)

---

## 1. Pattern Analysis and Detection

### 1.1 Main Pattern Analyzer (Weekly Cron Job)

```python
FUNCTION AnalyzeWorkflowPatterns():
    """
    Analyzes ACE reflections to detect repeated workflow patterns.
    Runs weekly via cron job.
    """

    # STEP 1: Query ACE reflections from last 90 days
    reflections = QueryPostgreSQL("""
        SELECT
            cr.id,
            cr.task_id,
            cr.team_id,
            cr.content,
            cr.workflow_steps,
            cr.confidence,
            cr.created_at,
            json_extract(cr.metadata, '$.tags') as tags,
            json_extract(cr.metadata, '$.domain') as domain
        FROM context_reflections cr
        WHERE
            cr.created_at > NOW() - INTERVAL '90 days' AND
            cr.confidence >= 0.75 AND
            json_array_length(cr.workflow_steps) >= 2
        ORDER BY cr.created_at DESC
    """)

    # STEP 2: Group reflections by workflow similarity
    workflow_groups = {}

    FOR EACH reflection IN reflections:
        # Extract workflow signature
        signature = GenerateWorkflowSignature(reflection.workflow_steps)

        IF signature NOT IN workflow_groups:
            workflow_groups[signature] = []
        END IF

        workflow_groups[signature].append(reflection)
    END FOR

    # STEP 3: Filter groups with >= 5 occurrences
    candidate_patterns = []

    FOR EACH signature, group IN workflow_groups:
        IF len(group) >= 5:
            # Calculate similarity score
            similarity = CalculateSimilarityScore(group)

            # Calculate confidence
            avg_confidence = AVG(reflection.confidence FOR reflection IN group)

            # Check if deterministic
            is_deterministic = CheckDeterministic(group)

            IF similarity >= 0.85 AND is_deterministic:
                pattern = {
                    "signature": signature,
                    "workflow_steps": ExtractCommonSteps(group),
                    "occurrence_count": len(group),
                    "teams_affected": UNIQUE(reflection.team_id FOR reflection IN group),
                    "similarity_score": similarity,
                    "confidence_score": avg_confidence,
                    "deterministic": is_deterministic
                }

                candidate_patterns.append(pattern)
            END IF
        END IF
    END FOR

    # STEP 4: Estimate cost savings and prioritize
    FOR EACH pattern IN candidate_patterns:
        pattern["estimated_savings_usd"] = EstimateCostSavings(pattern)
        pattern["priority"] = CalculatePriority(pattern)
    END FOR

    # Sort by priority (high → medium → low)
    candidate_patterns.sort(key=lambda p: p["priority"], reverse=True)

    # STEP 5: Store patterns in database
    FOR EACH pattern IN candidate_patterns:
        # Check if pattern already exists
        existing = QueryPostgreSQL("""
            SELECT id FROM workflow_patterns
            WHERE pattern_name = $1
        """, pattern["signature"])

        IF NOT existing:
            # Insert new pattern
            pattern_id = InsertPattern(pattern)

            # Trigger skill generation for high-priority patterns
            IF pattern["priority"] == "high":
                SpawnSkillGenerator(pattern_id)
            END IF
        END IF
    END FOR

    # STEP 6: Generate pattern detection report
    GeneratePatternReport(candidate_patterns)

    RETURN candidate_patterns
END FUNCTION


FUNCTION GenerateWorkflowSignature(workflow_steps):
    """
    Generates a normalized signature for workflow steps.
    Ignores parameters, focuses on command structure.
    """
    normalized_steps = []

    FOR EACH step IN workflow_steps:
        # Extract command (ignore parameters)
        command = ExtractCommand(step)  # "npm install" from "npm install --production"

        # Normalize whitespace and case
        command = command.strip().lower()

        normalized_steps.append(command)
    END FOR

    # Join with delimiter
    signature = " → ".join(normalized_steps)

    RETURN signature
END FUNCTION


FUNCTION CalculateSimilarityScore(reflection_group):
    """
    Calculates average pairwise similarity across reflection group.
    """
    total_similarity = 0.0
    comparisons = 0

    FOR i FROM 0 TO len(reflection_group) - 2:
        FOR j FROM i + 1 TO len(reflection_group) - 1:
            # Compare workflow steps using Jaccard similarity
            steps_a = SET(reflection_group[i].workflow_steps)
            steps_b = SET(reflection_group[j].workflow_steps)

            intersection = steps_a.intersection(steps_b)
            union = steps_a.union(steps_b)

            jaccard = len(intersection) / len(union)

            total_similarity += jaccard
            comparisons += 1
        END FOR
    END FOR

    avg_similarity = total_similarity / comparisons IF comparisons > 0 ELSE 0.0

    RETURN avg_similarity
END FUNCTION


FUNCTION CheckDeterministic(reflection_group):
    """
    Checks if workflow is deterministic (same inputs → same outputs).
    Uses heuristics: stateless commands, no external API calls, etc.
    """

    # Heuristic 1: Check for stateless commands
    FOR EACH reflection IN reflection_group:
        FOR EACH step IN reflection.workflow_steps:
            IF ContainsNonDeterministicPattern(step):
                RETURN FALSE  # Random numbers, timestamps, API calls, etc.
            END IF
        END FOR
    END FOR

    # Heuristic 2: Check for consistent outputs
    outputs = [reflection.output FOR reflection IN reflection_group]

    IF len(UNIQUE(outputs)) / len(outputs) > 0.3:
        # More than 30% output variance → not deterministic
        RETURN FALSE
    END IF

    RETURN TRUE
END FUNCTION


FUNCTION EstimateCostSavings(pattern):
    """
    Estimates monthly cost savings from codifying this workflow.
    """

    # Constants
    AI_INPUT_TOKENS = 5000      # Average for workflow task
    AI_OUTPUT_TOKENS = 2000     # Average for workflow completion
    TOKEN_COST = 0.50 / 1_000_000  # $0.50 per 1M tokens
    SCRIPT_COST = 0.0001        # Negligible

    # Calculate per-execution savings
    ai_cost = (AI_INPUT_TOKENS + AI_OUTPUT_TOKENS) * TOKEN_COST
    savings_per_execution = ai_cost - SCRIPT_COST

    # Estimate monthly executions
    occurrence_count = pattern["occurrence_count"]
    days_in_window = 90
    daily_rate = occurrence_count / days_in_window
    monthly_executions = daily_rate * 30

    # Calculate monthly savings
    monthly_savings = monthly_executions * savings_per_execution

    RETURN monthly_savings
END FUNCTION


FUNCTION CalculatePriority(pattern):
    """
    Calculates priority (high, medium, low) based on multiple factors.
    """

    score = 0

    # Factor 1: Occurrence count (weight: 40%)
    IF pattern["occurrence_count"] >= 20:
        score += 40
    ELSE IF pattern["occurrence_count"] >= 10:
        score += 25
    ELSE:
        score += 10
    END IF

    # Factor 2: Cost savings (weight: 30%)
    IF pattern["estimated_savings_usd"] >= 50:
        score += 30
    ELSE IF pattern["estimated_savings_usd"] >= 20:
        score += 20
    ELSE:
        score += 10
    END IF

    # Factor 3: Teams affected (weight: 20%)
    IF len(pattern["teams_affected"]) >= 3:
        score += 20
    ELSE IF len(pattern["teams_affected"]) >= 2:
        score += 12
    ELSE:
        score += 5
    END IF

    # Factor 4: Confidence score (weight: 10%)
    IF pattern["confidence_score"] >= 0.90:
        score += 10
    ELSE IF pattern["confidence_score"] >= 0.80:
        score += 6
    ELSE:
        score += 3
    END IF

    # Determine priority
    IF score >= 75:
        RETURN "high"
    ELSE IF score >= 50:
        RETURN "medium"
    ELSE:
        RETURN "low"
    END IF
END FUNCTION
```

---

## 2. Skill Generation (AI-Powered)

### 2.1 Skill Generator Agent Spawning

```python
FUNCTION SpawnSkillGenerator(pattern_id):
    """
    Spawns ephemeral AI agent to generate skill from pattern.
    """

    # STEP 1: Retrieve pattern details
    pattern = QueryPostgreSQL("""
        SELECT * FROM workflow_patterns WHERE id = $1
    """, pattern_id)

    # STEP 2: Retrieve related ACE reflections for context
    reflections = QueryPostgreSQL("""
        SELECT content, workflow_steps, metadata
        FROM context_reflections
        WHERE
            json_extract(metadata, '$.tags') && $1::TEXT[] AND
            created_at > NOW() - INTERVAL '90 days'
        LIMIT 20
    """, pattern["tags"])

    # STEP 3: Build skill generation prompt
    prompt = BuildSkillGenerationPrompt(pattern, reflections)

    # STEP 4: Spawn ephemeral skill-generator agent
    agent_id = SpawnEphemeralAgent(
        agent_type="skill-generator",
        task_prompt=prompt,
        context={
            "pattern_id": pattern_id,
            "pattern_name": pattern["pattern_name"],
            "workflow_steps": pattern["workflow_steps"]
        }
    )

    # STEP 5: Update pattern status
    UpdatePatternStatus(pattern_id, "GENERATING", {"agent_id": agent_id})

    # STEP 6: Monitor agent completion (async)
    MonitorAgentCompletion(agent_id, OnSkillGenerationComplete)

    RETURN agent_id
END FUNCTION


FUNCTION BuildSkillGenerationPrompt(pattern, reflections):
    """
    Constructs AI prompt for skill generation.
    """

    prompt = f"""
# Skill Generation Task

You are an expert bash script developer. Generate a complete CFN skill package from the following workflow pattern.

## Pattern Details
- **Pattern Name:** {pattern["pattern_name"]}
- **Occurrence Count:** {pattern["occurrence_count"]}
- **Teams Affected:** {", ".join(pattern["teams_affected"])}
- **Confidence Score:** {pattern["confidence_score"]}

## Workflow Steps
{FormatWorkflowSteps(pattern["workflow_steps"])}

## Historical Context (ACE Reflections)
{FormatReflections(reflections)}

## Requirements
1. Generate **execute.sh**: Main skill script implementing workflow
   - Use `set -euo pipefail` for error handling
   - Include parameter validation
   - Include progress echo statements
   - Handle edge cases from historical data

2. Generate **validate.sh**: Input validation script
   - Validate all parameters (type, format, existence)
   - Return 0 for valid, 1 for invalid

3. Generate **test.sh**: Test suite
   - Happy path tests (≥3)
   - Edge case tests (≥5)
   - Test coverage ≥80%
   - Use assert functions

4. Generate **SKILL.md**: Documentation
   - Purpose and description
   - Parameters with types and defaults
   - Usage examples (≥3)
   - Known edge cases
   - Team-specific notes

5. Generate **edge-cases.json**: Known edge cases from reflections
   - Extract from historical failures
   - Include: case description, input, expected output, solution

6. Generate **metadata.json**: Skill metadata
   - Version (1.0.0)
   - Teams, parameters, test coverage

## Output Format
Provide each file as a separate code block with filename header.

## Constraints
- All bash scripts must pass `shellcheck -x`
- Follow CFN skill specification
- Maximum execution time: 30 seconds
- No hardcoded secrets (use environment variables)
"""

    RETURN prompt
END FUNCTION


FUNCTION OnSkillGenerationComplete(agent_id, agent_output):
    """
    Callback when skill generator agent completes.
    """

    # STEP 1: Parse agent output
    skill_files = ParseSkillFiles(agent_output)

    # STEP 2: Validate generated files
    validation_result = ValidateGeneratedSkill(skill_files)

    IF validation_result["success"]:
        # STEP 3: Write files to staging repository
        skill_id = skill_files["metadata"]["skill_id"]
        staging_path = f".claude/skills/staging/codified-{skill_id}/"

        CreateDirectory(staging_path)

        FOR filename, content IN skill_files.items():
            WriteFile(staging_path + filename, content)
        END FOR

        # STEP 4: Create git branch for skill
        git_branch = f"skill/{skill_id}"
        ExecuteBash(f"git checkout -b {git_branch}")
        ExecuteBash(f"git add {staging_path}")
        ExecuteBash(f"git commit -m 'Generated skill: {skill_id}'")

        # STEP 5: Update pattern status
        pattern_id = skill_files["metadata"]["pattern_id"]
        UpdatePatternStatus(pattern_id, "PENDING_REVIEW", {
            "skill_id": skill_id,
            "git_branch": git_branch,
            "staging_path": staging_path
        })

        # STEP 6: Trigger approval workflow
        TriggerApprovalWorkflow(pattern_id, skill_id)

    ELSE:
        # Generation failed
        pattern_id = GetPatternIdFromAgent(agent_id)
        UpdatePatternStatus(pattern_id, "GENERATION_FAILED", {
            "error": validation_result["errors"]
        })

        # Notify Product Owner
        NotifyProductOwner(
            subject="Skill generation failed",
            message=f"Pattern {pattern_id} failed generation: {validation_result['errors']}"
        )
    END IF
END FUNCTION


FUNCTION ValidateGeneratedSkill(skill_files):
    """
    Validates generated skill files.
    """

    errors = []

    # Validate required files exist
    required_files = ["execute.sh", "validate.sh", "test.sh", "SKILL.md", "metadata.json"]

    FOR file IN required_files:
        IF file NOT IN skill_files:
            errors.append(f"Missing required file: {file}")
        END IF
    END FOR

    # Validate bash scripts with shellcheck
    FOR file IN ["execute.sh", "validate.sh", "test.sh"]:
        IF file IN skill_files:
            shellcheck_result = ExecuteBash(f"echo '{skill_files[file]}' | shellcheck -x -")

            IF shellcheck_result["exit_code"] != 0:
                errors.append(f"Shellcheck failed for {file}: {shellcheck_result['stderr']}")
            END IF
        END IF
    END FOR

    # Validate test coverage
    IF "test.sh" IN skill_files:
        test_count = CountTests(skill_files["test.sh"])

        IF test_count < 8:  # Minimum 3 happy path + 5 edge cases
            errors.append(f"Insufficient test coverage: {test_count} tests (minimum: 8)")
        END IF
    END IF

    # Validate metadata
    IF "metadata.json" IN skill_files:
        metadata = JSON.parse(skill_files["metadata.json"])

        required_keys = ["skill_id", "skill_name", "version", "parameters"]

        FOR key IN required_keys:
            IF key NOT IN metadata:
                errors.append(f"Missing metadata key: {key}")
            END IF
        END FOR
    END IF

    RETURN {
        "success": len(errors) == 0,
        "errors": errors
    }
END FUNCTION
```

---

## 3. Approval Workflow

### 3.1 Trigger Approval Workflow

```python
FUNCTION TriggerApprovalWorkflow(pattern_id, skill_id):
    """
    Initiates expert review process for generated skill.
    """

    # STEP 1: Determine team expert
    pattern = QueryPostgreSQL("SELECT * FROM workflow_patterns WHERE id = $1", pattern_id)
    teams = pattern["teams_affected"]

    # Get primary team (most occurrences)
    primary_team = GetPrimaryTeam(pattern_id, teams)
    expert = GetTeamExpert(primary_team)

    # STEP 2: Generate notification content
    notification = BuildApprovalNotification(pattern, skill_id, expert)

    # STEP 3: Send email notification
    SendEmail(
        to=expert["email"],
        subject=f"[CFN] New Skill Ready for Review: {pattern['pattern_name']}",
        body=notification["email_body"]
    )

    # STEP 4: Send Slack notification
    SendSlackMessage(
        channel=f"#{primary_team}-notifications",
        message=notification["slack_message"],
        mentions=[expert["slack_handle"]]
    )

    # STEP 5: Log approval request
    InsertApprovalRequest(pattern_id, skill_id, expert["id"])

    # STEP 6: Set SLA timer
    sla_hours = 48 IF pattern["priority"] == "high" ELSE 168  # 48h or 7 days
    SetSLATimer(pattern_id, sla_hours, OnSLAExpired)

    RETURN TRUE
END FUNCTION


FUNCTION BuildApprovalNotification(pattern, skill_id, expert):
    """
    Builds email and Slack notification content.
    """

    email_body = f"""
Hi {expert["name"]},

A new skill has been generated and is ready for your review:

**Skill Name:** {pattern["pattern_name"]}
**Team:** {pattern["teams_affected"][0]}
**Priority:** {pattern["priority"]}
**Estimated Savings:** ${pattern["estimated_savings_usd"]:.2f}/month

**Pattern Summary:**
- Occurrence Count: {pattern["occurrence_count"]}
- Teams Affected: {", ".join(pattern["teams_affected"])}
- Confidence Score: {pattern["confidence_score"]}

**Workflow Steps:**
{FormatWorkflowSteps(pattern["workflow_steps"])}

**Review Actions:**
1. Review skill code: `.claude/skills/staging/codified-{skill_id}/`
2. Run tests: `.claude/skills/staging/codified-{skill_id}/test.sh`
3. Approve/Reject/Request Correction:
   ```bash
   ./.claude/skills/workflow-codification/review-skill.sh \\
     --skill-id "{skill_id}" \\
     --action approve|reject|correct \\
     --feedback "Optional feedback"
   ```

**SLA:** Please review within {"48 hours" IF pattern["priority"] == "high" ELSE "7 days"}.

Thank you,
CFN Workflow Codification System
"""

    slack_message = f"""
🤖 **New Skill Ready for Review**

*Skill:* {pattern["pattern_name"]}
*Team:* {pattern["teams_affected"][0]}
*Priority:* {pattern["priority"]}
*Estimated Savings:* ${pattern["estimated_savings_usd"]:.2f}/month

*Workflow:*
{" → ".join(pattern["workflow_steps"][:3])}

*Actions:*
✅ Approve | ❌ Reject | 🔄 Request Correction

Review at: `.claude/skills/staging/codified-{skill_id}/`

cc: @{expert["slack_handle"]}
"""

    RETURN {
        "email_body": email_body,
        "slack_message": slack_message
    }
END FUNCTION


FUNCTION HandleExpertReview(skill_id, action, expert_id, feedback):
    """
    Processes expert review action (approve, reject, correct).
    """

    # STEP 1: Retrieve pattern and skill details
    pattern = QueryPostgreSQL("""
        SELECT * FROM workflow_patterns
        WHERE id = (SELECT pattern_id FROM skill_metadata WHERE skill_id = $1)
    """, skill_id)

    # STEP 2: Log approval action
    InsertApprovalLog(skill_id, expert_id, action, feedback)

    # STEP 3: Process action
    IF action == "approve":
        # Deploy skill to production
        DeploySkill(skill_id, pattern["id"])

        # Update pattern status
        UpdatePatternStatus(pattern["id"], "APPROVED", {"approved_by": expert_id})

        # Notify team
        NotifyTeam(
            team_id=pattern["teams_affected"][0],
            message=f"Skill '{pattern['pattern_name']}' approved and deployed!"
        )

    ELSE IF action == "reject":
        # Archive skill
        ArchiveSkill(skill_id, feedback)

        # Update pattern status
        UpdatePatternStatus(pattern["id"], "REJECTED", {
            "rejected_by": expert_id,
            "reason": feedback
        })

        # Mark pattern as unsuitable for codification
        UpdatePattern(pattern["id"], {"codification_suitable": FALSE})

    ELSE IF action == "correct":
        # Update pattern status
        UpdatePatternStatus(pattern["id"], "NEEDS_CORRECTION", {
            "feedback": feedback,
            "requested_by": expert_id
        })

        # Re-spawn skill generator with feedback
        RegenerateSkill(pattern["id"], skill_id, feedback)

    END IF

    RETURN TRUE
END FUNCTION
```

---

## 4. Skill Deployment

### 4.1 Deploy Skill to Production

```python
FUNCTION DeploySkill(skill_id, pattern_id):
    """
    Deploys approved skill from staging to production.
    """

    # STEP 1: Retrieve staging path
    staging_path = f".claude/skills/staging/codified-{skill_id}/"
    production_path = f".claude/skills/codified-{skill_id}/"

    # STEP 2: Move skill to production directory
    ExecuteBash(f"mv {staging_path} {production_path}")

    # STEP 3: Git operations
    git_branch = f"skill/{skill_id}"
    ExecuteBash(f"git checkout main")
    ExecuteBash(f"git merge {git_branch}")
    ExecuteBash(f"git branch -d {git_branch}")
    ExecuteBash(f"git push origin main")

    # STEP 4: Update metadata with deployment timestamp
    metadata = ReadJSON(f"{production_path}metadata.json")
    metadata["deployed_at"] = NOW()
    metadata["status"] = "DEPLOYED"
    WriteJSON(f"{production_path}metadata.json", metadata)

    # STEP 5: Update pattern status
    UpdatePatternStatus(pattern_id, "DEPLOYED", {
        "production_path": production_path,
        "deployed_at": NOW()
    })

    # STEP 6: Create skill execution tracker entry
    InsertSkillTracker(skill_id, pattern_id, production_path)

    # STEP 7: Notify all affected teams
    pattern = QueryPostgreSQL("SELECT * FROM workflow_patterns WHERE id = $1", pattern_id)

    FOR team IN pattern["teams_affected"]:
        NotifyTeam(
            team_id=team,
            message=f"New skill available: {pattern['pattern_name']} at {production_path}"
        )
    END FOR

    RETURN TRUE
END FUNCTION
```

---

## 5. Edge Case Tracking

### 5.1 Track Edge Case on Skill Execution Failure

```python
FUNCTION TrackEdgeCase(skill_id, task_id, team_id, execution_result):
    """
    Captures edge case when skill execution fails.
    """

    # STEP 1: Extract failure details
    exit_code = execution_result["exit_code"]
    input_params = execution_result["input_params"]
    expected_output = execution_result["expected_output"]
    actual_output = execution_result["actual_output"]
    stderr = execution_result["stderr"]

    # STEP 2: Classify severity
    severity = ClassifySeverity(exit_code, stderr)

    # STEP 3: Extract failure reason
    failure_reason = ExtractFailureReason(stderr, actual_output)

    # STEP 4: Check if edge case already exists
    existing_edge_case = QueryPostgreSQL("""
        SELECT id, occurrence_count
        FROM edge_cases
        WHERE
            skill_id = $1 AND
            failure_reason = $2 AND
            input_parameters = $3
    """, skill_id, failure_reason, JSON.stringify(input_params))

    IF existing_edge_case:
        # Increment occurrence count
        UpdatePostgreSQL("""
            UPDATE edge_cases
            SET
                occurrence_count = occurrence_count + 1,
                last_seen = NOW()
            WHERE id = $1
        """, existing_edge_case["id"])

        edge_case_id = existing_edge_case["id"]
        occurrence_count = existing_edge_case["occurrence_count"] + 1

    ELSE:
        # Insert new edge case
        edge_case_id = InsertPostgreSQL("""
            INSERT INTO edge_cases (
                skill_id,
                task_id,
                team_id,
                failure_reason,
                input_parameters,
                expected_output,
                actual_output,
                stack_trace,
                severity,
                occurrence_count,
                resolved
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, FALSE)
            RETURNING id
        """, skill_id, task_id, team_id, failure_reason,
            JSON.stringify(input_params), expected_output, actual_output,
            stderr, severity)

        occurrence_count = 1
    END IF

    # STEP 5: Check if threshold reached for skill update
    IF occurrence_count >= 3 AND NOT existing_edge_case["resolved"]:
        # Trigger skill update proposal
        ProposeSkillUpdate(skill_id, edge_case_id)
    END IF

    # STEP 6: Log edge case tracking
    LogEdgeCaseTracking(edge_case_id, skill_id, occurrence_count)

    RETURN edge_case_id
END FUNCTION


FUNCTION ClassifySeverity(exit_code, stderr):
    """
    Classifies edge case severity based on exit code and error output.
    """

    # Critical: Security issues, data corruption
    IF ContainsPattern(stderr, ["security", "unauthorized", "corruption", "data loss"]):
        RETURN "critical"
    END IF

    # High: Functional failure, blocking
    IF exit_code >= 100 OR ContainsPattern(stderr, ["fatal", "panic", "abort"]):
        RETURN "high"
    END IF

    # Medium: Partial failure, degraded functionality
    IF exit_code >= 10 OR ContainsPattern(stderr, ["error", "failed", "exception"]):
        RETURN "medium"
    END IF

    # Low: Warnings, performance issues
    RETURN "low"
END FUNCTION


FUNCTION ExtractFailureReason(stderr, actual_output):
    """
    Extracts concise failure reason from error output.
    """

    # Pattern matching for common errors
    patterns = {
        "File not found": r"No such file or directory: (.+)",
        "Permission denied": r"Permission denied: (.+)",
        "Invalid parameter": r"Invalid (argument|parameter|value): (.+)",
        "Timeout exceeded": r"Timeout|timed out|deadline exceeded",
        "Network error": r"Connection (refused|reset|timeout)|Network unreachable",
        "Validation failed": r"Validation (failed|error): (.+)"
    }

    FOR reason_template, regex IN patterns.items():
        match = RegexMatch(stderr, regex)

        IF match:
            detail = match.group(1) IF match.groups() ELSE ""
            RETURN f"{reason_template}: {detail}".strip()
        END IF
    END FOR

    # Fallback: Use first line of stderr
    first_line = stderr.split("\n")[0]
    RETURN first_line[:200]  # Truncate to 200 chars
END FUNCTION
```

---

## 6. Cost Tracking

### 6.1 Log Skill Execution and Calculate Savings

```python
FUNCTION LogSkillExecution(skill_id, team_id, task_id, execution_result):
    """
    Logs skill execution and calculates cost savings.
    """

    # STEP 1: Extract execution details
    execution_time_ms = execution_result["execution_time_ms"]
    exit_code = execution_result["exit_code"]

    # STEP 2: Calculate cost avoided
    cost_avoided = CalculateCostAvoided(skill_id)

    # STEP 3: Estimate tokens avoided
    tokens_avoided = EstimateTokensAvoided(skill_id)

    # STEP 4: Insert execution log
    InsertPostgreSQL("""
        INSERT INTO skill_executions (
            skill_id,
            team_id,
            task_id,
            execution_time_ms,
            exit_code,
            cost_avoided_usd,
            tokens_avoided,
            timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
    """, skill_id, team_id, task_id, execution_time_ms, exit_code,
        cost_avoided, tokens_avoided)

    # STEP 5: Update skill metadata (total executions, total savings)
    UpdatePostgreSQL("""
        UPDATE workflow_patterns
        SET
            total_executions = total_executions + 1,
            total_savings_usd = total_savings_usd + $1
        WHERE id = (SELECT pattern_id FROM skill_metadata WHERE skill_id = $2)
    """, cost_avoided, skill_id)

    RETURN TRUE
END FUNCTION


FUNCTION CalculateCostAvoided(skill_id):
    """
    Calculates cost avoided per skill execution.
    """

    # Constants
    AI_INPUT_TOKENS = 5000
    AI_OUTPUT_TOKENS = 2000
    TOKEN_COST_PER_MILLION = 0.50  # $0.50 per 1M tokens
    SCRIPT_COST = 0.0001           # Negligible

    # Calculate AI cost
    total_tokens = AI_INPUT_TOKENS + AI_OUTPUT_TOKENS
    ai_cost = (total_tokens / 1_000_000) * TOKEN_COST_PER_MILLION

    # Calculate savings
    cost_avoided = ai_cost - SCRIPT_COST

    RETURN cost_avoided
END FUNCTION


FUNCTION GenerateCostDashboard():
    """
    Generates cost tracking dashboard.
    """

    # Query 1: Total savings
    total_savings = QueryPostgreSQL("""
        SELECT
            COUNT(*) as total_executions,
            SUM(cost_avoided_usd) as total_savings,
            SUM(tokens_avoided) as total_tokens_avoided
        FROM skill_executions
        WHERE timestamp > NOW() - INTERVAL '30 days'
    """)

    # Query 2: Top 10 skills by ROI
    top_skills = QueryPostgreSQL("""
        SELECT
            s.pattern_name,
            COUNT(e.id) as executions,
            SUM(e.cost_avoided_usd) as total_savings,
            AVG(e.execution_time_ms) as avg_time_ms
        FROM skill_executions e
        JOIN workflow_patterns s ON e.skill_id = s.id
        WHERE e.timestamp > NOW() - INTERVAL '30 days'
        GROUP BY s.pattern_name
        ORDER BY total_savings DESC
        LIMIT 10
    """)

    # Query 3: Skills with highest edge case rate
    edge_case_skills = QueryPostgreSQL("""
        SELECT
            s.pattern_name,
            COUNT(ec.id) as edge_case_count,
            COUNT(ec.id) FILTER (WHERE ec.resolved = FALSE) as unresolved_count
        FROM edge_cases ec
        JOIN workflow_patterns s ON ec.skill_id = s.id
        GROUP BY s.pattern_name
        ORDER BY unresolved_count DESC
        LIMIT 10
    """)

    # Format dashboard
    dashboard = f"""
╔═══════════════════════════════════════════════════════════════════╗
║           WORKFLOW CODIFICATION COST DASHBOARD                    ║
╚═══════════════════════════════════════════════════════════════════╝

📊 SAVINGS (Last 30 Days)
─────────────────────────────────────────────────────────────────────
Total Executions:        {total_savings["total_executions"]}
Total Cost Saved:        ${total_savings["total_savings"]:.2f}
Total Tokens Avoided:    {total_savings["total_tokens_avoided"]:,}

🏆 TOP 10 SKILLS BY ROI
─────────────────────────────────────────────────────────────────────
{FormatTopSkills(top_skills)}

⚠️  SKILLS WITH MOST EDGE CASES
─────────────────────────────────────────────────────────────────────
{FormatEdgeCaseSkills(edge_case_skills)}

Last Updated: {NOW()}
"""

    RETURN dashboard
END FUNCTION
```

---

## 7. Skill Execution (Team Coordinator)

### 7.1 Team Coordinator Decides: AI vs Skill

```python
FUNCTION ExecuteTask(task_description, team_id, context):
    """
    Team Coordinator decides whether to execute codified skill or spawn AI agent.
    """

    # STEP 1: Check if codified skill exists for this workflow
    skill = FindMatchingSkill(task_description, team_id)

    IF skill AND skill["status"] == "DEPLOYED":
        # STEP 2: Execute codified skill
        result = ExecuteCodifiedSkill(skill["id"], task_description, context)

        # STEP 3: Log execution and cost savings
        LogSkillExecution(skill["id"], team_id, context["task_id"], result)

        IF result["exit_code"] == 0:
            # Success
            RETURN result
        ELSE:
            # Skill failed - track edge case
            TrackEdgeCase(skill["id"], context["task_id"], team_id, result)

            # Fallback to AI agent
            RETURN SpawnAIAgent(task_description, team_id, context)
        END IF

    ELSE:
        # STEP 4: No matching skill - spawn AI agent
        RETURN SpawnAIAgent(task_description, team_id, context)
    END IF
END FUNCTION


FUNCTION FindMatchingSkill(task_description, team_id):
    """
    Finds matching codified skill for task description.
    """

    # STEP 1: Extract keywords from task description
    keywords = ExtractKeywords(task_description)

    # STEP 2: Query deployed skills for team
    skills = QueryPostgreSQL("""
        SELECT
            s.id,
            s.pattern_name,
            s.workflow_steps,
            s.status,
            json_extract(s.metadata, '$.tags') as tags
        FROM workflow_patterns s
        WHERE
            s.status = 'DEPLOYED' AND
            $1 = ANY(s.teams_affected)
    """, team_id)

    # STEP 3: Calculate similarity scores
    best_match = NULL
    best_score = 0.0

    FOR skill IN skills:
        score = CalculateTaskSkillSimilarity(task_description, keywords, skill)

        IF score > best_score AND score >= 0.80:  # Threshold: 80%
            best_score = score
            best_match = skill
        END IF
    END FOR

    RETURN best_match
END FUNCTION


FUNCTION CalculateTaskSkillSimilarity(task_description, keywords, skill):
    """
    Calculates similarity between task and skill.
    """

    # Factor 1: Keyword overlap (50% weight)
    skill_tags = skill["tags"]
    keyword_overlap = len(SET(keywords).intersection(SET(skill_tags))) / len(keywords)

    # Factor 2: Workflow step matching (30% weight)
    workflow_similarity = 0.0
    FOR step IN skill["workflow_steps"]:
        IF ContainsPattern(task_description, step):
            workflow_similarity += 1.0 / len(skill["workflow_steps"])
        END IF
    END FOR

    # Factor 3: Pattern name similarity (20% weight)
    pattern_similarity = FuzzyMatch(task_description, skill["pattern_name"])

    # Weighted sum
    score = (keyword_overlap * 0.50) + (workflow_similarity * 0.30) + (pattern_similarity * 0.20)

    RETURN score
END FUNCTION


FUNCTION ExecuteCodifiedSkill(skill_id, task_description, context):
    """
    Executes codified skill script.
    """

    # STEP 1: Retrieve skill metadata
    metadata = QueryPostgreSQL("""
        SELECT production_path, parameters
        FROM workflow_patterns
        WHERE id = (SELECT pattern_id FROM skill_metadata WHERE skill_id = $1)
    """, skill_id)

    skill_path = metadata["production_path"] + "execute.sh"

    # STEP 2: Extract parameters from task description and context
    params = ExtractParameters(task_description, context, metadata["parameters"])

    # STEP 3: Validate parameters
    validation_result = ExecuteBash(f"{metadata['production_path']}validate.sh {params}")

    IF validation_result["exit_code"] != 0:
        RETURN {
            "success": FALSE,
            "exit_code": validation_result["exit_code"],
            "error": "Parameter validation failed",
            "stderr": validation_result["stderr"]
        }
    END IF

    # STEP 4: Execute skill with timeout
    start_time = NOW()
    execution_result = ExecuteBashWithTimeout(
        command=f"{skill_path} {params}",
        timeout_seconds=30
    )
    end_time = NOW()

    # STEP 5: Return result
    RETURN {
        "success": execution_result["exit_code"] == 0,
        "exit_code": execution_result["exit_code"],
        "stdout": execution_result["stdout"],
        "stderr": execution_result["stderr"],
        "execution_time_ms": (end_time - start_time).total_milliseconds(),
        "input_params": params
    }
END FUNCTION
```

---

## 8. Skill Update Proposal

### 8.1 Propose Skill Update for Recurring Edge Case

```python
FUNCTION ProposeSkillUpdate(skill_id, edge_case_id):
    """
    Generates skill update proposal when edge case occurs ≥3 times.
    """

    # STEP 1: Retrieve edge case details
    edge_case = QueryPostgreSQL("SELECT * FROM edge_cases WHERE id = $1", edge_case_id)

    # STEP 2: Retrieve current skill version
    skill = QueryPostgreSQL("""
        SELECT * FROM workflow_patterns
        WHERE id = (SELECT pattern_id FROM skill_metadata WHERE skill_id = $1)
    """, skill_id)

    current_version = skill["version"]
    production_path = skill["production_path"]

    # STEP 3: Generate update proposal (AI agent)
    proposal_prompt = f"""
# Skill Update Proposal

Generate an update for the following skill to handle a recurring edge case.

## Current Skill
- **Name:** {skill["pattern_name"]}
- **Version:** {current_version}
- **Path:** {production_path}

## Edge Case Details
- **Failure Reason:** {edge_case["failure_reason"]}
- **Occurrence Count:** {edge_case["occurrence_count"]}
- **Severity:** {edge_case["severity"]}
- **Input Parameters:** {edge_case["input_parameters"]}
- **Expected Output:** {edge_case["expected_output"]}
- **Actual Output:** {edge_case["actual_output"]}

## Current Script
{ReadFile(production_path + "execute.sh")}

## Requirements
1. Update execute.sh to handle the edge case
2. Add new test case to test.sh
3. Update SKILL.md documentation with edge case notes
4. Increment version to {IncrementVersion(current_version, "patch")}

Provide updated files and changelog.
"""

    # STEP 4: Spawn skill-update-generator agent
    agent_id = SpawnEphemeralAgent(
        agent_type="skill-update-generator",
        task_prompt=proposal_prompt,
        context={"skill_id": skill_id, "edge_case_id": edge_case_id}
    )

    # STEP 5: Monitor agent completion
    MonitorAgentCompletion(agent_id, OnSkillUpdateProposalComplete)

    # STEP 6: Update pattern status
    UpdatePatternStatus(skill["id"], "UPDATE_PROPOSED", {
        "edge_case_id": edge_case_id,
        "agent_id": agent_id
    })

    RETURN agent_id
END FUNCTION


FUNCTION OnSkillUpdateProposalComplete(agent_id, agent_output):
    """
    Callback when skill update proposal is generated.
    """

    # STEP 1: Parse updated files
    updated_files = ParseSkillFiles(agent_output)

    # STEP 2: Validate updates
    validation_result = ValidateSkillUpdate(updated_files)

    IF validation_result["success"]:
        # STEP 3: Create update branch
        skill_id = updated_files["metadata"]["skill_id"]
        edge_case_id = updated_files["metadata"]["edge_case_id"]
        new_version = updated_files["metadata"]["version"]

        update_branch = f"skill-update/{skill_id}/{new_version}"
        ExecuteBash(f"git checkout -b {update_branch}")

        # STEP 4: Write updated files to staging
        staging_path = f".claude/skills/staging/codified-{skill_id}-{new_version}/"
        CreateDirectory(staging_path)

        FOR filename, content IN updated_files.items():
            WriteFile(staging_path + filename, content)
        END FOR

        ExecuteBash(f"git add {staging_path}")
        ExecuteBash(f"git commit -m 'Skill update proposal: {skill_id} v{new_version}'")

        # STEP 5: Notify expert for review
        pattern_id = GetPatternIdFromSkill(skill_id)
        expert = GetTeamExpert(GetPrimaryTeam(pattern_id))

        NotifyExpert(
            expert=expert,
            subject=f"Skill Update Proposal: {skill_id} v{new_version}",
            message=f"""
A skill update has been proposed to handle recurring edge case.

**Edge Case:** {edge_case["failure_reason"]}
**Occurrence Count:** {edge_case["occurrence_count"]}
**Severity:** {edge_case["severity"]}

**Proposed Changes:**
{updated_files["CHANGELOG.md"]}

Review at: {staging_path}

Approve/Reject:
```bash
./.claude/skills/workflow-codification/review-skill-update.sh \\
  --skill-id "{skill_id}" \\
  --version "{new_version}" \\
  --action approve|reject \\
  --feedback "Optional feedback"
```
"""
        )

        # STEP 6: Update edge case status
        UpdateEdgeCase(edge_case_id, {"update_proposed": TRUE, "proposed_version": new_version})

    ELSE:
        # Update proposal failed
        LogError(f"Skill update proposal failed: {validation_result['errors']}")
    END IF
END FUNCTION


FUNCTION IncrementVersion(current_version, bump_type):
    """
    Increments semantic version (major.minor.patch).
    """

    parts = current_version.split(".")
    major = INT(parts[0])
    minor = INT(parts[1])
    patch = INT(parts[2])

    IF bump_type == "major":
        RETURN f"{major + 1}.0.0"
    ELSE IF bump_type == "minor":
        RETURN f"{major}.{minor + 1}.0"
    ELSE IF bump_type == "patch":
        RETURN f"{major}.{minor}.{patch + 1}"
    END IF
END FUNCTION
```

---

**End of Pseudocode Document**

**Version:** 3.0.0
**Status:** DRAFT
**Next:** Create ARCHITECTURE.md document
