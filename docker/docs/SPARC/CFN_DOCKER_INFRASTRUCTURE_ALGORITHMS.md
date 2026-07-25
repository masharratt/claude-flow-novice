# CFN Docker Infrastructure - Algorithm Design Specification

**Version:** 1.0.0
**Status:** Design Phase
**Author:** Pseudocode Specialist
**Date:** 2025-11-14

## Executive Summary

This document provides detailed algorithm specifications for the CFN Loop Docker infrastructure standardization initiative. Each algorithm includes complexity analysis, edge case handling, and implementation guidance to ensure correctness before code generation.

## Table of Contents

1. [Image Contract Validation Algorithm](#1-image-contract-validation-algorithm)
2. [Runtime Selection Algorithm](#2-runtime-selection-algorithm)
3. [Cross-Runtime Coordination Protocol](#3-cross-runtime-coordination-protocol)
4. [Multi-Layer Testing Pipeline](#4-multi-layer-testing-pipeline)
5. [Image Build & Deployment Pipeline](#5-image-build--deployment-pipeline)
6. [Agent Spawn Logic Enhancement](#6-agent-spawn-logic-enhancement)
7. [Appendix: Data Structures](#appendix-data-structures)

---

## 1. Image Contract Validation Algorithm

### Purpose
Validate that a Docker image implements all 7 mandatory capabilities required by the CFN Loop image contract.

### Algorithm Specification

```
ALGORITHM: ValidateImageContract
INPUT:
    imageName (string)      - Docker image identifier (name:tag)
    contractVersion (string) - Contract version to validate against (e.g., "1.0.0")

OUTPUT:
    ValidationResult {
        passed: boolean
        contractVersion: string
        capabilities: Map<CapabilityName, CapabilityResult>
        summary: string
        failureReasons: List<string>
    }

CONSTANTS:
    REQUIRED_CAPABILITIES = [
        "coordination-protocol",
        "task-execution",
        "file-operations",
        "bash-execution",
        "memory-operations",
        "skill-loading",
        "lifecycle-reporting"
    ]

    CAPABILITY_TESTS = Map {
        "coordination-protocol": TestCoordinationProtocol,
        "task-execution": TestTaskExecution,
        "file-operations": TestFileOperations,
        "bash-execution": TestBashExecution,
        "memory-operations": TestMemoryOperations,
        "skill-loading": TestSkillLoading,
        "lifecycle-reporting": TestLifecycleReporting
    }

    TIMEOUT_PER_TEST = 30 seconds
    MAX_RETRIES = 2

BEGIN
    // Initialize result structure
    result ← NEW ValidationResult
    result.contractVersion ← contractVersion
    result.capabilities ← EMPTY_MAP
    result.failureReasons ← EMPTY_LIST

    // Step 1: Pre-flight checks
    IF NOT ImageExists(imageName) THEN
        result.passed ← FALSE
        result.failureReasons.ADD("Image not found: " + imageName)
        RETURN result
    END IF

    // Step 2: Check image metadata for contract version
    imageMetadata ← InspectImage(imageName)
    declaredVersion ← imageMetadata.labels["cfn.contract.version"]

    IF declaredVersion IS NULL THEN
        result.failureReasons.ADD("Image missing CFN contract version label")
    ELSE IF NOT IsCompatibleVersion(declaredVersion, contractVersion) THEN
        result.failureReasons.ADD("Contract version mismatch: expected " +
                                  contractVersion + ", found " + declaredVersion)
    END IF

    // Step 3: Test each capability
    allPassed ← TRUE
    FOR EACH capability IN REQUIRED_CAPABILITIES DO
        testFunction ← CAPABILITY_TESTS[capability]
        capabilityResult ← ExecuteCapabilityTest(
            imageName,
            testFunction,
            TIMEOUT_PER_TEST,
            MAX_RETRIES
        )

        result.capabilities[capability] ← capabilityResult

        IF NOT capabilityResult.passed THEN
            allPassed ← FALSE
            result.failureReasons.ADD(
                capability + " failed: " + capabilityResult.errorMessage
            )
        END IF
    END FOR

    // Step 4: Generate summary
    result.passed ← allPassed AND result.failureReasons.isEmpty()

    IF result.passed THEN
        result.summary ← "All " + REQUIRED_CAPABILITIES.length +
                        " capabilities validated successfully"
    ELSE
        result.summary ← "Validation failed: " + result.failureReasons.length +
                        " issues found"
    END IF

    RETURN result
END


ALGORITHM: ExecuteCapabilityTest
INPUT:
    imageName (string)
    testFunction (function)
    timeout (integer)
    maxRetries (integer)

OUTPUT:
    CapabilityResult {
        passed: boolean
        executionTime: float
        errorMessage: string
        retryCount: integer
    }

BEGIN
    result ← NEW CapabilityResult
    retryCount ← 0

    WHILE retryCount <= maxRetries DO
        startTime ← CurrentTime()

        TRY
            // Create isolated test container
            containerId ← CreateContainer(imageName, {
                network: "isolated",
                resources: {cpu: "0.5", memory: "512m"},
                autoRemove: FALSE
            })

            // Execute test function
            testOutput ← testFunction(containerId, timeout)

            // Validate test output
            IF testOutput.exitCode == 0 AND testOutput.passed THEN
                result.passed ← TRUE
                result.executionTime ← CurrentTime() - startTime
                result.retryCount ← retryCount

                // Cleanup
                RemoveContainer(containerId)
                RETURN result
            ELSE
                result.errorMessage ← testOutput.error
            END IF

        CATCH exception AS e
            result.errorMessage ← "Test execution failed: " + e.message

        FINALLY
            // Ensure container cleanup
            IF ContainerExists(containerId) THEN
                RemoveContainer(containerId, force: TRUE)
            END IF
        END TRY

        retryCount ← retryCount + 1

        IF retryCount <= maxRetries THEN
            Sleep(2^retryCount seconds)  // Exponential backoff
        END IF
    END WHILE

    // All retries exhausted
    result.passed ← FALSE
    result.retryCount ← retryCount - 1

    RETURN result
END
```

### Individual Capability Test Functions

```
FUNCTION: TestCoordinationProtocol
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput {passed: boolean, exitCode: integer, error: string}

BEGIN
    // Test coordination-signal capability
    signalResult ← ExecInContainer(containerId,
        "coordination-signal 'test:key' 'test-value'",
        timeout
    )

    IF signalResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: signalResult.exitCode,
                error: "coordination-signal failed"}
    END IF

    // Test coordination-wait capability
    waitResult ← ExecInContainer(containerId,
        "coordination-wait 'test:key' --timeout 5",
        timeout
    )

    IF waitResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: waitResult.exitCode,
                error: "coordination-wait failed"}
    END IF

    // Verify protocol version
    versionResult ← ExecInContainer(containerId,
        "coordination-signal --version",
        timeout
    )

    IF versionResult.exitCode != 0 OR
       NOT IsValidProtocolVersion(versionResult.stdout) THEN
        RETURN {passed: FALSE, exitCode: versionResult.exitCode,
                error: "Invalid protocol version"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END


FUNCTION: TestTaskExecution
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput

BEGIN
    // Create test task file
    taskContent ← '{
        "task_id": "test-task",
        "agent_type": "validator",
        "description": "Test task execution"
    }'

    writeResult ← ExecInContainer(containerId,
        "echo '" + taskContent + "' > /tmp/test-task.json",
        timeout
    )

    IF writeResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: writeResult.exitCode,
                error: "Failed to create test task"}
    END IF

    // Execute task
    execResult ← ExecInContainer(containerId,
        "execute-task /tmp/test-task.json",
        timeout
    )

    IF execResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: execResult.exitCode,
                error: "Task execution failed"}
    END IF

    // Verify task output
    IF NOT ContainsString(execResult.stdout, "task_id") OR
       NOT ContainsString(execResult.stdout, "status") THEN
        RETURN {passed: FALSE, exitCode: 1,
                error: "Invalid task output format"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END


FUNCTION: TestFileOperations
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput

BEGIN
    testFile ← "/tmp/cfn-test-file.txt"
    testContent ← "CFN file operations test"

    // Test write
    writeResult ← ExecInContainer(containerId,
        "echo '" + testContent + "' > " + testFile,
        timeout
    )

    IF writeResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: writeResult.exitCode,
                error: "File write failed"}
    END IF

    // Test read
    readResult ← ExecInContainer(containerId,
        "cat " + testFile,
        timeout
    )

    IF readResult.exitCode != 0 OR readResult.stdout != testContent THEN
        RETURN {passed: FALSE, exitCode: readResult.exitCode,
                error: "File read failed or content mismatch"}
    END IF

    // Test delete
    deleteResult ← ExecInContainer(containerId,
        "rm " + testFile,
        timeout
    )

    IF deleteResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: deleteResult.exitCode,
                error: "File delete failed"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END


FUNCTION: TestBashExecution
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput

BEGIN
    // Test basic command execution
    basicResult ← ExecInContainer(containerId, "echo 'test'", timeout)

    IF basicResult.exitCode != 0 OR basicResult.stdout != "test" THEN
        RETURN {passed: FALSE, exitCode: basicResult.exitCode,
                error: "Basic bash execution failed"}
    END IF

    // Test environment variables
    envResult ← ExecInContainer(containerId,
        "export TEST_VAR='value' && echo $TEST_VAR",
        timeout
    )

    IF envResult.exitCode != 0 OR envResult.stdout != "value" THEN
        RETURN {passed: FALSE, exitCode: envResult.exitCode,
                error: "Environment variable handling failed"}
    END IF

    // Test command chaining
    chainResult ← ExecInContainer(containerId,
        "echo 'first' && echo 'second'",
        timeout
    )

    IF chainResult.exitCode != 0 OR
       NOT ContainsString(chainResult.stdout, "first") OR
       NOT ContainsString(chainResult.stdout, "second") THEN
        RETURN {passed: FALSE, exitCode: chainResult.exitCode,
                error: "Command chaining failed"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END


FUNCTION: TestMemoryOperations
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput

BEGIN
    testKey ← "cfn-test-memory-key"
    testValue ← '{"data": "test-value", "timestamp": 1699999999}'

    // Test memory write
    writeResult ← ExecInContainer(containerId,
        "memory-set '" + testKey + "' '" + testValue + "'",
        timeout
    )

    IF writeResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: writeResult.exitCode,
                error: "Memory write failed"}
    END IF

    // Test memory read
    readResult ← ExecInContainer(containerId,
        "memory-get '" + testKey + "'",
        timeout
    )

    IF readResult.exitCode != 0 OR readResult.stdout != testValue THEN
        RETURN {passed: FALSE, exitCode: readResult.exitCode,
                error: "Memory read failed or value mismatch"}
    END IF

    // Test memory delete
    deleteResult ← ExecInContainer(containerId,
        "memory-delete '" + testKey + "'",
        timeout
    )

    IF deleteResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: deleteResult.exitCode,
                error: "Memory delete failed"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END


FUNCTION: TestSkillLoading
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput

BEGIN
    // Test skill directory existence
    dirResult ← ExecInContainer(containerId,
        "test -d /.claude/skills",
        timeout
    )

    IF dirResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: dirResult.exitCode,
                error: "Skills directory not found"}
    END IF

    // Test skill loading capability
    loadResult ← ExecInContainer(containerId,
        "load-skill coordination",
        timeout
    )

    IF loadResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: loadResult.exitCode,
                error: "Skill loading failed"}
    END IF

    // Verify skill metadata
    IF NOT ContainsString(loadResult.stdout, "skill_name") OR
       NOT ContainsString(loadResult.stdout, "version") THEN
        RETURN {passed: FALSE, exitCode: 1,
                error: "Invalid skill metadata"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END


FUNCTION: TestLifecycleReporting
INPUT: containerId (string), timeout (integer)
OUTPUT: TestOutput

BEGIN
    testAgentId ← "test-agent-" + GenerateUUID()

    // Test lifecycle spawn reporting
    spawnResult ← ExecInContainer(containerId,
        "report-lifecycle spawn '" + testAgentId + "' --type 'validator'",
        timeout
    )

    IF spawnResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: spawnResult.exitCode,
                error: "Lifecycle spawn reporting failed"}
    END IF

    // Test lifecycle completion reporting
    completeResult ← ExecInContainer(containerId,
        "report-lifecycle complete '" + testAgentId + "' --confidence 0.85",
        timeout
    )

    IF completeResult.exitCode != 0 THEN
        RETURN {passed: FALSE, exitCode: completeResult.exitCode,
                error: "Lifecycle completion reporting failed"}
    END IF

    // Verify lifecycle data format
    queryResult ← ExecInContainer(containerId,
        "query-lifecycle '" + testAgentId + "'",
        timeout
    )

    IF queryResult.exitCode != 0 OR
       NOT ContainsString(queryResult.stdout, "spawned_at") OR
       NOT ContainsString(queryResult.stdout, "completed_at") THEN
        RETURN {passed: FALSE, exitCode: 1,
                error: "Invalid lifecycle data format"}
    END IF

    RETURN {passed: TRUE, exitCode: 0, error: ""}
END
```

### Complexity Analysis

**Time Complexity:**
- Overall: O(C × (T + R × E))
  - C = number of capabilities (7, constant)
  - T = timeout per test (30s, constant)
  - R = max retries (2, constant)
  - E = average execution time per test (~5s)
- **Worst case:** ~7 × (30 + 2 × 5) = ~280 seconds
- **Average case:** ~7 × 5 = ~35 seconds

**Space Complexity:**
- O(C) for storing capability results
- O(1) per container instance (cleaned up after each test)
- **Total:** O(C) = O(7) = O(1)

### Edge Cases

1. **Image Not Found:** Pre-flight check catches missing images before testing
2. **Partial Contract Implementation:** Individual capability failures tracked separately
3. **Version Mismatch:** Contract version validation in metadata inspection
4. **Timeout Scenarios:** Per-test timeout with exponential backoff retry
5. **Container Cleanup Failure:** FINALLY block ensures cleanup even on exception
6. **Network Isolation Issues:** Tests run in isolated network to prevent interference
7. **Resource Exhaustion:** Resource limits (CPU, memory) prevent runaway tests
8. **Concurrent Validation:** Algorithm is stateless, supports parallel execution

### Performance Optimization Points

1. **Parallel Capability Testing:** Tests are independent, can run concurrently
2. **Container Reuse:** Option to reuse container for multiple tests (trade-off: isolation vs speed)
3. **Early Exit:** Fast-fail on pre-flight checks saves 35-280 seconds
4. **Smart Retry:** Exponential backoff prevents thundering herd on transient failures
5. **Caching:** Image pull can be cached, metadata inspection cached for 5 minutes

---

## 2. Runtime Selection Algorithm

### Purpose
Select the appropriate Docker image for an agent based on its runtime requirements specified in agent metadata.

### Algorithm Specification

```
ALGORITHM: SelectRuntime
INPUT:
    agentType (string)         - Agent identifier (e.g., "backend-developer")
    agentMetadataPath (string)  - Path to agent .md file

OUTPUT:
    RuntimeSelection {
        imageName: string      - Full image name (e.g., "cfn-node:1.0.0")
        runtime: string        - Runtime identifier (e.g., "node")
        version: string        - Image version
        fallbackUsed: boolean  - Whether fallback logic was triggered
        warnings: List<string> - Any compatibility warnings
    }

CONSTANTS:
    DEFAULT_RUNTIME = "node"
    DEFAULT_VERSION = "latest"

    SUPPORTED_RUNTIMES = [
        "node",     // Node.js (TypeScript/JavaScript)
        "python",   // Python
        "rust",     // Rust
        "go",       // Go
        "java"      // Java/JVM
    ]

    RUNTIME_IMAGE_MAP = Map {
        "node": "cfn-node",
        "python": "cfn-python",
        "rust": "cfn-rust",
        "go": "cfn-go",
        "java": "cfn-java"
    }

    VERSION_COMPATIBILITY = Map {
        "1.0.0": ["node", "python"],     // Initial release
        "1.1.0": ["node", "python", "rust", "go"],  // Multi-runtime
        "2.0.0": ["node", "python", "rust", "go", "java"]  // Full support
    }

BEGIN
    result ← NEW RuntimeSelection
    result.warnings ← EMPTY_LIST
    result.fallbackUsed ← FALSE

    // Step 1: Parse agent metadata
    metadata ← ParseAgentMetadata(agentMetadataPath)

    IF metadata IS NULL THEN
        // Critical failure: cannot read agent metadata
        result.runtime ← DEFAULT_RUNTIME
        result.version ← DEFAULT_VERSION
        result.imageName ← RUNTIME_IMAGE_MAP[DEFAULT_RUNTIME] + ":" + DEFAULT_VERSION
        result.fallbackUsed ← TRUE
        result.warnings.ADD("Failed to parse agent metadata, using default runtime")
        RETURN result
    END IF

    // Step 2: Extract runtime requirement from frontmatter
    runtimeRequirement ← metadata.frontmatter["RUNTIME_REQUIREMENT"]

    IF runtimeRequirement IS NULL THEN
        // No explicit requirement: use agent type heuristics
        runtimeRequirement ← InferRuntimeFromAgentType(agentType)
        result.warnings.ADD("No runtime specified, inferred: " + runtimeRequirement)
    END IF

    // Step 3: Validate runtime is supported
    IF NOT SUPPORTED_RUNTIMES.contains(runtimeRequirement) THEN
        result.warnings.ADD("Unsupported runtime '" + runtimeRequirement +
                          "', falling back to " + DEFAULT_RUNTIME)
        runtimeRequirement ← DEFAULT_RUNTIME
        result.fallbackUsed ← TRUE
    END IF

    result.runtime ← runtimeRequirement

    // Step 4: Determine version
    requestedVersion ← metadata.frontmatter["RUNTIME_VERSION"]

    IF requestedVersion IS NULL THEN
        requestedVersion ← GetLatestCompatibleVersion(runtimeRequirement)
    ELSE IF NOT IsVersionAvailable(runtimeRequirement, requestedVersion) THEN
        result.warnings.ADD("Version " + requestedVersion + " not available for " +
                          runtimeRequirement + ", using latest")
        requestedVersion ← GetLatestCompatibleVersion(runtimeRequirement)
        result.fallbackUsed ← TRUE
    END IF

    result.version ← requestedVersion

    // Step 5: Construct image name
    baseImageName ← RUNTIME_IMAGE_MAP[runtimeRequirement]
    result.imageName ← baseImageName + ":" + requestedVersion

    // Step 6: Verify image exists and is healthy
    IF NOT ImageExists(result.imageName) THEN
        result.warnings.ADD("Image " + result.imageName + " not found locally")

        // Attempt to pull image
        IF PullImage(result.imageName) THEN
            result.warnings.ADD("Image pulled successfully")
        ELSE
            // Pull failed: fall back to default
            result.imageName ← RUNTIME_IMAGE_MAP[DEFAULT_RUNTIME] + ":" + DEFAULT_VERSION
            result.runtime ← DEFAULT_RUNTIME
            result.version ← DEFAULT_VERSION
            result.fallbackUsed ← TRUE
            result.warnings.ADD("Image pull failed, using default runtime")
        END IF
    END IF

    // Step 7: Health check
    healthStatus ← CheckImageHealth(result.imageName)

    IF NOT healthStatus.healthy THEN
        result.warnings.ADD("Image health check failed: " + healthStatus.reason)

        // Try previous version
        previousVersion ← GetPreviousVersion(requestedVersion)
        IF previousVersion IS NOT NULL THEN
            alternateImage ← baseImageName + ":" + previousVersion
            IF ImageExists(alternateImage) AND CheckImageHealth(alternateImage).healthy THEN
                result.imageName ← alternateImage
                result.version ← previousVersion
                result.warnings.ADD("Rolled back to version " + previousVersion)
            END IF
        END IF
    END IF

    RETURN result
END


FUNCTION: ParseAgentMetadata
INPUT: metadataPath (string)
OUTPUT: AgentMetadata {frontmatter: Map, content: string} OR NULL

BEGIN
    IF NOT FileExists(metadataPath) THEN
        RETURN NULL
    END IF

    fileContent ← ReadFile(metadataPath)

    // Extract YAML frontmatter
    frontmatterMatch ← Regex.Match(fileContent, "^---\n(.*?)\n---", DOTALL)

    IF NOT frontmatterMatch.success THEN
        // Try alternate format: <!-- RUNTIME_REQUIREMENT ... -->
        runtimeMatch ← Regex.Match(fileContent,
            "<!--\s*RUNTIME_REQUIREMENT\s*:\s*(\w+)\s*-->")

        IF runtimeMatch.success THEN
            metadata ← NEW AgentMetadata
            metadata.frontmatter ← Map {"RUNTIME_REQUIREMENT": runtimeMatch.group(1)}
            metadata.content ← fileContent
            RETURN metadata
        END IF

        RETURN NULL
    END IF

    // Parse YAML frontmatter
    TRY
        yamlContent ← frontmatterMatch.group(1)
        frontmatterData ← ParseYAML(yamlContent)

        metadata ← NEW AgentMetadata
        metadata.frontmatter ← frontmatterData
        metadata.content ← fileContent

        RETURN metadata

    CATCH exception AS e
        LogError("Failed to parse YAML frontmatter: " + e.message)
        RETURN NULL
    END TRY
END


FUNCTION: InferRuntimeFromAgentType
INPUT: agentType (string)
OUTPUT: runtime (string)

BEGIN
    // Pattern matching on agent type
    agentTypeLower ← ToLowerCase(agentType)

    // Node.js/TypeScript patterns
    IF ContainsAny(agentTypeLower, ["typescript", "javascript", "node", "react", "vue", "frontend"]) THEN
        RETURN "node"
    END IF

    // Python patterns
    IF ContainsAny(agentTypeLower, ["python", "django", "flask", "data-engineer", "ml"]) THEN
        RETURN "python"
    END IF

    // Rust patterns
    IF ContainsAny(agentTypeLower, ["rust", "systems", "embedded"]) THEN
        RETURN "rust"
    END IF

    // Go patterns
    IF ContainsAny(agentTypeLower, ["go", "golang", "microservice", "api"]) THEN
        RETURN "go"
    END IF

    // Java patterns
    IF ContainsAny(agentTypeLower, ["java", "spring", "jvm", "kotlin"]) THEN
        RETURN "java"
    END IF

    // Default fallback
    RETURN DEFAULT_RUNTIME
END


FUNCTION: GetLatestCompatibleVersion
INPUT: runtime (string)
OUTPUT: version (string)

BEGIN
    availableVersions ← EMPTY_LIST

    // Iterate VERSION_COMPATIBILITY to find compatible versions
    FOR EACH (version, supportedRuntimes) IN VERSION_COMPATIBILITY DO
        IF supportedRuntimes.contains(runtime) THEN
            availableVersions.ADD(version)
        END IF
    END FOR

    IF availableVersions.isEmpty() THEN
        RETURN DEFAULT_VERSION
    END IF

    // Sort versions in descending order (semantic versioning)
    SortDescending(availableVersions, SemanticVersionComparator)

    RETURN availableVersions[0]  // Return latest
END


FUNCTION: CheckImageHealth
INPUT: imageName (string)
OUTPUT: HealthStatus {healthy: boolean, reason: string}

BEGIN
    // Quick validation: run contract validation with minimal timeout
    validationResult ← ValidateImageContract(imageName, "1.0.0")

    IF validationResult.passed THEN
        RETURN {healthy: TRUE, reason: ""}
    ELSE
        // Check if it's a critical failure or minor issue
        criticalFailures ← 0
        FOR EACH capability IN validationResult.capabilities DO
            IF NOT capability.passed THEN
                criticalFailures ← criticalFailures + 1
            END IF
        END FOR

        IF criticalFailures > 3 THEN  // More than half failed
            RETURN {healthy: FALSE,
                   reason: "Critical contract violations: " + criticalFailures}
        ELSE
            // Minor issues: still usable
            RETURN {healthy: TRUE,
                   reason: "Minor issues: " + criticalFailures + " capabilities degraded"}
        END IF
    END IF
END
```

### Complexity Analysis

**Time Complexity:**
- File read: O(F) where F = file size (~10KB)
- YAML parsing: O(Y) where Y = YAML size (~1KB)
- Runtime inference: O(P × K) where P = number of patterns (~20), K = pattern length (~10)
- Version lookup: O(V) where V = number of versions (~10)
- **Overall:** O(F + Y + P×K + V) = O(F) ≈ **O(1)** (constant file sizes)

**Space Complexity:**
- Metadata storage: O(F)
- Version list: O(V)
- **Total:** O(F + V) ≈ **O(1)** (bounded by small constants)

### Edge Cases

1. **Missing Metadata File:** Returns default runtime with warning
2. **Malformed YAML:** Falls back to regex pattern matching
3. **Unsupported Runtime:** Falls back to default with warning
4. **Version Not Available:** Uses latest compatible version
5. **Image Pull Failure:** Falls back to default runtime
6. **Unhealthy Image:** Attempts rollback to previous version
7. **Ambiguous Agent Type:** Uses pattern matching heuristics
8. **Version Compatibility Conflict:** Selects highest compatible version

### Performance Optimization Points

1. **Metadata Caching:** Cache parsed metadata for 5 minutes
2. **Image Health Cache:** Cache health checks for 1 minute
3. **Lazy Image Pull:** Only pull if not exists locally
4. **Parallel Health Checks:** When checking multiple images, run in parallel
5. **Smart Inference:** Pattern matching before full YAML parse

---

## 3. Cross-Runtime Coordination Protocol

### Purpose
Enable seamless coordination messaging between agents running in different runtime environments (Node.js, Python, Rust, Go, Java).

### Protocol Design

```
ALGORITHM: EncodeCoordinationMessage
INPUT:
    messageType (string)    - Message type (e.g., "signal", "wait", "broadcast")
    key (string)           - Coordination key (e.g., "swarm:task-123:done")
    value (any)            - Message payload (language-specific type)
    protocolVersion (string) - Protocol version (e.g., "1.0.0")

OUTPUT:
    EncodedMessage (string) - JSON-encoded message with metadata

CONSTANTS:
    SUPPORTED_PROTOCOL_VERSIONS = ["1.0.0", "1.1.0", "2.0.0"]
    MAX_MESSAGE_SIZE = 1048576  // 1MB
    MESSAGE_TTL = 3600          // 1 hour in seconds

BEGIN
    // Step 1: Validate protocol version
    IF NOT SUPPORTED_PROTOCOL_VERSIONS.contains(protocolVersion) THEN
        THROW InvalidProtocolVersionException(protocolVersion)
    END IF

    // Step 2: Create message envelope
    envelope ← Map {
        "protocol_version": protocolVersion,
        "message_type": messageType,
        "key": key,
        "timestamp": CurrentUnixTimestamp(),
        "ttl": MESSAGE_TTL,
        "sender": Map {
            "agent_id": GetCurrentAgentId(),
            "runtime": GetCurrentRuntime(),
            "runtime_version": GetRuntimeVersion()
        }
    }

    // Step 3: Serialize payload to language-agnostic format
    serializedValue ← SerializePayload(value, protocolVersion)
    envelope["payload"] ← serializedValue
    envelope["payload_encoding"] ← serializedValue.encoding
    envelope["payload_size"] ← Length(serializedValue.data)

    // Step 4: Validate message size
    IF envelope["payload_size"] > MAX_MESSAGE_SIZE THEN
        THROW MessageTooLargeException(envelope["payload_size"], MAX_MESSAGE_SIZE)
    END IF

    // Step 5: Add checksum for integrity
    envelope["checksum"] ← CalculateSHA256(serializedValue.data)

    // Step 6: Encode to JSON
    TRY
        jsonMessage ← ToJSON(envelope)
        RETURN jsonMessage

    CATCH exception AS e
        THROW EncodingException("Failed to encode message: " + e.message)
    END TRY
END


ALGORITHM: DecodeCoordinationMessage
INPUT:
    encodedMessage (string)     - JSON-encoded message
    supportedVersions (List)    - Protocol versions this runtime supports

OUTPUT:
    DecodedMessage {
        messageType: string,
        key: string,
        value: any,              // Deserialized to language-specific type
        metadata: Map,
        versionCompatible: boolean
    }

BEGIN
    // Step 1: Parse JSON envelope
    TRY
        envelope ← ParseJSON(encodedMessage)
    CATCH exception AS e
        THROW DecodingException("Invalid JSON: " + e.message)
    END TRY

    // Step 2: Validate required fields
    requiredFields ← ["protocol_version", "message_type", "key", "payload", "checksum"]
    FOR EACH field IN requiredFields DO
        IF NOT envelope.hasKey(field) THEN
            THROW MalformedMessageException("Missing field: " + field)
        END IF
    END FOR

    // Step 3: Check protocol version compatibility
    messageVersion ← envelope["protocol_version"]
    compatible ← IsVersionCompatible(messageVersion, supportedVersions)

    IF NOT compatible THEN
        // Log warning but attempt decode with fallback
        LogWarning("Protocol version mismatch: message=" + messageVersion +
                  ", supported=" + supportedVersions)
    END IF

    // Step 4: Verify message integrity
    payloadData ← envelope["payload"]["data"]
    expectedChecksum ← envelope["checksum"]
    actualChecksum ← CalculateSHA256(payloadData)

    IF actualChecksum != expectedChecksum THEN
        THROW IntegrityException("Checksum mismatch: expected=" + expectedChecksum +
                                ", actual=" + actualChecksum)
    END IF

    // Step 5: Check message TTL
    messageTimestamp ← envelope["timestamp"]
    messageTTL ← envelope["ttl"]
    currentTime ← CurrentUnixTimestamp()

    IF (currentTime - messageTimestamp) > messageTTL THEN
        THROW ExpiredMessageException("Message expired: age=" +
                                     (currentTime - messageTimestamp) + "s")
    END IF

    // Step 6: Deserialize payload
    payloadEncoding ← envelope["payload"]["encoding"]
    deserializedValue ← DeserializePayload(
        payloadData,
        payloadEncoding,
        messageVersion
    )

    // Step 7: Construct result
    result ← NEW DecodedMessage
    result.messageType ← envelope["message_type"]
    result.key ← envelope["key"]
    result.value ← deserializedValue
    result.metadata ← envelope["sender"]
    result.versionCompatible ← compatible

    RETURN result
END


FUNCTION: SerializePayload
INPUT:
    value (any)
    protocolVersion (string)

OUTPUT:
    SerializedPayload {
        encoding: string,
        data: bytes
    }

BEGIN
    // Determine best encoding based on value type
    valueType ← GetTypeOf(value)

    SWITCH valueType DO
        CASE "string":
            RETURN {encoding: "utf-8", data: EncodeUTF8(value)}

        CASE "number":
            RETURN {encoding: "json", data: EncodeUTF8(ToJSON({"value": value}))}

        CASE "boolean":
            RETURN {encoding: "json", data: EncodeUTF8(ToJSON({"value": value}))}

        CASE "null":
            RETURN {encoding: "json", data: EncodeUTF8("null")}

        CASE "array", "list":
            RETURN {encoding: "json", data: EncodeUTF8(ToJSON(value))}

        CASE "object", "map", "dict":
            RETURN {encoding: "json", data: EncodeUTF8(ToJSON(value))}

        CASE "bytes", "binary":
            RETURN {encoding: "base64", data: Base64Encode(value)}

        DEFAULT:
            // Fallback: try JSON serialization
            TRY
                RETURN {encoding: "json", data: EncodeUTF8(ToJSON(value))}
            CATCH exception AS e
                // Last resort: convert to string
                RETURN {encoding: "utf-8", data: EncodeUTF8(ToString(value))}
            END TRY
    END SWITCH
END


FUNCTION: DeserializePayload
INPUT:
    data (bytes)
    encoding (string)
    protocolVersion (string)

OUTPUT:
    value (any)  - Deserialized to language-specific type

BEGIN
    SWITCH encoding DO
        CASE "utf-8":
            RETURN DecodeUTF8(data)

        CASE "json":
            jsonString ← DecodeUTF8(data)
            parsed ← ParseJSON(jsonString)

            // Unwrap single-value objects
            IF IsObject(parsed) AND parsed.hasKey("value") AND KeyCount(parsed) == 1 THEN
                RETURN parsed["value"]
            ELSE
                RETURN parsed
            END IF

        CASE "base64":
            RETURN Base64Decode(data)

        CASE "msgpack":  // Future protocol version
            RETURN DecodeMsgPack(data)

        DEFAULT:
            THROW UnsupportedEncodingException(encoding)
    END SWITCH
END


FUNCTION: IsVersionCompatible
INPUT:
    messageVersion (string)
    supportedVersions (List<string>)

OUTPUT:
    compatible (boolean)

BEGIN
    // Parse semantic versions
    msgMajor, msgMinor, msgPatch ← ParseSemanticVersion(messageVersion)

    FOR EACH supportedVersion IN supportedVersions DO
        supMajor, supMinor, supPatch ← ParseSemanticVersion(supportedVersion)

        // Major version must match
        IF msgMajor != supMajor THEN
            CONTINUE
        END IF

        // Minor version compatibility: backward compatible
        IF msgMinor <= supMinor THEN
            RETURN TRUE
        END IF
    END FOR

    RETURN FALSE
END


ALGORITHM: NegotiateProtocolVersion
INPUT:
    clientVersions (List<string>)  - Versions client supports
    serverVersions (List<string>)  - Versions server supports

OUTPUT:
    negotiatedVersion (string) OR NULL

BEGIN
    // Find highest common version
    commonVersions ← EMPTY_LIST

    FOR EACH clientVersion IN clientVersions DO
        IF serverVersions.contains(clientVersion) THEN
            commonVersions.ADD(clientVersion)
        END IF
    END FOR

    IF commonVersions.isEmpty() THEN
        RETURN NULL  // No compatible version
    END IF

    // Sort in descending order
    SortDescending(commonVersions, SemanticVersionComparator)

    RETURN commonVersions[0]  // Return highest version
END
```

### Runtime-Specific Implementations

```
// Node.js/TypeScript Example
FUNCTION: coordination_signal_nodejs
INPUT: key (string), value (any)
OUTPUT: void

BEGIN
    protocolVersion ← "1.0.0"
    encodedMessage ← EncodeCoordinationMessage("signal", key, value, protocolVersion)

    // Send to Redis
    RedisClient.set(key, encodedMessage)
    RedisClient.publish("cfn:coordination:" + key, encodedMessage)
END


// Python Example
FUNCTION: coordination_signal_python
INPUT: key (str), value (Any)
OUTPUT: None

BEGIN
    protocol_version = "1.0.0"
    encoded_message = encode_coordination_message("signal", key, value, protocol_version)

    # Send to Redis
    redis_client.set(key, encoded_message)
    redis_client.publish(f"cfn:coordination:{key}", encoded_message)
END


// Rust Example
FUNCTION: coordination_signal_rust
INPUT: key (&str), value (Value)
OUTPUT: Result<(), Error>

BEGIN
    let protocol_version = "1.0.0";
    let encoded_message = encode_coordination_message("signal", key, value, protocol_version)?;

    // Send to Redis
    redis_client.set(key, &encoded_message)?;
    redis_client.publish(&format!("cfn:coordination:{}", key), &encoded_message)?;

    Ok(())
END
```

### Complexity Analysis

**Time Complexity:**
- **Encoding:** O(S) where S = payload size
  - JSON serialization: O(S)
  - SHA256 checksum: O(S)
- **Decoding:** O(S)
  - JSON parsing: O(S)
  - SHA256 verification: O(S)
- **Version Negotiation:** O(V₁ × V₂) where V₁, V₂ = version list sizes
  - Worst case: O(100) for ~10 versions each
  - Average case: O(1) with smart ordering

**Space Complexity:**
- Message envelope: O(S) where S = payload size
- Metadata overhead: O(1) (~500 bytes)
- **Total:** O(S)

### Edge Cases

1. **Protocol Version Mismatch:** Graceful degradation with warning log
2. **Message Too Large:** Reject with clear error before transmission
3. **Checksum Failure:** Reject message and request retransmission
4. **Expired Message:** Reject with TTL exceeded error
5. **Malformed JSON:** Catch parse error and return meaningful error
6. **Encoding Mismatch:** Fallback to UTF-8 string representation
7. **Null/Undefined Values:** Explicitly handle with JSON null
8. **Binary Data:** Use base64 encoding for cross-runtime safety
9. **No Common Version:** Return NULL from negotiation
10. **Circular References:** JSON serialization prevents infinite loops

### Performance Optimization Points

1. **Connection Pooling:** Reuse Redis connections across messages
2. **Batching:** Combine multiple signals into single publish
3. **Compression:** gzip large payloads (>10KB) before encoding
4. **Lazy Checksum:** Only calculate on explicit integrity checks
5. **Version Caching:** Cache negotiation results for connection lifetime

---

## 4. Multi-Layer Testing Pipeline

### Purpose
Orchestrate comprehensive testing across build-time validation, integration tests, and regression tests with intelligent gate decisions.

### Algorithm Specification

```
ALGORITHM: ExecuteTestingPipeline
INPUT:
    imageName (string)         - Docker image to test
    imageVersion (string)      - Version being tested
    previousVersion (string)   - Last stable version (for regression)
    testMode (string)          - "build" | "integration" | "regression" | "full"

OUTPUT:
    TestPipelineResult {
        overallStatus: "PASS" | "FAIL" | "ROLLBACK",
        buildTests: TestLayerResult,
        integrationTests: TestLayerResult,
        regressionTests: TestLayerResult,
        gateDecision: GateDecision,
        executionTime: float,
        recommendations: List<string>
    }

CONSTANTS:
    BUILD_TEST_TIMEOUT = 300      // 5 minutes
    INTEGRATION_TEST_TIMEOUT = 900 // 15 minutes
    REGRESSION_TEST_TIMEOUT = 1800 // 30 minutes

    GATE_THRESHOLDS = Map {
        "build": {passRate: 1.0, criticalFailures: 0},
        "integration": {passRate: 0.95, criticalFailures: 0},
        "regression": {passRate: 0.90, criticalFailures: 2}
    }

BEGIN
    result ← NEW TestPipelineResult
    startTime ← CurrentTime()

    // Step 1: Build-time validation (always run)
    LogInfo("Starting build-time validation for " + imageName)
    result.buildTests ← ExecuteBuildTimeTests(imageName, BUILD_TEST_TIMEOUT)

    IF NOT PassesGate(result.buildTests, "build") THEN
        result.overallStatus ← "FAIL"
        result.gateDecision ← MakeGateDecision(result, "build_failed")
        result.recommendations.ADD("Fix critical build-time failures before proceeding")
        result.executionTime ← CurrentTime() - startTime
        RETURN result
    END IF

    // Step 2: Integration tests (skip if testMode == "build")
    IF testMode IN ["integration", "regression", "full"] THEN
        LogInfo("Starting integration tests")
        result.integrationTests ← ExecuteIntegrationTests(
            imageName,
            imageVersion,
            INTEGRATION_TEST_TIMEOUT
        )

        IF NOT PassesGate(result.integrationTests, "integration") THEN
            result.overallStatus ← "FAIL"
            result.gateDecision ← MakeGateDecision(result, "integration_failed")
            result.recommendations.ADD("Review integration test failures")
            result.executionTime ← CurrentTime() - startTime
            RETURN result
        END IF
    END IF

    // Step 3: Regression tests (skip if testMode != "regression" | "full")
    IF testMode IN ["regression", "full"] THEN
        LogInfo("Starting regression tests")
        result.regressionTests ← ExecuteRegressionTests(
            imageName,
            imageVersion,
            previousVersion,
            REGRESSION_TEST_TIMEOUT
        )

        IF NOT PassesGate(result.regressionTests, "regression") THEN
            // Regression failures may trigger rollback
            result.overallStatus ← "ROLLBACK"
            result.gateDecision ← MakeGateDecision(result, "regression_failed")
            result.recommendations.ADD("Consider rolling back to " + previousVersion)
            result.executionTime ← CurrentTime() - startTime
            RETURN result
        END IF
    END IF

    // All gates passed
    result.overallStatus ← "PASS"
    result.gateDecision ← MakeGateDecision(result, "all_passed")
    result.recommendations.ADD("Safe to deploy to production")
    result.executionTime ← CurrentTime() - startTime

    RETURN result
END


ALGORITHM: ExecuteBuildTimeTests
INPUT:
    imageName (string)
    timeout (integer)

OUTPUT:
    TestLayerResult {
        layer: string,
        tests: List<TestResult>,
        passRate: float,
        criticalFailures: integer,
        totalTests: integer,
        executionTime: float
    }

BEGIN
    result ← NEW TestLayerResult
    result.layer ← "build"
    result.tests ← EMPTY_LIST
    startTime ← CurrentTime()

    // Test 1: Image contract validation (critical)
    contractTest ← RunTest(
        "Image Contract Validation",
        LAMBDA() -> ValidateImageContract(imageName, "1.0.0"),
        timeout / 4,
        critical: TRUE
    )
    result.tests.ADD(contractTest)

    // Test 2: Base image security scan (critical)
    securityTest ← RunTest(
        "Security Scan",
        LAMBDA() -> ScanImageSecurity(imageName),
        timeout / 4,
        critical: TRUE
    )
    result.tests.ADD(securityTest)

    // Test 3: Dependency vulnerability check (critical)
    vulnerabilityTest ← RunTest(
        "Dependency Vulnerabilities",
        LAMBDA() -> CheckDependencyVulnerabilities(imageName),
        timeout / 4,
        critical: TRUE
    )
    result.tests.ADD(vulnerabilityTest)

    // Test 4: Image size optimization (non-critical)
    sizeTest ← RunTest(
        "Image Size Check",
        LAMBDA() -> ValidateImageSize(imageName, maxSize: 1000MB),
        timeout / 8,
        critical: FALSE
    )
    result.tests.ADD(sizeTest)

    // Test 5: Layer optimization (non-critical)
    layerTest ← RunTest(
        "Layer Count Check",
        LAMBDA() -> ValidateLayerCount(imageName, maxLayers: 30),
        timeout / 8,
        critical: FALSE
    )
    result.tests.ADD(layerTest)

    // Calculate metrics
    result.totalTests ← result.tests.length
    passedTests ← CountIf(result.tests, LAMBDA(t) -> t.status == "PASS")
    result.passRate ← passedTests / result.totalTests
    result.criticalFailures ← CountIf(result.tests,
        LAMBDA(t) -> t.critical AND t.status == "FAIL")
    result.executionTime ← CurrentTime() - startTime

    RETURN result
END


ALGORITHM: ExecuteIntegrationTests
INPUT:
    imageName (string)
    imageVersion (string)
    timeout (integer)

OUTPUT:
    TestLayerResult

BEGIN
    result ← NEW TestLayerResult
    result.layer ← "integration"
    result.tests ← EMPTY_LIST
    startTime ← CurrentTime()

    // Test 1: Cross-runtime coordination (critical)
    coordinationTest ← RunTest(
        "Cross-Runtime Coordination",
        LAMBDA() -> TestCrossRuntimeCoordination(imageName),
        timeout / 5,
        critical: TRUE
    )
    result.tests.ADD(coordinationTest)

    // Test 2: Agent spawn and lifecycle (critical)
    lifecycleTest ← RunTest(
        "Agent Lifecycle",
        LAMBDA() -> TestAgentLifecycle(imageName),
        timeout / 5,
        critical: TRUE
    )
    result.tests.ADD(lifecycleTest)

    // Test 3: File operations under load (critical)
    fileOpsTest ← RunTest(
        "File Operations Under Load",
        LAMBDA() -> TestFileOperationsLoad(imageName, concurrency: 10),
        timeout / 5,
        critical: TRUE
    )
    result.tests.ADD(fileOpsTest)

    // Test 4: Memory operations consistency (critical)
    memoryTest ← RunTest(
        "Memory Operations",
        LAMBDA() -> TestMemoryConsistency(imageName),
        timeout / 5,
        critical: TRUE
    )
    result.tests.ADD(memoryTest)

    // Test 5: Skill loading and execution (non-critical)
    skillTest ← RunTest(
        "Skill Loading",
        LAMBDA() -> TestSkillExecution(imageName),
        timeout / 5,
        critical: FALSE
    )
    result.tests.ADD(skillTest)

    // Test 6: Network isolation (non-critical)
    networkTest ← RunTest(
        "Network Isolation",
        LAMBDA() -> TestNetworkIsolation(imageName),
        timeout / 10,
        critical: FALSE
    )
    result.tests.ADD(networkTest)

    // Calculate metrics
    result.totalTests ← result.tests.length
    passedTests ← CountIf(result.tests, LAMBDA(t) -> t.status == "PASS")
    result.passRate ← passedTests / result.totalTests
    result.criticalFailures ← CountIf(result.tests,
        LAMBDA(t) -> t.critical AND t.status == "FAIL")
    result.executionTime ← CurrentTime() - startTime

    RETURN result
END


ALGORITHM: ExecuteRegressionTests
INPUT:
    imageName (string)
    imageVersion (string)
    previousVersion (string)
    timeout (integer)

OUTPUT:
    TestLayerResult

BEGIN
    result ← NEW TestLayerResult
    result.layer ← "regression"
    result.tests ← EMPTY_LIST
    startTime ← CurrentTime()

    // Test 1: Performance regression (critical)
    perfTest ← RunTest(
        "Performance Regression",
        LAMBDA() -> ComparePerformance(
            currentImage: imageName,
            baselineImage: GetImageName(previousVersion),
            maxRegression: 0.10  // 10% degradation threshold
        ),
        timeout / 4,
        critical: TRUE
    )
    result.tests.ADD(perfTest)

    // Test 2: Backward compatibility (critical)
    compatTest ← RunTest(
        "Backward Compatibility",
        LAMBDA() -> TestBackwardCompatibility(
            currentVersion: imageVersion,
            previousVersion: previousVersion
        ),
        timeout / 4,
        critical: TRUE
    )
    result.tests.ADD(compatTest)

    // Test 3: API contract stability (critical)
    apiTest ← RunTest(
        "API Contract Stability",
        LAMBDA() -> ValidateAPIStability(imageName, previousVersion),
        timeout / 4,
        critical: FALSE  // Non-critical: can have new features
    )
    result.tests.ADD(apiTest)

    // Test 4: Resource usage regression (non-critical)
    resourceTest ← RunTest(
        "Resource Usage",
        LAMBDA() -> CompareResourceUsage(
            currentImage: imageName,
            baselineImage: GetImageName(previousVersion),
            maxMemoryIncrease: 0.15,  // 15% increase threshold
            maxCPUIncrease: 0.10      // 10% increase threshold
        ),
        timeout / 4,
        critical: FALSE
    )
    result.tests.ADD(resourceTest)

    // Calculate metrics
    result.totalTests ← result.tests.length
    passedTests ← CountIf(result.tests, LAMBDA(t) -> t.status == "PASS")
    result.passRate ← passedTests / result.totalTests
    result.criticalFailures ← CountIf(result.tests,
        LAMBDA(t) -> t.critical AND t.status == "FAIL")
    result.executionTime ← CurrentTime() - startTime

    RETURN result
END


FUNCTION: RunTest
INPUT:
    testName (string)
    testFunction (function)
    timeout (integer)
    critical (boolean)

OUTPUT:
    TestResult {
        name: string,
        status: "PASS" | "FAIL" | "TIMEOUT" | "SKIP",
        critical: boolean,
        executionTime: float,
        errorMessage: string,
        details: Map
    }

BEGIN
    result ← NEW TestResult
    result.name ← testName
    result.critical ← critical
    startTime ← CurrentTime()

    TRY
        // Execute test with timeout
        testOutput ← ExecuteWithTimeout(testFunction, timeout)

        IF testOutput.success THEN
            result.status ← "PASS"
            result.details ← testOutput.details
        ELSE
            result.status ← "FAIL"
            result.errorMessage ← testOutput.error
            result.details ← testOutput.details
        END IF

    CATCH TimeoutException AS e
        result.status ← "TIMEOUT"
        result.errorMessage ← "Test exceeded timeout of " + timeout + "s"

    CATCH exception AS e
        result.status ← "FAIL"
        result.errorMessage ← "Test execution error: " + e.message

    FINALLY
        result.executionTime ← CurrentTime() - startTime
    END TRY

    RETURN result
END


FUNCTION: PassesGate
INPUT:
    layerResult (TestLayerResult)
    gateType (string)

OUTPUT:
    passed (boolean)

BEGIN
    threshold ← GATE_THRESHOLDS[gateType]

    // Check 1: Pass rate threshold
    IF layerResult.passRate < threshold.passRate THEN
        LogWarning("Gate failed: pass rate " + layerResult.passRate +
                  " < threshold " + threshold.passRate)
        RETURN FALSE
    END IF

    // Check 2: Critical failures threshold
    IF layerResult.criticalFailures > threshold.criticalFailures THEN
        LogWarning("Gate failed: critical failures " + layerResult.criticalFailures +
                  " > threshold " + threshold.criticalFailures)
        RETURN FALSE
    END IF

    RETURN TRUE
END


FUNCTION: MakeGateDecision
INPUT:
    pipelineResult (TestPipelineResult)
    failureReason (string)

OUTPUT:
    GateDecision {
        action: "DEPLOY" | "BLOCK" | "ROLLBACK" | "MANUAL_REVIEW",
        reason: string,
        blockers: List<string>,
        approvers: List<string>
    }

BEGIN
    decision ← NEW GateDecision
    decision.blockers ← EMPTY_LIST
    decision.approvers ← EMPTY_LIST

    SWITCH failureReason DO
        CASE "all_passed":
            decision.action ← "DEPLOY"
            decision.reason ← "All test layers passed quality gates"
            decision.approvers.ADD("automated-testing-system")

        CASE "build_failed":
            decision.action ← "BLOCK"
            decision.reason ← "Build-time validation failed"
            decision.blockers.ADD("Fix contract violations")
            decision.blockers.ADD("Resolve security issues")
            decision.blockers.ADD("Address dependency vulnerabilities")

        CASE "integration_failed":
            decision.action ← "BLOCK"
            decision.reason ← "Integration tests failed"
            decision.blockers.ADD("Fix coordination protocol issues")
            decision.blockers.ADD("Resolve lifecycle management bugs")

        CASE "regression_failed":
            // Check severity of regressions
            IF pipelineResult.regressionTests.criticalFailures > 1 THEN
                decision.action ← "ROLLBACK"
                decision.reason ← "Critical regressions detected"
                decision.blockers.ADD("Performance degradation > 10%")
                decision.blockers.ADD("Backward compatibility broken")
            ELSE
                decision.action ← "MANUAL_REVIEW"
                decision.reason ← "Minor regressions require review"
                decision.approvers.ADD("technical-lead")
                decision.approvers.ADD("product-owner")
            END IF

        DEFAULT:
            decision.action ← "MANUAL_REVIEW"
            decision.reason ← "Unknown failure mode: " + failureReason
            decision.approvers.ADD("system-administrator")
    END SWITCH

    RETURN decision
END
```

### Test Execution Flow Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                    Testing Pipeline Start                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
              ┌─────────────────────────┐
              │  Build-Time Validation  │
              │  • Contract tests       │
              │  • Security scan        │
              │  • Vulnerability check  │
              └────────────┬────────────┘
                           │
                  ┌────────┴────────┐
                  │  Gate Check 1   │
                  │  (100% pass)    │
                  └────┬────────┬───┘
                       │        │
                    PASS│        │FAIL
                       │        │
                       ▼        ▼
         ┌───────────────┐   [BLOCK]
         │ Integration   │
         │ Tests         │
         │ • Coordination│
         │ • Lifecycle   │
         │ • File ops    │
         └───────┬───────┘
                 │
        ┌────────┴────────┐
        │  Gate Check 2   │
        │  (95% pass)     │
        └────┬────────┬───┘
             │        │
          PASS│        │FAIL
             │        │
             ▼        ▼
   ┌──────────────┐ [BLOCK]
   │ Regression   │
   │ Tests        │
   │ • Perf       │
   │ • Compat     │
   └──────┬───────┘
          │
  ┌───────┴───────┐
  │ Gate Check 3  │
  │ (90% pass)    │
  └───┬───────┬───┘
      │       │
   PASS│       │FAIL
      │       │
      ▼       ▼
   [DEPLOY] [ROLLBACK/MANUAL_REVIEW]
```

### Complexity Analysis

**Time Complexity:**
- **Build tests:** O(T_b) where T_b = build test time (~5 min)
- **Integration tests:** O(T_i) where T_i = integration test time (~15 min)
- **Regression tests:** O(T_r) where T_r = regression test time (~30 min)
- **Sequential execution:** O(T_b + T_i + T_r) ≈ **50 minutes worst case**
- **Parallel optimization:** O(max(T_b, T_i, T_r)) ≈ **30 minutes** (not safe due to dependencies)

**Space Complexity:**
- Test results storage: O(N) where N = number of tests (~15 tests)
- Container overhead: O(C) where C = concurrent containers (~3-5)
- **Total:** O(N + C) ≈ **O(1)** (bounded constants)

### Edge Cases

1. **Build Test Failure:** Early exit, skip integration/regression
2. **Timeout in Integration:** Mark as FAIL, continue to regression if non-critical
3. **Partial Regression:** Manual review decision for <2 critical failures
4. **No Previous Version:** Skip regression tests entirely
5. **Test Infrastructure Failure:** Retry with exponential backoff (3 attempts)
6. **Flaky Test Detection:** Re-run failed tests once before marking as FAIL
7. **Resource Exhaustion:** Throttle concurrent tests, queue overflow
8. **Network Partition:** Isolated test containers prevent cross-contamination

### Performance Optimization Points

1. **Parallel Test Execution:** Run independent tests concurrently within layers
2. **Smart Caching:** Cache container images between tests (95% time savings)
3. **Incremental Testing:** Only run affected tests based on changed capabilities
4. **Early Exit on Critical Failures:** Skip remaining tests after 3 critical failures
5. **Resource Pooling:** Reuse test containers for similar test cases
6. **Adaptive Timeout:** Reduce timeout for fast-failing tests (e.g., syntax checks)

---

## 5. Image Build & Deployment Pipeline

### Purpose
Orchestrate dependency-based image building with parallel optimization, version tagging, and rollback capabilities.

### Algorithm Specification

```
ALGORITHM: BuildAndDeployImages
INPUT:
    buildConfig (BuildConfiguration)  - Build targets and dependencies
    deploymentMode (string)           - "incremental" | "full" | "rollback"
    targetVersion (string)            - Version to build/deploy

OUTPUT:
    BuildDeploymentResult {
        builds: List<ImageBuildResult>,
        deployments: List<DeploymentResult>,
        overallStatus: "SUCCESS" | "PARTIAL" | "FAILED",
        rollbackPerformed: boolean,
        executionTime: float
    }

CONSTANTS:
    BUILD_PARALLELISM = 4  // Max parallel builds
    HEALTH_CHECK_RETRIES = 3
    HEALTH_CHECK_INTERVAL = 10  // seconds

    BUILD_ORDER = [
        ["cfn-base"],                              // Layer 0: Base
        ["cfn-node", "cfn-python"],                // Layer 1: Primary runtimes
        ["cfn-rust", "cfn-go", "cfn-java"],        // Layer 2: Extended runtimes
        ["cfn-coordinator", "cfn-orchestrator"]    // Layer 3: Specialized
    ]

BEGIN
    result ← NEW BuildDeploymentResult
    result.builds ← EMPTY_LIST
    result.deployments ← EMPTY_LIST
    result.rollbackPerformed ← FALSE
    startTime ← CurrentTime()

    // Step 1: Determine build targets
    IF deploymentMode == "rollback" THEN
        rollbackResult ← ExecuteRollback(buildConfig, targetVersion)
        result.rollbackPerformed ← TRUE
        result.overallStatus ← rollbackResult.status
        result.executionTime ← CurrentTime() - startTime
        RETURN result
    END IF

    buildTargets ← DetermineBuildTargets(buildConfig, deploymentMode, targetVersion)

    IF buildTargets.isEmpty() THEN
        LogInfo("No build targets determined")
        result.overallStatus ← "SUCCESS"
        result.executionTime ← CurrentTime() - startTime
        RETURN result
    END IF

    // Step 2: Build images in dependency order
    FOR EACH layer IN BUILD_ORDER DO
        // Filter targets for this layer
        layerTargets ← Filter(buildTargets, LAMBDA(t) -> layer.contains(t.imageName))

        IF layerTargets.isEmpty() THEN
            CONTINUE
        END IF

        LogInfo("Building layer: " + Join(layer, ", "))

        // Build images in parallel within layer
        layerResults ← BuildImagesParallel(layerTargets, BUILD_PARALLELISM)
        result.builds.EXTEND(layerResults)

        // Check for failures
        failedBuilds ← Filter(layerResults, LAMBDA(r) -> r.status == "FAILED")

        IF NOT failedBuilds.isEmpty() THEN
            LogError("Layer build failed: " + failedBuilds.length + " images failed")

            // Rollback on critical layer failure
            IF IsCriticalLayer(layer) THEN
                LogWarning("Critical layer failed, initiating rollback")
                rollbackResult ← ExecuteRollback(buildConfig, GetPreviousVersion(targetVersion))
                result.rollbackPerformed ← TRUE
                result.overallStatus ← "FAILED"
                result.executionTime ← CurrentTime() - startTime
                RETURN result
            ELSE
                // Non-critical layer: continue but mark as partial
                result.overallStatus ← "PARTIAL"
            END IF
        END IF
    END FOR

    // Step 3: Tag successful builds
    successfulBuilds ← Filter(result.builds, LAMBDA(r) -> r.status == "SUCCESS")

    FOR EACH build IN successfulBuilds DO
        TagImage(build.imageName, targetVersion)
        TagImage(build.imageName, "latest")
    END FOR

    // Step 4: Health checks
    LogInfo("Performing health checks on " + successfulBuilds.length + " images")
    healthCheckResults ← PerformHealthChecks(successfulBuilds, HEALTH_CHECK_RETRIES)

    unhealthyImages ← Filter(healthCheckResults, LAMBDA(r) -> NOT r.healthy)

    IF NOT unhealthyImages.isEmpty() THEN
        LogWarning("Health checks failed for " + unhealthyImages.length + " images")
        result.overallStatus ← "PARTIAL"
    END IF

    // Step 5: Deploy to registry (if configured)
    IF buildConfig.pushToRegistry THEN
        LogInfo("Pushing images to registry")

        FOR EACH build IN successfulBuilds DO
            deployResult ← PushToRegistry(build.imageName, targetVersion, buildConfig.registry)
            result.deployments.ADD(deployResult)
        END FOR
    END IF

    // Final status determination
    IF result.overallStatus != "PARTIAL" THEN
        result.overallStatus ← "SUCCESS"
    END IF

    result.executionTime ← CurrentTime() - startTime

    RETURN result
END


ALGORITHM: BuildImagesParallel
INPUT:
    buildTargets (List<BuildTarget>)
    maxParallelism (integer)

OUTPUT:
    List<ImageBuildResult>

BEGIN
    results ← EMPTY_LIST
    semaphore ← CreateSemaphore(maxParallelism)
    taskQueue ← CreateTaskQueue()

    // Queue all build tasks
    FOR EACH target IN buildTargets DO
        task ← LAMBDA() -> BuildSingleImage(target, semaphore)
        taskQueue.ADD(task)
    END FOR

    // Execute tasks with parallelism limit
    WHILE NOT taskQueue.isEmpty() DO
        // Wait for available slot
        semaphore.Acquire()

        task ← taskQueue.Dequeue()

        // Execute in background
        AsyncExecute(task, LAMBDA(buildResult) -> {
            results.ADD(buildResult)
            semaphore.Release()
        })
    END WHILE

    // Wait for all tasks to complete
    WaitForAllTasks()

    RETURN results
END


FUNCTION: BuildSingleImage
INPUT:
    target (BuildTarget)
    semaphore (Semaphore)

OUTPUT:
    ImageBuildResult {
        imageName: string,
        version: string,
        status: "SUCCESS" | "FAILED",
        buildTime: float,
        imageSize: integer,
        errorMessage: string
    }

BEGIN
    result ← NEW ImageBuildResult
    result.imageName ← target.imageName
    result.version ← target.version
    startTime ← CurrentTime()

    TRY
        // Step 1: Prepare build context (Linux native storage for WSL2)
        buildContext ← PrepareBuildContext(target)

        IF buildContext IS NULL THEN
            result.status ← "FAILED"
            result.errorMessage ← "Failed to prepare build context"
            RETURN result
        END IF

        // Step 2: Execute build
        LogInfo("Building " + target.imageName + ":" + target.version)

        buildCommand ← ConstructBuildCommand(target, buildContext)
        buildOutput ← ExecuteCommand(buildCommand, timeout: 600)  // 10 min timeout

        IF buildOutput.exitCode != 0 THEN
            result.status ← "FAILED"
            result.errorMessage ← "Build failed: " + buildOutput.stderr
            RETURN result
        END IF

        // Step 3: Verify build output
        imageId ← ExtractImageId(buildOutput.stdout)

        IF NOT ImageExists(imageId) THEN
            result.status ← "FAILED"
            result.errorMessage ← "Built image not found"
            RETURN result
        END IF

        // Step 4: Collect metrics
        imageInfo ← InspectImage(imageId)
        result.imageSize ← imageInfo.size
        result.buildTime ← CurrentTime() - startTime
        result.status ← "SUCCESS"

        LogInfo("Successfully built " + target.imageName + " (" +
               FormatSize(result.imageSize) + " in " +
               FormatDuration(result.buildTime) + ")")

    CATCH exception AS e
        result.status ← "FAILED"
        result.errorMessage ← "Build exception: " + e.message
        LogError("Build failed for " + target.imageName + ": " + e.message)

    FINALLY
        result.buildTime ← CurrentTime() - startTime

        // Cleanup build context
        CleanupBuildContext(buildContext)
    END TRY

    RETURN result
END


FUNCTION: PrepareBuildContext
INPUT: target (BuildTarget)
OUTPUT: BuildContext OR NULL

BEGIN
    // Use Linux native storage for WSL2 performance (96% faster)
    buildDir ← "/tmp/cfn-build-" + GenerateUUID()

    TRY
        // Create build directory
        CreateDirectory(buildDir)

        // Copy Dockerfile
        CopyFile(target.dockerfilePath, buildDir + "/Dockerfile")

        // Copy build context files
        FOR EACH sourceFile IN target.contextFiles DO
            relativePath ← GetRelativePath(sourceFile, target.contextRoot)
            destPath ← buildDir + "/" + relativePath

            CreateParentDirectories(destPath)
            CopyFile(sourceFile, destPath)
        END FOR

        // Copy skill files
        IF target.includeSkills THEN
            CopyDirectory(".claude/skills", buildDir + "/.claude/skills")
        END IF

        context ← NEW BuildContext
        context.directory ← buildDir
        context.dockerfile ← buildDir + "/Dockerfile"

        RETURN context

    CATCH exception AS e
        LogError("Failed to prepare build context: " + e.message)
        CleanupDirectory(buildDir)
        RETURN NULL
    END TRY
END


FUNCTION: ConstructBuildCommand
INPUT:
    target (BuildTarget)
    buildContext (BuildContext)

OUTPUT:
    command (string)

BEGIN
    command ← "docker build"

    // Add build args
    FOR EACH (key, value) IN target.buildArgs DO
        command ← command + " --build-arg " + key + "=" + value
    END FOR

    // Add labels
    command ← command + " --label cfn.contract.version=" + target.contractVersion
    command ← command + " --label cfn.build.timestamp=" + CurrentUnixTimestamp()
    command ← command + " --label cfn.runtime=" + target.runtime

    // Add tags
    command ← command + " -t " + target.imageName + ":" + target.version

    // Add build context
    command ← command + " -f " + buildContext.dockerfile
    command ← command + " " + buildContext.directory

    RETURN command
END


ALGORITHM: ExecuteRollback
INPUT:
    buildConfig (BuildConfiguration)
    rollbackVersion (string)

OUTPUT:
    RollbackResult {
        status: "SUCCESS" | "FAILED",
        restoredImages: List<string>,
        errors: List<string>
    }

BEGIN
    result ← NEW RollbackResult
    result.restoredImages ← EMPTY_LIST
    result.errors ← EMPTY_LIST

    LogWarning("Initiating rollback to version " + rollbackVersion)

    // Step 1: Verify rollback version exists
    FOR EACH imageName IN buildConfig.imageNames DO
        rollbackImageName ← imageName + ":" + rollbackVersion

        IF NOT ImageExists(rollbackImageName) THEN
            result.errors.ADD("Rollback image not found: " + rollbackImageName)
            CONTINUE
        END IF

        // Step 2: Re-tag rollback version as latest
        TRY
            TagImage(rollbackImageName, "latest")
            result.restoredImages.ADD(imageName)
            LogInfo("Restored " + imageName + " to version " + rollbackVersion)

        CATCH exception AS e
            result.errors.ADD("Failed to restore " + imageName + ": " + e.message)
        END TRY
    END FOR

    // Step 3: Determine overall status
    IF result.errors.isEmpty() THEN
        result.status ← "SUCCESS"
        LogInfo("Rollback completed successfully: " + result.restoredImages.length + " images restored")
    ELSE
        result.status ← "FAILED"
        LogError("Rollback completed with errors: " + result.errors.length + " failures")
    END IF

    RETURN result
END


FUNCTION: PerformHealthChecks
INPUT:
    builds (List<ImageBuildResult>)
    maxRetries (integer)

OUTPUT:
    List<HealthCheckResult>

BEGIN
    results ← EMPTY_LIST

    FOR EACH build IN builds DO
        healthResult ← NEW HealthCheckResult
        healthResult.imageName ← build.imageName
        healthResult.version ← build.version

        retryCount ← 0
        healthy ← FALSE

        WHILE retryCount < maxRetries AND NOT healthy DO
            healthStatus ← CheckImageHealth(build.imageName + ":" + build.version)

            IF healthStatus.healthy THEN
                healthy ← TRUE
                healthResult.healthy ← TRUE
                healthResult.checks ← healthStatus.checks
            ELSE
                retryCount ← retryCount + 1
                IF retryCount < maxRetries THEN
                    Sleep(HEALTH_CHECK_INTERVAL)
                END IF
            END IF
        END WHILE

        IF NOT healthy THEN
            healthResult.healthy ← FALSE
            healthResult.failureReason ← "Health check failed after " + maxRetries + " retries"
        END IF

        results.ADD(healthResult)
    END FOR

    RETURN results
END


FUNCTION: DetermineBuildTargets
INPUT:
    buildConfig (BuildConfiguration)
    deploymentMode (string)
    targetVersion (string)

OUTPUT:
    List<BuildTarget>

BEGIN
    targets ← EMPTY_LIST

    IF deploymentMode == "full" THEN
        // Build all images
        FOR EACH imageName IN buildConfig.imageNames DO
            target ← CreateBuildTarget(imageName, targetVersion, buildConfig)
            targets.ADD(target)
        END FOR

    ELSE IF deploymentMode == "incremental" THEN
        // Only build changed images
        FOR EACH imageName IN buildConfig.imageNames DO
            currentVersion ← GetCurrentImageVersion(imageName)

            IF HasChanges(imageName, currentVersion, targetVersion) THEN
                target ← CreateBuildTarget(imageName, targetVersion, buildConfig)
                targets.ADD(target)
            ELSE
                LogInfo("Skipping " + imageName + " (no changes)")
            END IF
        END FOR
    END IF

    RETURN targets
END
```

### Build Dependency Graph

```
                     ┌──────────────┐
                     │  cfn-base    │
                     │  (Layer 0)   │
                     └──────┬───────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
     ┌────────────────┐          ┌────────────────┐
     │  cfn-node      │          │  cfn-python    │
     │  (Layer 1)     │          │  (Layer 1)     │
     └────────┬───────┘          └───────┬────────┘
              │                          │
    ┌─────────┼──────────────────────────┘
    │         │
    ▼         ▼
┌────────┐ ┌────────┐ ┌────────┐
│ cfn-   │ │ cfn-go │ │ cfn-   │
│ rust   │ │        │ │ java   │
│(Layer2)│ │(Layer2)│ │(Layer2)│
└────┬───┘ └───┬────┘ └────┬───┘
     │         │           │
     └─────────┼───────────┘
               │
               ▼
     ┌─────────────────────┐
     │  cfn-coordinator    │
     │  cfn-orchestrator   │
     │  (Layer 3)          │
     └─────────────────────┘
```

### Complexity Analysis

**Time Complexity:**
- **Sequential build:** O(N × T_b) where N = number of images, T_b = average build time
- **Parallel build:** O(L × (N_l / P) × T_b) where L = layers, N_l = images per layer, P = parallelism
- **With P=4, N=7, L=4:** O(4 × (2/4) × 5min) ≈ **10 minutes** vs 35 minutes sequential

**Space Complexity:**
- Build contexts: O(N × C) where C = context size (~500MB)
- Image storage: O(N × I) where I = image size (~800MB)
- **Peak:** O(N × (C + I)) ≈ **9.1GB** for 7 images

### Edge Cases

1. **Build Failure in Base Layer:** Immediate rollback, no downstream builds
2. **Partial Layer Failure:** Continue if non-critical, rollback if critical
3. **Disk Space Exhaustion:** Pre-flight check, fail-fast with cleanup
4. **Concurrent Builds:** Semaphore prevents >4 parallel builds
5. **Registry Push Failure:** Retry 3 times with exponential backoff
6. **Version Conflict:** Verify version doesn't already exist
7. **Dockerfile Not Found:** Validate all Dockerfiles before starting builds
8. **Network Timeout:** Retry with backoff for registry operations

### Performance Optimization Points

1. **Layer Caching:** Docker layer cache reduces rebuilds by 70-90%
2. **Build Context Optimization:** Minimize context size with .dockerignore
3. **Multi-Stage Builds:** Reduce final image size by 50-70%
4. **Parallel Builds:** 4x speedup with parallelism=4
5. **Linux Native Storage (WSL2):** 96% faster builds (755s → <20s)
6. **Registry Caching:** Pull base images once, reuse across builds
7. **Incremental Mode:** Only rebuild changed images (saves 50-80% time)

---

## 6. Agent Spawn Logic Enhancement

### Purpose
Enhance agent spawning to select appropriate runtime images, validate availability, and monitor container health.

### Algorithm Specification

```
ALGORITHM: SpawnAgentWithRuntimeSelection
INPUT:
    agentType (string)          - Agent identifier
    taskDescription (string)    - Task to execute
    taskId (string)             - Unique task identifier
    spawnMode (string)          - "cli" | "task"

OUTPUT:
    AgentSpawnResult {
        agentId: string,
        containerId: string,
        runtime: string,
        imageName: string,
        status: "RUNNING" | "FAILED" | "STARTING",
        spawnTime: float,
        healthStatus: HealthStatus
    }

CONSTANTS:
    AGENT_METADATA_DIR = ".claude/agents/cfn-dev-team"
    DEFAULT_SPAWN_TIMEOUT = 60  // seconds
    READINESS_CHECK_INTERVAL = 2  // seconds
    MAX_READINESS_CHECKS = 15  // 30 seconds total

BEGIN
    result ← NEW AgentSpawnResult
    startTime ← CurrentTime()

    // Step 1: Locate agent metadata
    agentMetadataPath ← FindAgentMetadata(agentType, AGENT_METADATA_DIR)

    IF agentMetadataPath IS NULL THEN
        result.status ← "FAILED"
        result.errorMessage ← "Agent metadata not found: " + agentType
        RETURN result
    END IF

    // Step 2: Select runtime image
    runtimeSelection ← SelectRuntime(agentType, agentMetadataPath)

    IF NOT runtimeSelection.fallbackUsed AND NOT runtimeSelection.warnings.isEmpty() THEN
        LogWarning("Runtime selection warnings for " + agentType + ": " +
                  Join(runtimeSelection.warnings, ", "))
    END IF

    result.runtime ← runtimeSelection.runtime
    result.imageName ← runtimeSelection.imageName

    // Step 3: Verify image exists and is healthy
    IF NOT ImageExists(result.imageName) THEN
        LogError("Runtime image not found: " + result.imageName)

        // Attempt to pull image
        IF PullImage(result.imageName) THEN
            LogInfo("Successfully pulled " + result.imageName)
        ELSE
            result.status ← "FAILED"
            result.errorMessage ← "Failed to pull image: " + result.imageName
            RETURN result
        END IF
    END IF

    healthCheck ← CheckImageHealth(result.imageName)
    IF NOT healthCheck.healthy THEN
        LogWarning("Image health check failed: " + healthCheck.reason)
        // Continue anyway, container may still work
    END IF

    // Step 4: Generate agent ID
    result.agentId ← GenerateAgentId(agentType, taskId)

    // Step 5: Prepare container configuration
    containerConfig ← PrepareContainerConfig(
        imageName: result.imageName,
        agentId: result.agentId,
        agentType: agentType,
        taskId: taskId,
        taskDescription: taskDescription,
        spawnMode: spawnMode
    )

    // Step 6: Create and start container
    TRY
        result.containerId ← CreateContainer(containerConfig)
        StartContainer(result.containerId)

        LogInfo("Started container " + result.containerId + " for agent " + result.agentId)

    CATCH exception AS e
        result.status ← "FAILED"
        result.errorMessage ← "Container creation failed: " + e.message

        // Cleanup partial container
        IF result.containerId IS NOT NULL THEN
            RemoveContainer(result.containerId, force: TRUE)
        END IF

        RETURN result
    END TRY

    // Step 7: Wait for agent readiness
    result.status ← "STARTING"
    readinessResult ← WaitForAgentReadiness(
        result.containerId,
        result.agentId,
        MAX_READINESS_CHECKS,
        READINESS_CHECK_INTERVAL
    )

    IF readinessResult.ready THEN
        result.status ← "RUNNING"
        result.healthStatus ← readinessResult.healthStatus
        LogInfo("Agent " + result.agentId + " is ready")
    ELSE
        result.status ← "FAILED"
        result.errorMessage ← "Agent failed to become ready: " + readinessResult.reason

        // Collect logs for debugging
        logs ← GetContainerLogs(result.containerId)
        LogError("Agent startup logs: " + logs)

        // Cleanup failed container
        RemoveContainer(result.containerId, force: TRUE)
        RETURN result
    END IF

    // Step 8: Register agent in lifecycle tracking
    RegisterAgentSpawn(
        agentId: result.agentId,
        agentType: agentType,
        runtime: result.runtime,
        containerId: result.containerId,
        taskId: taskId
    )

    result.spawnTime ← CurrentTime() - startTime

    RETURN result
END


FUNCTION: FindAgentMetadata
INPUT:
    agentType (string)
    searchDir (string)

OUTPUT:
    filePath (string) OR NULL

BEGIN
    // Try exact match first
    exactPath ← searchDir + "/" + agentType + ".md"
    IF FileExists(exactPath) THEN
        RETURN exactPath
    END IF

    // Search subdirectories
    pattern ← "**/" + agentType + ".md"
    matches ← GlobSearch(searchDir, pattern)

    IF NOT matches.isEmpty() THEN
        RETURN matches[0]  // Return first match
    END IF

    // Try fuzzy matching (e.g., "backend-dev" → "backend-developer")
    allAgents ← GlobSearch(searchDir, "**/*.md")

    FOR EACH agentPath IN allAgents DO
        agentName ← GetFileName(agentPath, withoutExtension: TRUE)

        IF FuzzyMatch(agentType, agentName, threshold: 0.8) THEN
            LogInfo("Fuzzy matched " + agentType + " to " + agentName)
            RETURN agentPath
        END IF
    END FOR

    RETURN NULL
END


FUNCTION: PrepareContainerConfig
INPUT:
    imageName (string)
    agentId (string)
    agentType (string)
    taskId (string)
    taskDescription (string)
    spawnMode (string)

OUTPUT:
    ContainerConfig

BEGIN
    config ← NEW ContainerConfig

    // Image
    config.image ← imageName
    config.name ← agentId

    // Environment variables
    config.env ← Map {
        "AGENT_ID": agentId,
        "AGENT_TYPE": agentType,
        "TASK_ID": taskId,
        "TASK_DESCRIPTION": taskDescription,
        "SPAWN_MODE": spawnMode,
        "CFN_CONTRACT_VERSION": "1.0.0"
    }

    // Load custom provider settings
    IF GetEnv("CFN_CUSTOM_ROUTING") == "true" THEN
        config.env["CFN_CUSTOM_ROUTING"] ← "true"

        // Load provider from agent metadata or default to Z.ai
        agentMetadata ← ParseAgentMetadata(GetAgentMetadataPath(agentType))
        IF agentMetadata IS NOT NULL AND agentMetadata.frontmatter.hasKey("PROVIDER_PARAMETERS") THEN
            providerParams ← agentMetadata.frontmatter["PROVIDER_PARAMETERS"]
            config.env["CFN_PROVIDER"] ← providerParams.provider
            config.env["CFN_MODEL"] ← providerParams.model
        ELSE
            // Default to Z.ai + glm-4.6
            config.env["CFN_PROVIDER"] ← "zai"
            config.env["CFN_MODEL"] ← "glm-4.6"
        END IF
    END IF

    // Volumes
    config.volumes ← [
        ".claude/skills:/.claude/skills:ro",         // Skills (read-only)
        "cfn-workdir:/workspace",                     // Working directory
        "/var/run/docker.sock:/var/run/docker.sock"  // Docker socket (if needed)
    ]

    // Network
    config.network ← "cfn-agent-network"

    // Resource limits
    config.resources ← Map {
        "cpu": "1.0",          // 1 CPU core
        "memory": "1024m",     // 1GB RAM
        "memorySwap": "2048m"  // 2GB total (with swap)
    }

    // Labels
    config.labels ← Map {
        "cfn.agent.id": agentId,
        "cfn.agent.type": agentType,
        "cfn.task.id": taskId,
        "cfn.spawn.mode": spawnMode,
        "cfn.spawned.at": CurrentISO8601Timestamp()
    }

    // Auto-remove on exit (for short-lived tasks)
    config.autoRemove ← (spawnMode == "task")

    // Health check
    config.healthCheck ← Map {
        "test": ["CMD", "coordination-signal", "--health-check"],
        "interval": "10s",
        "timeout": "5s",
        "retries": 3,
        "startPeriod": "10s"
    }

    RETURN config
END


ALGORITHM: WaitForAgentReadiness
INPUT:
    containerId (string)
    agentId (string)
    maxChecks (integer)
    checkInterval (integer)

OUTPUT:
    ReadinessResult {
        ready: boolean,
        healthStatus: HealthStatus,
        reason: string,
        checksPerformed: integer
    }

BEGIN
    result ← NEW ReadinessResult
    result.ready ← FALSE
    result.checksPerformed ← 0

    FOR i FROM 1 TO maxChecks DO
        result.checksPerformed ← i

        // Check 1: Container is still running
        containerStatus ← GetContainerStatus(containerId)

        IF containerStatus != "running" THEN
            result.reason ← "Container stopped: " + containerStatus
            RETURN result
        END IF

        // Check 2: Health check status
        healthStatus ← GetContainerHealth(containerId)

        IF healthStatus.state == "healthy" THEN
            result.ready ← TRUE
            result.healthStatus ← healthStatus
            RETURN result
        ELSE IF healthStatus.state == "unhealthy" THEN
            result.reason ← "Container health check failed: " + healthStatus.output
            RETURN result
        END IF

        // Check 3: Agent lifecycle registration
        lifecycleStatus ← QueryAgentLifecycle(agentId)

        IF lifecycleStatus IS NOT NULL AND lifecycleStatus.status == "ready" THEN
            result.ready ← TRUE
            result.healthStatus ← healthStatus
            RETURN result
        END IF

        // Wait before next check
        IF i < maxChecks THEN
            Sleep(checkInterval)
        END IF
    END FOR

    // Max checks exhausted
    result.reason ← "Agent readiness timeout after " +
                   (maxChecks × checkInterval) + " seconds"

    RETURN result
END


FUNCTION: RegisterAgentSpawn
INPUT:
    agentId (string)
    agentType (string)
    runtime (string)
    containerId (string)
    taskId (string)

OUTPUT:
    void

BEGIN
    // Register in SQLite lifecycle database
    db ← OpenDatabase("./claude-assets/skills/cfn-redis-coordination/data/cfn-loop.db")

    metadata ← ToJSON(Map {
        "container_id": containerId,
        "runtime": runtime,
        "task_id": taskId,
        "spawn_mode": "cli"
    })

    ExecuteSQL(db, "
        INSERT OR REPLACE INTO agents
        (id, type, status, spawned_at, metadata)
        VALUES (?, ?, ?, datetime('now'), ?)
    ", [agentId, agentType, "spawned", metadata])

    CloseDatabase(db)

    // Signal coordination layer
    coordination-signal("swarm:" + taskId + ":agents:" + agentId, "spawned")

    LogInfo("Registered agent " + agentId + " in lifecycle tracking")
END
```

### Agent Spawn Flow Diagram

```
┌────────────────────────────────────────────┐
│  SpawnAgentWithRuntimeSelection(agentType) │
└──────────────┬─────────────────────────────┘
               │
               ▼
    ┌──────────────────────┐
    │ Locate Agent         │
    │ Metadata (.md file)  │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ SelectRuntime()      │
    │ • Parse frontmatter  │
    │ • Infer if missing   │
    │ • Validate support   │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ Verify Image         │
    │ • Check exists       │
    │ • Pull if missing    │
    │ • Health check       │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ Prepare Container    │
    │ Config               │
    │ • Env vars           │
    │ • Volumes            │
    │ • Resources          │
    │ • Health check       │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ Create & Start       │
    │ Container            │
    └──────┬───────────────┘
           │
           ▼
    ┌──────────────────────┐
    │ Wait for Readiness   │
    │ • Container running? │
    │ • Health check pass? │
    │ • Lifecycle ready?   │
    └──────┬───────────────┘
           │
      ┌────┴────┐
      │         │
   READY      FAILED
      │         │
      ▼         ▼
┌──────────┐ ┌──────────┐
│ Register │ │ Cleanup  │
│ Lifecycle│ │ & Return │
│ & Return │ │ Error    │
└──────────┘ └──────────┘
```

### Complexity Analysis

**Time Complexity:**
- Metadata lookup: O(F) where F = number of agent files (~23)
- Runtime selection: O(1) (file parse + lookup)
- Image pull: O(I) where I = image size (~800MB) - only if not cached
- Container creation: O(1) (~2-5 seconds)
- Readiness wait: O(R × C) where R = max checks (15), C = check time (~2s)
- **Total:** O(F + I + R×C) ≈ **30-45 seconds** first spawn, **5-10 seconds** cached

**Space Complexity:**
- Agent metadata: O(M) where M = metadata size (~10KB)
- Container config: O(1) (~2KB)
- Lifecycle record: O(1) (~500 bytes)
- **Total:** O(M) ≈ **O(1)**

### Edge Cases

1. **Agent Metadata Not Found:** Fuzzy matching or fallback to default runtime
2. **Runtime Not Supported:** Fallback to Node.js with warning
3. **Image Pull Failure:** Return error, don't attempt spawn
4. **Container Startup Failure:** Cleanup partial container, return error
5. **Readiness Timeout:** Collect logs, cleanup container, return error
6. **Health Check Failure:** Log warning but continue (may still work)
7. **Resource Exhaustion:** Docker returns error, propagate to caller
8. **Network Issues:** Retry image pull 3 times before failing
9. **Lifecycle DB Lock:** Retry with exponential backoff (SQLite concurrency)
10. **Custom Provider Missing:** Fallback to Z.ai with warning

### Performance Optimization Points

1. **Metadata Caching:** Cache parsed agent metadata for 5 minutes
2. **Image Pre-Warming:** Pull all runtime images on system startup
3. **Container Pooling:** Keep warm containers for frequently used runtimes
4. **Parallel Readiness Checks:** Check container health and lifecycle concurrently
5. **Smart Image Selection:** Prefer locally available images over pulling
6. **Lazy Health Checks:** Skip if image recently validated (<5 min ago)

---

## Appendix: Data Structures

### Core Data Structures

```
STRUCT ValidationResult:
    passed: boolean
    contractVersion: string
    capabilities: Map<string, CapabilityResult>
    summary: string
    failureReasons: List<string>

STRUCT CapabilityResult:
    name: string
    passed: boolean
    executionTime: float
    errorMessage: string
    retryCount: integer

STRUCT RuntimeSelection:
    imageName: string
    runtime: string
    version: string
    fallbackUsed: boolean
    warnings: List<string>

STRUCT AgentMetadata:
    frontmatter: Map<string, any>
    content: string

STRUCT SerializedPayload:
    encoding: string
    data: bytes

STRUCT DecodedMessage:
    messageType: string
    key: string
    value: any
    metadata: Map
    versionCompatible: boolean

STRUCT TestPipelineResult:
    overallStatus: "PASS" | "FAIL" | "ROLLBACK"
    buildTests: TestLayerResult
    integrationTests: TestLayerResult
    regressionTests: TestLayerResult
    gateDecision: GateDecision
    executionTime: float
    recommendations: List<string>

STRUCT TestLayerResult:
    layer: string
    tests: List<TestResult>
    passRate: float
    criticalFailures: integer
    totalTests: integer
    executionTime: float

STRUCT TestResult:
    name: string
    status: "PASS" | "FAIL" | "TIMEOUT" | "SKIP"
    critical: boolean
    executionTime: float
    errorMessage: string
    details: Map

STRUCT GateDecision:
    action: "DEPLOY" | "BLOCK" | "ROLLBACK" | "MANUAL_REVIEW"
    reason: string
    blockers: List<string>
    approvers: List<string>

STRUCT BuildDeploymentResult:
    builds: List<ImageBuildResult>
    deployments: List<DeploymentResult>
    overallStatus: "SUCCESS" | "PARTIAL" | "FAILED"
    rollbackPerformed: boolean
    executionTime: float

STRUCT ImageBuildResult:
    imageName: string
    version: string
    status: "SUCCESS" | "FAILED"
    buildTime: float
    imageSize: integer
    errorMessage: string

STRUCT BuildContext:
    directory: string
    dockerfile: string

STRUCT BuildTarget:
    imageName: string
    version: string
    dockerfilePath: string
    contextFiles: List<string>
    contextRoot: string
    buildArgs: Map<string, string>
    runtime: string
    contractVersion: string
    includeSkills: boolean

STRUCT AgentSpawnResult:
    agentId: string
    containerId: string
    runtime: string
    imageName: string
    status: "RUNNING" | "FAILED" | "STARTING"
    spawnTime: float
    healthStatus: HealthStatus
    errorMessage: string

STRUCT ContainerConfig:
    image: string
    name: string
    env: Map<string, string>
    volumes: List<string>
    network: string
    resources: Map<string, string>
    labels: Map<string, string>
    autoRemove: boolean
    healthCheck: Map

STRUCT ReadinessResult:
    ready: boolean
    healthStatus: HealthStatus
    reason: string
    checksPerformed: integer

STRUCT HealthStatus:
    healthy: boolean
    state: string
    output: string
    checks: List<string>
```

---

## Summary

This algorithm specification provides comprehensive pseudocode for all critical components of the CFN Docker infrastructure standardization:

1. **Image Contract Validation:** 7 capability tests with retry logic and health checks
2. **Runtime Selection:** Metadata parsing, inference, fallback handling
3. **Cross-Runtime Coordination:** JSON-based protocol with checksums and version negotiation
4. **Multi-Layer Testing:** Build → Integration → Regression with intelligent gates
5. **Build & Deployment:** Dependency-based parallel builds with rollback
6. **Agent Spawn Enhancement:** Runtime-aware spawning with readiness monitoring

**Key Strengths:**
- Comprehensive edge case handling
- Performance optimization points identified
- Complexity analysis for each algorithm
- Clear data structure definitions
- Testable, modular design

**Ready for Implementation:**
- All algorithms are language-agnostic
- Clear input/output contracts
- Detailed error handling strategies
- Performance characteristics documented

This specification prevents bugs by thinking through edge cases before implementation and provides a clear roadmap for developers across all supported runtimes.
