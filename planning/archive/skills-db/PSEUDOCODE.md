# Dynamic Skills Database - Pseudocode & Algorithms

## Document Metadata
- **Version:** 1.0.0
- **Status:** Draft
- **Date:** 2025-11-15
- **Related:** SPECIFICATION.md, ARCHITECTURE.md

---

## Table of Contents
1. [Core Algorithms](#1-core-algorithms)
2. [Database Operations](#2-database-operations)
3. [Skill Loading](#3-skill-loading)
4. [CLI Commands](#4-cli-commands)
5. [Analytics](#5-analytics)
6. [Migration Scripts](#6-migration-scripts)
7. [Validation Logic](#7-validation-logic)

---

## 1. Core Algorithms

### 1.1 Contextual Skill Selection

**Purpose:** Load only relevant skills for agent based on task context

**Inputs:**
- `agentType: string` - Agent type (e.g., "backend-developer")
- `taskContext: TaskContext` - Task metadata
  - `taskContext.keywords: string[]` - Task description keywords
  - `taskContext.phase: string` - CFN Loop phase (loop1, loop2, loop3)
  - `taskContext.mode: string` - Execution mode (mvp, standard, enterprise)

**Output:**
- `skills: Skill[]` - Ordered list of applicable skills

**Algorithm:**
```
FUNCTION loadSkillsForAgent(agentType, taskContext):
    skills = []

    # Step 1: Load bootstrap skills (always first)
    bootstrapSkills = loadBootstrapSkills()
    skills.append(bootstrapSkills)

    # Step 2: Query database for agent-skill mappings
    mappings = database.query("""
        SELECT
            s.id, s.name, s.content_path, s.content_hash,
            s.tags, s.version, m.priority, m.required, m.conditions
        FROM skills s
        INNER JOIN agent_skill_mappings m ON s.id = m.skill_id
        WHERE m.agent_type = :agentType
          AND s.status = 'active'
        ORDER BY m.priority ASC
    """, {agentType: agentType})

    # Step 3: Filter by conditional logic
    FOR mapping IN mappings:
        IF shouldLoadSkill(mapping, taskContext):
            skill = loadSkillContent(mapping)
            skills.append(skill)

    # Step 4: Deduplicate and validate
    skills = removeDuplicates(skills)
    skills = validateIntegrity(skills)

    RETURN skills

FUNCTION shouldLoadSkill(mapping, taskContext):
    # No conditions = always load
    IF mapping.conditions IS NULL:
        RETURN TRUE

    conditions = parseJSON(mapping.conditions)

    # Check task context keywords
    IF conditions.taskContext IS NOT NULL:
        FOR keyword IN conditions.taskContext:
            IF keyword IN taskContext.keywords:
                RETURN TRUE

    # Check CFN Loop phase
    IF conditions.phase IS NOT NULL:
        IF taskContext.phase IN conditions.phase:
            RETURN TRUE

    # Check execution mode
    IF conditions.mode IS NOT NULL:
        IF taskContext.mode IN conditions.mode:
            RETURN TRUE

    # No conditions matched
    RETURN FALSE

FUNCTION loadSkillContent(mapping):
    # Read content from disk
    content = readFile(mapping.content_path)

    # Validate hash (non-blocking warning)
    actualHash = sha256(content)
    IF actualHash != mapping.content_hash:
        logWarning("Hash mismatch for skill", mapping.name)

    RETURN {
        id: mapping.id,
        name: mapping.name,
        content: content,
        tags: parseJSON(mapping.tags),
        version: mapping.version,
        priority: mapping.priority
    }
```

**Complexity Analysis:**
- Database query: O(log n) with indexes on `agent_type` and `status`
- Conditional filtering: O(m × k) where m = mappings, k = conditions per mapping
- Content loading: O(m) file reads
- **Total:** O(m × k + m) = O(m) where m ≈ 5-10 skills per agent

**Performance Target:** ≤15ms total latency

---

### 1.2 Skill Hash Validation

**Purpose:** Detect skill content tampering or corruption

**Inputs:**
- `skill: Skill` - Skill object with content and expected hash

**Output:**
- `valid: boolean` - True if hash matches
- `error: string | null` - Error message if validation fails

**Algorithm:**
```
FUNCTION validateSkillHash(skill):
    # Calculate SHA256 of content
    actualHash = sha256(skill.content)

    # Compare with stored hash
    IF actualHash == skill.content_hash:
        RETURN {valid: TRUE, error: NULL}
    ELSE:
        error = "Hash mismatch for skill " + skill.name +
                ": expected " + skill.content_hash +
                ", got " + actualHash

        # Log warning but don't block (allow recovery)
        logWarning(error)

        RETURN {valid: FALSE, error: error}

FUNCTION validateAllSkills():
    skills = database.query("SELECT * FROM skills WHERE status = 'active'")
    results = []

    FOR skill IN skills:
        content = readFile(skill.content_path)
        validation = validateSkillHash({
            name: skill.name,
            content: content,
            content_hash: skill.content_hash
        })
        results.append({
            skill: skill.name,
            valid: validation.valid,
            error: validation.error
        })

    RETURN results
```

**Error Handling:**
- Hash mismatch: Log warning, continue execution (non-blocking)
- File not found: Throw error (blocking)
- Database corruption: Trigger recovery from YAML snapshot

---

### 1.3 Skill Effectiveness Calculation

**Purpose:** Measure skill impact on agent confidence

**Inputs:**
- `skillId: number` - Skill identifier
- `timePeriod: number` - Days to analyze (default: 30)

**Output:**
- `metrics: SkillMetrics` - Effectiveness metrics

**Algorithm:**
```
FUNCTION calculateSkillEffectiveness(skillId, timePeriod):
    # Query usage logs
    usageLogs = database.query("""
        SELECT
            confidence_before,
            confidence_after,
            execution_time_ms,
            agent_type,
            phase
        FROM skill_usage_log
        WHERE skill_id = :skillId
          AND loaded_at >= datetime('now', '-' || :days || ' days')
    """, {skillId: skillId, days: timePeriod})

    IF usageLogs.length == 0:
        RETURN NULL

    # Calculate metrics
    totalLoads = usageLogs.length
    confidenceDeltas = []
    executionTimes = []
    agentTypes = {}
    phases = {}

    FOR log IN usageLogs:
        # Confidence impact
        delta = log.confidence_after - log.confidence_before
        confidenceDeltas.append(delta)

        # Execution time
        executionTimes.append(log.execution_time_ms)

        # Group by agent type
        IF log.agent_type NOT IN agentTypes:
            agentTypes[log.agent_type] = []
        agentTypes[log.agent_type].append(delta)

        # Group by phase
        IF log.phase NOT IN phases:
            phases[log.phase] = []
        phases[log.phase].append(delta)

    # Aggregate statistics
    RETURN {
        skillId: skillId,
        totalLoads: totalLoads,
        avgConfidenceImpact: mean(confidenceDeltas),
        medianConfidenceImpact: median(confidenceDeltas),
        stdDevConfidence: standardDeviation(confidenceDeltas),
        avgExecutionTimeMs: mean(executionTimes),
        maxExecutionTimeMs: max(executionTimes),
        topAgentTypes: sortByImpact(agentTypes).slice(0, 5),
        topPhases: sortByImpact(phases),
        recommendation: generateRecommendation(confidenceDeltas, totalLoads)
    }

FUNCTION generateRecommendation(confidenceDeltas, totalLoads):
    avgImpact = mean(confidenceDeltas)

    IF avgImpact >= 0.10 AND totalLoads >= 10:
        RETURN "HIGHLY_EFFECTIVE"
    ELSE IF avgImpact >= 0.05:
        RETURN "EFFECTIVE"
    ELSE IF avgImpact >= 0.0:
        RETURN "NEUTRAL"
    ELSE IF avgImpact >= -0.05:
        RETURN "REVIEW_NEEDED"
    ELSE:
        RETURN "DEPRECATE_CANDIDATE"
```

**Usage Example:**
```javascript
const metrics = await calculateSkillEffectiveness(1, 30);
console.log(`Skill: ${metrics.skillId}`);
console.log(`Avg Confidence Impact: +${metrics.avgConfidenceImpact.toFixed(2)}`);
console.log(`Recommendation: ${metrics.recommendation}`);
```

---

## 2. Database Operations

### 2.1 Skill Creation

**Purpose:** Add new skill to database

**Algorithm:**
```
FUNCTION createSkill(skillData):
    # Validate input
    IF NOT fileExists(skillData.content_path):
        THROW Error("Skill content file not found: " + skillData.content_path)

    # Calculate content hash
    content = readFile(skillData.content_path)
    contentHash = sha256(content)

    # Validate semver
    IF NOT isValidSemver(skillData.version):
        THROW Error("Invalid version format: " + skillData.version)

    # Insert into database
    result = database.execute("""
        INSERT INTO skills (
            name, category, team, content_path, content_hash,
            tags, version, status, owner
        ) VALUES (
            :name, :category, :team, :content_path, :content_hash,
            :tags, :version, :status, :owner
        )
    """, {
        name: skillData.name,
        category: skillData.category,
        team: skillData.team,
        content_path: skillData.content_path,
        content_hash: contentHash,
        tags: JSON.stringify(skillData.tags),
        version: skillData.version,
        status: skillData.status || 'active',
        owner: skillData.owner
    })

    skillId = result.lastInsertRowId

    # Log audit trail
    logAudit("SKILL_CREATED", {skillId: skillId, name: skillData.name})

    RETURN skillId
```

---

### 2.2 Skill Assignment to Agent

**Purpose:** Map skill to agent type with conditions

**Algorithm:**
```
FUNCTION assignSkillToAgent(assignment):
    # Validate skill exists
    skill = database.queryOne("""
        SELECT id FROM skills WHERE id = :skillId AND status = 'active'
    """, {skillId: assignment.skillId})

    IF skill IS NULL:
        THROW Error("Skill not found or deprecated: " + assignment.skillId)

    # Validate priority range
    IF assignment.priority < 1 OR assignment.priority > 10:
        THROW Error("Priority must be between 1 and 10")

    # Validate conditions JSON
    IF assignment.conditions IS NOT NULL:
        IF NOT isValidJSON(assignment.conditions):
            THROW Error("Invalid conditions JSON")

    # Insert or update mapping
    database.execute("""
        INSERT INTO agent_skill_mappings (
            agent_type, skill_id, priority, required, conditions, notes
        ) VALUES (
            :agentType, :skillId, :priority, :required, :conditions, :notes
        )
        ON CONFLICT (agent_type, skill_id) DO UPDATE SET
            priority = :priority,
            required = :required,
            conditions = :conditions,
            notes = :notes,
            updated_at = datetime('now')
    """, {
        agentType: assignment.agentType,
        skillId: assignment.skillId,
        priority: assignment.priority,
        required: assignment.required,
        conditions: JSON.stringify(assignment.conditions),
        notes: assignment.notes
    })

    # Log audit trail
    logAudit("SKILL_ASSIGNED", {
        agentType: assignment.agentType,
        skillId: assignment.skillId
    })

    RETURN TRUE
```

---

### 2.3 Skill Deprecation

**Purpose:** Mark skill as deprecated and suggest replacement

**Algorithm:**
```
FUNCTION deprecateSkill(skillId, replacementId, deprecationNote):
    # Validate skill exists
    skill = database.queryOne("SELECT id FROM skills WHERE id = :id", {id: skillId})
    IF skill IS NULL:
        THROW Error("Skill not found: " + skillId)

    # Validate replacement if provided
    IF replacementId IS NOT NULL:
        replacement = database.queryOne("""
            SELECT id FROM skills WHERE id = :id AND status = 'active'
        """, {id: replacementId})

        IF replacement IS NULL:
            THROW Error("Replacement skill not found or deprecated: " + replacementId)

    # Update skill status
    database.execute("""
        UPDATE skills
        SET status = 'deprecated',
            deprecation_note = :note,
            replacement_id = :replacementId,
            updated_at = datetime('now')
        WHERE id = :skillId
    """, {
        skillId: skillId,
        note: deprecationNote,
        replacementId: replacementId
    })

    # Find affected agents
    affectedAgents = database.query("""
        SELECT DISTINCT agent_type
        FROM agent_skill_mappings
        WHERE skill_id = :skillId
    """, {skillId: skillId})

    # Log warning for affected agents
    FOR agent IN affectedAgents:
        logWarning("Agent " + agent.agent_type + " uses deprecated skill " + skillId)

    # Auto-migrate if replacement provided
    IF replacementId IS NOT NULL AND affectedAgents.length > 0:
        migrateSkillMappings(skillId, replacementId)

    RETURN {
        deprecated: skillId,
        replacement: replacementId,
        affectedAgents: affectedAgents.length
    }

FUNCTION migrateSkillMappings(oldSkillId, newSkillId):
    # Copy mappings to new skill
    database.execute("""
        INSERT INTO agent_skill_mappings (
            agent_type, skill_id, priority, required, conditions, notes
        )
        SELECT
            agent_type, :newSkillId, priority, required, conditions,
            'Auto-migrated from deprecated skill ' || :oldSkillId
        FROM agent_skill_mappings
        WHERE skill_id = :oldSkillId
        ON CONFLICT (agent_type, skill_id) DO NOTHING
    """, {oldSkillId: oldSkillId, newSkillId: newSkillId})

    # Keep old mappings for audit trail (don't delete)
    logAudit("SKILL_MAPPINGS_MIGRATED", {
        from: oldSkillId,
        to: newSkillId
    })
```

---

## 3. Skill Loading

### 3.1 Bootstrap Skills Loading

**Purpose:** Load core skills without database dependency

**Algorithm:**
```
FUNCTION loadBootstrapSkills():
    # Hardcoded bootstrap skills (no DB query)
    bootstrapDefs = [
        {
            name: "database-connection",
            path: ".claude/skills/bootstrap/database-connection.md",
            order: 1
        },
        {
            name: "error-handling",
            path: ".claude/skills/bootstrap/error-handling.md",
            order: 2
        },
        {
            name: "bash-fundamentals",
            path: ".claude/skills/bootstrap/bash-fundamentals.md",
            order: 3
        },
        {
            name: "file-operations",
            path: ".claude/skills/bootstrap/file-operations.md",
            order: 4
        },
        {
            name: "skill-loader",
            path: ".claude/skills/bootstrap/skill-loader.md",
            order: 5
        }
    ]

    skills = []

    FOR def IN bootstrapDefs:
        IF fileExists(def.path):
            content = readFile(def.path)
            skills.append({
                name: def.name,
                content: content,
                priority: def.order,
                isBootstrap: TRUE
            })
        ELSE:
            logError("Bootstrap skill missing: " + def.path)
            THROW Error("Critical bootstrap skill not found")

    RETURN skills
```

**Error Handling:** Missing bootstrap skills are **fatal errors** (block execution)

---

### 3.2 Skill Content Caching

**Purpose:** Cache skill content to avoid repeated disk reads

**Algorithm:**
```
CLASS SkillCache:
    cache = {}  # Map<string, CachedSkill>
    maxSize = 100  # Maximum cached skills
    ttl = 300000  # 5 minutes in milliseconds

    FUNCTION get(skillName):
        IF skillName NOT IN cache:
            RETURN NULL

        cached = cache[skillName]

        # Check if expired
        IF (currentTime() - cached.loadedAt) > ttl:
            DELETE cache[skillName]
            RETURN NULL

        RETURN cached.content

    FUNCTION set(skillName, content):
        # Evict oldest if cache full
        IF size(cache) >= maxSize:
            oldestKey = findOldestCacheKey()
            DELETE cache[oldestKey]

        cache[skillName] = {
            content: content,
            loadedAt: currentTime()
        }

    FUNCTION invalidate(skillName):
        IF skillName IN cache:
            DELETE cache[skillName]

    FUNCTION clear():
        cache = {}

GLOBAL skillCache = new SkillCache()

FUNCTION loadSkillWithCache(skillName, contentPath, contentHash):
    # Try cache first
    cached = skillCache.get(skillName)
    IF cached IS NOT NULL:
        RETURN cached

    # Cache miss - load from disk
    content = readFile(contentPath)

    # Validate hash
    actualHash = sha256(content)
    IF actualHash != contentHash:
        logWarning("Hash mismatch for " + skillName)

    # Store in cache
    skillCache.set(skillName, content)

    RETURN content
```

**Cache Invalidation Triggers:**
- Skill updated in database
- Manual invalidation via CLI
- TTL expiration (5 minutes)
- System restart

---

## 4. CLI Commands

### 4.1 Skill List Command

**Purpose:** Display skills with filtering

**Algorithm:**
```
FUNCTION cliSkillList(options):
    # Build WHERE clause based on filters
    whereClauses = []
    params = {}

    IF options.agent IS NOT NULL:
        whereClauses.append("""
            s.id IN (
                SELECT skill_id FROM agent_skill_mappings
                WHERE agent_type = :agentType
            )
        """)
        params.agentType = options.agent

    IF options.category IS NOT NULL:
        whereClauses.append("s.category = :category")
        params.category = options.category

    IF options.team IS NOT NULL:
        whereClauses.append("s.team = :team")
        params.team = options.team

    IF options.tags IS NOT NULL:
        FOR tag IN options.tags:
            whereClauses.append("s.tags LIKE :tag" + tag)
            params["tag" + tag] = "%\"" + tag + "\"%"

    IF options.status IS NOT NULL:
        whereClauses.append("s.status = :status")
        params.status = options.status
    ELSE:
        whereClauses.append("s.status = 'active'")  # Default: active only

    # Build query
    whereClause = whereClauses.length > 0
        ? "WHERE " + join(whereClauses, " AND ")
        : ""

    query = """
        SELECT
            s.id, s.name, s.category, s.team, s.version,
            s.status, s.tags, s.owner,
            COUNT(m.agent_type) as agent_count
        FROM skills s
        LEFT JOIN agent_skill_mappings m ON s.id = m.skill_id
        """ + whereClause + """
        GROUP BY s.id
        ORDER BY s.category, s.name
    """

    skills = database.query(query, params)

    # Format output
    IF options.format == 'json':
        RETURN JSON.stringify(skills, null, 2)
    ELSE IF options.format == 'yaml':
        RETURN convertToYAML(skills)
    ELSE:  # Default: table format
        RETURN formatAsTable(skills, [
            'id', 'name', 'category', 'version', 'status', 'agent_count'
        ])

FUNCTION formatAsTable(rows, columns):
    # Calculate column widths
    widths = {}
    FOR col IN columns:
        widths[col] = max(
            length(col),
            max(rows.map(row => length(toString(row[col]))))
        )

    # Print header
    header = columns.map(col => padRight(col, widths[col])).join(' | ')
    separator = columns.map(col => repeat('-', widths[col])).join('-+-')

    output = [header, separator]

    # Print rows
    FOR row IN rows:
        line = columns.map(col =>
            padRight(toString(row[col]), widths[col])
        ).join(' | ')
        output.append(line)

    RETURN join(output, '\n')
```

**Example Output:**
```
id | name                | category      | version | status | agent_count
---+---------------------+---------------+---------+--------+------------
1  | cfn-coordination    | coordination  | 2.1.0   | active | 15
2  | jwt-authentication  | domain        | 1.0.0   | active | 3
3  | redis-testing       | testing       | 1.2.0   | active | 8
```

---

### 4.2 Skill Export to YAML

**Purpose:** Export database to version-controlled YAML

**Algorithm:**
```
FUNCTION cliSkillExport(outputPath):
    # Query all skills
    skills = database.query("""
        SELECT * FROM skills ORDER BY id
    """)

    # Query all mappings
    mappings = database.query("""
        SELECT * FROM agent_skill_mappings ORDER BY agent_type, priority
    """)

    # Build YAML structure
    yamlData = {
        version: "1.0",
        exported_at: currentISO8601(),
        schema_version: 1,
        skills: [],
        agent_skill_mappings: []
    }

    # Format skills
    FOR skill IN skills:
        yamlData.skills.append({
            id: skill.id,
            name: skill.name,
            category: skill.category,
            team: skill.team,
            content_path: skill.content_path,
            content_hash: skill.content_hash,
            tags: parseJSON(skill.tags),
            version: skill.version,
            status: skill.status,
            owner: skill.owner,
            deprecation_note: skill.deprecation_note,
            replacement_id: skill.replacement_id
        })

    # Format mappings
    FOR mapping IN mappings:
        yamlData.agent_skill_mappings.append({
            agent_type: mapping.agent_type,
            skill_id: mapping.skill_id,
            priority: mapping.priority,
            required: mapping.required == 1,
            conditions: parseJSON(mapping.conditions),
            notes: mapping.notes
        })

    # Write to file
    yamlContent = convertToYAML(yamlData)
    writeFile(outputPath, yamlContent)

    logInfo("Exported " + skills.length + " skills to " + outputPath)

    RETURN {
        skillsExported: skills.length,
        mappingsExported: mappings.length,
        outputPath: outputPath
    }
```

---

### 4.3 Skill Import from YAML

**Purpose:** Import database from YAML with validation

**Algorithm:**
```
FUNCTION cliSkillImport(inputPath, validateOnly):
    # Read YAML file
    yamlContent = readFile(inputPath)
    data = parseYAML(yamlContent)

    # Validate schema version
    IF data.schema_version != 1:
        THROW Error("Unsupported schema version: " + data.schema_version)

    errors = []
    warnings = []

    # Validate skills
    FOR skill IN data.skills:
        # Check required fields
        IF NOT skill.name OR NOT skill.content_path:
            errors.append("Skill missing required fields: " + JSON.stringify(skill))
            CONTINUE

        # Validate content file exists
        IF NOT fileExists(skill.content_path):
            errors.append("Content file not found: " + skill.content_path)

        # Validate hash matches content
        IF fileExists(skill.content_path):
            content = readFile(skill.content_path)
            actualHash = sha256(content)
            IF actualHash != skill.content_hash:
                warnings.append("Hash mismatch for " + skill.name)

        # Validate semver
        IF NOT isValidSemver(skill.version):
            errors.append("Invalid version for " + skill.name + ": " + skill.version)

    # Validate mappings
    skillIds = new Set(data.skills.map(s => s.id))
    FOR mapping IN data.agent_skill_mappings:
        IF NOT skillIds.has(mapping.skill_id):
            errors.append("Mapping references unknown skill: " + mapping.skill_id)

        IF mapping.priority < 1 OR mapping.priority > 10:
            errors.append("Invalid priority: " + mapping.priority)

    # Return validation results if validate-only
    IF validateOnly:
        RETURN {
            valid: errors.length == 0,
            errors: errors,
            warnings: warnings
        }

    # Abort if validation failed
    IF errors.length > 0:
        THROW Error("Validation failed:\n" + join(errors, '\n'))

    # Begin transaction
    database.beginTransaction()

    TRY:
        # Clear existing data
        database.execute("DELETE FROM agent_skill_mappings")
        database.execute("DELETE FROM skills")

        # Import skills
        FOR skill IN data.skills:
            database.execute("""
                INSERT INTO skills (
                    id, name, category, team, content_path, content_hash,
                    tags, version, status, owner, deprecation_note, replacement_id
                ) VALUES (
                    :id, :name, :category, :team, :content_path, :content_hash,
                    :tags, :version, :status, :owner, :deprecation_note, :replacement_id
                )
            """, {
                id: skill.id,
                name: skill.name,
                category: skill.category,
                team: skill.team,
                content_path: skill.content_path,
                content_hash: skill.content_hash,
                tags: JSON.stringify(skill.tags),
                version: skill.version,
                status: skill.status,
                owner: skill.owner,
                deprecation_note: skill.deprecation_note,
                replacement_id: skill.replacement_id
            })

        # Import mappings
        FOR mapping IN data.agent_skill_mappings:
            database.execute("""
                INSERT INTO agent_skill_mappings (
                    agent_type, skill_id, priority, required, conditions, notes
                ) VALUES (
                    :agentType, :skillId, :priority, :required, :conditions, :notes
                )
            """, {
                agentType: mapping.agent_type,
                skillId: mapping.skill_id,
                priority: mapping.priority,
                required: mapping.required ? 1 : 0,
                conditions: JSON.stringify(mapping.conditions),
                notes: mapping.notes
            })

        database.commit()

        logInfo("Imported " + data.skills.length + " skills successfully")

        RETURN {
            skillsImported: data.skills.length,
            mappingsImported: data.agent_skill_mappings.length
        }

    CATCH error:
        database.rollback()
        THROW error
```

---

## 5. Analytics

### 5.1 Unused Skills Detection

**Purpose:** Identify skills with no usage in past N days

**Algorithm:**
```
FUNCTION findUnusedSkills(days):
    query = """
        SELECT
            s.id, s.name, s.category, s.version,
            s.created_at,
            MAX(ul.loaded_at) as last_used,
            COUNT(DISTINCT m.agent_type) as mapped_agents
        FROM skills s
        LEFT JOIN skill_usage_log ul ON s.id = ul.skill_id
        LEFT JOIN agent_skill_mappings m ON s.id = m.skill_id
        WHERE s.status = 'active'
        GROUP BY s.id
        HAVING last_used IS NULL
            OR last_used < datetime('now', '-' || :days || ' days')
        ORDER BY last_used ASC NULLS FIRST
    """

    unusedSkills = database.query(query, {days: days})

    # Categorize by severity
    results = {
        never_used: [],
        rarely_used: [],
        potentially_deprecated: []
    }

    FOR skill IN unusedSkills:
        IF skill.last_used IS NULL:
            results.never_used.append(skill)
        ELSE IF skill.mapped_agents == 0:
            results.potentially_deprecated.append(skill)
        ELSE:
            results.rarely_used.append(skill)

    RETURN results
```

---

### 5.2 Cross-Team Skill Usage

**Purpose:** Identify foundation skills used across multiple teams

**Algorithm:**
```
FUNCTION analyzeCrossTeamUsage():
    query = """
        SELECT
            s.id, s.name, s.team as owner_team,
            GROUP_CONCAT(DISTINCT ul.agent_type) as using_agents,
            COUNT(DISTINCT CASE
                WHEN ul.agent_type LIKE 'cfn-%' THEN 'cfn'
                WHEN ul.agent_type LIKE 'marketing-%' THEN 'marketing'
                WHEN ul.agent_type LIKE 'data-%' THEN 'data-eng'
                ELSE 'other'
            END) as team_count,
            COUNT(*) as total_usage
        FROM skills s
        INNER JOIN skill_usage_log ul ON s.id = ul.skill_id
        WHERE s.team = 'foundation'
          AND ul.loaded_at >= datetime('now', '-30 days')
        GROUP BY s.id
        HAVING team_count >= 2
        ORDER BY team_count DESC, total_usage DESC
    """

    crossTeamSkills = database.query(query)

    # Format report
    report = []
    FOR skill IN crossTeamSkills:
        report.append({
            skill: skill.name,
            ownerTeam: skill.owner_team,
            teamsUsing: skill.team_count,
            totalUsage: skill.total_usage,
            recommendation: generateCrossTeamRecommendation(skill)
        })

    RETURN report

FUNCTION generateCrossTeamRecommendation(skill):
    IF skill.team_count >= 4:
        RETURN "PROMOTE_TO_CORE"  # Used by 4+ teams
    ELSE IF skill.total_usage >= 100:
        RETURN "MAINTAIN_FOUNDATION"  # High usage
    ELSE:
        RETURN "MONITOR"  # Emerging cross-team usage
```

---

## 6. Migration Scripts

### 6.1 Filesystem to Database Migration

**Purpose:** Seed database from existing `.claude/skills/*` directories

**Algorithm:**
```
FUNCTION seedFromFilesystem(skillsDirectory):
    # Discover all SKILL.md files
    skillFiles = findFiles(skillsDirectory + "/**/SKILL.md")

    imported = []
    errors = []

    FOR filePath IN skillFiles:
        TRY:
            # Extract metadata from file path
            # e.g., .claude/skills/cfn-coordination/SKILL.md
            parts = splitPath(filePath)
            skillName = parts[-2]  # Parent directory name

            # Infer category from prefix
            category = inferCategory(skillName)

            # Infer team from prefix
            team = inferTeam(skillName)

            # Read content and calculate hash
            content = readFile(filePath)
            contentHash = sha256(content)

            # Parse frontmatter for additional metadata
            frontmatter = parseFrontmatter(content)

            # Insert into database
            database.execute("""
                INSERT OR IGNORE INTO skills (
                    name, category, team, content_path, content_hash,
                    tags, version, status, owner
                ) VALUES (
                    :name, :category, :team, :path, :hash,
                    :tags, :version, 'active', :owner
                )
            """, {
                name: skillName,
                category: category,
                team: team,
                path: filePath,
                hash: contentHash,
                tags: JSON.stringify(frontmatter.tags || []),
                version: frontmatter.version || '1.0.0',
                owner: frontmatter.owner || team
            })

            imported.append(skillName)

        CATCH error:
            errors.append({file: filePath, error: error.message})

    RETURN {
        imported: imported.length,
        errors: errors
    }

FUNCTION inferCategory(skillName):
    IF skillName.includes('coordination') OR skillName.includes('orchestration'):
        RETURN 'coordination'
    ELSE IF skillName.includes('test'):
        RETURN 'testing'
    ELSE IF skillName.includes('docker') OR skillName.includes('redis'):
        RETURN 'infrastructure'
    ELSE:
        RETURN 'domain'

FUNCTION inferTeam(skillName):
    IF skillName.startsWith('cfn-'):
        RETURN 'cfn'
    ELSE IF skillName.startsWith('marketing-'):
        RETURN 'marketing'
    ELSE IF skillName.startsWith('data-'):
        RETURN 'data-eng'
    ELSE:
        RETURN 'foundation'
```

---

## 7. Validation Logic

### 7.1 Circular Dependency Detection

**Purpose:** Prevent skills from depending on themselves (future feature)

**Algorithm:**
```
FUNCTION detectCircularDependencies(skillDependencies):
    # Build dependency graph
    graph = {}
    FOR dep IN skillDependencies:
        IF dep.skill_id NOT IN graph:
            graph[dep.skill_id] = []
        graph[dep.skill_id].append(dep.depends_on_skill_id)

    # DFS to detect cycles
    visited = new Set()
    recursionStack = new Set()

    FUNCTION hasCycle(skillId):
        IF skillId IN recursionStack:
            RETURN TRUE  # Cycle detected

        IF skillId IN visited:
            RETURN FALSE  # Already checked

        visited.add(skillId)
        recursionStack.add(skillId)

        IF skillId IN graph:
            FOR dependencyId IN graph[skillId]:
                IF hasCycle(dependencyId):
                    RETURN TRUE

        recursionStack.remove(skillId)
        RETURN FALSE

    # Check all skills
    cycles = []
    FOR skillId IN keys(graph):
        IF hasCycle(skillId):
            cycles.append(skillId)

    RETURN cycles
```

---

## 8. Complexity Analysis

### 8.1 Time Complexity

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Load skills for agent | O(m log n) | m = mappings, n = total skills, log n for indexed query |
| Validate skill hash | O(k) | k = content size |
| Export to YAML | O(n + m) | n = skills, m = mappings |
| Import from YAML | O(n + m) | Transaction-based |
| Find unused skills | O(n) | Full table scan with aggregation |
| Calculate effectiveness | O(l) | l = usage log entries |

### 8.2 Space Complexity

| Component | Space | Notes |
|-----------|-------|-------|
| Skills table | O(n) | n = number of skills, ~1KB per row |
| Mappings table | O(a × s) | a = agents, s = avg skills per agent |
| Usage log | O(e) | e = events, ~200 bytes per entry |
| Skill cache | O(c) | c = cached skills, max 100 × ~50KB = 5MB |

---

## 9. Error Handling Patterns

### 9.1 Database Error Recovery

**Algorithm:**
```
FUNCTION withDatabaseRecovery(operation):
    TRY:
        RETURN operation()

    CATCH error:
        IF error.type == 'SQLITE_CORRUPT':
            logError("Database corrupted, attempting recovery")

            # Restore from YAML snapshot
            snapshotPath = ".claude/skills-database/snapshot.yaml"
            IF fileExists(snapshotPath):
                cliSkillImport(snapshotPath, validateOnly=FALSE)
                logInfo("Database recovered from snapshot")

                # Retry operation
                RETURN operation()
            ELSE:
                THROW Error("Database corrupt and no snapshot available")

        ELSE IF error.type == 'SQLITE_BUSY':
            # Retry with exponential backoff
            FOR retry IN [100ms, 200ms, 400ms]:
                sleep(retry)
                TRY:
                    RETURN operation()
                CATCH:
                    CONTINUE

            THROW Error("Database locked after retries")

        ELSE:
            THROW error
```

---

## 10. Testing Pseudocode

### 10.1 Unit Test: Contextual Skill Selection

**Algorithm:**
```
TEST contextualSkillSelection():
    # Setup
    database = createTestDatabase()
    seedTestSkills(database)
    seedTestMappings(database)

    # Test 1: Load skills for authentication task
    context = {
        keywords: ["authentication", "jwt"],
        phase: "loop3",
        mode: "standard"
    }

    skills = loadSkillsForAgent("backend-developer", context)

    ASSERT skills.length == 7  # 5 bootstrap + 2 auth-specific
    ASSERT skills[5].name == "jwt-authentication"
    ASSERT skills[6].name == "oauth2-integration"

    # Test 2: Load skills for testing phase
    context2 = {
        keywords: [],
        phase: "loop2",
        mode: "standard"
    }

    skills2 = loadSkillsForAgent("tester", context2)

    ASSERT skills2.length == 8  # 5 bootstrap + 3 testing skills
    ASSERT skills2[5].name == "test-coverage-analysis"

    # Cleanup
    database.close()
```

---

This pseudocode provides implementation-ready algorithms for the dynamic skills database system. All functions include complexity analysis, error handling, and validation logic.
