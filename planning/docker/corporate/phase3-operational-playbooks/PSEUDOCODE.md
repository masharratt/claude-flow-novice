# Phase 3: Operational Playbooks - Pseudocode

**Version:** 1.0.0
**Status:** Implemented
**Date:** 2025-11-15

---

## Overview

This document describes the logical flow and decision trees for operational playbook usage. Since playbooks are human procedures (not executable code), pseudocode represents **decision logic** and **procedural workflows** rather than programmatic implementations.

---

## 1. Playbook Navigation Logic

### 1.1 Entry Point Decision Tree

```pseudocode
FUNCTION determine_playbook(situation):
    IF situation == "emergency" OR situation == "critical_failure":
        RETURN QUICK_REFERENCE
        # Print-ready one-pager for immediate action

    ELSE IF situation == "daily_operations":
        RETURN OPERATIONAL_RUNBOOK
        # Standard procedures (health checks, provisioning)

    ELSE IF situation == "something_broken":
        RETURN TROUBLESHOOTING_PLAYBOOK
        # Issue diagnosis and resolution

    ELSE IF situation == "sev1_incident" OR situation == "sev2_incident":
        RETURN INCIDENT_RESPONSE_GUIDE
        # Critical incident handling

    ELSE IF situation == "disaster" OR situation == "data_loss":
        RETURN DISASTER_RECOVERY_GUIDE
        # Catastrophic failure recovery

    ELSE IF situation == "new_operator" OR situation == "training":
        RETURN README (training_path)
        # Structured 4-week training program

    ELSE:
        RETURN README (navigation_hub)
        # General navigation and document selection
END FUNCTION
```

---

## 2. Daily Operations Workflow

### 2.1 Morning Health Check Procedure

```pseudocode
PROCEDURE morning_health_check():
    # Duration: 10 minutes
    # Frequency: Daily (weekdays, 9:00 AM)

    START_TIMER(10_minutes)

    # Step 1: Container Status (2 min)
    containers = EXEC("docker ps --format 'table {{.Names}}\t{{.Status}}' | grep cfn-")

    FOR EACH container IN containers:
        IF container.status != "Up" OR container.status.contains("unhealthy"):
            LOG_ERROR(container.name, container.status)
            ESCALATE_TO(operations_lead)
        END IF
    END FOR

    # Step 2: Coordinator Health (2 min)
    FOR EACH team IN [seo, marketing, frontend, backend, devops, qa, csuite]:
        health = EXEC("docker inspect cfn-docker-team-coordinator-{team} | grep 'Status'")

        IF health.status != "healthy":
            LOG_ERROR("Coordinator unhealthy", team)
            CONSULT(TROUBLESHOOTING_PLAYBOOK, "Coordinator health check failures")
        END IF
    END FOR

    # Step 3: Resource Usage (2 min)
    stats = EXEC("docker stats --no-stream --format 'table {{.Name}}\t{{.CPUPerc}}\t{{.MemPerc}}'")

    FOR EACH container IN stats:
        IF container.cpu_percent > 80:
            LOG_WARNING("High CPU usage", container.name, container.cpu_percent)
        END IF

        IF container.mem_percent > 85:
            LOG_WARNING("High memory usage", container.name, container.mem_percent)
            CONSULT(TROUBLESHOOTING_PLAYBOOK, "Resource exhaustion")
        END IF
    END FOR

    # Step 4: Overnight Logs (2 min)
    errors = EXEC("docker logs cfn-docker-main-coordinator --since 12h | grep -i error")

    IF errors.count > 0:
        FOR EACH error IN errors:
            LOG_ERROR("Coordinator error", error.message)
            CONSULT(TROUBLESHOOTING_PLAYBOOK, error.pattern)
        END FOR
    END IF

    # Step 5: Service Connectivity (2 min)
    redis_ok = EXEC("docker exec cfn-redis redis-cli PING") == "PONG"
    postgres_ok = EXEC("docker exec cfn-postgres pg_isready").exit_code == 0

    IF NOT redis_ok:
        LOG_CRITICAL("Redis offline")
        ESCALATE_TO(infrastructure_team, PRIORITY=HIGH)
    END IF

    IF NOT postgres_ok:
        LOG_CRITICAL("PostgreSQL offline")
        ESCALATE_TO(database_admin, PRIORITY=HIGH)
    END IF

    # Generate Report
    GENERATE_HEALTH_REPORT(
        containers=containers,
        health=health_results,
        resources=stats,
        errors=errors,
        services={redis: redis_ok, postgres: postgres_ok}
    )

    STOP_TIMER()
    RETURN "health_check_complete"
END PROCEDURE
```

