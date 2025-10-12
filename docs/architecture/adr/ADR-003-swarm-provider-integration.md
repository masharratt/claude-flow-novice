# ADR-003: SwarmCoordinator + ProviderManager Integration for Real Agent Execution

**Status:** Proposed
**Date:** 2025-10-12
**Architect:** Claude (Architect Agent)
**Epic:** Swarm Real Execution Integration
**Decision Makers:** Technical Lead, Platform Architect

---

## Context

SwarmCoordinator currently uses `simulateTaskExecution()` to mock agent execution instead of spawning real Z.ai-powered agents. This limits the system to simulation mode and prevents real agent coordination, tool usage, and production deployment.

### Current Limitations
1. **No Real LLM Execution**: Tasks are mocked with timeouts, not actual LLM reasoning
2. **No Tool Access**: Agents cannot read files, execute bash, or coordinate via Redis/SQLite
3. **No Conversation State**: Each task is stateless; no multi-turn conversations
4. **No Result Extraction**: Mock results don't reflect actual agent work
5. **No Mesh Coordination**: Cannot test 70-agent mesh with real execution

### Requirements
- Real Z.ai-powered agent execution via ProviderManager
- Tool provisioning (Read, Write, Edit, Bash, Redis pub/sub, SQLite memory)
- Support 70+ concurrent agents in mesh topology
- <500ms agent spawn time, <2s simple task completion
- Security-first design with sandboxing and ACL enforcement

---

## Decision

We will create an **AgentExecutor** bridge class that integrates SwarmCoordinator with ProviderManager, along with supporting infrastructure for tool provisioning, conversation management, and response parsing.

### Core Components

#### 1. AgentExecutor
**Purpose:** Bridge between SwarmCoordinator and ProviderManager

**Responsibilities:**
- Manage agent execution lifecycle
- Coordinate tool provisioning via AgentToolkit
- Maintain conversation state via ConversationManager
- Build prompts via AgentPromptBuilder
- Parse responses via ResponseParser

**Integration Point:**
```typescript
// SwarmCoordinator (before)
private async simulateTaskExecution(task, agent) {
  return new Promise(resolve => setTimeout(resolve, 2000));
}

// SwarmCoordinator (after)
private async executeTask(task, agent) {
  const executor = new AgentExecutor(
    this.providerManager,
    this.toolkit,
    this.conversationManager,
    this.promptBuilder,
    this.responseParser,
    this.context
  );
  return await executor.executeTask(task, agent);
}
```

#### 2. AgentToolkit
**Purpose:** Provide sandboxed tools to agents

**Tool Categories:**
- **File Operations**: read, write, edit (with path validation)
- **Bash Execution**: bash (with command whitelisting)
- **Redis Pub/Sub**: redis_publish, redis_subscribe
- **SQLite Memory**: memory_store, memory_get (with ACL enforcement)

**Security Controls:**
- Path validation (prevent directory traversal)
- Command whitelisting (only safe bash commands)
- Input sanitization (remove script injection patterns)
- Resource limits (file size, execution time, memory)
- ACL enforcement (5-level access control)

#### 3. ConversationManager
**Purpose:** Manage stateful LLM conversations

**Features:**
- Multi-turn conversation support
- Tool call history tracking
- Context window management (200K tokens for Claude)
- Conversation replay for debugging

#### 4. AgentPromptBuilder
**Purpose:** Construct agent-specific prompts

**Prompt Structure:**
1. Agent identity (name, type, capabilities)
2. Task definition (name, type, description, instructions)
3. Available tools (descriptions, parameters, usage examples)
4. Quality requirements (confidence threshold, testing/review flags)
5. Output format (structured JSON response template)

#### 5. ResponseParser
**Purpose:** Extract task results from agent responses

**Parsing Strategy:**
1. JSON extraction (preferred method)
2. Markdown code block extraction
3. Natural language inference (fallback)

---

## Alternatives Considered

### Alternative 1: Direct ProviderManager Integration
**Approach:** SwarmCoordinator calls ProviderManager directly without intermediary

**Pros:**
- Simpler architecture
- Fewer classes to maintain

**Cons:**
- Tight coupling between coordinator and provider
- No separation of concerns for tools, prompts, parsing
- Harder to test and mock
- No reusability of execution logic

**Decision:** ❌ Rejected - violates separation of concerns

### Alternative 2: MCP Tool Integration
**Approach:** Use Model Context Protocol (MCP) for tool provisioning

**Pros:**
- Standard protocol for tool calling
- Rich tool ecosystem

**Cons:**
- MCP deprecated in v2.0.0 (per project guidelines)
- Adds external dependency
- Z.ai may not fully support MCP
- Over-engineering for internal tools

**Decision:** ❌ Rejected - MCP deprecated, unnecessary complexity

