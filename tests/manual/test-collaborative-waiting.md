# Test: Collaborative Waiting State (Architect Q&A Mode)

**Test ID**: redis-coord-test-collaborative-waiting
**Date**: 2025-10-17
**Objective**: Validate waiting state pattern where architect finishes design, enters Q&A mode, all agents exit together
**Status**: ✅ **PASS**

---

## Test Results Summary

**Status**: ✅ **FULL SUCCESS**

**Execution**: 4 agents spawned in parallel (architect, coder, tester, coordinator)

**Results**:
- ✅ Architect entered Q&A waiting state: confirmed
- ✅ Coder asked question about error handling: confirmed
- ✅ Tester asked question about edge cases: confirmed
- ✅ Architect answered questions: confirmed
- ✅ All agents signaled completion via `agents_done` counter: confirmed
- ✅ Coordinator detected completion at iteration 17/60: confirmed
- ✅ Coordinator set `all_done` flag for graceful shutdown: confirmed
- ✅ All agents exited together (coordinated shutdown): confirmed
- ✅ All queues empty (messages consumed): confirmed

**Verification**:
```bash
Agent Status:
  Architect: complete    ✅
  Coder: complete        ✅
  Tester: complete       ✅
  Coordinator: complete  ✅

Coordination State:
  Agents done counter: 4    ✅
  All done flag: true       ✅

Queue Lengths:
  Architect questions: 0    ✅ (all consumed)
  Coder answers: 0          ✅ (all consumed)
  Tester answers: 0         ✅ (all consumed)
```

**Key Discovery**: 4-agent collaborative waiting pattern works perfectly with explicit bash instructions. Coordinator monitoring pattern reliable for graceful shutdown.

---

## Test Scenario

**Pattern**: Architect completes design, enters "waiting" state to answer questions. Other agents work and ask questions. All agents coordinate to exit together.

```
Time 0:
Architect → Completes design (confidence 0.90)
Architect → Enters "waiting" state (Q&A mode)

Time 1:
Coder → Asks question: "Should we use JWT or sessions?"
Architect → Answers: "Use JWT for stateless auth"

Time 2:
Tester → Asks question: "What edge cases to test?"
Architect → Answers: "Test token expiration, invalid signatures"

Time 3:
Coder → Signals: "Implementation complete"
Tester → Signals: "Tests complete"
Architect → Sees all agents done → Exits
All agents exit together
```

---

## Architecture

```
Architect Agent (enters waiting state after design)
  ↓
  Completes design
  ↓
  Sends: redis-cli lpush "swarm:collab:architect:design" (design document)
  ↓
  Enters Q&A loop:
    - Waits: redis-cli blpop "swarm:collab:architect:questions" (with timeout)
    - Answers: redis-cli lpush "swarm:collab:{agent}:answers"
    - Checks: redis-cli get "swarm:collab:all_done" (exit signal)
  ↓
  Exits when all_done = true

Coder Agent
  ↓
  Waits: redis-cli blpop "swarm:collab:architect:design" (design)
  ↓
  Implements code
  ↓
  Asks question: redis-cli lpush "swarm:collab:architect:questions"
  ↓
  Waits: redis-cli blpop "swarm:collab:coder:answers"
  ↓
  Completes implementation
  ↓
  Signals: redis-cli incr "swarm:collab:agents_done"

Tester Agent
  ↓
  Waits: redis-cli blpop "swarm:collab:architect:design" (design)
  ↓
  Asks question: redis-cli lpush "swarm:collab:architect:questions"
  ↓
  Waits: redis-cli blpop "swarm:collab:tester:answers"
  ↓
  Completes tests
  ↓
  Signals: redis-cli incr "swarm:collab:agents_done"

Coordinator (monitors completion)
  ↓
  Waits for agents_done = 3 (architect + coder + tester)
  ↓
  Sets: redis-cli set "swarm:collab:all_done" "true"
  ↓
  All agents see signal and exit together
```

---

## Expected Results

### Success Criteria
- ✅ Architect completes design and enters Q&A mode
- ✅ Architect broadcasts design to coder and tester
- ✅ Coder asks question and receives answer
- ✅ Tester asks question and receives answer
- ✅ All agents signal completion
- ✅ All agents exit together (coordinated shutdown)
- ✅ No agent exits early