### 2.2 Team Provisioning Workflow

```pseudocode
PROCEDURE provision_new_team(team_id):
    # Duration: 20-30 minutes
    # Prerequisites: Team config file exists

    config_file = "docker/config/teams/{team_id}.yaml"

    # Step 1: Validate Configuration (2 min)
    validation = EXEC("./docker/scripts/validate-team-config.sh {config_file}")

    IF validation.exit_code != 0:
        DISPLAY_ERROR("Configuration validation failed")
        DISPLAY_ERRORS(validation.output)
        ABORT_PROVISIONING()
        RETURN "validation_failed"
    END IF

    # Step 2: Dry-Run (2 min)
    dry_run = EXEC("./docker/scripts/provision-team.sh --config {config_file} --dry-run")

    DISPLAY_OUTPUT(dry_run.output)
    user_confirmation = PROMPT("Proceed with provisioning? (yes/no)")

    IF user_confirmation != "yes":
        RETURN "provisioning_cancelled"
    END IF

    # Step 3: Create Network (2 min)
    network_result = CREATE_DOCKER_NETWORK(team_id, config.network.subnet_id)

    IF NOT network_result.success:
        LOG_ERROR("Network creation failed", team_id)
        CONSULT(TROUBLESHOOTING_PLAYBOOK, "Network issues")
        RETURN "network_creation_failed"
    END IF

    # Step 4: Create Workspace (3 min)
    workspace_path = config.team.workspace.path
    EXEC("sudo mkdir -p {workspace_path}/code")
    EXEC("sudo mkdir -p {workspace_path}/skills")
    EXEC("sudo chown -R 1000:1000 {workspace_path}")

    # Step 5: Copy Skills (5 min)
    FOR EACH skill IN config.team.allowed_skills:
        source = "/skills/{skill}"
        dest = "{workspace_path}/skills/{skill}"

        EXEC("sudo cp -r {source} {dest}")
        EXEC("sudo chown -R 1000:1000 {dest}")
    END FOR

    # Step 6: Deploy Redis (2 min)
    redis_result = DEPLOY_TEAM_REDIS(team_id, config.network)

    IF NOT redis_result.success:
        LOG_ERROR("Redis deployment failed", team_id)
        ROLLBACK_PROVISIONING(team_id)
        RETURN "redis_deployment_failed"
    END IF

    # Step 7: Deploy Coordinator (4 min)
    coordinator_result = DEPLOY_TEAM_COORDINATOR(
        team_id=team_id,
        config=config,
        redis_host="cfn-redis-{team_id}"
    )

    IF NOT coordinator_result.success:
        LOG_ERROR("Coordinator deployment failed", team_id)
        ROLLBACK_PROVISIONING(team_id)
        RETURN "coordinator_deployment_failed"
    END IF

    # Step 8: Verification (3 min)
    WAIT(15_seconds)  # Allow coordinator startup

    health_check = VERIFY_TEAM_HEALTH(team_id)

    IF NOT health_check.all_passing:
        LOG_WARNING("Health check failed", health_check.failures)
        CONSULT(TROUBLESHOOTING_PLAYBOOK, "Coordinator won't start")
        RETURN "health_check_failed"
    END IF

    # Step 9: Documentation (2 min)
    UPDATE_TEAM_REGISTRY(team_id, config)

    DISPLAY_SUCCESS_MESSAGE(
        "Team provisioned successfully",
        team_id=team_id,
        workspace=workspace_path,
        network="team-{team_id}",
        coordinator="cfn-docker-team-coordinator-{team_id}"
    )

    RETURN "provisioning_complete"
END PROCEDURE
```