### Alternative 3: Native Function Calling
**Approach:** Use Anthropic's native function calling API

**Pros:**
- Structured tool calls
- Built-in validation
- Type safety

**Cons:**
- Z.ai may not support full function calling
- Less flexible than system prompts
- Vendor lock-in to Anthropic format

**Decision:** ⚠️ Deferred - use system prompts initially, upgrade to function calling if Z.ai adds support

### Alternative 4: Agent-as-Service (Separate Processes)
**Approach:** Spawn agents as separate Node.js processes with IPC

**Pros:**
- Complete isolation
- Crash resilience
- Parallel execution

**Cons:**
- High overhead (>1s spawn time)
- Complex IPC coordination
- Resource intensive (70+ processes)
- Debugging difficulty

**Decision:** ❌ Rejected - too slow, too complex for 70-agent mesh

---

## Consequences

### Positive Consequences

#### 1. Real Agent Execution
- ✅ SwarmCoordinator can spawn real Z.ai-powered agents
- ✅ Agents can reason, plan, and execute tasks using LLM capabilities
- ✅ Production-ready agent coordination system

#### 2. Tool Access
- ✅ Agents can read/write files, execute bash, coordinate via Redis/SQLite
- ✅ Full autonomy for agents to accomplish complex tasks
- ✅ Enables realistic agent workflows (code generation, testing, review)

#### 3. Security by Design
- ✅ Path validation prevents directory traversal attacks
- ✅ Command whitelisting prevents arbitrary code execution
- ✅ ACL enforcement protects sensitive memory
- ✅ Input sanitization prevents injection attacks
- ✅ Resource limits prevent DoS attacks

#### 4. Performance
- ✅ <500ms agent spawn time (in-process execution)
- ✅ <2s simple task completion (Hello World)
- ✅ 70+ concurrent agents supported (lightweight architecture)
- ✅ Efficient tool execution (<100ms average)

#### 5. Testability
- ✅ Modular design allows unit testing of each component
- ✅ Mock-friendly interfaces for integration testing
- ✅ Clear separation enables performance benchmarking
- ✅ Conversation replay aids debugging

### Negative Consequences

#### 1. Increased Complexity
- ⚠️ 5 new classes to maintain (AgentExecutor, Toolkit, ConversationManager, PromptBuilder, ResponseParser)
- ⚠️ More code paths to test
- **Mitigation:** Comprehensive unit and integration tests; clear documentation

#### 2. Z.ai Dependency
- ⚠️ Tight coupling to Z.ai API format (Anthropic Messages API)
- ⚠️ API changes could break integration
- **Mitigation:** Abstraction via ProviderManager; fallback to other providers

#### 3. Tool Call Parsing Fragility
- ⚠️ Regex-based tool extraction may fail on edge cases
- ⚠️ LLM may not follow tool format consistently
- **Mitigation:** Multiple parsing strategies (XML tags, JSON, fallback); error handling

#### 4. Conversation State Memory
- ⚠️ 70 agents × conversation history = significant memory usage
- ⚠️ Long-running tasks may hit context limits
- **Mitigation:** Sliding window (last 10 messages); conversation compression; TTL-based cleanup

#### 5. Security Surface
- ⚠️ Tool execution introduces new attack vectors
- ⚠️ Malicious agents could attempt privilege escalation
- **Mitigation:** Defense-in-depth (validation + sanitization + limits + ACL + audit logging)

---

## Implementation Strategy

### Phase 1: Core Infrastructure (Week 1)
- Create AgentExecutor, AgentToolkit, ConversationManager, AgentPromptBuilder, ResponseParser
- Unit tests for each class
- Integration test skeleton

### Phase 2: SwarmCoordinator Integration (Week 2)
- Replace `simulateTaskExecution()` with real execution
- Integrate AgentExecutor into task assignment flow
- Error handling and retry logic
- Metrics tracking

### Phase 3: Tool Implementation (Week 3)
- Implement file operation tools (read, write, edit)
- Implement bash execution with sandboxing
- Implement Redis pub/sub tools
- Implement SQLite memory tools with ACL
- Security validation and sanitization

### Phase 4: Testing & Validation (Week 4)
- 70-agent mesh coordination test
- Performance benchmarks (<500ms spawn, <2s task)
- Security penetration testing
- Load testing (sustained 100 agents)
- Documentation and examples

---

## Metrics & Success Criteria

### Performance Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Agent spawn time | <500ms | Time from `executeTask()` to first LLM call |
| Simple task completion | <2s | Hello World task end-to-end |
| Tool execution | <100ms | Average per tool call |
| Memory per agent | <50MB | Heap usage per conversation |
| Concurrent agents | 70+ | Sustained without degradation |
| Message throughput | 1000/sec | Redis pub/sub messages |

