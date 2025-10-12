# SwarmCoordinator + ProviderManager Integration - Visual Diagrams

## Class Diagram

```mermaid
classDiagram
    class SwarmCoordinator {
        -agents: Map~string, SwarmAgent~
        -tasks: Map~string, SwarmTask~
        -objectives: Map~string, SwarmObjective~
        +assignTask(taskId, agentId)
        +executeTask(task, agent)
        -simulateTaskExecution() ❌ REMOVED
        -executeWithAgentExecutor() ✅ NEW
    }

    class AgentExecutor {
        -providerManager: ProviderManager
        -toolkit: AgentToolkit
        -conversationManager: ConversationManager
        -promptBuilder: AgentPromptBuilder
        -responseParser: ResponseParser
        +executeTask(task, agent): TaskResult
        -extractToolCalls(content): ToolCall[]
        -formatToolResults(results): string
    }

    class AgentToolkit {
        -tools: Map~string, Tool~
        -redis: Redis
        -sqliteMemory: SQLiteMemory
        +executeTool(name, input, agent): ToolResult
        -validatePath(path): string
        -validateCommand(cmd): string
        -validateToolAccess(tool, agent): boolean
        -sanitizeInput(input): any
    }

    class ConversationManager {
        -conversations: Map~string, Conversation~
        +startConversation(agent, task): conversationId
        +addMessage(id, message)
        +getHistory(id, max): Message[]
        +endConversation(id)
    }

    class AgentPromptBuilder {
        +buildSystemPrompt(agent): string
        +buildTaskPrompt(task): string
        +buildToolDescriptions(tools): string
        +buildContextPrompt(context): string
    }

    class ResponseParser {
        +parse(response): TaskResult
        -extractJSON(text): object
        -extractCodeBlocks(text): CodeBlock[]
        -isValidTaskResult(obj): boolean
        -inferResults(text): TaskResult
    }

    class ProviderManager {
        -providers: Map~LLMProvider, ILLMProvider~
        -tieredRouter: TieredProviderRouter
        +complete(request, agentType): LLMResponse
        +streamComplete(request, agentType): AsyncIterable
        -selectProvider(request, agentType): ILLMProvider
    }

    class ZaiProvider {
        -apiKey: string
        -baseURL: string
        +doComplete(request): LLMResponse
        +doStreamComplete(request): AsyncIterable
        -callZaiAPI(endpoint, payload): Response
    }

    class Tool {
        <<interface>>
        +name: string
        +description: string
        +parameters: ToolParameter[]
        +execute(input, agent): any
    }

    class ToolResult {
        +tool: string
        +result: any
        +status: 'success' | 'error'
        +error?: string
        +executionTime: number
    }

    SwarmCoordinator --> AgentExecutor : creates
    AgentExecutor --> AgentToolkit : uses
    AgentExecutor --> ConversationManager : uses
    AgentExecutor --> AgentPromptBuilder : uses
    AgentExecutor --> ResponseParser : uses
    AgentExecutor --> ProviderManager : calls
    ProviderManager --> ZaiProvider : routes to
    AgentToolkit --> Tool : manages
    AgentToolkit --> ToolResult : returns
```

## Sequence Diagram: Task Execution Flow

```mermaid
sequenceDiagram
    participant SC as SwarmCoordinator
    participant AE as AgentExecutor
    participant APB as AgentPromptBuilder
    participant CM as ConversationManager
    participant PM as ProviderManager
    participant ZP as ZaiProvider
    participant AT as AgentToolkit
    participant RP as ResponseParser

    SC->>AE: executeTask(task, agent)
    AE->>CM: startConversation(agent, task)
    CM-->>AE: conversationId

    AE->>APB: buildPrompt(task, agent, [])
    APB-->>AE: initialPrompt

    AE->>PM: complete(request, agentType)
    PM->>PM: selectProvider(request, agentType)
    PM->>ZP: doComplete(request)
    ZP->>ZP: POST /api/anthropic/v1/messages
    ZP-->>PM: LLMResponse
    PM-->>AE: LLMResponse

    AE->>CM: addMessage(conversationId, assistantMessage)
    AE->>AE: extractToolCalls(response.content)

    alt Has Tool Calls
        AE->>AT: executeTool(toolName, input, agent)
        AT->>AT: validateToolAccess(tool, agent)
        AT->>AT: sanitizeInput(input)
        AT->>AT: tool.execute(input, agent)
        AT-->>AE: ToolResult

        AE->>AE: formatToolResults(results)
        AE->>CM: addMessage(conversationId, toolResultMessage)
        AE->>PM: complete(request, agentType)
        Note over AE,PM: Loop continues with tool results
    else No Tool Calls
        AE->>RP: parse(response)
        RP->>RP: extractJSON(content)
        RP->>RP: isValidTaskResult(json)
        RP-->>AE: TaskResult

        AE->>CM: endConversation(conversationId)
        AE-->>SC: TaskResult
    end

    SC->>SC: handleTaskCompleted(taskId, result)
```