---

## 3. Troubleshooting Decision Logic

### 3.1 Issue Classification Algorithm

```pseudocode
FUNCTION classify_issue(symptoms):
    # Determine which troubleshooting scenario applies

    # Critical Coordinator Issues
    IF "coordinator won't start" IN symptoms:
        RETURN SCENARIO("Coordinator Issues", "Issue 1: Main coordinator won't start")

    ELSE IF "no heartbeat" IN symptoms AND "coordinator" IN symptoms:
        RETURN SCENARIO("Coordinator Issues", "Issue 3: Coordinator heartbeat missing")

    # Network Issues
    ELSE IF "connection refused" IN symptoms OR "timeout" IN symptoms:
        RETURN SCENARIO("Network Issues", "Issue 6: Container can't reach Redis/PostgreSQL")

    ELSE IF "team can access other team" IN symptoms:
        RETURN SCENARIO("Network Issues", "Issue 7: Team network isolation broken")

    # Resource Exhaustion
    ELSE IF "memory" IN symptoms AND "exhausted" IN symptoms:
        RETURN SCENARIO("Resource Exhaustion", "Issue 8: Team exceeds memory budget")

    ELSE IF "cpu" IN symptoms AND ("throttling" IN symptoms OR "slow" IN symptoms):
        RETURN SCENARIO("Resource Exhaustion", "Issue 9: CPU throttling")

    # Agent Issues
    ELSE IF "agent won't spawn" IN symptoms:
        RETURN SCENARIO("Agent Issues", "Issue 10: Agent won't spawn")

    ELSE IF "agent heartbeat" IN symptoms:
        RETURN SCENARIO("Agent Issues", "Issue 11: Agent heartbeat timeout")

    # Skill Access Issues
    ELSE IF "write operations not allowed" IN symptoms:
        RETURN SCENARIO("Skill Access Issues", "Issue 12: Read-only skill blocks legitimate query")

    ELSE IF "permission denied" IN symptoms AND "database" IN symptoms:
        RETURN SCENARIO("Skill Access Issues", "Issue 13: Read-write skill access denied")

    # Database Issues
    ELSE IF "postgres" IN symptoms AND "connection" IN symptoms:
        RETURN SCENARIO("Database Issues", "Issue 14: PostgreSQL connection refused")

    # Health Check Failures
    ELSE IF "unhealthy" IN symptoms:
        RETURN SCENARIO("Health Check Failures", "Issue 15: Container health check failing")

    # Unknown - Use Quick Reference
    ELSE:
        RETURN QUICK_REFERENCE_TABLE()
    END IF
END FUNCTION
```

### 3.2 Troubleshooting Execution Flow