### Quality Metrics
| Metric | Target | Measurement |
|--------|--------|-------------|
| Test coverage | ≥80% | Lines of code covered |
| Security audit score | 0 high/critical | Static analysis + penetration testing |
| Uptime | ≥99.9% | Production availability |
| Error rate | <1% | Failed tasks / total tasks |
| Agent success rate | ≥90% | Completed tasks / assigned tasks |

### Acceptance Criteria
- ✅ 70-agent mesh coordination test passes
- ✅ All performance targets met
- ✅ Zero high/critical security vulnerabilities
- ✅ All unit and integration tests pass
- ✅ Documentation complete with examples

---

## Dependencies

### Existing Systems
1. **ProviderManager** (`src/providers/provider-manager.ts`)
   - Already implemented with Z.ai support
   - No changes required

2. **ZaiProvider** (`src/providers/zai-provider.ts`)
   - Working Anthropic-compatible endpoint
   - No changes required

3. **Redis** (coordination layer)
   - Pub/sub infrastructure available
   - Used for agent coordination

4. **SQLite Memory** (`src/sqlite/`)
   - Memory management system available
   - ACL enforcement implemented

### New Dependencies
1. **Node.js child_process** (for bash execution)
   - Built-in module, no installation needed

2. **fs/promises** (for async file operations)
   - Built-in module, no installation needed

---

## Risks & Mitigation

### Risk 1: Z.ai API Instability
**Impact:** High
**Probability:** Medium
**Mitigation:**
- Implement fallback to Anthropic/OpenAI providers
- Add retry logic with exponential backoff
- Circuit breaker pattern for API failures
- Comprehensive error handling

### Risk 2: Tool Execution Security Breach
**Impact:** Critical
**Probability:** Low
**Mitigation:**
- Defense-in-depth security controls
- Path validation, command whitelisting
- Input sanitization, resource limits
- ACL enforcement, audit logging
- Regular security audits

### Risk 3: Performance Degradation at Scale
**Impact:** High
**Probability:** Medium
**Mitigation:**
- Horizontal scaling support
- Connection pooling for providers
- Conversation state compression
- Tool result caching
- Load shedding under pressure

### Risk 4: Conversation Context Overflow
**Impact:** Medium
**Probability:** High
**Mitigation:**
- Sliding window (last 10 messages)
- Message compression for old history
- Context summarization
- Task decomposition for long-running work

### Risk 5: Tool Call Parsing Failures
**Impact:** Medium
**Probability:** Medium
**Mitigation:**
- Multiple parsing strategies (XML, JSON, fallback)
- LLM prompt engineering for consistent format
- Graceful degradation to natural language parsing
- Extensive testing with edge cases

---

## Open Questions

1. **Should we support streaming responses?**
   - **Recommendation:** Yes, for long-running tasks and better UX
   - **Implementation:** AgentExecutor can use `streamComplete()` from ProviderManager

2. **How to handle agent-to-agent communication?**
   - **Recommendation:** Redis pub/sub + SQLite memory
   - **Pattern:** Agents publish events to Redis, store state in SQLite with ACL

3. **Should we implement agent memory persistence across swarm restarts?**
   - **Recommendation:** Yes, SQLite already supports this
   - **Pattern:** Store conversation state in SQLite with TTL

4. **How to handle tool execution timeouts?**
   - **Recommendation:** Tool-specific timeouts (30s for bash, 5s for file ops)
   - **Pattern:** AbortController for async operations

5. **Should we support custom tools defined by users?**
   - **Recommendation:** Future enhancement, not MVP
   - **Pattern:** Tool plugin system with registration API

---

## References

- [SwarmCoordinator Implementation](../../src/coordination/swarm-coordinator.ts)
- [ProviderManager Implementation](../../src/providers/provider-manager.ts)
- [ZaiProvider Implementation](../../src/providers/zai-provider.ts)
- [Redis Pub/Sub Helpers](../../src/cfn-loop/redis-pubsub-helpers.ts)
- [SQLite Memory Manager](../../src/cfn-loop/cfn-loop-memory-manager.ts)
- [Architecture Overview](./swarm-provider-integration-architecture.md)
- [Visual Diagrams](./swarm-provider-integration-diagrams.md)

---

## Approval

This ADR will be reviewed by:

- [ ] Technical Lead (architecture approval)
- [ ] Platform Architect (integration approval)
- [ ] Security Lead (security controls approval)
- [ ] DevOps Lead (infrastructure approval)

**Target Approval Date:** 2025-10-15
**Implementation Start:** 2025-10-16
**Target Completion:** 2025-11-13 (4 weeks)

---

## Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2025-10-12 | Claude (Architect Agent) | Initial ADR |