## Data Flow Diagram: 70-Agent Mesh Coordination

```mermaid
graph TB
    subgraph SwarmCoordinator
        SC[SwarmCoordinator<br/>Main Loop]
        AGR[Agent Registry<br/>70 agents]
        TQ[Task Queue<br/>Pending tasks]
    end

    subgraph Agent_1[Agent 1: Coder]
        AE1[AgentExecutor]
        AT1[AgentToolkit]
        CM1[ConversationMgr]
    end

    subgraph Agent_2[Agent 2: Tester]
        AE2[AgentExecutor]
        AT2[AgentToolkit]
        CM2[ConversationMgr]
    end

    subgraph Agent_N[Agent N: Reviewer]
        AEN[AgentExecutor]
        ATN[AgentToolkit]
        CMN[ConversationMgr]
    end

    subgraph Shared_Infrastructure
        PM[ProviderManager<br/>Load balancing]
        ZP[ZaiProvider<br/>LLM API]
        REDIS[Redis Pub/Sub<br/>Coordination]
        SQLITE[SQLite Memory<br/>Persistent state]
        FS[File System<br/>Shared workspace]
    end

    SC --> TQ
    TQ --> AE1
    TQ --> AE2
    TQ --> AEN

    AE1 --> PM
    AE2 --> PM
    AEN --> PM
    PM --> ZP

    AT1 --> REDIS
    AT2 --> REDIS
    ATN --> REDIS

    AT1 --> SQLITE
    AT2 --> SQLITE
    ATN --> SQLITE

    AT1 --> FS
    AT2 --> FS
    ATN --> FS

    REDIS --> SC
    SQLITE --> SC
    FS --> SC

    style SC fill:#e1f5fe
    style PM fill:#f3e5f5
    style ZP fill:#f3e5f5
    style REDIS fill:#fff3e0
    style SQLITE fill:#fff3e0
    style FS fill:#fff3e0
```

## Tool Execution Flow Diagram

```mermaid
graph TB
    START([Agent Response]) --> EXTRACT{extractToolCalls}

    EXTRACT -->|Has Tools| VALIDATE[validateToolAccess]
    EXTRACT -->|No Tools| PARSE[ResponseParser.parse]

    VALIDATE -->|Authorized| SANITIZE[sanitizeInput]
    VALIDATE -->|Unauthorized| ERROR1[SecurityError]

    SANITIZE --> EXECUTE{Execute Tool}

    EXECUTE -->|read| READ[fs.readFile]
    EXECUTE -->|write| WRITE[fs.writeFile]
    EXECUTE -->|edit| EDIT[fs.readFile + replace + writeFile]
    EXECUTE -->|bash| BASH[exec with sandbox]
    EXECUTE -->|redis_publish| REDIS_PUB[redis.publish]
    EXECUTE -->|memory_store| SQLITE_STORE[sqliteMemory.set]
    EXECUTE -->|memory_get| SQLITE_GET[sqliteMemory.get]

    READ --> RESULT[ToolResult: success]
    WRITE --> RESULT
    EDIT --> RESULT
    BASH --> RESULT
    REDIS_PUB --> RESULT
    SQLITE_STORE --> RESULT
    SQLITE_GET --> RESULT

    RESULT --> FORMAT[formatToolResults]
    FORMAT --> NEXT[Next LLM Turn]

    PARSE --> FINAL([TaskResult])

    style START fill:#e8f5e9
    style FINAL fill:#c8e6c9
    style ERROR1 fill:#ffcdd2
    style RESULT fill:#b2ebf2
```

## Agent Coordination Message Flow

```mermaid
sequenceDiagram
    participant A1 as Agent 1 (Coder)
    participant REDIS as Redis Pub/Sub
    participant SQLITE as SQLite Memory
    participant FS as File System
    participant A2 as Agent 2 (Tester)
    participant A3 as Agent 3 (Reviewer)
    participant SC as SwarmCoordinator

    Note over A1: Completes coding task
    A1->>FS: Write src/api.ts
    A1->>SQLITE: Store confidence<br/>key: cfn/phase/loop3/agent-1
    A1->>REDIS: Publish agent:completed

    REDIS-->>A2: Subscribe: agent:completed
    REDIS-->>A3: Subscribe: agent:completed
    REDIS-->>SC: Subscribe: agent:completed

    Note over A2: Triggered by completion event
    A2->>SQLITE: Get confidence<br/>key: cfn/phase/loop3/agent-1
    A2->>FS: Read src/api.ts
    A2->>FS: Execute tests
    A2->>SQLITE: Store test results<br/>key: cfn/phase/loop2/validator-1
    A2->>REDIS: Publish validation:complete

    REDIS-->>A3: Subscribe: validation:complete
    REDIS-->>SC: Subscribe: validation:complete

    Note over A3: Triggered by validation event
    A3->>SQLITE: Get confidence + test results
    A3->>FS: Read src/api.ts
    A3->>FS: Run code quality checks
    A3->>SQLITE: Store consensus<br/>key: cfn/phase/loop2/consensus
    A3->>REDIS: Publish consensus:achieved

    REDIS-->>SC: Subscribe: consensus:achieved
    SC->>SQLITE: Retrieve all results
    SC->>SC: Aggregate and decide
```