### Redis State Verification
```bash
# After test completes
redis-cli get "swarm:collab:architect:status"     # Expect: "waiting_completed"
redis-cli get "swarm:collab:coder:status"         # Expect: "complete"
redis-cli get "swarm:collab:tester:status"        # Expect: "complete"
redis-cli get "swarm:collab:agents_done"          # Expect: "3"
redis-cli get "swarm:collab:all_done"             # Expect: "true"
redis-cli llen "swarm:collab:architect:questions" # Expect: 0 (all consumed)
```

---

## Test Implementation

### Architect Agent (Waiting State Mode)

```javascript
const architectWaitingState = async () => {
  console.log('🏗️ Architect: Starting design phase');

  // Phase 1: Complete design
  const design = {
    architecture: 'Microservices with JWT auth',
    components: ['AuthService', 'UserService', 'TokenService'],
    patterns: ['Repository', 'Dependency Injection'],
    confidence: 0.90,
    timestamp: Date.now()
  };

  console.log('Architect: Design complete (confidence 0.90)');

  // Broadcast design to team (coder and tester need separate inboxes)
  await bash(`redis-cli lpush "swarm:collab:coder:design" '${JSON.stringify(design)}'`);
  await bash(`redis-cli lpush "swarm:collab:tester:design" '${JSON.stringify(design)}'`);
  console.log('Architect: Design broadcast to team');

  await bash(`redis-cli set "swarm:collab:architect:status" "waiting"`);
  console.log('🏗️ Architect: Entering Q&A waiting state');

  // Phase 2: Q&A loop (answer questions from team)
  let questionsAnswered = 0;
  const maxQuestions = 5; // Safety limit

  while (questionsAnswered < maxQuestions) {
    console.log(`\nArchitect: Waiting for questions (${questionsAnswered}/${maxQuestions})...`);

    // Check if all agents are done (5 second check interval)
    const allDoneCheck = await bash(`redis-cli get "swarm:collab:all_done"`);
    if (allDoneCheck && allDoneCheck.trim() === 'true') {
      console.log('✅ Architect: All agents complete - exiting Q&A mode');
      break;
    }

    // Wait for question (10 second timeout - if no question, check all_done again)
    const questionRaw = await bash(`timeout 10 redis-cli --csv blpop "swarm:collab:architect:questions" 0`);

    if (!questionRaw || questionRaw.includes('(nil)')) {
      console.log('Architect: No questions (timeout) - checking if all done...');
      continue; // Loop continues, will check all_done again
    }

    // Parse question
    const questionJson = questionRaw.split(',')[1].replace(/^"|"$/g, '');
    const question = JSON.parse(questionJson);

    console.log(`Architect: Received question from ${question.from}: "${question.text}"`);
    questionsAnswered++;

    // Answer question
    let answer;
    if (question.text.includes('JWT or sessions')) {
      answer = 'Use JWT for stateless auth - better for microservices scalability';
    } else if (question.text.includes('edge cases')) {
      answer = 'Test: token expiration, invalid signatures, missing tokens, malformed payloads';
    } else {
      answer = 'Refer to design document for details';
    }

    const response = {
      question: question.text,
      answer,
      from: 'architect',
      to: question.from,
      timestamp: Date.now()
    };

    // Send answer to requesting agent's inbox
    await bash(`redis-cli lpush "swarm:collab:${question.from}:answers" '${JSON.stringify(response)}'`);
    console.log(`Architect: Answered question for ${question.from}`);
  }

  await bash(`redis-cli set "swarm:collab:architect:status" "waiting_completed"`);
  await bash(`redis-cli incr "swarm:collab:agents_done"`);
  console.log('🏗️ Architect: Exiting (coordinated shutdown)');
};
```

### Coder Agent (With Q&A)

