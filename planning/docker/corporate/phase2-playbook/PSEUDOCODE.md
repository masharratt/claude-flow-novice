# Phase 2: Playbook-Driven Ephemeral Agent Pseudocode

**Version:** 2.0.0
**Date:** 2025-11-12

---

## Table of Contents

1. [Team Coordinator: Ephemeral Agent Spawning](#1-team-coordinator-ephemeral-agent-spawning)
2. [Pre-Spawn Hook: Context Injection](#2-pre-spawn-hook-context-injection)
3. [Ephemeral Agent Lifecycle](#3-ephemeral-agent-lifecycle)
4. [Post-Completion Hook: Lesson Extraction](#4-post-completion-hook-lesson-extraction)
5. [Playbook Query Engine](#5-playbook-query-engine)
6. [Confidence Tracking](#6-confidence-tracking)
7. [Scope Management](#7-scope-management)

---

## 1. Team Coordinator: Ephemeral Agent Spawning

### 1.1 Ephemeral Agent Spawn Workflow

```pseudocode
FUNCTION SpawnEphemeralAgent(task):
    // Task arrives at team coordinator
    taskId = task.id
    agentType = DetermineAgentType(task.description)
    agentId = GenerateUniqueAgentId(agentType)

    LOG("Spawning ephemeral agent: " + agentId + " for task: " + taskId)

    // STEP 1: Extract tags from task description
    tags = ExtractTags(task.description)
    LOG("Extracted tags: " + tags.join(", "))

    // STEP 2: Automatic context injection (pre-spawn hook)
    contextFile = "/tmp/context-" + taskId + ".json"

    hookResult = ExecuteHook(
        hookName: "cfn-pre-spawn-context-inject.sh",
        parameters: {
            taskId: taskId,
            agentType: agentType,
            tags: tags.join(","),
            scope: "team:" + this.teamId,
            outputFile: contextFile
        }
    )

    IF hookResult.exitCode != 0:
        LOG("WARNING: Context injection failed, proceeding without context")
        contextFile = "/tmp/empty-context.json"
        WriteFile(contextFile, '{"lessons": []}')
    END IF

    // Verify context file created
    context = ReadJSON(contextFile)
    LOG("Loaded " + context.lessons.length + " lessons for agent")

    // STEP 3: Generate MCP configuration
    mcpConfigFile = "/tmp/mcp-" + agentId + ".json"
    mcpConfig = BuildMCPConfig(this.teamId, agentType, agentId)
    WriteFile(mcpConfigFile, JSON.stringify(mcpConfig))

    // STEP 4: Spawn ephemeral Docker container
    containerConfig = {
        Image: "cfn-agent-" + this.teamId + ":latest",

        Env: [
            "TEAM_ID=" + this.teamId,
            "AGENT_ID=" + agentId,
            "AGENT_ROLE=" + agentType,
            "TASK_ID=" + taskId,
            "TASK_PROMPT=" + task.description,
            "CONTEXT_FILE=/context.json",  // Mounted inside container
            "REDIS_NAMESPACE=team:" + this.teamId + ":agent:" + agentType + ":" + agentId
        ],

        HostConfig: {
            NetworkMode: "team-" + this.teamId,

            Binds: [
                // Team workspace isolation
                GetWorkspacePath(this.teamId, agentType) + ":/workspace:" + GetAccessMode(agentType),

                // Context file (playbook lessons)
                contextFile + ":/context.json:ro",

                // MCP configuration
                mcpConfigFile + ":/home/claude/.config/claude/claude_desktop_config.json:ro"
            ],

            Memory: GetMemoryLimit(agentType),
            CpuShares: GetCpuShares(agentType),

            // CRITICAL: Auto-remove container on exit (ephemeral)
            AutoRemove: true
        },

        Labels: {
            "cfn.component": "agent",
            "cfn.ephemeral": "true",
            "cfn.team": this.teamId,
            "cfn.task-id": taskId,
            "cfn.agent-id": agentId
        }
    }

    container = docker.createContainer(containerConfig)
    container.start()

    LOG("Ephemeral agent started: " + container.id)

    // STEP 5: Monitor completion (non-blocking)
    SPAWN_ASYNC(MonitorEphemeralAgent, container.id, taskId, agentId, contextFile)

    RETURN {
        agentId: agentId,
        containerId: container.id,
        taskId: taskId,
        spawnedAt: NOW()
    }
END FUNCTION
```

### 1.2 Ephemeral Agent Monitoring

```pseudocode
ASYNC FUNCTION MonitorEphemeralAgent(containerId, taskId, agentId, contextFile):
    // Wait for container to exit (blocking wait)
    result = docker.wait(containerId)

    exitCode = result.StatusCode

    LOG("Agent " + agentId + " exited with code: " + exitCode)

    // STEP 1: Retrieve agent output from Redis
    outputKey = "cfn_loop:task:" + taskId + ":agent:" + agentId + ":output"
    agentOutput = redis.get(outputKey)

    IF agentOutput == NULL:
        // Fallback: read from container logs
        agentOutput = docker.logs(containerId)
    END IF

    // STEP 2: Automatic lesson extraction (post-completion hook)
    hookResult = ExecuteHook(
        hookName: "cfn-post-completion-extract.sh",
        parameters: {
            taskId: taskId,
            agentId: agentId,
            agentOutput: agentOutput,
            autoExtract: true
        }
    )

    IF hookResult.exitCode != 0:
        LOG("WARNING: Lesson extraction failed for task: " + taskId)
    ELSE:
        extractionResult = ParseJSON(hookResult.stdout)
        LOG("Extracted " + extractionResult.lessons_stored + " new lessons")
        LOG("Updated " + extractionResult.lessons_updated + " existing lessons")
    END IF

    // STEP 3: Update task status
    UPDATE tasks
    SET
        status = CASE WHEN exitCode = 0 THEN 'completed' ELSE 'failed' END,
        end_time = NOW(),
        agent_id = agentId,
        exit_code = exitCode
    WHERE id = taskId

    // STEP 4: Cleanup temporary files
    DeleteFile(contextFile)

    // Container auto-removed by Docker (AutoRemove=true)
    LOG("Ephemeral agent lifecycle complete: " + agentId)
END FUNCTION
```

---

## 2. Pre-Spawn Hook: Context Injection

### 2.1 Context Injection Main Flow

```pseudocode
FUNCTION ExecuteContextInjection(taskId, agentType, tags, scope, outputFile):
    startTime = NOW()

    // STEP 1: Parse scope (extract team_id)
    teamId = ExtractTeamId(scope)  // "team:frontend" → "frontend"

    // STEP 2: Query PostgreSQL for relevant lessons
    lessons = QueryRelevantLessons(teamId, tags, limit=100)

    LOG("Found " + lessons.length + " relevant lessons")

    // STEP 3: Calculate scope breakdown
    scopeBreakdown = {
        agent: CountWhere(lessons, l => l.scope == "agent"),
        team: CountWhere(lessons, l => l.scope == "team"),
        org: CountWhere(lessons, l => l.scope == "org")
    }

    // STEP 4: Build context object
    context = {
        task_id: taskId,
        agent_type: agentType,
        tags: tags,
        lessons: lessons,
        total_lessons: lessons.length,
        load_time_ms: ElapsedMillis(startTime),
        scope_breakdown: scopeBreakdown,
        injected_at: NOW()
    }

    // STEP 5: Write to output file
    WriteJSON(outputFile, context)

    LOG("Context injection complete: " + outputFile)
    LOG("- Agent scope: " + scopeBreakdown.agent + " lessons")
    LOG("- Team scope: " + scopeBreakdown.team + " lessons")
    LOG("- Org scope: " + scopeBreakdown.org + " lessons")

    RETURN 0  // Exit code 0 = success
END FUNCTION
```

### 2.2 Relevant Lessons Query

```pseudocode
FUNCTION QueryRelevantLessons(teamId, tags, limit):
    // Build SQL query with scope hierarchy
    query = "
        SELECT
            id,
            content,
            scope,
            confidence,
            success_count,
            total_count,
            tags,
            lesson_type,
            created_at,
            last_used_at
        FROM context_reflections
        WHERE
            -- Scope filter: team-specific or org-wide
            (team_id = $1 OR scope = 'org')
            AND
            -- Tag overlap: at least one tag matches
            tags && $2::TEXT[]
        ORDER BY
            -- Priority 1: Scope (agent > team > org)
            CASE scope
                WHEN 'agent' THEN 1
                WHEN 'team' THEN 2
                WHEN 'org' THEN 3
            END ASC,
            -- Priority 2: Confidence (higher is better)
            confidence DESC,
            -- Priority 3: Recently used (tie-breaker)
            last_used_at DESC NULLS LAST
        LIMIT $3
    "

    params = [teamId, tags, limit]

    TRY:
        result = postgres.query(query, params)

        lessons = []
        FOR EACH row IN result.rows:
            lessons.APPEND({
                id: row.id,
                content: row.content,
                scope: row.scope,
                confidence: row.confidence,
                success_count: row.success_count,
                total_count: row.total_count,
                tags: row.tags,
                lesson_type: row.lesson_type,
                created_at: row.created_at,
                last_used_at: row.last_used_at
            })
        END FOR

        RETURN lessons

    CATCH error:
        LOG("ERROR: PostgreSQL query failed: " + error.message)
        RETURN []  // Return empty array, agent proceeds without context
    END TRY
END FUNCTION
```

### 2.3 Tag Extraction from Task Description

```pseudocode
FUNCTION ExtractTags(description):
    // Lowercase and tokenize
    tokens = Tokenize(description.toLowerCase())

    // Remove stopwords
    stopwords = ["the", "a", "an", "and", "or", "in", "on", "at", "to", "for"]
    tokens = Filter(tokens, t => NOT stopwords.includes(t))

    // Extract technical terms (heuristic patterns)
    tags = []

    FOR EACH token IN tokens:
        // Programming languages
        IF token MATCHES /^(typescript|javascript|python|rust|go)$/:
            tags.APPEND(token)
        END IF

        // Frameworks/libraries
        IF token MATCHES /^(react|vue|angular|django|flask|express)$/:
            tags.APPEND(token)
        END IF

        // Task types
        IF token MATCHES /^(fix|create|refactor|optimize|test|deploy)$/:
            tags.APPEND(token)
        END IF

        // File extensions
        IF token MATCHES /\.(tsx|ts|js|py|rs|go)$/:
            extension = ExtractExtension(token)
            tags.APPEND(extension)
        END IF
    END FOR

    // Deduplicate
    tags = Unique(tags)

    // Default tag if none found
    IF tags.length == 0:
        tags = ["general"]
    END IF

    RETURN tags
END FUNCTION
```

---

## 3. Ephemeral Agent Lifecycle

### 3.1 Agent Initialization

```pseudocode
FUNCTION AgentMain():
    // Read environment variables
    teamId = ENV("TEAM_ID")
    agentId = ENV("AGENT_ID")
    agentRole = ENV("AGENT_ROLE")
    taskId = ENV("TASK_ID")
    taskPrompt = ENV("TASK_PROMPT")
    contextFile = ENV("CONTEXT_FILE")

    LOG("Agent starting: " + agentId)
    LOG("Task: " + taskId)

    // STEP 1: Load playbook context
    context = LoadPlaybookContext(contextFile)

    LOG("Loaded " + context.lessons.length + " playbook lessons")
    LOG("- Agent scope: " + CountScope(context.lessons, "agent") + " lessons")
    LOG("- Team scope: " + CountScope(context.lessons, "team") + " lessons")
    LOG("- Org scope: " + CountScope(context.lessons, "org") + " lessons")

    // STEP 2: Build enhanced task prompt
    enhancedPrompt = BuildEnhancedPrompt(taskPrompt, context.lessons)

    // STEP 3: Execute task
    result = ExecuteTask(enhancedPrompt, context.lessons)

    // STEP 4: Store output to Redis (for post-completion hook)
    outputKey = "cfn_loop:task:" + taskId + ":agent:" + agentId + ":output"
    redis.setex(outputKey, 3600, result.output)  // 1 hour TTL

    // STEP 5: Report completion
    ReportCompletion(taskId, agentId, result)

    // STEP 6: Exit (container auto-removed)
    LOG("Agent exiting: " + agentId)
    EXIT(result.success ? 0 : 1)
END FUNCTION
```

### 3.2 Load Playbook Context

```pseudocode
FUNCTION LoadPlaybookContext(contextFile):
    TRY:
        contextJson = ReadFile(contextFile)
        context = ParseJSON(contextJson)

        // Validate context structure
        IF context.lessons == NULL:
            LOG("WARNING: Context file missing lessons array")
            context.lessons = []
        END IF

        // Organize lessons by scope
        context.lessonsByScope = {
            agent: Filter(context.lessons, l => l.scope == "agent"),
            team: Filter(context.lessons, l => l.scope == "team"),
            org: Filter(context.lessons, l => l.scope == "org")
        }

        RETURN context

    CATCH error:
        LOG("ERROR: Failed to load context file: " + error.message)
        // Return empty context (agent proceeds without playbook)
        RETURN {
            lessons: [],
            lessonsByScope: {agent: [], team: [], org: []},
            total_lessons: 0
        }
    END TRY
END FUNCTION
```

### 3.3 Build Enhanced Task Prompt

```pseudocode
FUNCTION BuildEnhancedPrompt(originalPrompt, lessons):
    // Start with original prompt
    enhanced = originalPrompt + "\n\n"

    IF lessons.length > 0:
        enhanced += "## Relevant Playbook Lessons (" + lessons.length + ")\n\n"

        // Group by lesson type
        lessonsByType = GroupBy(lessons, "lesson_type")

        FOR EACH (type, typeLessons) IN lessonsByType:
            enhanced += "### " + Capitalize(type) + " (" + typeLessons.length + ")\n"

            FOR EACH lesson IN typeLessons:
                // Format: [SCOPE] "content" (confidence, success_count/total_count)
                enhanced += "- [" + lesson.scope.toUpperCase() + "] "
                enhanced += '"' + lesson.content + '" '
                enhanced += "(" + (lesson.confidence * 100).toFixed(0) + "% confidence, "
                enhanced += lesson.success_count + "/" + lesson.total_count + " success)\n"
            END FOR

            enhanced += "\n"
        END FOR

        enhanced += "**Instructions:** Apply these lessons where relevant to avoid known pitfalls and follow proven patterns.\n\n"
    ELSE:
        enhanced += "No playbook lessons available for this task (first-time task type).\n\n"
    END IF

    RETURN enhanced
END FUNCTION
```

### 3.4 Execute Task with Lesson Tracking

```pseudocode
FUNCTION ExecuteTask(enhancedPrompt, lessons):
    startTime = NOW()

    // Track which lessons were applied
    appliedLessons = []

    TRY:
        // Execute task (this is where Claude Code CLI runs)
        output = ExecuteClaudeCode(enhancedPrompt)

        // Scan output for lesson references
        FOR EACH lesson IN lessons:
            // Check if lesson was mentioned/applied in output
            IF output.includes(lesson.content):
                appliedLessons.APPEND({
                    lessonId: lesson.id,
                    applied: true,
                    successful: true  // Assume success if task succeeds
                })
            END IF
        END FOR

        // Extract new learnings from output
        newLearnings = ExtractLearningsFromOutput(output)

        success = true

    CATCH error:
        LOG("ERROR: Task execution failed: " + error.message)
        output = error.message
        newLearnings = []
        success = false
    END TRY

    duration = ElapsedMillis(startTime)

    RETURN {
        success: success,
        output: output,
        newLearnings: newLearnings,
        appliedLessons: appliedLessons,
        durationMs: duration
    }
END FUNCTION
```

### 3.5 Extract Learnings from Output

```pseudocode
FUNCTION ExtractLearningsFromOutput(output):
    learnings = []

    // Regex patterns for automatic lesson extraction
    patterns = [
        {type: "learned", regex: /Learned: (.+)$/gm},
        {type: "best_practice", regex: /Best practice: (.+)$/gm},
        {type: "anti_pattern", regex: /Anti-pattern: (.+)$/gm},
        {type: "key_insight", regex: /Key insight: (.+)$/gm},
        {type: "error_solution", regex: /Error solution: (.+)$/gm},
        {type: "optimization", regex: /Optimization: (.+)$/gm}
    ]

    FOR EACH pattern IN patterns:
        matches = FindAllMatches(output, pattern.regex)

        FOR EACH match IN matches:
            learnings.APPEND({
                content: match.captured,
                lessonType: pattern.type,
                tags: ExtractTags(match.captured)
            })
        END FOR
    END FOR

    LOG("Extracted " + learnings.length + " new learnings from output")

    RETURN learnings
END FUNCTION
```

---

## 4. Post-Completion Hook: Lesson Extraction

### 4.1 Lesson Extraction Main Flow

```pseudocode
FUNCTION ExecuteLessonExtraction(taskId, agentId, agentOutput, autoExtract):
    startTime = NOW()

    extractedLessons = []
    lessonsStored = 0
    lessonsDeduplicated = 0
    lessonsUpdated = 0

    // STEP 1: Parse agent output (JSON or text)
    TRY:
        result = ParseJSON(agentOutput)
        IF result.newLearnings != NULL:
            extractedLessons = result.newLearnings
        END IF
    CATCH:
        // Not JSON, parse as text with regex
        extractedLessons = ExtractLessonsViaRegex(agentOutput)
    END TRY

    LOG("Extracted " + extractedLessons.length + " lessons from agent output")

    // STEP 2: Store each lesson to PostgreSQL
    FOR EACH learning IN extractedLessons:
        storeResult = StoreLesson(taskId, agentId, learning)

        IF storeResult.action == "inserted":
            lessonsStored++
        ELSE IF storeResult.action == "deduplicated":
            lessonsDeduplicated++
        ELSE IF storeResult.action == "updated":
            lessonsUpdated++
        END IF
    END FOR

    // STEP 3: Update confidence for applied lessons
    IF result.appliedLessons != NULL:
        FOR EACH applied IN result.appliedLessons:
            UpdateLessonConfidence(applied.lessonId, applied.successful)
        END FOR
    END IF

    extractionTime = ElapsedMillis(startTime)

    // STEP 4: Build result summary
    summary = {
        task_id: taskId,
        agent_id: agentId,
        extracted_lessons: extractedLessons.length,
        lessons_stored: lessonsStored,
        lessons_deduplicated: lessonsDeduplicated,
        lessons_updated: lessonsUpdated,
        extraction_time_ms: extractionTime
    }

    LOG("Lesson extraction complete:")
    LOG("- Stored: " + lessonsStored)
    LOG("- Deduplicated: " + lessonsDeduplicated)
    LOG("- Updated: " + lessonsUpdated)

    RETURN summary
END FUNCTION
```

### 4.2 Store Lesson to PostgreSQL

```pseudocode
FUNCTION StoreLesson(taskId, agentId, learning):
    // Determine scope (default to team)
    scope = DetermineScope(learning)

    // Get team_id from agent
    agent = SELECT team_id FROM agents WHERE id = agentId
    teamId = agent.team_id

    // Insert or update lesson
    query = "
        INSERT INTO context_reflections (
            owner_id, team_id, scope, content, lesson_type,
            tags, confidence, success_count, total_count, created_by
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, 1, 1, $8
        )
        ON CONFLICT (team_id, scope, content)
        DO UPDATE SET
            -- Increment counters (assumes success if lesson used again)
            success_count = context_reflections.success_count + 1,
            total_count = context_reflections.total_count + 1,
            -- Recalculate confidence
            confidence = (context_reflections.success_count + 1.0) / (context_reflections.total_count + 1.0),
            -- Update timestamp
            updated_at = NOW()
        RETURNING
            CASE
                WHEN xmax = 0 THEN 'inserted'
                ELSE 'updated'
            END as action
    "

    params = [
        agentId,
        teamId,
        scope,
        learning.content,
        learning.lessonType,
        learning.tags,
        0.80,  // Default confidence for new lessons
        agentId
    ]

    TRY:
        result = postgres.query(query, params)
        action = result.rows[0].action

        IF action == "inserted":
            LOG("Stored new lesson: " + Truncate(learning.content, 50))
        ELSE:
            LOG("Updated existing lesson: " + Truncate(learning.content, 50))
        END IF

        RETURN {action: action}

    CATCH error:
        // Check if conflict (deduplication)
        IF error.code == "23505":  // UNIQUE constraint violation
            LOG("Deduplicated lesson: " + Truncate(learning.content, 50))
            RETURN {action: "deduplicated"}
        ELSE:
            LOG("ERROR: Failed to store lesson: " + error.message)
            RETURN {action: "failed"}
        END IF
    END TRY
END FUNCTION
```

### 4.3 Determine Lesson Scope

```pseudocode
FUNCTION DetermineScope(learning):
    content = learning.content.toLowerCase()

    // Check for agent-specific indicators
    agentIndicators = ["i prefer", "my approach", "personally"]
    FOR EACH indicator IN agentIndicators:
        IF content.includes(indicator):
            RETURN "agent"
        END IF
    END FOR

    // Check for org-wide indicators
    orgIndicators = ["always", "never", "all teams", "company policy", "security requirement"]
    FOR EACH indicator IN orgIndicators:
        IF content.includes(indicator):
            RETURN "org"
        END IF
    END FOR

    // Default to team scope
    RETURN "team"
END FUNCTION
```

---

## 5. Playbook Query Engine

### 5.1 Query Optimization

```pseudocode
FUNCTION OptimizePlaybookQuery(teamId, tags):
    // Build index hints for PostgreSQL
    query = "
        /*+
            IndexScan(context_reflections idx_team_scope)
            IndexScan(context_reflections idx_tags)
        */
        SELECT ...
    "

    // Use prepared statement for repeated queries
    preparedStatement = PrepareStatement("playbook_query", query)

    result = ExecutePreparedStatement(preparedStatement, [teamId, tags])

    RETURN result
END FUNCTION
```

### 5.2 Caching Strategy

```pseudocode
FUNCTION QueryRelevantLessonsWithCache(teamId, tags, limit):
    // Build cache key
    cacheKey = "playbook:" + teamId + ":" + tags.sort().join(",") + ":" + limit

    // Check Redis cache
    cached = redis.get(cacheKey)
    IF cached != NULL:
        LOG("Cache hit for playbook query")
        RETURN ParseJSON(cached)
    END IF

    // Cache miss, query PostgreSQL
    lessons = QueryRelevantLessons(teamId, tags, limit)

    // Cache result for 5 minutes
    redis.setex(cacheKey, 300, JSON.stringify(lessons))

    RETURN lessons
END FUNCTION
```

---

## 6. Confidence Tracking

### 6.1 Update Lesson Confidence

```pseudocode
FUNCTION UpdateLessonConfidence(lessonId, wasSuccessful):
    query = "
        UPDATE context_reflections
        SET
            success_count = success_count + CASE WHEN $2 THEN 1 ELSE 0 END,
            total_count = total_count + 1,
            confidence = (success_count + CASE WHEN $2 THEN 1 ELSE 0 END)::DECIMAL / (total_count + 1),
            last_used_at = NOW(),
            updated_at = NOW()
        WHERE id = $1
        RETURNING confidence, success_count, total_count
    "

    result = postgres.query(query, [lessonId, wasSuccessful])

    IF result.rows.length > 0:
        row = result.rows[0]
        LOG("Updated lesson confidence:")
        LOG("- New confidence: " + (row.confidence * 100).toFixed(1) + "%")
        LOG("- Success count: " + row.success_count + "/" + row.total_count)
    END IF
END FUNCTION
```

### 6.2 Confidence Decay (Optional)

```pseudocode
FUNCTION ApplyConfidenceDecay():
    // Reduce confidence for lessons not used in >30 days
    query = "
        UPDATE context_reflections
        SET
            confidence = GREATEST(
                confidence * 0.95,  // 5% decay
                0.50  // Minimum confidence threshold
            ),
            updated_at = NOW()
        WHERE
            last_used_at < NOW() - INTERVAL '30 days'
            OR last_used_at IS NULL
        RETURNING id, content, confidence
    "

    result = postgres.query(query)

    LOG("Applied confidence decay to " + result.rows.length + " lessons")
END FUNCTION
```

---

## 7. Scope Management

### 7.1 Promote Lesson Scope

```pseudocode
FUNCTION PromoteLessonToOrgScope(lessonId):
    // Verify promotion criteria
    lesson = SELECT * FROM context_reflections WHERE id = lessonId

    IF lesson.confidence < 0.95:
        RETURN {success: false, reason: "Confidence too low (<0.95)"}
    END IF

    IF lesson.success_count < 50:
        RETURN {success: false, reason: "Not enough uses (<50)"}
    END IF

    IF lesson.scope == "org":
        RETURN {success: false, reason: "Already org scope"}
    END IF

    // Promote to org scope
    UPDATE context_reflections
    SET
        scope = "org",
        team_id = NULL,  // No longer team-specific
        updated_at = NOW()
    WHERE id = lessonId

    LOG("Promoted lesson to org scope: " + lesson.content)

    RETURN {success: true}
END FUNCTION
```

### 7.2 Scope Conflict Resolution

```pseudocode
FUNCTION ResolveScopeConflicts(lessons):
    // Group lessons by content similarity
    groups = GroupSimilarLessons(lessons)

    resolvedLessons = []

    FOR EACH group IN groups:
        // Find highest priority lesson
        bestLesson = FindBestLesson(group)

        resolvedLessons.APPEND(bestLesson)
    END FOR

    RETURN resolvedLessons
END FUNCTION

FUNCTION FindBestLesson(group):
    // Sort by scope priority, then confidence
    sorted = Sort(group, (a, b) => {
        // Scope priority: agent=1, team=2, org=3
        scopePriority = {agent: 1, team: 2, org: 3}

        IF scopePriority[a.scope] != scopePriority[b.scope]:
            RETURN scopePriority[a.scope] - scopePriority[b.scope]
        END IF

        // Same scope, compare confidence
        RETURN b.confidence - a.confidence
    })

    RETURN sorted[0]
END FUNCTION
```

---

**End of Phase 2 Pseudocode v2.0.0**