## Architecture Layers Diagram

```mermaid
graph TB
    subgraph Layer_1[Orchestration Layer]
        SC[SwarmCoordinator]
        SM[SwarmMonitor]
        MM[MemoryManager]
    end

    subgraph Layer_2[Execution Layer]
        AE[AgentExecutor]
        AT[AgentToolkit]
        CM[ConversationManager]
    end

    subgraph Layer_3[Prompt & Parse Layer]
        APB[AgentPromptBuilder]
        RP[ResponseParser]
        TE[ToolExtractor]
    end

    subgraph Layer_4[Provider Layer]
        PM[ProviderManager]
        TR[TieredRouter]
        LB[LoadBalancer]
    end

    subgraph Layer_5[LLM Provider Layer]
        ZP[ZaiProvider]
        AP[AnthropicProvider]
        OP[OpenAIProvider]
    end

    subgraph Layer_6[Infrastructure Layer]
        REDIS[Redis Pub/Sub]
        SQLITE[SQLite Memory]
        FS[File System]
        METRICS[Metrics System]
    end

    Layer_1 --> Layer_2
    Layer_2 --> Layer_3
    Layer_3 --> Layer_4
    Layer_4 --> Layer_5
    Layer_5 --> Layer_6
    Layer_2 --> Layer_6

    style Layer_1 fill:#e3f2fd
    style Layer_2 fill:#f3e5f5
    style Layer_3 fill:#fff3e0
    style Layer_4 fill:#e8f5e9
    style Layer_5 fill:#fce4ec
    style Layer_6 fill:#f1f8e9
```

## Tool Specification Structure

```mermaid
graph LR
    TOOLS[Tool Registry]

    TOOLS --> FILE[File Operations]
    TOOLS --> EXEC[Execution]
    TOOLS --> COORD[Coordination]
    TOOLS --> MEM[Memory]

    FILE --> READ[read<br/>Read file contents]
    FILE --> WRITE[write<br/>Write file contents]
    FILE --> EDIT[edit<br/>Search & replace]

    EXEC --> BASH[bash<br/>Execute command<br/>sandboxed]

    COORD --> REDIS_PUB[redis_publish<br/>Publish to channel]
    COORD --> REDIS_SUB[redis_subscribe<br/>Subscribe to channel]

    MEM --> MEM_STORE[memory_store<br/>Store in SQLite]
    MEM --> MEM_GET[memory_get<br/>Retrieve from SQLite]

    style TOOLS fill:#e1f5fe
    style FILE fill:#f3e5f5
    style EXEC fill:#fff3e0
    style COORD fill:#e8f5e9
    style MEM fill:#fce4ec
```

## Security Control Flow

```mermaid
graph TB
    INPUT[Tool Input] --> VAL1{Path Validation}

    VAL1 -->|Valid| VAL2{Command Validation}
    VAL1 -->|Invalid| ERR1[SecurityError:<br/>Path traversal]

    VAL2 -->|Allowed| VAL3{ACL Check}
    VAL2 -->|Blocked| ERR2[SecurityError:<br/>Command not allowed]

    VAL3 -->|Authorized| SANITIZE[Input Sanitization]
    VAL3 -->|Unauthorized| ERR3[SecurityError:<br/>ACL violation]

    SANITIZE --> LIMIT{Resource Limits}

    LIMIT -->|Within Limits| EXEC[Execute Tool]
    LIMIT -->|Exceeded| ERR4[SecurityError:<br/>Resource limit]

    EXEC --> AUDIT[Security Audit Log]
    AUDIT --> RESULT[ToolResult]

    ERR1 --> AUDIT
    ERR2 --> AUDIT
    ERR3 --> AUDIT
    ERR4 --> AUDIT

    style INPUT fill:#e8f5e9
    style RESULT fill:#c8e6c9
    style EXEC fill:#b2ebf2
    style ERR1 fill:#ffcdd2
    style ERR2 fill:#ffcdd2
    style ERR3 fill:#ffcdd2
    style ERR4 fill:#ffcdd2
    style AUDIT fill:#fff9c4
```