```pseudocode
PROCEDURE troubleshoot_issue(issue_description):
    # Step 1: Classify Issue
    scenario = classify_issue(issue_description)

    # Step 2: Display Symptoms (User Confirmation)
    DISPLAY_SYMPTOMS(scenario.symptoms)
    user_match = PROMPT("Do these symptoms match? (yes/no)")

    IF user_match != "yes":
        # Try alternative classification
        scenario = PROMPT_USER_SELECT_SCENARIO()
    END IF

    # Step 3: Run Diagnostic Commands
    DISPLAY_SECTION("Running diagnostics...")

    FOR EACH diagnostic IN scenario.diagnostic_commands:
        result = EXEC(diagnostic.command)
        DISPLAY_OUTPUT(diagnostic.description, result)

        # Check if diagnostic reveals root cause
        IF diagnostic.matches_pattern(result):
            DISPLAY_SECTION("Root cause identified: {diagnostic.cause}")
            BREAK
        END IF
    END FOR

    # Step 4: Apply Resolution
    DISPLAY_SECTION("Applying resolution...")

    FOR EACH resolution_step IN scenario.resolution_steps:
        DISPLAY_STEP(resolution_step.number, resolution_step.description)

        IF resolution_step.requires_command:
            user_proceed = PROMPT("Execute: {resolution_step.command}? (yes/no)")

            IF user_proceed == "yes":
                result = EXEC(resolution_step.command)
                DISPLAY_OUTPUT(result)

                IF result.exit_code != 0:
                    LOG_ERROR("Command failed", resolution_step.command, result.stderr)
                    DISPLAY_SECTION("Resolution failed, escalating...")
                    ESCALATE_TO(scenario.escalation_team)
                    RETURN "escalated"
                END IF
            ELSE:
                DISPLAY_WARNING("Step skipped by user")
            END IF
        END IF
    END FOR

    # Step 5: Verification
    DISPLAY_SECTION("Verifying resolution...")
    WAIT(30_seconds)  # Allow changes to take effect

    verification = EXEC(scenario.verification_command)

    IF verification.indicates_resolved:
        DISPLAY_SUCCESS("Issue resolved successfully")
        RETURN "resolved"
    ELSE:
        DISPLAY_WARNING("Issue persists after resolution attempt")

        IF scenario.time_limit_exceeded:
            ESCALATE_TO(scenario.escalation_team)
            RETURN "escalated"
        ELSE:
            retry = PROMPT("Try again? (yes/no)")
            IF retry == "yes":
                RETURN troubleshoot_issue(issue_description)  # Recursive retry
            ELSE:
                RETURN "unresolved"
            END IF
        END IF
    END IF
END PROCEDURE
```

---

## 4. Incident Response State Machine

### 4.1 Incident Lifecycle