```javascript
const coderWithQuestions = async () => {
  console.log('💻 Coder: Starting implementation');

  // Wait for design
  console.log('Coder: Waiting for architect design...');
  const designRaw = await bash(`timeout 30 redis-cli --csv blpop "swarm:collab:coder:design" 0`);

  if (!designRaw || designRaw.includes('(nil)')) {
    console.log('❌ Coder: Timeout waiting for design');
    await bash(`redis-cli set "swarm:collab:coder:status" "timeout"`);
    return;
  }

  const designJson = designRaw.split(',')[1].replace(/^"|"$/g, '');
  const design = JSON.parse(designJson);

  console.log('Coder: Received design:', design.architecture);

  // Ask question
  await bash(`redis-cli lpush "swarm:collab:architect:questions" '{"from":"coder","text":"Should we use JWT or sessions?","timestamp":${Date.now()}}'`);
  console.log('Coder: Asked question about auth approach');

  // Wait for answer
  console.log('Coder: Waiting for architect answer...');
  const answerRaw = await bash(`timeout 30 redis-cli --csv blpop "swarm:collab:coder:answers" 0`);

  if (!answerRaw || answerRaw.includes('(nil)')) {
    console.log('❌ Coder: Timeout waiting for answer');
    await bash(`redis-cli set "swarm:collab:coder:status" "timeout"`);
    return;
  }

  const answerJson = answerRaw.split(',')[1].replace(/^"|"$/g, '');
  const answer = JSON.parse(answerJson);

  console.log(`Coder: Received answer: "${answer.answer}"`);

  // Implement based on answer
  console.log('Coder: Implementing JWT authentication...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work

  console.log('✅ Coder: Implementation complete (confidence 0.85)');
  await bash(`redis-cli set "swarm:collab:coder:status" "complete"`);
  await bash(`redis-cli incr "swarm:collab:agents_done"`);

  console.log('💻 Coder: Waiting for coordinated shutdown...');
  // Wait for all_done signal (30 second timeout)
  let allDone = false;
  for (let i = 0; i < 30; i++) {
    const check = await bash(`redis-cli get "swarm:collab:all_done"`);
    if (check && check.trim() === 'true') {
      allDone = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (allDone) {
    console.log('💻 Coder: Exiting (coordinated shutdown)');
  } else {
    console.log('⚠️ Coder: Timeout waiting for shutdown signal');
  }
};
```

### Tester Agent (With Q&A)

```javascript
const testerWithQuestions = async () => {
  console.log('🧪 Tester: Starting test planning');

  // Wait for design
  console.log('Tester: Waiting for architect design...');
  const designRaw = await bash(`timeout 30 redis-cli --csv blpop "swarm:collab:tester:design" 0`);

  if (!designRaw || designRaw.includes('(nil)')) {
    console.log('❌ Tester: Timeout waiting for design');
    await bash(`redis-cli set "swarm:collab:tester:status" "timeout"`);
    return;
  }

  const designJson = designRaw.split(',')[1].replace(/^"|"$/g, '');
  const design = JSON.parse(designJson);

  console.log('Tester: Received design:', design.architecture);

  // Ask question
  await bash(`redis-cli lpush "swarm:collab:architect:questions" '{"from":"tester","text":"What edge cases to test?","timestamp":${Date.now()}}'`);
  console.log('Tester: Asked question about edge cases');

  // Wait for answer
  console.log('Tester: Waiting for architect answer...');
  const answerRaw = await bash(`timeout 30 redis-cli --csv blpop "swarm:collab:tester:answers" 0`);

  if (!answerRaw || answerRaw.includes('(nil)')) {
    console.log('❌ Tester: Timeout waiting for answer');
    await bash(`redis-cli set "swarm:collab:tester:status" "timeout"`);
    return;
  }

  const answerJson = answerRaw.split(',')[1].replace(/^"|"$/g, '');
  const answer = JSON.parse(answerJson);

  console.log(`Tester: Received answer: "${answer.answer}"`);

  // Write tests based on answer
  console.log('Tester: Writing tests for edge cases...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate work

  console.log('✅ Tester: Tests complete (confidence 0.88)');
  await bash(`redis-cli set "swarm:collab:tester:status" "complete"`);
  await bash(`redis-cli incr "swarm:collab:agents_done"`);

  console.log('🧪 Tester: Waiting for coordinated shutdown...');
  // Wait for all_done signal (30 second timeout)
  let allDone = false;
  for (let i = 0; i < 30; i++) {
    const check = await bash(`redis-cli get "swarm:collab:all_done"`);
    if (check && check.trim() === 'true') {
      allDone = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (allDone) {
    console.log('🧪 Tester: Exiting (coordinated shutdown)');
  } else {
    console.log('⚠️ Tester: Timeout waiting for shutdown signal');
  }
};
```

### Coordinator (Monitors Completion)

