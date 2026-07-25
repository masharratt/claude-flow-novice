# CFN Docker Infrastructure - State Machines & Design Patterns

**Version:** 1.0.0
**Status:** Design Phase
**Author:** Pseudocode Specialist
**Date:** 2025-11-14
**Companion Document:** CFN_DOCKER_INFRASTRUCTURE_ALGORITHMS.md

## Executive Summary

This document defines state machines, design patterns, and advanced workflow orchestration for the CFN Docker infrastructure. Use this alongside the main algorithm document for complete implementation guidance.

## Table of Contents

1. [Agent Lifecycle State Machine](#1-agent-lifecycle-state-machine)
2. [Image Build State Machine](#2-image-build-state-machine)
3. [Test Pipeline State Machine](#3-test-pipeline-state-machine)
4. [Protocol Version Negotiation State Machine](#4-protocol-version-negotiation-state-machine)
5. [Design Patterns](#5-design-patterns)
6. [Error Recovery Strategies](#6-error-recovery-strategies)
7. [Monitoring & Observability](#7-monitoring--observability)

---

## 1. Agent Lifecycle State Machine

### States

```
STATES:
    PENDING      - Agent spawn requested, not yet started
    SPAWNING     - Container being created
    STARTING     - Container created, waiting for readiness
    READY        - Health checks passed, ready for work
    WORKING      - Executing task
    COMPLETING   - Task done, reporting results
    COMPLETED    - Results reported, container exiting
    FAILED       - Error occurred during lifecycle
    TERMINATED   - Container removed

INITIAL_STATE: PENDING
FINAL_STATES: [COMPLETED, FAILED, TERMINATED]
```

### State Transitions

```
STATE_MACHINE: AgentLifecycle

TRANSITIONS:
    PENDING → SPAWNING
        Event: spawn_requested
        Action: CreateContainerConfig()
        Guard: ImageExists(selectedRuntime)

    SPAWNING → STARTING
        Event: container_created
        Action: StartContainer()
        Guard: ContainerExists(containerId)

    SPAWNING → FAILED
        Event: container_creation_failed
        Action: LogError(), Cleanup()
        Guard: Always

    STARTING → READY
        Event: health_check_passed
        Action: RegisterLifecycle(), SignalReady()
        Guard: HealthCheckPassed() AND LifecycleRegistered()

    STARTING → FAILED
        Event: readiness_timeout
        Action: CollectLogs(), RemoveContainer()
        Guard: ReadinessChecks >= MaxChecks

    READY → WORKING
        Event: task_started
        Action: UpdateStatus("working")
        Guard: TaskAssigned()

    WORKING → COMPLETING
        Event: task_completed
        Action: ReportConfidence(), SignalDone()
        Guard: WorkComplete()

    WORKING → FAILED
        Event: task_error
        Action: LogError(), ReportFailure()
        Guard: ExceptionOccurred() OR Timeout()

    COMPLETING → COMPLETED
        Event: results_reported
        Action: UpdateLifecycle("completed")
        Guard: ConfidenceReported() AND ResultsStored()

    COMPLETED → TERMINATED
        Event: cleanup_requested
        Action: RemoveContainer()
        Guard: AutoRemove == TRUE OR CleanupSignal

    FAILED → TERMINATED
        Event: cleanup_requested
        Action: RemoveContainer(force: TRUE)
        Guard: Always
```

### State Machine Implementation

```
ALGORITHM: AgentLifecycleStateMachine
INPUT:
    agentId (string)
    initialState (State)

OUTPUT:
    finalState (State)

GLOBAL:
    currentState: State
    stateHistory: List<StateTransition>
    eventQueue: Queue<Event>

BEGIN
    currentState ← initialState
    stateHistory ← EMPTY_LIST

    WHILE NOT IsFinalState(currentState) DO
        // Wait for next event
        event ← eventQueue.Dequeue(timeout: 300)  // 5 min timeout

        IF event IS NULL THEN
            // Timeout: check if should transition to FAILED
            IF ShouldTimeoutTransition(currentState) THEN
                event ← NEW Event("timeout")
            ELSE
                CONTINUE
            END IF
        END IF

        // Find valid transition
        transition ← FindTransition(currentState, event)

        IF transition IS NULL THEN
            LogWarning("No transition for " + currentState + " on event " + event.type)
            CONTINUE
        END IF

        // Evaluate guard condition
        IF NOT transition.guard.Evaluate() THEN
            LogInfo("Guard failed for transition " + currentState + " → " + transition.nextState)
            CONTINUE
        END IF

        // Execute transition action
        TRY
            transition.action.Execute()

            // Record state transition
            stateHistory.ADD(NEW StateTransition {
                fromState: currentState,
                toState: transition.nextState,
                event: event,
                timestamp: CurrentTime()
            })

            LogInfo("State transition: " + currentState + " → " + transition.nextState)
            currentState ← transition.nextState

        CATCH exception AS e
            LogError("Transition action failed: " + e.message)

            // Transition to FAILED state
            currentState ← FAILED
            stateHistory.ADD(NEW StateTransition {
                fromState: currentState,
                toState: FAILED,
                event: NEW Event("exception"),
                timestamp: CurrentTime()
            })
        END TRY
    END WHILE

    RETURN currentState
END


FUNCTION: ShouldTimeoutTransition
INPUT: state (State)
OUTPUT: shouldTransition (boolean)

BEGIN
    SWITCH state DO
        CASE SPAWNING:
            RETURN TimeSinceStateEntry() > 60  // 60s spawn timeout

        CASE STARTING:
            RETURN TimeSinceStateEntry() > 30  // 30s readiness timeout

        CASE WORKING:
            RETURN TimeSinceStateEntry() > 3600  // 1h task timeout

        DEFAULT:
            RETURN FALSE
    END SWITCH
END
```

### State Persistence

```
ALGORITHM: PersistAgentState
INPUT:
    agentId (string)
    state (State)
    metadata (Map)

OUTPUT:
    void

BEGIN
    db ← OpenDatabase("cfn-loop.db")

    stateJson ← ToJSON(Map {
        "state": state.name,
        "metadata": metadata,
        "updated_at": CurrentISO8601Timestamp()
    })

    ExecuteSQL(db, "
        UPDATE agents
        SET status = ?, metadata = ?, updated_at = datetime('now')
        WHERE id = ?
    ", [state.name, stateJson, agentId])

    CloseDatabase(db)

    // Also update coordination layer
    coordination-signal("swarm:agent:" + agentId + ":state", state.name)
END


ALGORITHM: RecoverAgentState
INPUT: agentId (string)
OUTPUT: state (State) OR NULL

BEGIN
    db ← OpenDatabase("cfn-loop.db")

    result ← QuerySQL(db, "
        SELECT status, metadata
        FROM agents
        WHERE id = ?
    ", [agentId])

    CloseDatabase(db)

    IF result.isEmpty() THEN
        RETURN NULL
    END IF

    stateName ← result[0]["status"]
    metadata ← ParseJSON(result[0]["metadata"])

    RETURN NEW State(stateName, metadata)
END
```

---

## 2. Image Build State Machine

### States

```
STATES:
    QUEUED           - Build target identified, waiting for slot
    PREPARING        - Build context being prepared
    BUILDING         - Docker build in progress
    BUILT            - Build completed successfully
    TAGGING          - Applying version tags
    VALIDATING       - Running contract validation
    VALIDATED        - Validation passed
    PUSHING          - Pushing to registry
    DEPLOYED         - Image deployed to registry
    FAILED           - Build/validation/push failed
    ROLLED_BACK      - Previous version restored

INITIAL_STATE: QUEUED
SUCCESS_STATES: [DEPLOYED, VALIDATED]  // Depending on pushToRegistry
FAILURE_STATES: [FAILED, ROLLED_BACK]
```

### State Transitions

```
STATE_MACHINE: ImageBuild

TRANSITIONS:
    QUEUED → PREPARING
        Event: build_slot_available
        Action: PrepareBuildContext()
        Guard: Semaphore.Acquire()

    PREPARING → BUILDING
        Event: context_ready
        Action: ExecuteDockerBuild()
        Guard: BuildContextExists()

    PREPARING → FAILED
        Event: context_preparation_failed
        Action: LogError(), Cleanup()
        Guard: Always

    BUILDING → BUILT
        Event: build_succeeded
        Action: InspectImage(), RecordMetrics()
        Guard: ExitCode == 0

    BUILDING → FAILED
        Event: build_failed
        Action: LogError(), Cleanup()
        Guard: ExitCode != 0 OR Timeout

    BUILT → TAGGING
        Event: tagging_requested
        Action: TagImage(version), TagImage("latest")
        Guard: Always

    TAGGING → VALIDATING
        Event: tags_applied
        Action: ValidateImageContract()
        Guard: Always

    VALIDATING → VALIDATED
        Event: validation_passed
        Action: RecordValidationResults()
        Guard: ValidationResult.passed == TRUE

    VALIDATING → FAILED
        Event: validation_failed
        Action: LogValidationErrors()
        Guard: ValidationResult.passed == FALSE

    VALIDATED → PUSHING
        Event: push_requested
        Action: PushToRegistry()
        Guard: PushToRegistry == TRUE

    VALIDATED → DEPLOYED
        Event: push_skipped
        Action: MarkAsDeployed()
        Guard: PushToRegistry == FALSE

    PUSHING → DEPLOYED
        Event: push_succeeded
        Action: MarkAsDeployed()
        Guard: ExitCode == 0

    PUSHING → FAILED
        Event: push_failed
        Action: LogError(), RetryOrFail()
        Guard: ExitCode != 0

    FAILED → ROLLED_BACK
        Event: rollback_requested
        Action: RestorePreviousVersion()
        Guard: IsCriticalImage() AND PreviousVersionExists()
```

### Build Orchestrator with State Tracking

```
ALGORITHM: OrchestrateBuildWithStates
INPUT:
    buildTargets (List<BuildTarget>)
    parallelism (integer)

OUTPUT:
    Map<imageName, finalState>

BEGIN
    // Initialize state machines for each target
    stateMachines ← EMPTY_MAP

    FOR EACH target IN buildTargets DO
        sm ← NEW ImageBuildStateMachine(target.imageName, QUEUED)
        stateMachines[target.imageName] ← sm
    END FOR

    // Process builds with state transitions
    semaphore ← CreateSemaphore(parallelism)
    completedBuilds ← 0

    WHILE completedBuilds < buildTargets.length DO
        FOR EACH (imageName, sm) IN stateMachines DO
            IF IsTerminalState(sm.currentState) THEN
                CONTINUE
            END IF

            // Process state machine events
            event ← PollStateEvent(sm)

            IF event IS NOT NULL THEN
                sm.ProcessEvent(event)

                // Trigger actions based on new state
                SWITCH sm.currentState DO
                    CASE PREPARING:
                        AsyncExecute(LAMBDA() -> {
                            PrepareContext(imageName)
                            sm.EmitEvent("context_ready")
                        })

                    CASE BUILDING:
                        AsyncExecute(LAMBDA() -> {
                            BuildImage(imageName)
                            sm.EmitEvent("build_succeeded")
                        })

                    CASE VALIDATING:
                        AsyncExecute(LAMBDA() -> {
                            ValidateImage(imageName)
                            IF validationPassed THEN
                                sm.EmitEvent("validation_passed")
                            ELSE
                                sm.EmitEvent("validation_failed")
                            END IF
                        })

                    CASE DEPLOYED, FAILED, ROLLED_BACK:
                        completedBuilds ← completedBuilds + 1
                END SWITCH
            END IF
        END FOR

        Sleep(1)  // Polling interval
    END WHILE

    // Collect final states
    finalStates ← EMPTY_MAP
    FOR EACH (imageName, sm) IN stateMachines DO
        finalStates[imageName] ← sm.currentState
    END FOR

    RETURN finalStates
END
```

---

## 3. Test Pipeline State Machine

### States

```
STATES:
    IDLE                    - No tests running
    BUILD_TESTING           - Running build-time tests
    BUILD_GATE_CHECK        - Evaluating build gate
    INTEGRATION_TESTING     - Running integration tests
    INTEGRATION_GATE_CHECK  - Evaluating integration gate
    REGRESSION_TESTING      - Running regression tests
    REGRESSION_GATE_CHECK   - Evaluating regression gate
    MAKING_DECISION         - Product Owner decision logic
    PASSED                  - All gates passed
    FAILED_BUILD            - Build gate failed
    FAILED_INTEGRATION      - Integration gate failed
    FAILED_REGRESSION       - Regression gate failed
    ROLLBACK_INITIATED      - Rolling back to previous version

INITIAL_STATE: IDLE
SUCCESS_STATE: PASSED
FAILURE_STATES: [FAILED_BUILD, FAILED_INTEGRATION, FAILED_REGRESSION, ROLLBACK_INITIATED]
```

### State Transitions

```
STATE_MACHINE: TestPipeline

TRANSITIONS:
    IDLE → BUILD_TESTING
        Event: pipeline_started
        Action: StartBuildTests()
        Guard: ImageExists()

    BUILD_TESTING → BUILD_GATE_CHECK
        Event: build_tests_completed
        Action: EvaluateBuildGate()
        Guard: AllTestsFinished()

    BUILD_GATE_CHECK → INTEGRATION_TESTING
        Event: build_gate_passed
        Action: StartIntegrationTests()
        Guard: PassRate >= 1.0 AND CriticalFailures == 0

    BUILD_GATE_CHECK → FAILED_BUILD
        Event: build_gate_failed
        Action: RecordFailure(), GenerateReport()
        Guard: PassRate < 1.0 OR CriticalFailures > 0

    INTEGRATION_TESTING → INTEGRATION_GATE_CHECK
        Event: integration_tests_completed
        Action: EvaluateIntegrationGate()
        Guard: AllTestsFinished()

    INTEGRATION_GATE_CHECK → REGRESSION_TESTING
        Event: integration_gate_passed
        Action: StartRegressionTests()
        Guard: PassRate >= 0.95 AND CriticalFailures == 0

    INTEGRATION_GATE_CHECK → FAILED_INTEGRATION
        Event: integration_gate_failed
        Action: RecordFailure(), GenerateReport()
        Guard: PassRate < 0.95 OR CriticalFailures > 0

    REGRESSION_TESTING → REGRESSION_GATE_CHECK
        Event: regression_tests_completed
        Action: EvaluateRegressionGate()
        Guard: AllTestsFinished()

    REGRESSION_GATE_CHECK → MAKING_DECISION
        Event: regression_gate_passed
        Action: MakeGateDecision()
        Guard: PassRate >= 0.90 AND CriticalFailures <= 2

    REGRESSION_GATE_CHECK → FAILED_REGRESSION
        Event: regression_gate_failed
        Action: RecordFailure()
        Guard: PassRate < 0.90 OR CriticalFailures > 2

    MAKING_DECISION → PASSED
        Event: decision_deploy
        Action: MarkAsDeployable()
        Guard: GateDecision.action == "DEPLOY"

    MAKING_DECISION → ROLLBACK_INITIATED
        Event: decision_rollback
        Action: InitiateRollback()
        Guard: GateDecision.action == "ROLLBACK"

    FAILED_REGRESSION → ROLLBACK_INITIATED
        Event: auto_rollback_triggered
        Action: InitiateRollback()
        Guard: CriticalFailures > 2
```

### Pipeline Execution with State Recovery

```
ALGORITHM: ExecutePipelineWithRecovery
INPUT:
    imageName (string)
    imageVersion (string)
    checkpointPath (string)

OUTPUT:
    finalState (State)

BEGIN
    // Attempt to recover previous state
    checkpoint ← LoadCheckpoint(checkpointPath)

    IF checkpoint IS NOT NULL THEN
        LogInfo("Recovering pipeline from state: " + checkpoint.state)
        sm ← RestoreStateMachine(checkpoint)
    ELSE
        sm ← NEW TestPipelineStateMachine(IDLE)
    END IF

    // Execute state machine with checkpointing
    WHILE NOT IsTerminalState(sm.currentState) DO
        // Save checkpoint before state transition
        SaveCheckpoint(checkpointPath, sm)

        // Process events
        event ← WaitForEvent(sm, timeout: 300)

        IF event IS NULL THEN
            // Timeout: check for stuck state
            IF IsStuckState(sm) THEN
                LogError("Pipeline stuck in state: " + sm.currentState)
                sm.TransitionTo(FAILED_BUILD)
                BREAK
            END IF
            CONTINUE
        END IF

        // Transition state
        sm.ProcessEvent(event)

        LogInfo("Pipeline state: " + sm.currentState)
    END WHILE

    // Cleanup checkpoint on completion
    DeleteCheckpoint(checkpointPath)

    RETURN sm.currentState
END


FUNCTION: SaveCheckpoint
INPUT:
    path (string)
    stateMachine (StateMachine)

OUTPUT:
    void

BEGIN
    checkpoint ← Map {
        "state": stateMachine.currentState.name,
        "stateHistory": stateMachine.stateHistory,
        "timestamp": CurrentTime(),
        "metadata": stateMachine.metadata
    }

    WriteJSON(path, checkpoint)
END


FUNCTION: LoadCheckpoint
INPUT: path (string)
OUTPUT: Checkpoint OR NULL

BEGIN
    IF NOT FileExists(path) THEN
        RETURN NULL
    END IF

    checkpoint ← ReadJSON(path)

    // Check if checkpoint is stale (>1 hour old)
    age ← CurrentTime() - checkpoint.timestamp

    IF age > 3600 THEN
        LogWarning("Checkpoint is stale, ignoring")
        RETURN NULL
    END IF

    RETURN checkpoint
END
```

---

## 4. Protocol Version Negotiation State Machine

### States

```
STATES:
    INIT             - Negotiation not started
    PROPOSING        - Sending supported versions
    RECEIVING        - Waiting for peer response
    EVALUATING       - Finding common version
    AGREED           - Version negotiated successfully
    INCOMPATIBLE     - No common version found
    FALLBACK         - Using fallback compatibility mode

INITIAL_STATE: INIT
SUCCESS_STATES: [AGREED, FALLBACK]
FAILURE_STATE: INCOMPATIBLE
```

### State Transitions

```
STATE_MACHINE: ProtocolNegotiation

TRANSITIONS:
    INIT → PROPOSING
        Event: negotiation_started
        Action: SendSupportedVersions()
        Guard: HasPeerConnection()

    PROPOSING → RECEIVING
        Event: versions_sent
        Action: WaitForPeerResponse()
        Guard: Always

    RECEIVING → EVALUATING
        Event: peer_response_received
        Action: FindCommonVersion()
        Guard: ResponseValid()

    RECEIVING → INCOMPATIBLE
        Event: timeout
        Action: LogNegotiationFailure()
        Guard: TimeoutReached()

    EVALUATING → AGREED
        Event: common_version_found
        Action: SetProtocolVersion(), NotifyPeer()
        Guard: CommonVersions.notEmpty()

    EVALUATING → INCOMPATIBLE
        Event: no_common_version
        Action: LogIncompatibility()
        Guard: CommonVersions.isEmpty() AND NoFallback

    EVALUATING → FALLBACK
        Event: fallback_activated
        Action: SetFallbackMode()
        Guard: CommonVersions.isEmpty() AND FallbackAvailable
```

### Negotiation Protocol Implementation

```
ALGORITHM: NegotiateProtocolVersion
INPUT:
    peerConnection (Connection)
    supportedVersions (List<string>)
    timeout (integer)

OUTPUT:
    negotiatedVersion (string) OR NULL

BEGIN
    sm ← NEW ProtocolNegotiationStateMachine(INIT)

    // Start negotiation
    sm.EmitEvent("negotiation_started")

    // Send our supported versions
    message ← Map {
        "type": "version_proposal",
        "versions": supportedVersions,
        "timestamp": CurrentTime()
    }

    Send(peerConnection, ToJSON(message))
    sm.EmitEvent("versions_sent")

    // Wait for peer response
    startTime ← CurrentTime()

    WHILE sm.currentState == RECEIVING DO
        response ← Receive(peerConnection, timeout: 5)

        IF response IS NULL THEN
            IF (CurrentTime() - startTime) > timeout THEN
                sm.EmitEvent("timeout")
                BREAK
            END IF
            CONTINUE
        END IF

        // Parse peer versions
        peerMessage ← ParseJSON(response)
        peerVersions ← peerMessage["versions"]

        sm.EmitEvent("peer_response_received")

        // Find common versions
        commonVersions ← Intersection(supportedVersions, peerVersions)

        IF NOT commonVersions.isEmpty() THEN
            // Sort by semantic version (descending)
            SortDescending(commonVersions, SemanticVersionComparator)

            negotiatedVersion ← commonVersions[0]
            sm.EmitEvent("common_version_found")

            // Confirm negotiation
            confirmation ← Map {
                "type": "version_confirmation",
                "version": negotiatedVersion
            }
            Send(peerConnection, ToJSON(confirmation))

            RETURN negotiatedVersion

        ELSE IF FallbackModeAvailable() THEN
            sm.EmitEvent("fallback_activated")
            LogWarning("No common version, activating fallback mode")
            RETURN "fallback-1.0.0"

        ELSE
            sm.EmitEvent("no_common_version")
            LogError("Protocol negotiation failed: no common version")
            RETURN NULL
        END IF
    END WHILE

    // Negotiation failed
    RETURN NULL
END
```

---

## 5. Design Patterns

### 5.1 Strategy Pattern: Runtime Selection

```
INTERFACE: RuntimeSelector
    selectRuntime(agentType: string, metadata: AgentMetadata): RuntimeSelection

CLASS: DefaultRuntimeSelector IMPLEMENTS RuntimeSelector
    selectRuntime(agentType, metadata):
        // Standard selection logic from main algorithm
        RETURN SelectRuntime(agentType, metadata)

CLASS: CachedRuntimeSelector IMPLEMENTS RuntimeSelector
    cache: Map<agentType, RuntimeSelection>
    delegate: RuntimeSelector

    selectRuntime(agentType, metadata):
        IF cache.hasKey(agentType) THEN
            cached ← cache[agentType]
            IF NOT IsStale(cached, ttl: 300) THEN  // 5 min cache
                RETURN cached
            END IF
        END IF

        result ← delegate.selectRuntime(agentType, metadata)
        cache[agentType] ← result
        RETURN result

CLASS: FallbackRuntimeSelector IMPLEMENTS RuntimeSelector
    primary: RuntimeSelector
    fallback: RuntimeSelector

    selectRuntime(agentType, metadata):
        TRY
            RETURN primary.selectRuntime(agentType, metadata)
        CATCH exception AS e
            LogWarning("Primary selector failed: " + e.message)
            RETURN fallback.selectRuntime(agentType, metadata)
        END TRY
```

### 5.2 Observer Pattern: Test Result Monitoring

```
INTERFACE: TestObserver
    onTestStarted(test: TestResult)
    onTestCompleted(test: TestResult)
    onTestFailed(test: TestResult)

CLASS: LoggingTestObserver IMPLEMENTS TestObserver
    onTestStarted(test):
        LogInfo("Test started: " + test.name)

    onTestCompleted(test):
        LogInfo("Test completed: " + test.name + " (" + test.executionTime + "s)")

    onTestFailed(test):
        LogError("Test failed: " + test.name + " - " + test.errorMessage)

CLASS: MetricsTestObserver IMPLEMENTS TestObserver
    metrics: MetricsCollector

    onTestStarted(test):
        metrics.Increment("tests.started")

    onTestCompleted(test):
        metrics.Increment("tests.completed")
        metrics.RecordTiming("test.duration." + test.name, test.executionTime)

    onTestFailed(test):
        metrics.Increment("tests.failed")
        metrics.Increment("tests.failed." + test.name)

CLASS: TestPipelineWithObservers
    observers: List<TestObserver>

    registerObserver(observer: TestObserver):
        observers.ADD(observer)

    runTest(test: TestResult):
        // Notify observers: test started
        FOR EACH observer IN observers DO
            observer.onTestStarted(test)
        END FOR

        // Execute test
        TRY
            result ← ExecuteTest(test)

            IF result.status == "PASS" THEN
                FOR EACH observer IN observers DO
                    observer.onTestCompleted(test)
                END FOR
            ELSE
                FOR EACH observer IN observers DO
                    observer.onTestFailed(test)
                END FOR
            END IF

        CATCH exception AS e
            test.status ← "FAIL"
            test.errorMessage ← e.message

            FOR EACH observer IN observers DO
                observer.onTestFailed(test)
            END FOR
        END TRY
```

### 5.3 Builder Pattern: Container Configuration

```
CLASS: ContainerConfigBuilder
    config: ContainerConfig

    constructor():
        config ← NEW ContainerConfig

    withImage(imageName: string):
        config.image ← imageName
        RETURN this

    withName(name: string):
        config.name ← name
        RETURN this

    withEnvironment(key: string, value: string):
        config.env[key] ← value
        RETURN this

    withVolume(hostPath: string, containerPath: string, readOnly: boolean):
        volume ← hostPath + ":" + containerPath
        IF readOnly THEN
            volume ← volume + ":ro"
        END IF
        config.volumes.ADD(volume)
        RETURN this

    withResource(resource: string, value: string):
        config.resources[resource] ← value
        RETURN this

    withLabel(key: string, value: string):
        config.labels[key] ← value
        RETURN this

    withHealthCheck(command: string, interval: string, timeout: string):
        config.healthCheck ← Map {
            "test": ["CMD-SHELL", command],
            "interval": interval,
            "timeout": timeout,
            "retries": 3
        }
        RETURN this

    build(): ContainerConfig
        // Validate required fields
        IF config.image IS NULL THEN
            THROW MissingRequiredFieldException("image")
        END IF

        IF config.name IS NULL THEN
            THROW MissingRequiredFieldException("name")
        END IF

        RETURN config


// Usage Example:
config ← NEW ContainerConfigBuilder()
    .withImage("cfn-node:1.0.0")
    .withName("agent-backend-dev-12345")
    .withEnvironment("AGENT_ID", "agent-backend-dev-12345")
    .withEnvironment("TASK_ID", "task-67890")
    .withVolume(".claude/skills", "/.claude/skills", readOnly: TRUE)
    .withVolume("cfn-workdir", "/workspace", readOnly: FALSE)
    .withResource("cpu", "1.0")
    .withResource("memory", "1024m")
    .withLabel("cfn.agent.type", "backend-developer")
    .withHealthCheck("coordination-signal --health-check", "10s", "5s")
    .build()
```

### 5.4 Chain of Responsibility: Validation Pipeline

```
INTERFACE: Validator
    validate(data: any): ValidationResult
    setNext(validator: Validator)

CLASS: ImageExistsValidator IMPLEMENTS Validator
    nextValidator: Validator

    validate(imageName: string):
        IF NOT ImageExists(imageName) THEN
            RETURN ValidationResult(valid: FALSE, error: "Image not found")
        END IF

        IF nextValidator IS NOT NULL THEN
            RETURN nextValidator.validate(imageName)
        END IF

        RETURN ValidationResult(valid: TRUE)

    setNext(validator):
        nextValidator ← validator

CLASS: ImageHealthValidator IMPLEMENTS Validator
    nextValidator: Validator

    validate(imageName: string):
        healthStatus ← CheckImageHealth(imageName)

        IF NOT healthStatus.healthy THEN
            RETURN ValidationResult(valid: FALSE, error: healthStatus.reason)
        END IF

        IF nextValidator IS NOT NULL THEN
            RETURN nextValidator.validate(imageName)
        END IF

        RETURN ValidationResult(valid: TRUE)

CLASS: ContractValidator IMPLEMENTS Validator
    nextValidator: Validator

    validate(imageName: string):
        contractResult ← ValidateImageContract(imageName, "1.0.0")

        IF NOT contractResult.passed THEN
            RETURN ValidationResult(valid: FALSE,
                                   error: "Contract validation failed")
        END IF

        IF nextValidator IS NOT NULL THEN
            RETURN nextValidator.validate(imageName)
        END IF

        RETURN ValidationResult(valid: TRUE)


// Build validation chain
existsValidator ← NEW ImageExistsValidator()
healthValidator ← NEW ImageHealthValidator()
contractValidator ← NEW ContractValidator()

existsValidator.setNext(healthValidator)
healthValidator.setNext(contractValidator)

// Execute chain
result ← existsValidator.validate("cfn-node:1.0.0")
```

---

## 6. Error Recovery Strategies

### 6.1 Exponential Backoff with Jitter

```
ALGORITHM: RetryWithExponentialBackoff
INPUT:
    operation (function)       - Operation to retry
    maxRetries (integer)       - Maximum retry attempts
    baseDelay (integer)        - Base delay in seconds
    maxDelay (integer)         - Maximum delay cap

OUTPUT:
    result OR exception

BEGIN
    retryCount ← 0

    WHILE retryCount <= maxRetries DO
        TRY
            result ← operation()
            RETURN result

        CATCH exception AS e
            IF retryCount >= maxRetries THEN
                THROW exception
            END IF

            // Calculate backoff with jitter
            exponentialDelay ← baseDelay × (2 ^ retryCount)
            jitter ← Random(0, exponentialDelay × 0.1)  // 10% jitter
            actualDelay ← Min(exponentialDelay + jitter, maxDelay)

            LogWarning("Operation failed (attempt " + (retryCount + 1) + "/" +
                      (maxRetries + 1) + "), retrying in " + actualDelay + "s: " +
                      e.message)

            Sleep(actualDelay)
            retryCount ← retryCount + 1
        END TRY
    END WHILE
END


// Usage Example:
result ← RetryWithExponentialBackoff(
    operation: LAMBDA() -> PullImage("cfn-rust:1.0.0"),
    maxRetries: 3,
    baseDelay: 2,
    maxDelay: 30
)
```

### 6.2 Circuit Breaker Pattern

```
CLASS: CircuitBreaker
    state: "CLOSED" | "OPEN" | "HALF_OPEN"
    failureThreshold: integer
    successThreshold: integer
    timeout: integer
    failureCount: integer
    successCount: integer
    lastFailureTime: timestamp

    constructor(failureThreshold: integer, successThreshold: integer, timeout: integer):
        this.failureThreshold ← failureThreshold
        this.successThreshold ← successThreshold
        this.timeout ← timeout
        this.state ← "CLOSED"
        this.failureCount ← 0
        this.successCount ← 0

    execute(operation: function):
        IF state == "OPEN" THEN
            // Check if timeout has elapsed
            IF (CurrentTime() - lastFailureTime) > timeout THEN
                LogInfo("Circuit breaker transitioning to HALF_OPEN")
                state ← "HALF_OPEN"
                successCount ← 0
            ELSE
                THROW CircuitBreakerOpenException("Circuit breaker is OPEN")
            END IF
        END IF

        TRY
            result ← operation()
            this.onSuccess()
            RETURN result

        CATCH exception AS e
            this.onFailure()
            THROW exception
        END TRY

    onSuccess():
        failureCount ← 0

        IF state == "HALF_OPEN" THEN
            successCount ← successCount + 1

            IF successCount >= successThreshold THEN
                LogInfo("Circuit breaker transitioning to CLOSED")
                state ← "CLOSED"
                successCount ← 0
            END IF
        END IF

    onFailure():
        failureCount ← failureCount + 1
        lastFailureTime ← CurrentTime()

        IF state == "HALF_OPEN" THEN
            LogWarning("Circuit breaker transitioning to OPEN (failure in HALF_OPEN)")
            state ← "OPEN"
            successCount ← 0

        ELSE IF failureCount >= failureThreshold THEN
            LogWarning("Circuit breaker transitioning to OPEN (threshold reached)")
            state ← "OPEN"
        END IF


// Usage Example:
registryCircuitBreaker ← NEW CircuitBreaker(
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60
)

result ← registryCircuitBreaker.execute(
    LAMBDA() -> PushToRegistry("cfn-node:1.0.0", "registry.example.com")
)
```

### 6.3 Graceful Degradation

```
ALGORITHM: ExecuteWithGracefulDegradation
INPUT:
    primaryOperation (function)
    fallbackOperation (function)
    degradedOperation (function)

OUTPUT:
    result

BEGIN
    TRY
        // Attempt primary operation
        result ← primaryOperation()
        RETURN result

    CATCH primaryException AS e1
        LogWarning("Primary operation failed: " + e1.message)

        TRY
            // Attempt fallback operation
            result ← fallbackOperation()
            LogInfo("Fallback operation succeeded")
            RETURN result

        CATCH fallbackException AS e2
            LogWarning("Fallback operation failed: " + e2.message)

            TRY
                // Attempt degraded operation
                result ← degradedOperation()
                LogWarning("Using degraded operation")
                RETURN result

            CATCH degradedException AS e3
                LogError("All operations failed: " + e3.message)
                THROW AllOperationsFailedException([e1, e2, e3])
            END TRY
        END TRY
    END TRY
END


// Usage Example: Runtime Selection with Degradation
result ← ExecuteWithGracefulDegradation(
    primaryOperation: LAMBDA() -> {
        // Use specified runtime from metadata
        runtime ← ParseAgentMetadata(agentPath).frontmatter["RUNTIME_REQUIREMENT"]
        RETURN SelectRuntime(agentType, runtime)
    },
    fallbackOperation: LAMBDA() -> {
        // Infer runtime from agent type
        runtime ← InferRuntimeFromAgentType(agentType)
        RETURN SelectRuntime(agentType, runtime)
    },
    degradedOperation: LAMBDA() -> {
        // Use default runtime
        RETURN SelectRuntime(agentType, "node")
    }
)
```

---

## 7. Monitoring & Observability

### 7.1 Metrics Collection

```
INTERFACE: MetricsCollector
    increment(metric: string, tags: Map)
    gauge(metric: string, value: float, tags: Map)
    timing(metric: string, duration: float, tags: Map)
    histogram(metric: string, value: float, tags: Map)

CLASS: PrometheusMetricsCollector IMPLEMENTS MetricsCollector
    registry: PrometheusRegistry

    increment(metric, tags):
        counter ← registry.getOrCreateCounter(metric, tags)
        counter.inc()

    gauge(metric, value, tags):
        gauge ← registry.getOrCreateGauge(metric, tags)
        gauge.set(value)

    timing(metric, duration, tags):
        histogram ← registry.getOrCreateHistogram(metric, tags)
        histogram.observe(duration)

    histogram(metric, value, tags):
        histogram ← registry.getOrCreateHistogram(metric, tags)
        histogram.observe(value)


// Instrumented Build Function
FUNCTION: BuildSingleImageWithMetrics
INPUT: target (BuildTarget), metrics (MetricsCollector)
OUTPUT: ImageBuildResult

BEGIN
    startTime ← CurrentTime()
    tags ← Map {"image": target.imageName, "runtime": target.runtime}

    metrics.increment("builds.started", tags)

    TRY
        result ← BuildSingleImage(target)

        IF result.status == "SUCCESS" THEN
            metrics.increment("builds.succeeded", tags)
            metrics.timing("build.duration", result.buildTime, tags)
            metrics.histogram("build.size_mb", result.imageSize / 1048576, tags)
        ELSE
            metrics.increment("builds.failed", tags)
        END IF

        RETURN result

    CATCH exception AS e
        metrics.increment("builds.error", tags)
        THROW exception

    FINALLY
        totalTime ← CurrentTime() - startTime
        metrics.timing("build.total_time", totalTime, tags)
    END TRY
END
```

### 7.2 Distributed Tracing

```
INTERFACE: Tracer
    startSpan(name: string, parent: SpanContext): Span
    inject(span: Span, carrier: Map)
    extract(carrier: Map): SpanContext

CLASS: JaegerTracer IMPLEMENTS Tracer
    // Implementation details omitted

CLASS: Span
    traceId: string
    spanId: string
    parentSpanId: string
    operationName: string
    startTime: timestamp
    tags: Map
    logs: List

    setTag(key: string, value: any)
    log(message: string, data: Map)
    finish()


// Instrumented Agent Spawn with Tracing
FUNCTION: SpawnAgentWithTracing
INPUT: agentType (string), taskId (string), tracer (Tracer), parentContext (SpanContext)
OUTPUT: AgentSpawnResult

BEGIN
    // Start root span
    span ← tracer.startSpan("spawn_agent", parentContext)
    span.setTag("agent.type", agentType)
    span.setTag("task.id", taskId)

    TRY
        // Runtime selection span
        runtimeSpan ← tracer.startSpan("select_runtime", span.context())
        runtimeSelection ← SelectRuntime(agentType, agentMetadataPath)
        runtimeSpan.setTag("runtime", runtimeSelection.runtime)
        runtimeSpan.setTag("image", runtimeSelection.imageName)
        runtimeSpan.finish()

        // Container creation span
        containerSpan ← tracer.startSpan("create_container", span.context())
        containerId ← CreateContainer(containerConfig)
        containerSpan.setTag("container.id", containerId)
        containerSpan.finish()

        // Readiness check span
        readinessSpan ← tracer.startSpan("wait_readiness", span.context())
        readinessResult ← WaitForAgentReadiness(containerId, agentId, 15, 2)
        readinessSpan.setTag("ready", readinessResult.ready)
        readinessSpan.finish()

        span.setTag("status", "success")
        RETURN result

    CATCH exception AS e
        span.setTag("error", TRUE)
        span.log("exception", Map {"message": e.message, "stacktrace": e.stacktrace})
        THROW exception

    FINALLY
        span.finish()
    END TRY
END
```

### 7.3 Health Check Endpoints

```
ALGORITHM: HealthCheckEndpoint
INPUT: request (HTTPRequest)
OUTPUT: response (HTTPResponse)

BEGIN
    healthStatus ← Map {
        "status": "healthy",
        "timestamp": CurrentISO8601Timestamp(),
        "checks": Map {}
    }

    // Check 1: Database connectivity
    TRY
        db ← OpenDatabase("cfn-loop.db")
        QuerySQL(db, "SELECT 1")
        CloseDatabase(db)
        healthStatus["checks"]["database"] ← "healthy"
    CATCH exception AS e
        healthStatus["checks"]["database"] ← "unhealthy: " + e.message
        healthStatus["status"] ← "degraded"
    END TRY

    // Check 2: Docker daemon connectivity
    TRY
        DockerClient.ping()
        healthStatus["checks"]["docker"] ← "healthy"
    CATCH exception AS e
        healthStatus["checks"]["docker"] ← "unhealthy: " + e.message
        healthStatus["status"] ← "unhealthy"
    END TRY

    // Check 3: Disk space
    diskUsage ← GetDiskUsage("/")
    IF diskUsage.percentUsed > 90 THEN
        healthStatus["checks"]["disk"] ← "warning: " + diskUsage.percentUsed + "% used"
        healthStatus["status"] ← "degraded"
    ELSE
        healthStatus["checks"]["disk"] ← "healthy"
    END IF

    // Check 4: Active agents
    activeAgents ← CountActiveAgents()
    healthStatus["checks"]["agents"] ← Map {
        "active": activeAgents,
        "limit": 100
    }

    IF activeAgents > 100 THEN
        healthStatus["status"] ← "degraded"
    END IF

    // Determine HTTP status code
    SWITCH healthStatus["status"] DO
        CASE "healthy":
            statusCode ← 200
        CASE "degraded":
            statusCode ← 200  // Still operational
        CASE "unhealthy":
            statusCode ← 503  // Service unavailable
    END SWITCH

    RETURN HTTPResponse(statusCode, ToJSON(healthStatus))
END
```

---

## Summary

This state machine and design pattern specification provides:

1. **Agent Lifecycle State Machine:** Complete lifecycle tracking with recovery
2. **Image Build State Machine:** Build orchestration with state persistence
3. **Test Pipeline State Machine:** Multi-gate testing with checkpointing
4. **Protocol Negotiation State Machine:** Version negotiation with fallback
5. **Design Patterns:** Strategy, Observer, Builder, Chain of Responsibility
6. **Error Recovery:** Exponential backoff, circuit breaker, graceful degradation
7. **Monitoring:** Metrics, tracing, health checks

**Integration with Main Algorithms:**
- State machines wrap algorithm execution
- Design patterns provide implementation flexibility
- Error recovery ensures resilience
- Monitoring enables observability

**Next Steps:**
1. Implement state machines in target runtime
2. Apply design patterns to algorithm implementations
3. Integrate monitoring and tracing
4. Test error recovery scenarios
5. Validate state persistence and recovery

This completes the algorithmic design phase for CFN Docker infrastructure standardization.