```pseudocode
ENUM IncidentState:
    DETECTED
    ASSESSED
    COMMUNICATED
    INVESTIGATING
    MITIGATING
    MONITORING
    RESOLVED
END ENUM

ENUM IncidentSeverity:
    SEV1  # Critical (immediate response)
    SEV2  # Major (30 min response)
    SEV3  # Minor (4 hour response)
END ENUM

PROCEDURE handle_incident(incident_description):
    incident = {
        id: GENERATE_UUID(),
        description: incident_description,
        state: IncidentState.DETECTED,
        severity: NULL,
        start_time: NOW(),
        stakeholders: [],
        timeline: []
    }

    # State 1: Detect and Assess (0-5 min)
    TRANSITION_STATE(incident, IncidentState.ASSESSED)

    # Run quick health check
    health_result = EXEC("docker ps --format 'table {{.Names}}\t{{.Status}}' | grep cfn-")
    stats_result = EXEC("docker stats --no-stream | grep cfn-")

    # Classify severity
    IF "main coordinator" IN incident.description AND "down" IN incident.description:
        incident.severity = IncidentSeverity.SEV1
    ELSE IF count(failing_coordinators) >= 2:
        incident.severity = IncidentSeverity.SEV1
    ELSE IF "postgres" IN incident.description AND "offline" IN incident.description:
        incident.severity = IncidentSeverity.SEV1
    ELSE IF count(failing_coordinators) == 1:
        incident.severity = IncidentSeverity.SEV2
    ELSE IF "agent" IN incident.description:
        incident.severity = IncidentSeverity.SEV3
    ELSE:
        incident.severity = IncidentSeverity.SEV3
    END IF

    LOG_EVENT(incident, "Severity classified as {incident.severity}")

    # State 2: Communicate (5-10 min)
    TRANSITION_STATE(incident, IncidentState.COMMUNICATED)

    CASE incident.severity:
        WHEN SEV1:
            PAGE_ONCALL_IMMEDIATELY()
            NOTIFY_MANAGEMENT(within=15_minutes)
            CREATE_INCIDENT_CHANNEL(incident.id)
            UPDATE_STATUS_PAGE(interval=15_minutes)

        WHEN SEV2:
            CALL_ONCALL(within=30_minutes)
            NOTIFY_AFFECTED_TEAMS()
            CREATE_INCIDENT_CHANNEL(incident.id)
            UPDATE_STATUS_PAGE(interval=30_minutes)

        WHEN SEV3:
            CREATE_INCIDENT_TICKET()
            NOTIFY_AFFECTED_TEAM()
            # No status page update
    END CASE

    # State 3: Investigate (parallel with mitigation)
    TRANSITION_STATE(incident, IncidentState.INVESTIGATING)

    diagnostics = COLLECT_DIAGNOSTICS(incident)
    recent_changes = REVIEW_RECENT_CHANGES(time_window=24_hours)
    error_logs = CHECK_ERROR_LOGS(since=incident.start_time)

    LOG_EVENT(incident, "Diagnostics collected", diagnostics)

    # State 4: Mitigate (immediate action)
    TRANSITION_STATE(incident, IncidentState.MITIGATING)

    # Route to appropriate procedure based on incident type
    mitigation_result = APPLY_MITIGATION(incident, diagnostics)

    IF mitigation_result.success:
        LOG_EVENT(incident, "Mitigation successful", mitigation_result)
    ELSE:
        LOG_EVENT(incident, "Mitigation failed", mitigation_result.error)
        ESCALATE_TO_NEXT_LEVEL(incident)
    END IF

    UPDATE_STAKEHOLDERS(incident, "Mitigation applied, monitoring for stability")

    # State 5: Monitor (30-60 min post-mitigation)
    TRANSITION_STATE(incident, IncidentState.MONITORING)

    monitor_duration = CASE incident.severity:
        WHEN SEV1: 60_minutes
        WHEN SEV2: 45_minutes
        WHEN SEV3: 30_minutes
    END CASE

    FOR EACH check_interval IN RANGE(0, monitor_duration, 10_minutes):
        WAIT(10_minutes)

        health_status = CHECK_SYSTEM_HEALTH()

        IF NOT health_status.all_passing:
            LOG_WARNING("Issue recurring during monitoring", health_status.failures)
            # Return to mitigation state
            TRANSITION_STATE(incident, IncidentState.MITIGATING)
            APPLY_ADDITIONAL_MITIGATION(incident, health_status.failures)
        END IF
    END FOR

    # State 6: Resolve
    TRANSITION_STATE(incident, IncidentState.RESOLVED)

    final_health = CHECK_SYSTEM_HEALTH()

    IF final_health.all_passing:
        incident.end_time = NOW()
        incident.duration = incident.end_time - incident.start_time

        SEND_RESOLUTION_MESSAGE(incident)
        UPDATE_STATUS_PAGE("Resolved")
        ARCHIVE_INCIDENT_CHANNEL(incident.id, after=7_days)

        # Schedule post-incident review if required
        IF incident.severity IN [SEV1, SEV2]:
            SCHEDULE_POST_INCIDENT_REVIEW(incident, within=48_hours)
        END IF

        RETURN "resolved"
    ELSE:
        LOG_ERROR("Failed to resolve incident", final_health.failures)
        ESCALATE_TO_MANAGEMENT()
        RETURN "escalated"
    END IF
END PROCEDURE
```

---

## 5. Disaster Recovery Algorithm

### 5.1 Recovery Scenario Selection

```pseudocode
FUNCTION select_recovery_scenario(disaster_type):
    CASE disaster_type:
        WHEN "complete_host_failure":
            RETURN {
                scenario: "Complete Host Failure",
                rto: 2_hours,
                rpo: 24_hours,
                procedure: PROCEDURE_COMPLETE_HOST_REBUILD
            }

        WHEN "postgres_corruption":
            RETURN {
                scenario: "PostgreSQL Data Corruption",
                rto: 30_minutes,
                rpo: 24_hours,
                procedure: PROCEDURE_POSTGRES_RESTORE
            }

        WHEN "workspace_data_loss":
            RETURN {
                scenario: "Team Workspace Data Loss",
                rto: 15_minutes,
                rpo: 24_hours,
                procedure: PROCEDURE_WORKSPACE_RESTORE
            }

        DEFAULT:
            RETURN {
                scenario: "Unknown Disaster",
                procedure: CONSULT_DISASTER_RECOVERY_GUIDE
            }
    END CASE
END FUNCTION
```

### 5.2 Complete Host Rebuild Procedure

