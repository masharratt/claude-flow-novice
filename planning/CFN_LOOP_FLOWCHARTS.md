# CFN Loop System Flowcharts

Complete visual documentation of the CFN (Claude Flow Novice) Loop system with detailed Mermaid diagrams.

**Documentation Version**: 1.1.0
**Last Updated**: 2025-10-03
**Compatible With**: Claude Flow Novice v1.5.22+

---

## Table of Contents

1. [Overall CFN Loop Flow](#1-overall-cfn-loop-flow)
2. [Autonomous Self-Looping Flow](#2-autonomous-self-looping-flow)
3. [Loop 2: Phase-Level Flow](#3-loop-2-phase-level-flow)
4. [Loop 3: Consensus Flow](#4-loop-3-consensus-flow)
5. [Product Owner Decision Gate (Loop 2)](#5-product-owner-decision-gate-loop-2)
6. [Confidence Score Calculation](#6-confidence-score-calculation)
7. [Circuit Breaker State Machine](#7-circuit-breaker-state-machine)
8. [Memory Coordination](#8-memory-coordination)
9. [Agent Spawning Process](#9-agent-spawning-process)
10. [Feedback Injection Pipeline](#10-feedback-injection-pipeline)

---

## 1. Overall CFN Loop Flow

Complete 3-loop system with decision gates, feedback paths, and escalation routes.

```mermaid
flowchart TD
    Start([Start CFN Loop]) --> Loop1Init{Loop 1: Swarm<br/>Initialization}

    Loop1Init --> CheckMultiAgent{Multiple<br/>Agents?}
    CheckMultiAgent -->|Yes| SwarmInit[Initialize Swarm<br/>swarm_init topology maxAgents]
    CheckMultiAgent -->|No Single Agent| DirectExecution[Direct Execution<br/>No Coordination]

    SwarmInit --> SelectTopology{Agent Count?}
    SelectTopology -->|2-7 Agents| MeshTopology[Topology: mesh<br/>Peer-to-peer]
    SelectTopology -->|8+ Agents| HierarchicalTopology[Topology: hierarchical<br/>Coordinator-led]

    MeshTopology --> SpawnAgents[Spawn ALL Agents<br/>in SINGLE Message]
    HierarchicalTopology --> SpawnAgents

    SpawnAgents --> Loop2[Loop 2: Execution Loop<br/>Primary Swarm]

    %% Loop 2: Execution Loop
    Loop2 --> ExecuteAgents[Execute Primary Agents<br/>Concurrent via Task tool]
    ExecuteAgents --> FileEdits[File Edits<br/>Write/Edit/MultiEdit]
    FileEdits --> PostEditHooks[MANDATORY: Post-Edit Hooks<br/>npx enhanced-hooks post-edit]

    PostEditHooks --> ValidationResults[Validation Results<br/>Format Lint Type Security Tests]
    ValidationResults --> SelfValidation[Self-Validation<br/>Calculate Confidence Scores]

    SelfValidation --> Gate1{GATE 1:<br/>Self-Assessment<br/>Confidence ≥ 0.75?}

    Gate1 -->|PASS| Loop3[Loop 3: Consensus<br/>Verification Loop]
    Gate1 -->|FAIL| CheckLoop2Retries{Loop 2 Round<br/>≤ 3?}

    CheckLoop2Retries -->|Yes| CollectFeedback2[Collect Feedback<br/>from Failed Validations]
    CheckLoop2Retries -->|No Max Retries| EscalateLoop2[Escalate with<br/>Next Steps Guidance]

    CollectFeedback2 --> InjectFeedback2[Inject Feedback<br/>into Agent Instructions]
    InjectFeedback2 --> Loop2RetryCounter[Round++]
    Loop2RetryCounter --> Loop2

    %% Loop 3: Consensus Verification Loop
    Loop3 --> SpawnValidators[Spawn Validator Swarm<br/>2-4 validators]
    SpawnValidators --> MultiDimValidation[Multi-Dimensional Validation<br/>Quality Security Performance Tests Docs]

    MultiDimValidation --> ByzantineVoting[Byzantine Consensus Voting<br/>Calculate Agreement & Confidence]
    ByzantineVoting --> CheckCritical{All Critical<br/>Criteria Passing?}

    CheckCritical -->|No| FailConsensus[Consensus: FAIL]
    CheckCritical -->|Yes| Gate2{GATE 2:<br/>Consensus Decision<br/>Agreement ≥ 0.90<br/>& Avg Conf ≥ 0.90?}

    Gate2 -->|PASS| Success[Success!<br/>Store Results in SwarmMemory]
    Gate2 -->|FAIL| FailConsensus

    FailConsensus --> CheckLoop3Retries{Loop 3 Round<br/>≤ 10?}

    CheckLoop3Retries -->|Yes| AggregateFeedback3[Aggregate Validator Feedback]
    CheckLoop3Retries -->|No Max Rounds| EscalateLoop3[Escalate to Human<br/>Next Steps Guidance]

    AggregateFeedback3 --> InjectFeedback3[Inject Feedback<br/>into Loop 2 Context]
    InjectFeedback3 --> Loop3RetryCounter[Round++]
    Loop3RetryCounter --> Loop2

    Success --> UpdateDocs{Documentation<br/>Required?}
    UpdateDocs -->|Yes| GenerateDocs[Update Documentation]
    UpdateDocs -->|No| GenerateNextSteps
    GenerateDocs --> GenerateNextSteps[Generate Next Steps Guidance]

    GenerateNextSteps --> Exit([Exit: Success])

    EscalateLoop2 --> EscalateGuidance[Generate Escalation Guidance<br/>Completed Issues Next Steps]
    EscalateLoop3 --> EscalateGuidance
    EscalateGuidance --> Exit2([Exit: Escalated])

    DirectExecution --> Exit3([Exit: Single Agent])

    style Start fill:#90EE90
    style Exit fill:#90EE90
    style Exit2 fill:#FFB6C1
    style Exit3 fill:#87CEEB
    style Success fill:#FFD700
    style Gate1 fill:#FFA500
    style Gate2 fill:#FFA500
    style Loop2 fill:#E6E6FA
    style Loop3 fill:#E6E6FA
    style EscalateLoop2 fill:#FF6B6B
    style EscalateLoop3 fill:#FF6B6B
```

---

## 2. Autonomous Self-Looping Flow

Demonstrates autonomous retry behavior with NO human approval gates, immediate auto-retries, and auto-transitions between phases.

```mermaid
graph TD
    Start[Start CFN Loop] --> Phase0[Loop 0: Initialize Phase]

    Phase0 --> Loop2[Loop 2: Execute Primary Swarm]

    Loop2 --> ConfGate{Confidence ≥ 75%?}

    ConfGate -->|NO| CheckIter2{Iteration < 5?}
    CheckIter2 -->|YES| AutoRetry2[🔄 IMMEDIATE AUTO-RETRY<br/>Generate feedback<br/>Relaunch NOW<br/>NO APPROVAL]
    AutoRetry2 --> Loop2

    CheckIter2 -->|NO| AltApproach[Generate Alternative<br/>Attempt 1 more iteration]
    AltApproach --> Loop2

    ConfGate -->|YES| Loop3[Loop 3: Consensus Validation]

    Loop3 --> ConsGate{Consensus ≥ 90%?}

    ConsGate -->|NO| CheckIter3{Iteration < 10?}
    CheckIter3 -->|YES| AutoRetry3[🔄 IMMEDIATE AUTO-RETRY<br/>Inject validator feedback<br/>Relaunch Loop 2 NOW<br/>NO APPROVAL]
    AutoRetry3 --> Loop2

    CheckIter3 -->|NO| AltStrategy[Generate Alternative Strategy<br/>Attempt 1 more round]
    AltStrategy --> Loop2

    ConsGate -->|YES| PhaseComplete[Phase Complete]

    PhaseComplete --> NextPhase{Next Phase<br/>Dependencies<br/>Satisfied?}

    NextPhase -->|YES| AutoTrans[🔄 IMMEDIATE AUTO-TRANSITION<br/>Initialize next phase NOW<br/>NO APPROVAL]
    AutoTrans --> Phase0

    NextPhase -->|NO| Wait[Wait for Dependencies]
    Wait --> NextPhase

    NextPhase -->|All Complete| Success[✅ All Phases Complete<br/>Project Success]

    style AutoRetry2 fill:#f9f,stroke:#333,stroke-width:4px
    style AutoRetry3 fill:#f9f,stroke:#333,stroke-width:4px
    style AutoTrans fill:#9f9,stroke:#333,stroke-width:4px
    style Success fill:#9f9,stroke:#333,stroke-width:2px
```

**Key Features of Autonomous Self-Looping:**

1. **NO Human Approval Gates**: All retry and transition decisions are autonomous
2. **Immediate Auto-Retry**: Failed validations trigger instant retry with feedback injection
3. **Alternative Approaches**: System tries alternative strategies when iteration limits approached
4. **Auto-Transitions**: Successful phase completion automatically initializes next phase
5. **Dependency-Aware**: Waits only for external dependencies, not human approval
6. **Continuous Improvement**: Feedback loops continuously refine deliverables

**Autonomous Decision Points:**

| Decision | Trigger | Action | Human Involvement |
|----------|---------|--------|------------------|
| **Loop 2 Retry** | Confidence < 75% | Generate feedback → Relaunch immediately | None |
| **Alternative Approach** | Iteration ≥ 5 | Try different strategy → Relaunch | None |
| **Loop 3 Retry** | Consensus < 90% | Inject validator feedback → Return to Loop 2 | None |
| **Alternative Strategy** | Iteration ≥ 10 | Generate new approach → Relaunch | None |
| **Phase Transition** | Phase complete + Dependencies met | Initialize next phase automatically | None |

**Escalation Only Occurs When:**
- Maximum iterations exhausted (5 for Loop 2, 10 for Loop 3)
- Alternative approaches all fail
- Critical blockers detected (security vulnerabilities, system failures)
- External dependencies cannot be satisfied

---

## 3. Loop 2: Phase-Level Flow

Self-validation iterations with confidence collection and retry logic.

```mermaid
flowchart TD
    Start([Enter Loop 2:<br/>Execution Loop]) --> InitRound[Initialize Round Counter<br/>r = 1]

    InitRound --> SpawnAgents[Spawn Primary Agents<br/>3-20 agents concurrently]

    SpawnAgents --> ParallelExecution{Execute Agents<br/>in Parallel}

    ParallelExecution --> Agent1[Agent 1: Task Execution]
    ParallelExecution --> Agent2[Agent 2: Task Execution]
    ParallelExecution --> Agent3[Agent 3: Task Execution]
    ParallelExecution --> AgentN[Agent N: Task Execution]

    Agent1 --> Edit1[File Edits]
    Agent2 --> Edit2[File Edits]
    Agent3 --> Edit3[File Edits]
    AgentN --> EditN[File Edits]

    Edit1 --> Hook1[Post-Edit Hook<br/>MANDATORY]
    Edit2 --> Hook2[Post-Edit Hook<br/>MANDATORY]
    Edit3 --> Hook3[Post-Edit Hook<br/>MANDATORY]
    EditN --> HookN[Post-Edit Hook<br/>MANDATORY]

    Hook1 --> Validation1[Validation:<br/>Format Lint Type<br/>Security Tests Coverage]
    Hook2 --> Validation2[Validation:<br/>Format Lint Type<br/>Security Tests Coverage]
    Hook3 --> Validation3[Validation:<br/>Format Lint Type<br/>Security Tests Coverage]
    HookN --> ValidationN[Validation:<br/>Format Lint Type<br/>Security Tests Coverage]

    Validation1 --> SelfVal1[Calculate<br/>Confidence Score]
    Validation2 --> SelfVal2[Calculate<br/>Confidence Score]
    Validation3 --> SelfVal3[Calculate<br/>Confidence Score]
    ValidationN --> SelfValN[Calculate<br/>Confidence Score]

    SelfVal1 --> Collect[Collect All<br/>Confidence Scores<br/>PARALLEL]
    SelfVal2 --> Collect
    SelfVal3 --> Collect
    SelfValN --> Collect

    Collect --> MinConfidence[Calculate min confidence<br/>across all agents]

    MinConfidence --> Gate{GATE 1:<br/>min confidence<br/>≥ 0.75?}

    Gate -->|PASS| MemoryStore[Store Results<br/>in SwarmMemory]
    MemoryStore --> ExitSuccess([Proceed to Loop 3:<br/>Consensus Verification])

    Gate -->|FAIL| IdentifyIssues[Identify Failed<br/>Validation Criteria]

    IdentifyIssues --> CategorizeIssues[Categorize Issues:<br/>Tests Coverage Security<br/>Formatting Syntax]

    CategorizeIssues --> GenerateFeedback[Generate Actionable<br/>Feedback per Agent]

    GenerateFeedback --> CheckRetries{Round Counter<br/>r ≤ 3?}

    CheckRetries -->|Yes| IncrementRound[r++]
    CheckRetries -->|No Max Retries| Escalate[Escalate with<br/>Next Steps Guidance]

    IncrementRound --> InjectFeedback[Inject Feedback<br/>into Agent Instructions]

    InjectFeedback --> RetryNote[NOTE: Retry with<br/>specific improvements<br/>per agent]

    RetryNote --> SpawnAgents

    Escalate --> ExitEscalate([Exit: Escalated<br/>to Human])

    style Start fill:#90EE90
    style ExitSuccess fill:#90EE90
    style ExitEscalate fill:#FFB6C1
    style Gate fill:#FFA500
    style Collect fill:#FFD700
    style ParallelExecution fill:#87CEEB
    style Escalate fill:#FF6B6B
```

---

## 4. Loop 3: Consensus Flow

Consensus validation with Byzantine voting and feedback capture.

```mermaid
flowchart TD
    Start([Enter Loop 3:<br/>Consensus Verification]) --> InitRound[Initialize Round Counter<br/>v = 1]

    InitRound --> SpawnValidators[Spawn Validator Swarm<br/>2-4 validators concurrently]

    SpawnValidators --> ValidatorTypes{Validator Types}

    ValidatorTypes --> Reviewer[Validator 1:<br/>reviewer<br/>Quality & Architecture]
    ValidatorTypes --> Security[Validator 2:<br/>security-specialist<br/>Security & Performance]
    ValidatorTypes --> Architect[Validator 3:<br/>system-architect<br/>Architecture Validation]
    ValidatorTypes --> Tester[Validator 4:<br/>tester<br/>Integration Testing]

    Reviewer --> ReviewerAssess[Multi-Dimensional<br/>Assessment]
    Security --> SecurityAssess[Multi-Dimensional<br/>Assessment]
    Architect --> ArchitectAssess[Multi-Dimensional<br/>Assessment]
    Tester --> TesterAssess[Multi-Dimensional<br/>Assessment]

    ReviewerAssess --> ReviewerDims[Dimensions:<br/>Quality Performance<br/>Tests Docs]
    SecurityAssess --> SecurityDims[Dimensions:<br/>Security Vulnerabilities<br/>Best Practices]
    ArchitectAssess --> ArchitectDims[Dimensions:<br/>Architecture Scalability<br/>Consistency]
    TesterAssess --> TesterDims[Dimensions:<br/>Test Coverage Edge Cases<br/>Integration]

    ReviewerDims --> ReviewerVote[Vote:<br/>approve: bool<br/>confidence: float]
    SecurityDims --> SecurityVote[Vote:<br/>approve: bool<br/>confidence: float]
    ArchitectDims --> ArchitectVote[Vote:<br/>approve: bool<br/>confidence: float]
    TesterDims --> TesterVote[Vote:<br/>approve: bool<br/>confidence: float]

    ReviewerVote --> CollectVotes[Collect All Votes<br/>PARALLEL]
    SecurityVote --> CollectVotes
    ArchitectVote --> CollectVotes
    TesterVote --> CollectVotes

    CollectVotes --> ByzantineVoting[Byzantine Consensus Voting]

    ByzantineVoting --> CalcAgreement[Calculate Agreement Rate<br/>approvals / total validators]
    CalcAgreement --> CalcConfidence[Calculate Avg Confidence<br/>mean validator confidence]

    CalcConfidence --> CheckCritical{All Critical<br/>Criteria Passing?}

    CheckCritical -->|No Security Vulns| CriticalFail[Critical Criteria: FAIL]
    CheckCritical -->|Tests Failing| CriticalFail
    CheckCritical -->|Blocking Errors| CriticalFail
    CheckCritical -->|All Pass| Gate2{GATE 2:<br/>Agreement ≥ 0.90<br/>& Avg Conf ≥ 0.90?}

    CriticalFail --> ConsensusFail[Consensus: FAIL]

    Gate2 -->|PASS| ConsensusPass[Consensus: PASS]
    Gate2 -->|FAIL| ConsensusFail

    ConsensusPass --> StoreResults[Store Results<br/>in SwarmMemory]
    StoreResults --> UpdateDocs{Documentation<br/>Required?}
    UpdateDocs -->|Yes| GenerateDocs[Update Documentation]
    UpdateDocs -->|No| NextSteps
    GenerateDocs --> NextSteps[Generate Next Steps<br/>Guidance]
    NextSteps --> ExitSuccess([Exit: Success])

    ConsensusFail --> ProductOwnerGate[Product Owner<br/>Decision Gate]
    ProductOwnerGate --> PODecision{PO Decision?}

    PODecision -->|relaunch_loop3| CaptureFeedback[Capture Validator<br/>Feedback]
    PODecision -->|defer_to_backlog| DeferBacklog[Save to Backlog<br/>Approve Phase]
    PODecision -->|escalate| Escalate[Escalate to Human<br/>Next Steps Guidance]

    DeferBacklog --> ExitDeferred([Exit: Deferred<br/>Phase Approved])

    CaptureFeedback --> AggregateFeedback[Aggregate Feedback:<br/>Critical Issues<br/>Recommendations<br/>Failed Criteria]

    AggregateFeedback --> CheckRetries{Round Counter<br/>v ≤ 10?}

    CheckRetries -->|Yes| IncrementRound[v++]
    CheckRetries -->|No Max Rounds| Escalate

    IncrementRound --> PrioritizeFeedback[Prioritize Feedback:<br/>Critical > High > Medium > Low]

    PrioritizeFeedback --> DeduplicateIssues[Deduplicate Issues<br/>vs Previous Iterations]

    DeduplicateIssues --> InjectIntoLoop2[Inject Feedback<br/>into Loop 2 Context]

    InjectIntoLoop2 --> ReturnToLoop2([Return to Loop 2:<br/>Relaunch Primary Swarm])

    Escalate --> GenerateEscalation[Generate Escalation Guidance:<br/>Completed Work<br/>Validation Results<br/>Identified Issues<br/>Recommended Next Steps]

    GenerateEscalation --> ExitEscalate([Exit: Escalated])

    style Start fill:#90EE90
    style ExitSuccess fill:#90EE90
    style ExitDeferred fill:#87CEEB
    style ExitEscalate fill:#FFB6C1
    style ReturnToLoop2 fill:#87CEEB
    style Gate2 fill:#FFA500
    style ConsensusPass fill:#FFD700
    style ConsensusFail fill:#FF6B6B
    style ProductOwnerGate fill:#FFD700
    style Escalate fill:#FF6B6B
    style CollectVotes fill:#FFD700
```

---

## 5. Product Owner Decision Gate (Loop 2)

GOAP-based autonomous decision-making for scope control and resource optimization when consensus fails.

```mermaid
graph TD
    A[Consensus <90%] --> B[Spawn Product Owner]
    B --> C[Retrieve Scope from Memory<br/>namespace: scope-control]
    C --> D[Parse Validator Concerns]
    D --> E[Classify Each Concern]
    E --> F{In-Scope?}
    F -->|Yes| G[Cost = 50-100<br/>In-scope blocker]
    F -->|No| H[Cost = 1000<br/>Scope expansion]
    G --> I[GOAP A* Search]
    H --> I
    I --> J{Optimal Action?}
    J -->|relaunch_loop3| K[PROCEED<br/>Spawn Loop 3 agents]
    J -->|defer_to_backlog| L[DEFER<br/>Save to backlog<br/>Approve phase]
    J -->|escalate| M[ESCALATE<br/>Generate options]
    K --> N[Loop 3 Iteration X/10]
    L --> O[Phase Complete<br/>Auto-transition]
    M --> P[Human Decision Required]

    style A fill:#FFB6C1
    style B fill:#FFD700
    style F fill:#FFA500
    style J fill:#FFA500
    style K fill:#90EE90
    style L fill:#87CEEB
    style M fill:#FF6B6B
    style O fill:#90EE90
    style P fill:#FFE6B3
```

**Product Owner Decision Logic:**

**When Triggered:**
- Consensus <90% in Loop 2 validation
- Validator concerns require triage

**Decision Process:**
1. Retrieve original scope from `scope-control` namespace
2. Parse and classify each validator concern
3. Assess whether concern is in-scope or scope expansion
4. Assign GOAP costs based on classification
5. Run A* search to find optimal action
6. Execute decision autonomously

**GOAP Cost Model:**
- In-scope blocker: 50-100 cost (low)
- Scope expansion: 1000 cost (high)
- Deferral to backlog: 25 cost (very low)
- Human escalation: 500 cost (medium-high)

**Actions:**
- `relaunch_loop3`: Fix in-scope blockers, continue CFN loop
- `defer_to_backlog`: Save out-of-scope items, approve phase
- `escalate`: Present options to human for critical decisions

**Benefits:**
- Prevents scope creep
- Optimizes resource allocation
- Maintains autonomous operation
- Escalates only when necessary

---

## 6. Confidence Score Calculation

Input collection, weighting application, threshold evaluation, and gate decision.

```mermaid
flowchart TD
    Start([Post-Edit Hook<br/>Validation Complete]) --> CollectInputs[Collect Validation Inputs]

    CollectInputs --> TestsPassed{Tests<br/>Passed?}
    CollectInputs --> Coverage[Coverage %]
    CollectInputs --> SyntaxErrors{Syntax<br/>Errors?}
    CollectInputs --> SecurityIssues[Security Issues<br/>by Severity]
    CollectInputs --> Formatting{Formatting<br/>Correct?}

    TestsPassed -->|Yes| TestScore[Tests Score: 1.0]
    TestsPassed -->|No| TestScoreFail[Tests Score: 0.0]

    Coverage --> CoverageCalc{Coverage<br/>≥ 80%?}
    CoverageCalc -->|Yes| CovScore[Coverage Score: 1.0]
    CoverageCalc -->|No| CovScorePartial[Coverage Score:<br/>coverage / 80]

    SyntaxErrors -->|No Errors| SyntaxScore[Syntax Score: 1.0]
    SyntaxErrors -->|Errors Found| SyntaxScoreFail[Syntax Score: 0.0]

    SecurityIssues --> SecurityCalc[Calculate Security Score]
    SecurityCalc --> CountCritical{Critical<br/>Issues?}
    CountCritical -->|0| SecScore1[Security Score: 1.0]
    CountCritical -->|≥1| SecScoreFail[Security Score: 0.0]
    CountCritical -->|Only High/Med/Low| SecScorePartial[Security Score:<br/>1.0 - weighted penalty]

    Formatting -->|Correct| FmtScore[Formatting Score: 1.0]
    Formatting -->|Incorrect| FmtScoreFail[Formatting Score: 0.0]

    %% Weighting
    TestScore --> ApplyWeights[Apply Weights]
    TestScoreFail --> ApplyWeights
    CovScore --> ApplyWeights
    CovScorePartial --> ApplyWeights
    SyntaxScore --> ApplyWeights
    SyntaxScoreFail --> ApplyWeights
    SecScore1 --> ApplyWeights
    SecScoreFail --> ApplyWeights
    SecScorePartial --> ApplyWeights
    FmtScore --> ApplyWeights
    FmtScoreFail --> ApplyWeights

    ApplyWeights --> Weights[Weights:<br/>Tests: 0.30<br/>Coverage: 0.25<br/>Syntax: 0.15<br/>Security: 0.20<br/>Formatting: 0.10]

    Weights --> Calculate[Calculate Weighted Sum:<br/>Σ score × weight]

    Calculate --> ConfidenceScore[Confidence Score<br/>Range: 0.0 - 1.0]

    ConfidenceScore --> ThresholdCheck{Confidence<br/>≥ 0.75?}

    ThresholdCheck -->|PASS| GatePass[GATE PASS:<br/>Proceed to Consensus]
    ThresholdCheck -->|FAIL| GateFail[GATE FAIL:<br/>Retry Loop 2]

    GatePass --> StoreMemory[Store in SwarmMemory:<br/>swarm/agent/task/confidence]
    GateFail --> IdentifyWeakest[Identify Weakest<br/>Criteria for Feedback]

    StoreMemory --> ExitPass([Continue to<br/>Loop 3])
    IdentifyWeakest --> ExitFail([Collect Feedback<br/>for Retry])

    %% Examples
    Calculate --> Example1[Example 1: All Criteria Met<br/>0.30 + 0.25 + 0.15 + 0.20 + 0.10<br/>= 1.00 100%]
    Calculate --> Example2[Example 2: Low Coverage 60%<br/>0.30 + 0.25×0.75 + 0.15 + 0.20 + 0.10<br/>= 0.94 94%]
    Calculate --> Example3[Example 3: Tests Failing<br/>0.00 + 0.00 + 0.15 + 0.20 + 0.10<br/>= 0.45 45% FAIL]

    style Start fill:#90EE90
    style ExitPass fill:#90EE90
    style ExitFail fill:#FFB6C1
    style GatePass fill:#FFD700
    style GateFail fill:#FF6B6B
    style ThresholdCheck fill:#FFA500
    style ConfidenceScore fill:#87CEEB
    style Example1 fill:#E6FFE6
    style Example2 fill:#FFF9E6
    style Example3 fill:#FFE6E6
```

---

## 7. Circuit Breaker State Machine

CLOSED → OPEN → HALF_OPEN transitions with failure/success thresholds and cooldown.

```mermaid
stateDiagram-v2
    [*] --> CLOSED: Initialize

    CLOSED --> CLOSED: Success<br/>(reset failure count)
    CLOSED --> OPEN: Failure threshold reached<br/>(3 consecutive failures)
    CLOSED --> OPEN: Timeout exceeded<br/>(operation > timeoutMs)

    OPEN --> HALF_OPEN: Cooldown elapsed<br/>(wait cooldownMs)
    OPEN --> OPEN: Request rejected<br/>(circuit still open)

    HALF_OPEN --> CLOSED: Success threshold met<br/>(2 successes)
    HALF_OPEN --> OPEN: Failure detected<br/>(any failure in half-open)
    HALF_OPEN --> HALF_OPEN: Success<br/>(increment success count)

    note right of CLOSED
        State: CLOSED
        Behavior: Allow all requests
        Failure count: 0-2
        Success count: tracked
    end note

    note right of OPEN
        State: OPEN
        Behavior: Reject all requests
        Next attempt time: now + cooldownMs
        Cooldown: 5 minutes default
    end note

    note right of HALF_OPEN
        State: HALF_OPEN
        Behavior: Limited requests (max 3)
        Testing recovery
        Success threshold: 2
    end note

    CLOSED --> [*]: Shutdown
    OPEN --> [*]: Shutdown
    HALF_OPEN --> [*]: Shutdown
```

**Circuit Breaker Transitions Detail:**

```mermaid
flowchart TD
    Start([Execute Request]) --> CheckState{Current<br/>State?}

    CheckState -->|CLOSED| CheckTimeout{Timeout<br/>Protection}
    CheckState -->|OPEN| CheckCooldown{Cooldown<br/>Elapsed?}
    CheckState -->|HALF_OPEN| CheckLimit{Half-Open<br/>Request Limit?}

    CheckTimeout --> ExecuteRequest[Execute Request]
    ExecuteRequest --> RequestResult{Result?}

    RequestResult -->|Success| IncrementSuccess[Increment<br/>Success Count]
    RequestResult -->|Failure| IncrementFailure[Increment<br/>Failure Count]
    RequestResult -->|Timeout| TimeoutDetected[Timeout Detected<br/>Increment Timeout Count]

    IncrementSuccess --> ResetFailures[Reset Failure Count<br/>Stay CLOSED]
    ResetFailures --> ReturnSuccess([Return Success])

    IncrementFailure --> CheckThreshold{Failure Count<br/>≥ 3?}
    CheckThreshold -->|Yes| TransitionOpen[Transition to OPEN<br/>Set nextAttemptTime]
    CheckThreshold -->|No| StayClosed[Stay CLOSED]

    TimeoutDetected --> TransitionOpen

    TransitionOpen --> RejectRequest[Reject Request<br/>CircuitOpenError]
    RejectRequest --> ReturnError([Return Error])

    StayClosed --> ReturnFailure([Return Failure])

    CheckCooldown -->|No| RejectStillOpen[Reject Request<br/>Circuit Still Open]
    CheckCooldown -->|Yes| TransitionHalfOpen[Transition to HALF_OPEN<br/>Allow Limited Requests]

    RejectStillOpen --> ReturnError

    TransitionHalfOpen --> CheckLimit

    CheckLimit -->|Limit Reached| RejectLimit[Reject Request<br/>Half-Open Limit]
    CheckLimit -->|Under Limit| ExecuteHalfOpen[Execute Request<br/>in Half-Open]

    RejectLimit --> ReturnError

    ExecuteHalfOpen --> HalfOpenResult{Result?}

    HalfOpenResult -->|Success| IncrementHalfOpenSuccess[Increment<br/>Success Count]
    HalfOpenResult -->|Failure| HalfOpenFail[Failure in Half-Open]

    IncrementHalfOpenSuccess --> CheckCloseThreshold{Success Count<br/>≥ 2?}
    CheckCloseThreshold -->|Yes| TransitionClosed[Transition to CLOSED<br/>Reset Counters]
    CheckCloseThreshold -->|No| StayHalfOpen[Stay HALF_OPEN]

    TransitionClosed --> ReturnSuccess
    StayHalfOpen --> ReturnSuccess

    HalfOpenFail --> TransitionOpenAgain[Transition to OPEN<br/>Reset Cooldown]
    TransitionOpenAgain --> ReturnError

    style Start fill:#90EE90
    style ReturnSuccess fill:#90EE90
    style ReturnError fill:#FFB6C1
    style ReturnFailure fill:#FFE6B3
    style TransitionOpen fill:#FF6B6B
    style TransitionClosed fill:#90EE90
    style TransitionHalfOpen fill:#87CEEB
```

---

## 8. Memory Coordination

Storage flow, retrieval flow, cleanup triggers, and namespace routing.

```mermaid
flowchart TD
    Start([Memory Operation<br/>Request]) --> OperationType{Operation<br/>Type?}

    %% Storage Flow
    OperationType -->|Store| ValidateKey[Validate Memory Key<br/>Format: swarm/agent/task]
    ValidateKey --> KeyValid{Valid<br/>Format?}
    KeyValid -->|No| KeyError([Error: Invalid Key])
    KeyValid -->|Yes| DetermineNamespace[Determine Namespace<br/>from Key]

    DetermineNamespace --> NamespaceRouting{Namespace<br/>Routing}

    NamespaceRouting -->|swarm/agent/*| AgentNamespace[Agent Task Memory<br/>Namespace]
    NamespaceRouting -->|swarm/consensus/*| ConsensusNamespace[Consensus Round Memory<br/>Namespace]
    NamespaceRouting -->|swarm/iterations/*| IterationNamespace[Iteration Feedback Memory<br/>Namespace]
    NamespaceRouting -->|swarm/*/learning/*| LearningNamespace[Learning Patterns Memory<br/>Namespace]

    AgentNamespace --> PrepareData[Prepare Data Structure]
    ConsensusNamespace --> PrepareData
    IterationNamespace --> PrepareData
    LearningNamespace --> PrepareData

    PrepareData --> AddMetadata[Add Metadata:<br/>Timestamp Agent ID<br/>Phase ID]
    AddMetadata --> SerializeData[Serialize to JSON]
    SerializeData --> CheckCompression{Compression<br/>Enabled?}

    CheckCompression -->|Yes| CompressData[Compress with gzip]
    CheckCompression -->|No| StoreRaw[Store Raw JSON]
    CompressData --> StoreDB
    StoreRaw --> StoreDB[Store in SQLite DB<br/>.swarm/swarm-memory.db]

    StoreDB --> CheckTTL{TTL<br/>Specified?}
    CheckTTL -->|Yes| SetExpiration[Set Expiration Time]
    CheckTTL -->|No| NoExpiration[No Expiration]
    SetExpiration --> IndexData
    NoExpiration --> IndexData[Index by:<br/>Namespace Phase Agent]

    IndexData --> CheckLRU{Memory<br/>Over Limit?}
    CheckLRU -->|Yes| EvictOldest[Evict Oldest Entries<br/>LRU Policy]
    CheckLRU -->|No| StoreComplete[Store Complete]
    EvictOldest --> StoreComplete

    StoreComplete --> ExitStore([Return: Success])

    %% Retrieval Flow
    OperationType -->|Retrieve| RetrieveKey[Parse Memory Key]
    RetrieveKey --> QueryDB[Query SQLite DB<br/>by Key]
    QueryDB --> CheckExists{Entry<br/>Exists?}

    CheckExists -->|No| NotFound([Return: null])
    CheckExists -->|Yes| CheckExpired{TTL<br/>Expired?}

    CheckExpired -->|Yes| DeleteExpired[Delete Expired Entry]
    DeleteExpired --> NotFound
    CheckExpired -->|No| FetchData[Fetch Data from DB]

    FetchData --> CheckCompressed{Data<br/>Compressed?}
    CheckCompressed -->|Yes| DecompressData[Decompress gzip]
    CheckCompressed -->|No| ParseJSON[Parse JSON]
    DecompressData --> ParseJSON

    ParseJSON --> ValidateSchema{Schema<br/>Valid?}
    ValidateSchema -->|No| SchemaError([Error: Invalid Schema])
    ValidateSchema -->|Yes| ReturnData([Return: Data Object])

    %% Search Flow
    OperationType -->|Search| ParsePattern[Parse Search Pattern<br/>e.g. swarm/*/*]
    ParsePattern --> WildcardQuery[Wildcard Query<br/>LIKE operator]
    WildcardQuery --> FilterResults[Apply Filters:<br/>Phase Agent Timestamp]
    FilterResults --> SortResults[Sort by Timestamp<br/>DESC]
    SortResults --> LimitResults[Apply Limit<br/>default: 100]
    LimitResults --> MapResults[Map Results<br/>to Objects]
    MapResults --> ExitSearch([Return: Array])

    %% Cleanup Flow
    OperationType -->|Cleanup| TriggerCleanup[Trigger Cleanup]
    TriggerCleanup --> DeleteExpiredAll[Delete All Expired<br/>Entries]
    DeleteExpiredAll --> CompactDB[Compact SQLite DB<br/>VACUUM]
    CompactDB --> RebuildIndexes[Rebuild Indexes]
    RebuildIndexes --> ExitCleanup([Return: Cleanup Stats])

    style Start fill:#90EE90
    style ExitStore fill:#90EE90
    style ExitSearch fill:#90EE90
    style ExitCleanup fill:#90EE90
    style ReturnData fill:#90EE90
    style NotFound fill:#FFE6B3
    style KeyError fill:#FFB6C1
    style SchemaError fill:#FFB6C1
```

**Memory Namespace Hierarchy:**

```mermaid
graph TD
    Root[swarm/] --> SwarmID[swarm-id/]

    SwarmID --> Agents[agents/]
    SwarmID --> Consensus[consensus/]
    SwarmID --> Iterations[iterations/]
    SwarmID --> Results[results/]

    Agents --> AgentID[agent-id/]
    AgentID --> Tasks[tasks/]
    AgentID --> Learning[learning/]
    AgentID --> Metrics[metrics]

    Tasks --> TaskID[task-id/]
    TaskID --> Deliverables[deliverables]
    TaskID --> Confidence[confidence]
    TaskID --> Validation[validation]
    TaskID --> Feedback[feedback]

    Learning --> Patterns[patterns]
    Learning --> Errors[errors]
    Learning --> Successes[successes]

    Consensus --> RoundID[round-id/]
    RoundID --> Validators[validators]
    RoundID --> Votes[votes]
    RoundID --> Agreement[agreement]
    RoundID --> Decision[decision]

    Iterations --> RoundN[round-n/]
    RoundN --> IterFeedback[feedback]
    RoundN --> Changes[changes]
    RoundN --> Improvements[improvements]

    Results --> FinalDeliverable[final-deliverable]
    Results --> ValidationSummary[validation-summary]
    Results --> NextSteps[next-steps]

    style Root fill:#FFD700
    style SwarmID fill:#87CEEB
    style Agents fill:#E6E6FA
    style Consensus fill:#E6E6FA
    style Iterations fill:#E6E6FA
    style Results fill:#E6E6FA
```

---

## 9. Agent Spawning Process

Swarm initialization, agent type selection, task distribution, and coordination setup.

```mermaid
flowchart TD
    Start([Begin Agent<br/>Spawning]) --> AnalyzeTask[Analyze Task<br/>Complexity]

    AnalyzeTask --> CountSteps[Count Required Steps]
    CountSteps --> DetermineComplexity{Task<br/>Complexity?}

    DetermineComplexity -->|3-5 steps| SimpleTask[Simple Task<br/>2-3 agents]
    DetermineComplexity -->|6-10 steps| MediumTask[Medium Task<br/>4-6 agents]
    DetermineComplexity -->|11-20 steps| ComplexTask[Complex Task<br/>8-12 agents]
    DetermineComplexity -->|20+ steps| EnterpriseTask[Enterprise Task<br/>15-20 agents]

    SimpleTask --> SelectAgentTypes
    MediumTask --> SelectAgentTypes
    ComplexTask --> SelectAgentTypes
    EnterpriseTask --> SelectAgentTypes[Select Agent Types<br/>Based on Task Needs]

    SelectAgentTypes --> CoreTeam{Core Team<br/>Always Include}
    CoreTeam --> Coder[coder]
    CoreTeam --> Tester[tester]
    CoreTeam --> Reviewer[reviewer]

    SelectAgentTypes --> SpecializedTeam{Specialized Team<br/>Task-Specific}
    SpecializedTeam --> BackendDev[backend-dev]
    SpecializedTeam --> SecuritySpec[security-specialist]
    SpecializedTeam --> SystemArch[system-architect]
    SpecializedTeam --> PerfAnalyzer[perf-analyzer]
    SpecializedTeam --> DevOps[devops-engineer]
    SpecializedTeam --> APIDocs[api-docs]

    Coder --> DetermineCount
    Tester --> DetermineCount
    Reviewer --> DetermineCount
    BackendDev --> DetermineCount
    SecuritySpec --> DetermineCount
    SystemArch --> DetermineCount
    PerfAnalyzer --> DetermineCount
    DevOps --> DetermineCount
    APIDocs --> DetermineCount[Determine Agent Count]

    DetermineCount --> SelectTopology{Agent Count<br/>Determines Topology}

    SelectTopology -->|2-7 agents| MeshTopo[Topology: mesh<br/>Peer-to-peer coordination]
    SelectTopology -->|8+ agents| HierarchicalTopo[Topology: hierarchical<br/>Coordinator-led structure]

    MeshTopo --> InitSwarm
    HierarchicalTopo --> InitSwarm[MANDATORY: Initialize Swarm<br/>swarm_init]

    InitSwarm --> SwarmConfig[Swarm Configuration:<br/>topology maxAgents strategy]
    SwarmConfig --> SetupMemory[Setup SwarmMemory<br/>Shared State]
    SetupMemory --> PrepareByzantine[Prepare Byzantine<br/>Consensus Infrastructure]

    PrepareByzantine --> DistributeTasks[Distribute Tasks<br/>to Agents]

    DistributeTasks --> AssignNonOverlapping[Assign Non-Overlapping<br/>Responsibilities]

    AssignNonOverlapping --> GenerateInstructions[Generate Specific<br/>Instructions per Agent]

    GenerateInstructions --> BatchSpawn{Spawn ALL Agents<br/>in SINGLE Message?}

    BatchSpawn -->|Yes CORRECT| SpawnBatch[Spawn All Agents<br/>Concurrently via Task tool]
    BatchSpawn -->|No WRONG| SpawnSequential[Sequential Spawning<br/>ANTI-PATTERN]

    SpawnSequential --> Warning[WARNING: Slower<br/>No Coordination<br/>Inconsistent Results]
    Warning --> SpawnBatch

    SpawnBatch --> EstablishCoordination[Establish Cross-Agent<br/>Coordination]

    EstablishCoordination --> EnableMemoryAccess[Enable SwarmMemory<br/>Access for All Agents]
    EnableMemoryAccess --> SetupByzantine[Setup Byzantine<br/>Voting Channels]
    SetupByzantine --> MonitorHealth[Setup Agent<br/>Health Monitoring]

    MonitorHealth --> SpawnComplete[Agent Spawning<br/>Complete]

    SpawnComplete --> ExitReady([Agents Ready<br/>for Execution])

    style Start fill:#90EE90
    style ExitReady fill:#90EE90
    style InitSwarm fill:#FFD700
    style SpawnBatch fill:#90EE90
    style SpawnSequential fill:#FF6B6B
    style Warning fill:#FF6B6B
```

**Agent Type Selection Matrix:**

```mermaid
flowchart LR
    TaskType[Task Type] --> Backend{Backend<br/>Work?}
    TaskType --> Frontend{Frontend<br/>Work?}
    TaskType --> Security{Security<br/>Sensitive?}
    TaskType --> Performance{Performance<br/>Critical?}
    TaskType --> Testing{Testing<br/>Required?}

    Backend -->|Yes| BackendDev[backend-dev<br/>api-docs<br/>database-specialist]
    Frontend -->|Yes| FrontendDev[frontend-dev<br/>mobile-dev]
    Security -->|Yes| SecurityTeam[security-specialist<br/>compliance-auditor]
    Performance -->|Yes| PerfTeam[perf-analyzer<br/>system-architect]
    Testing -->|Yes ALL TASKS| TestTeam[tester<br/>reviewer]

    BackendDev --> FinalTeam[Final Agent Team]
    FrontendDev --> FinalTeam
    SecurityTeam --> FinalTeam
    PerfTeam --> FinalTeam
    TestTeam --> FinalTeam

    FinalTeam --> CountAgents[Count Agents]
    CountAgents --> SelectTopo{Count?}
    SelectTopo -->|2-7| Mesh[mesh topology]
    SelectTopo -->|8+| Hierarchical[hierarchical topology]

    style TaskType fill:#FFD700
    style FinalTeam fill:#90EE90
    style TestTeam fill:#FF6B6B
```

---

## 10. Feedback Injection Pipeline

Feedback capture from consensus, sanitization, priority assignment, and injection into agent instructions.

```mermaid
flowchart TD
    Start([Consensus Validation<br/>FAILED]) --> CaptureFeedback[Capture Validator<br/>Feedback]

    CaptureFeedback --> ExtractValidators[Extract Feedback<br/>from Each Validator]

    ExtractValidators --> Validator1[Validator 1:<br/>reviewer feedback]
    ExtractValidators --> Validator2[Validator 2:<br/>security-specialist feedback]
    ExtractValidators --> Validator3[Validator 3:<br/>system-architect feedback]
    ExtractValidators --> Validator4[Validator 4:<br/>tester feedback]

    Validator1 --> ExtractIssues1[Extract Issues:<br/>Type Severity Location<br/>Recommendation]
    Validator2 --> ExtractIssues2[Extract Issues:<br/>Type Severity Location<br/>Recommendation]
    Validator3 --> ExtractIssues3[Extract Issues:<br/>Type Severity Location<br/>Recommendation]
    Validator4 --> ExtractIssues4[Extract Issues:<br/>Type Severity Location<br/>Recommendation]

    ExtractIssues1 --> AggregateFeedback[Aggregate All<br/>Validator Feedback]
    ExtractIssues2 --> AggregateFeedback
    ExtractIssues3 --> AggregateFeedback
    ExtractIssues4 --> AggregateFeedback

    AggregateFeedback --> SanitizeFeedback[Sanitize Feedback<br/>SECURITY: CVE-CFN-2025-002]

    SanitizeFeedback --> BlockPatterns[Block Malicious Patterns:<br/>IGNORE PREVIOUS<br/>SYSTEM:/ASSISTANT:<br/>ACT AS/PRETEND<br/>DISREGARD]

    BlockPatterns --> LengthLimit[Enforce Length Limit:<br/>max 5000 chars per feedback]
    LengthLimit --> SanitizeComplete[Sanitization Complete]

    SanitizeComplete --> CategorizeIssues[Categorize Issues<br/>by Type]

    CategorizeIssues --> TypeSecurity[Type: security]
    CategorizeIssues --> TypeTesting[Type: testing]
    CategorizeIssues --> TypeQuality[Type: quality]
    CategorizeIssues --> TypePerformance[Type: performance]
    CategorizeIssues --> TypeDocumentation[Type: documentation]

    TypeSecurity --> AssignPriority
    TypeTesting --> AssignPriority
    TypeQuality --> AssignPriority
    TypePerformance --> AssignPriority
    TypeDocumentation --> AssignPriority[Assign Priority<br/>Based on Severity]

    AssignPriority --> Critical{Severity:<br/>Critical?}
    AssignPriority --> High{Severity:<br/>High?}
    AssignPriority --> Medium{Severity:<br/>Medium?}
    AssignPriority --> Low{Severity:<br/>Low?}

    Critical -->|Yes| PrioCritical[Priority: critical<br/>Weight: 1.0<br/>Must Fix Immediately]
    High -->|Yes| PrioHigh[Priority: high<br/>Weight: 0.8<br/>Important]
    Medium -->|Yes| PrioMedium[Priority: medium<br/>Weight: 0.5<br/>Should Fix]
    Low -->|Yes| PrioLow[Priority: low<br/>Weight: 0.3<br/>Nice to Have]

    PrioCritical --> Deduplicate
    PrioHigh --> Deduplicate
    PrioMedium --> Deduplicate
    PrioLow --> Deduplicate[Deduplicate Issues<br/>vs Previous Iterations]

    Deduplicate --> GenerateKey[Generate Issue Key:<br/>type:severity:message:location]
    GenerateKey --> CheckRegistry{Key Exists<br/>in Registry?}

    CheckRegistry -->|Yes Duplicate| MarkRecurring[Mark as Recurring<br/>Increment Occurrence Count]
    CheckRegistry -->|No New| AddToRegistry[Add to<br/>Deduplication Registry]

    MarkRecurring --> CheckLRU
    AddToRegistry --> CheckLRU{Registry Size<br/>> 100?}

    CheckLRU -->|Yes| EvictOldest[Evict Oldest Entry<br/>LRU Policy]
    CheckLRU -->|No| GenerateActionable[Generate Actionable<br/>Steps]
    EvictOldest --> GenerateActionable

    GenerateActionable --> FormatSteps[Format Steps:<br/>Action Target Agent<br/>Estimated Effort]

    FormatSteps --> SortByPriority[Sort by Priority:<br/>Critical > High > Medium > Low]

    SortByPriority --> GenerateSections[Generate Injection<br/>Sections]

    GenerateSections --> CriticalSection[CRITICAL ISSUES<br/>Must Fix Immediately]
    GenerateSections --> HighSection[High Priority Issues]
    GenerateSections --> MediumSection[Medium Priority Issues]
    GenerateSections --> LowSection[Low Priority Issues]
    GenerateSections --> ValidatorSection[Validator Feedback<br/>Details]
    GenerateSections --> LearningSection[Learnings from<br/>Previous Iterations]

    CriticalSection --> FormatMarkdown
    HighSection --> FormatMarkdown
    MediumSection --> FormatMarkdown
    LowSection --> FormatMarkdown
    ValidatorSection --> FormatMarkdown
    LearningSection --> FormatMarkdown[Format as Markdown]

    FormatMarkdown --> InjectIntoInstructions[Inject into Agent<br/>Instructions]

    InjectIntoInstructions --> PrependFeedback[Prepend Feedback<br/>Before Original Task]

    PrependFeedback --> TargetAgents[Target Specific Agents<br/>Based on Issue Type]

    TargetAgents --> SecurityIssues{Security<br/>Issues?}
    TargetAgents --> TestIssues{Testing<br/>Issues?}
    TargetAgents --> QualityIssues{Quality<br/>Issues?}

    SecurityIssues -->|Yes| TargetSecurity[Inject into:<br/>security-specialist<br/>backend-dev]
    TestIssues -->|Yes| TargetTester[Inject into:<br/>tester]
    QualityIssues -->|Yes| TargetCoder[Inject into:<br/>coder<br/>reviewer]

    TargetSecurity --> StoreInMemory
    TargetTester --> StoreInMemory
    TargetCoder --> StoreInMemory[Store Feedback<br/>in SwarmMemory]

    StoreInMemory --> FeedbackKey[Memory Key:<br/>swarm/iterations/round-n/feedback]
    FeedbackKey --> StoreLRU[Store with LRU:<br/>max 100 entries per phase]

    StoreLRU --> InjectComplete[Feedback Injection<br/>Complete]

    InjectComplete --> ExitRelaunch([Return to Loop 2:<br/>Relaunch Primary Swarm<br/>with Injected Feedback])

    style Start fill:#FFB6C1
    style ExitRelaunch fill:#87CEEB
    style SanitizeFeedback fill:#FF6B6B
    style BlockPatterns fill:#FF6B6B
    style PrioCritical fill:#FF0000
    style PrioHigh fill:#FFA500
    style PrioMedium fill:#FFD700
    style PrioLow fill:#90EE90
    style InjectComplete fill:#90EE90
```

**Feedback Deduplication Process:**

```mermaid
flowchart TD
    Start([New Issue<br/>from Validator]) --> GenerateKey[Generate Unique Key<br/>type:severity:message:location]

    GenerateKey --> HashKey[Hash Key:<br/>SHA-256]

    HashKey --> CheckRegistry{Key in<br/>Registry?}

    CheckRegistry -->|New| AddRegistry[Add to Registry<br/>occurrence = 1]
    CheckRegistry -->|Exists| IncrementOccurrence[Increment<br/>Occurrence Count]

    AddRegistry --> CheckSize{Registry<br/>Size > 100?}
    IncrementOccurrence --> MarkRecurring[Mark as<br/>Recurring Issue]

    CheckSize -->|Yes| EvictOldest[Evict Oldest Entry<br/>LRU Policy]
    CheckSize -->|No| ReturnUnique[Return:<br/>Unique Issue]

    EvictOldest --> ReturnUnique
    MarkRecurring --> ReturnDuplicate[Return:<br/>Duplicate Filtered]

    ReturnUnique --> IncludeInFeedback[Include in<br/>Feedback Injection]
    ReturnDuplicate --> ExcludeFromFeedback[Exclude from<br/>Feedback Injection<br/>Log Recurrence]

    IncludeInFeedback --> ExitInclude([Proceed to<br/>Injection])
    ExcludeFromFeedback --> ExitExclude([Skip Issue])

    style Start fill:#90EE90
    style ExitInclude fill:#90EE90
    style ExitExclude fill:#FFE6B3
    style ReturnDuplicate fill:#FFB6C1
```

---

## Appendix: Flow Interaction Summary

**How Flows Connect:**

1. **Overall CFN Loop** → Calls **Loop 2** and **Loop 3**
2. **Loop 2** → Uses **Confidence Score Calculation** for gate decision
3. **Loop 3** → Uses **Confidence Score Calculation** for validator assessments
4. **Loop 3 Failure** → Triggers **Feedback Injection Pipeline**
5. **Feedback Injection** → Stores in **Memory Coordination**
6. **Loop 2/Loop 3** → Protected by **Circuit Breaker State Machine**
7. **All Loops** → Begin with **Agent Spawning Process**

**Key Integration Points:**

```mermaid
graph LR
    Overall[Overall CFN Loop] --> Loop2[Loop 2: Execution]
    Overall --> Loop3[Loop 3: Consensus]

    Loop2 --> Confidence[Confidence Score<br/>Calculation]
    Loop3 --> Confidence

    Loop3 --> Feedback[Feedback Injection<br/>Pipeline]
    Feedback --> Memory[Memory<br/>Coordination]

    Overall --> Circuit[Circuit Breaker<br/>State Machine]
    Loop2 --> Circuit
    Loop3 --> Circuit

    Overall --> AgentSpawn[Agent Spawning<br/>Process]
    Loop2 --> AgentSpawn
    Loop3 --> AgentSpawn

    Memory --> Loop2
    Memory --> Loop3

    style Overall fill:#FFD700
    style Loop2 fill:#E6E6FA
    style Loop3 fill:#E6E6FA
    style Confidence fill:#87CEEB
    style Feedback fill:#FFB6C1
    style Memory fill:#90EE90
    style Circuit fill:#FFA500
    style AgentSpawn fill:#E6FFE6
```

---

## Quick Reference: Decision Gates

| Gate | Location | Threshold | Pass Criteria | Fail Action |
|------|----------|-----------|---------------|-------------|
| **GATE 1** | Loop 2 | ≥ 0.75 | `min(confidence) ≥ 0.75` | Collect feedback → Retry (max 10) or Escalate |
| **GATE 2** | Loop 3 | ≥ 0.90 | `agreement ≥ 0.90 AND avg_conf ≥ 0.90 AND no_critical_issues` | Inject feedback → Return to Loop 2 (max 10) or Escalate |

---

## Quick Reference: Iteration Limits

| Loop | Max Iterations | Default Threshold | Escalation Trigger |
|------|----------------|-------------------|-------------------|
| **Loop 2** (Self-Validation) | 3 | Confidence ≥ 0.75 | 3 failures → Proceed to Loop 3 with warnings |
| **Loop 3** (Consensus) | 10 | Agreement ≥ 0.90 | 10 failures → Escalate to human with Next Steps Guidance |

---

## Quick Reference: Memory Namespaces

| Namespace | Purpose | Example Key |
|-----------|---------|-------------|
| `swarm/{agent}/{task}` | Agent task deliverables | `swarm/backend-dev/jwt-auth` |
| `swarm/consensus/{round}` | Consensus validation results | `swarm/consensus/round-5` |
| `swarm/iterations/round-{n}` | Iteration feedback | `swarm/iterations/round-3/feedback` |
| `swarm/{agent}/learning/patterns` | Learning patterns | `swarm/backend-dev/learning/patterns` |

---

**End of CFN Loop Flowcharts Documentation**

For additional information, see:
- [CFN Loop Documentation](/mnt/c/Users/masha/Documents/claude-flow-novice/docs/CFN_LOOP.md)
- [CFN Loop Implementation](/mnt/c/Users/masha/Documents/claude-flow-novice/src/cfn-loop/README.md)
- [Main CLAUDE.md](/mnt/c/Users/masha/Documents/claude-flow-novice/CLAUDE.md)