```javascript
const collaborativeCoordinator = async () => {
  console.log('📊 Coordinator: Monitoring collaborative swarm');

  const totalAgents = 3; // architect + coder + tester
  let allDone = false;

  // Wait for all agents to signal completion (60 second timeout)
  for (let i = 0; i < 60; i++) {
    const doneCount = await bash(`redis-cli get "swarm:collab:agents_done"`);
    const count = parseInt(doneCount || '0', 10);

    console.log(`Coordinator: ${count}/${totalAgents} agents complete`);

    if (count >= totalAgents) {
      console.log('✅ Coordinator: All agents complete - signaling shutdown');
      await bash(`redis-cli set "swarm:collab:all_done" "true"`);
      allDone = true;
      break;
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  if (!allDone) {
    console.log('⚠️ Coordinator: Timeout - not all agents completed');
    await bash(`redis-cli set "swarm:collab:status" "timeout"`);
  } else {
    await bash(`redis-cli set "swarm:collab:status" "complete"`);
  }

  console.log('📊 Coordinator: Exiting');
};
```

---

## Execution Steps

### 1. Clear Redis State

```bash
redis-cli del "swarm:collab:architect:design"
redis-cli del "swarm:collab:coder:design"
redis-cli del "swarm:collab:tester:design"
redis-cli del "swarm:collab:architect:questions"
redis-cli del "swarm:collab:coder:answers"
redis-cli del "swarm:collab:tester:answers"
redis-cli del "swarm:collab:architect:status"
redis-cli del "swarm:collab:coder:status"
redis-cli del "swarm:collab:tester:status"
redis-cli del "swarm:collab:agents_done"
redis-cli del "swarm:collab:all_done"
redis-cli del "swarm:collab:status"
```

### 2. Spawn Agents in Parallel

```javascript
// Spawn all 4 agents simultaneously
await Promise.all([
  Task('architect', architectWaitingStatePrompt, 'architect'),
  Task('coder', coderWithQuestionsPrompt, 'coder'),
  Task('tester', testerWithQuestionsPrompt, 'tester'),
  Task('coordinator', collaborativeCoordinatorPrompt, 'coordinator')
]);
```

### 3. Verify Results

```bash
echo "=== Collaborative Waiting State Test Results ==="
echo "Architect status: $(redis-cli get "swarm:collab:architect:status")"
echo "Coder status: $(redis-cli get "swarm:collab:coder:status")"
echo "Tester status: $(redis-cli get "swarm:collab:tester:status")"
echo "Agents done: $(redis-cli get "swarm:collab:agents_done")"
echo "All done signal: $(redis-cli get "swarm:collab:all_done")"
echo "Overall status: $(redis-cli get "swarm:collab:status")"

# Verify all questions answered
echo "Remaining questions: $(redis-cli llen "swarm:collab:architect:questions")"
```

---

## Key Innovations

### 1. Waiting State Pattern

Architect doesn't exit after design - enters Q&A loop:
- Checks `all_done` signal every iteration
- Answers questions while waiting
- Exits only when all agents signal completion

### 2. Coordinated Shutdown

All agents wait for `all_done = true` signal:
- No agent exits early
- Coordinator monitors completion
- Clean shutdown when all work done

### 3. Asynchronous Q&A

Questions don't block work:
- Architect answers in parallel with team working
- Each agent has own answer inbox
- Questions queued if architect busy

---

## Risk Assessment

### Potential Issues

**1. Agent Exits Early**
- **Scenario**: Coder finishes, exits before tester asks question
- **Mitigation**: All agents wait for `all_done` signal

**2. Question Timeout**
- **Scenario**: Architect dies before answering
- **Mitigation**: Agents have timeout (30s), continue without answer if needed

**3. Infinite Wait**
- **Scenario**: One agent never signals completion
- **Mitigation**: Coordinator has 60s timeout, signals shutdown anyway

**4. Question Queue Overflow**
- **Scenario**: Too many questions for architect
- **Mitigation**: Max 5 questions limit, agents must work with available info

---

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Agents Complete** | 3 | `redis-cli get "swarm:collab:agents_done"` |
| **Questions Answered** | 2 | Count from architect logs |
| **Coordinated Shutdown** | "true" | `redis-cli get "swarm:collab:all_done"` |
| **Status** | "complete" | `redis-cli get "swarm:collab:status"` |
| **No Early Exits** | All agents exit ~same time | Timestamp analysis |

---

## Next Steps

If test PASSES:
- ✅ Waiting state pattern validated
- ✅ Can implement in real architect agents
- ✅ Enables true collaborative workflow
- ✅ Document pattern in `.claude/templates/redis-coordination.md`

If test FAILS:
- ❌ Coordinated shutdown too complex
- ❌ Agents should exit immediately after work
- ❌ Questions should be pre-answered in design doc