```pseudocode
PROCEDURE rebuild_from_complete_failure():
    # RTO: 2 hours | RPO: 24 hours

    START_TIMER(120_minutes)  # RTO target

    # Phase 1: Provision New Host (20 min)
    DISPLAY_SECTION("Phase 1: Provisioning new host...")

    new_host = PROVISION_VM(
        ram=128_GB,
        cpu=64_cores,
        disk=1_TB,
        os="Ubuntu 22.04 LTS"
    )

    INSTALL_DEPENDENCIES(new_host, [
        "docker",
        "yq",
        "postgresql-client",
        "redis-tools"
    ])

    # Phase 2: Restore Infrastructure Code (10 min)
    DISPLAY_SECTION("Phase 2: Restoring infrastructure code...")

    EXEC_ON(new_host, "git clone https://github.com/company/claude-flow-novice.git")
    EXEC_ON(new_host, "cd claude-flow-novice")

    # Phase 3: Create Networks (5 min)
    DISPLAY_SECTION("Phase 3: Creating Docker networks...")

    EXEC_ON(new_host, "./docker/scripts/create-networks.sh")

    # Phase 4: Deploy Shared Infrastructure (15 min)
    DISPLAY_SECTION("Phase 4: Deploying shared infrastructure...")

    # PostgreSQL
    EXEC_ON(new_host, """
        docker run -d \
          --name cfn-postgres \
          --network cfn-coordination \
          --ip 172.18.0.5 \
          -e POSTGRES_PASSWORD={secret} \
          -v cfn-postgres-data:/var/lib/postgresql/data \
          postgres:15-alpine
    """)

    # Redis
    EXEC_ON(new_host, """
        docker run -d \
          --name cfn-redis \
          --network cfn-coordination \
          --ip 172.18.0.10 \
          redis:7-alpine
    """)

    # Phase 5: Restore PostgreSQL Data (30 min)
    DISPLAY_SECTION("Phase 5: Restoring PostgreSQL database...")

    latest_backup = GET_LATEST_BACKUP("s3://cfn-backups/postgresql/")
    DOWNLOAD_BACKUP(latest_backup, "/tmp/postgres-backup.sql.gz")

    EXEC_ON(new_host, """
        gunzip -c /tmp/postgres-backup.sql.gz | \
          docker exec -i cfn-postgres psql -U postgres
    """)

    # Phase 6: Build and Deploy Coordinators (20 min)
    DISPLAY_SECTION("Phase 6: Building and deploying coordinators...")

    EXEC_ON(new_host, """
        docker build -f docker/Dockerfile.main-coordinator \
          -t cfn-docker-main-coordinator:latest .
    """)

    EXEC_ON(new_host, """
        docker build -f docker/Dockerfile.team-coordinator \
          -t cfn-docker-team-coordinator:latest .
    """)

    DEPLOY_MAIN_COORDINATOR(new_host)

    # Phase 7: Restore Team Workspaces (30 min)
    DISPLAY_SECTION("Phase 7: Restoring team workspaces...")

    FOR EACH team IN [seo, marketing, frontend, backend, devops, qa, csuite]:
        latest_workspace = GET_LATEST_BACKUP("s3://cfn-backups/workspaces/{team}/")
        DOWNLOAD_BACKUP(latest_workspace, "/tmp/workspace-{team}.tar.gz")

        EXEC_ON(new_host, "sudo mkdir -p /workspace/{team}")
        EXEC_ON(new_host, "sudo tar -xzf /tmp/workspace-{team}.tar.gz -C /workspace/")
        EXEC_ON(new_host, "sudo chown -R 1000:1000 /workspace/{team}")
    END FOR

    # Phase 8: Provision All Teams (40 min)
    DISPLAY_SECTION("Phase 8: Provisioning all teams...")

    FOR EACH team IN [seo, marketing, frontend, backend, devops, qa, csuite]:
        EXEC_ON(new_host, """
            ./docker/scripts/provision-team.sh \
              --config docker/config/teams/{team}.yaml \
              --spawn-coordinator
        """)

        WAIT(10_seconds)  # Stagger coordinator starts
    END FOR

    # Phase 9: Verification (10 min)
    DISPLAY_SECTION("Phase 9: Verifying recovery...")

    health_check = RUN_COMPREHENSIVE_HEALTH_CHECK(new_host)

    IF health_check.all_passing:
        elapsed = STOP_TIMER()

        DISPLAY_SUCCESS(
            "Complete host recovery successful",
            elapsed_time=elapsed,
            rto_target=120_minutes,
            rto_met=(elapsed < 120_minutes)
        )

        RETURN "recovery_complete"
    ELSE:
        DISPLAY_ERROR("Health check failed", health_check.failures)
        ESCALATE_TO(infrastructure_lead)
        RETURN "recovery_failed"
    END IF
END PROCEDURE
```

---

## 6. Training Path State Machine

### 6.1 Operator Competency Progression

```pseudocode
ENUM CompetencyLevel:
    NOVICE           # Week 0 (before training)
    BASIC            # Week 1 (daily health checks)
    ADVANCED         # Week 2-3 (provisioning, troubleshooting)
    INCIDENT_READY   # Week 4+ (on-call ready)
    EXPERT           # 6+ months (can train others)
END ENUM

PROCEDURE train_operator(operator_id):
    operator = {
        id: operator_id,
        level: CompetencyLevel.NOVICE,
        week: 0,
        completed_exercises: [],
        assessments: []
    }

    # Week 1: Basic Operations
    DISPLAY_SECTION("Week 1: Basic Operations Training")

    # Reading assignments
    ASSIGN_READING(operator, QUICK_REFERENCE, duration=2_minutes)
    ASSIGN_READING(operator, OPERATIONAL_RUNBOOK.daily_operations, duration=30_minutes)
    ASSIGN_READING(operator, TROUBLESHOOTING_PLAYBOOK.quick_reference, duration=10_minutes)

    # Hands-on exercises
    SHADOWED_EXERCISE(operator, "Daily Health Check", supervisor=senior_operator)
    SHADOWED_EXERCISE(operator, "Review Logs for Errors", supervisor=senior_operator)
    SHADOWED_EXERCISE(operator, "Run Quick Diagnostic Script", supervisor=senior_operator)

    # Assessment
    assessment_1 = ASSESS_COMPETENCY(operator, [
        "Can perform health check independently",
        "Can identify unhealthy containers",
        "Can check resource usage",
        "Can review logs for errors"
    ])

    IF assessment_1.all_passing:
        operator.level = CompetencyLevel.BASIC
        operator.week = 1
    ELSE:
        DISPLAY_WARNING("Week 1 assessment failed, repeating training")
        RETURN train_operator(operator_id)  # Repeat Week 1
    END IF

    # Week 2-3: Advanced Operations
    DISPLAY_SECTION("Week 2-3: Advanced Operations Training")

    # Reading assignments
    ASSIGN_READING(operator, OPERATIONAL_RUNBOOK.full, duration=1_hour)
    ASSIGN_READING(operator, TROUBLESHOOTING_PLAYBOOK.full, duration=1_hour)
    ASSIGN_READING(operator, INCIDENT_RESPONSE_GUIDE.sev3_only, duration=30_minutes)

    # Hands-on exercises
    EXERCISE(operator, "Provision Test Team (Staging)", supervisor=senior_operator)
    EXERCISE(operator, "Adjust Resource Limits (Staging)", supervisor=senior_operator)
    EXERCISE(operator, "Resolve Simulated SEV-3 Incident", supervisor=senior_operator)
    EXERCISE(operator, "Restart Coordinators During Maintenance", supervisor=senior_operator)

    # Assessment
    assessment_2 = ASSESS_COMPETENCY(operator, [
        "Can provision new team independently",
        "Can troubleshoot common issues",
        "Can handle SEV-3 incidents",
        "Can perform maintenance tasks"
    ])

    IF assessment_2.all_passing:
        operator.level = CompetencyLevel.ADVANCED
        operator.week = 3
    ELSE:
        DISPLAY_WARNING("Week 2-3 assessment failed, additional training needed")
        # Additional 1:1 training sessions
    END IF

    # Week 4+: Incident Response
    DISPLAY_SECTION("Week 4+: Incident Response Training")

    # Reading assignments
    ASSIGN_READING(operator, INCIDENT_RESPONSE_GUIDE.full, duration=1_hour)
    ASSIGN_READING(operator, DISASTER_RECOVERY_GUIDE.full, duration=45_minutes)

    # Hands-on exercises
    PARTICIPATE_IN(operator, "Incident Response Drill (SEV-2)", role=secondary_responder)
    EXERCISE(operator, "Backup Restore Test (Staging)", supervisor=senior_operator)
    SHADOW(operator, on_call_engineer, duration=1_week)
    LEAD(operator, "Post-Incident Review Session", supervisor=team_lead)

    # Final assessment
    assessment_3 = ASSESS_COMPETENCY(operator, [
        "Can handle SEV-1/SEV-2 incidents",
        "Can execute disaster recovery procedures",
        "Can lead post-incident reviews",
        "Can make escalation decisions"
    ])

    IF assessment_3.all_passing:
        operator.level = CompetencyLevel.INCIDENT_READY
        operator.week = 4

        # Add to on-call rotation
        ADD_TO_ONCALL_ROTATION(operator)

        DISPLAY_SUCCESS("Operator training complete", operator)
        RETURN "training_complete"
    ELSE:
        DISPLAY_WARNING("Final assessment failed, extended training required")
        ASSIGN_MENTOR(operator, mentor=senior_oncall_engineer)
        RETURN "training_extended"
    END IF
END PROCEDURE
```

---

## 7. Automated Script Integration

### 7.1 Playbook-to-Script Invocation

```pseudocode
# Playbooks provide human context around automated scripts

PROCEDURE execute_scripted_procedure(procedure_name, parameters):
    # Phase 0B automation scripts referenced by playbooks

    CASE procedure_name:
        WHEN "provision_team":
            # Human reads: OPERATIONAL_RUNBOOK.team_provisioning
            # Human executes:
            EXEC("./docker/scripts/provision-team.sh --config {parameters.config_file} --dry-run")
            # Human reviews output, confirms
            EXEC("./docker/scripts/provision-team.sh --config {parameters.config_file} --create-workspace --create-network --spawn-redis --spawn-coordinator")

        WHEN "deprovision_team":
            # Human reads: OPERATIONAL_RUNBOOK.team_deprovisioning
            # Human executes:
            EXEC("./docker/scripts/deprovision-team.sh --config {parameters.config_file} --dry-run")
            # Human reviews output, confirms safety
            EXEC("./docker/scripts/deprovision-team.sh --config {parameters.config_file} --archive-workspace")

        WHEN "validate_config":
            # Human reads: OPERATIONAL_RUNBOOK.team_provisioning
            # Human executes:
            EXEC("./docker/scripts/validate-team-config.sh {parameters.config_file}")

        WHEN "create_networks":
            # Human reads: OPERATIONAL_RUNBOOK.team_provisioning
            # Human executes:
            EXEC("./docker/scripts/create-networks.sh --dry-run")
            # Human confirms
            EXEC("./docker/scripts/create-networks.sh")

        WHEN "daily_backup":
            # Automated via cron (no human intervention)
            # Human monitors: /var/log/cfn/backup.log
            EXEC("/usr/local/bin/cfn-daily-backup.sh")

        WHEN "log_rotation":
            # Automated via cron (no human intervention)
            # Human monitors: /var/log/cfn/log-rotation.log
            EXEC("/usr/local/bin/cfn-log-rotation.sh")

        DEFAULT:
            DISPLAY_ERROR("Unknown procedure: {procedure_name}")
            CONSULT(playbook_index)
    END CASE
END PROCEDURE
```

---

**End of Phase 3 Pseudocode v1.0.0**

**Status:** ✅ Documented (2025-11-15)
**Next:** ARCHITECTURE.md (system structure and relationships)
