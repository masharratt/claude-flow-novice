# Intelligent Coordinator Architecture Archive

Archived: 2025-11-14
Status: DEPRECATED - Replaced by cfn-error-batching-strategy skill architecture

---

## What Was Here

This archive contains the **Intelligent TypeScript Error Coordinator** implementation - a self-contained Docker-based coordinator that:

- Analyzed TypeScript compilation errors across entire frontend codebases
- Built dependency graphs to cluster related files
- Created strategic batches respecting 40GB memory budgets
- Spawned agent containers in waves for parallel error fixing
- Implemented autonomous iteration based on compiler validation
- Used Redis for passive coordination between coordinator and agents

### Key Features (Archived)

**Error Analysis & Clustering:**
- Analyzed ALL frontend TypeScript errors in single pass
- Built dependency graphs (directory-based or AST-based)
- Clustered files by dependencies using Union-Find algorithm
- Created four-tier batching strategy: 512MB → 600MB → 800MB → 1GB

**Wave-Based Spawning:**
- Coordinated agent container spawning within memory budgets
- Maximized parallelism with 40GB budget constraints
- Passive Redis polling (5s intervals) for completion tracking
- Graceful cleanup after validation

**Autonomous Iteration:**
- Ran TypeScript compiler after agents completed
- Counted remaining errors
- Auto-iterated if errors remained (max 10 iterations)
- CFN Loop integration: Loop 3 (Implement) → Loop 2 (Validate) → Product Owner

---

## Why Archived

**Reason:** Intelligent coordinator pattern extracted into reusable **cfn-error-batching-strategy skill**

**Benefits of new approach:**
- Reusable across multiple error domains (not just TypeScript)
- Decoupled from Docker-specific implementation
- Integrates with cfn-docker-v3-coordinator instead of standalone
- Better testability and composability
- Cleaner skill-based architecture

---

## Migration Path

### Old Pattern (Archived)
```
docker run cfn-intelligent-coordinator:latest
  ├── Analyzes errors
  ├── Builds dependency graph
  ├── Creates batches
  ├── Spawns agents in waves
  ├── Waits for completion (Redis polling)
  └── Iterates if errors remain
```

### New Pattern (Active)
```
cfn-docker-v3-coordinator
  └── Invokes cfn-error-batching-strategy skill
      ├── Error analysis
      ├── Dependency clustering
      ├── Strategic batching
      ├── Agent spawning (via Docker)
      └── Iteration management
```

### Migration Steps

1. **Replace coordinator image** in Docker compose/scripts:
   - Old: `cfn-intelligent-coordinator:latest`
   - New: `cfn-docker-v3-coordinator:latest`

2. **Update invocation**:
   - Old: `docker run cfn-intelligent-coordinator:latest`
   - New: Invoked by cfn-docker-v3-coordinator or orchestrator

3. **Skill references**:
   - New location: `./.claude/skills/cfn-error-batching-strategy/`
   - Use skill invocation pattern, not direct container spawning

4. **Configuration**:
   - Environment variables remain similar (MEMORY_BUDGET, MAX_ITERATIONS, etc.)
   - Redis coordination still used for agent task queue
   - cfn-docker-v3-coordinator manages orchestration

---

## Archive Contents

### Code
- `code/coordinator.js` - Main Node.js coordinator implementation (20KB)
  - Error analysis via TypeScript compiler
  - Dependency graph construction
  - Union-Find clustering algorithm
  - Wave-based agent spawning
  - Redis coordination
  - Iteration loop management

### Docker
- `docker/Dockerfile.coordinator` - Container image for coordinator
  - Node.js 20 slim base
  - Dependencies: dockerode, redis, typescript
  - Mounts: /var/run/docker.sock, /workspace

### Documentation
- `documentation/architecture.md` - Detailed architecture design
  - Option C (Hybrid Iterator) pattern selection
  - Coordinator/agent lifecycle diagrams
  - Memory optimization strategies
  - Four-tier batching algorithm
  - Redis coordination schema

- `documentation/handoff.md` - Implementation handoff notes
  - Development context and decisions
  - Known limitations and future enhancements
  - Testing approach
  - Integration points

### Tests
- `tests/intelligent-coordinator-test.sh` - Full integration test
  - Tests on real frontend project (ourstories-v2)
  - Validates error reduction over iterations
  - Measures execution time and memory usage
  - Checks container cleanup

### Utilities
- `cleanup-images.sh` - Manual Docker image cleanup script
  - Lists intelligent coordinator images
  - Stops running coordinator containers
  - Provides manual removal commands
  - Requires human confirmation before deletion

---

## Key Learnings

### What Worked Well

1. **Wave-Based Spawning**: Respecting 40GB memory budgets prevented OOM issues
2. **Redis Coordination**: Passive polling simplified coordinator logic
3. **Autonomous Iteration**: TypeScript compiler as source of truth eliminated consensus ambiguity
4. **Clustering Accuracy**: Directory-based clustering achieved 80% accuracy with minimal overhead
5. **Fault Tolerance**: Redis persistence survived coordinator restarts

### Limitations (Why Archived)

1. **Language-Specific**: Only worked for TypeScript errors
2. **Domain-Specific**: Coordinator tightly coupled to error fixing domain
3. **Not Reusable**: Difficult to adapt for other coordinator tasks
4. **Docker-Bound**: Required Docker socket mount and Dockerode library
5. **Monolithic**: No separation of concerns between coordination and domain logic

### Future Enhancement Ideas (If Revived)

1. **Generic Error Handling**: Support multiple language/error domains
2. **Pluggable Clustering**: Allow different graph construction algorithms
3. **Enhanced Metrics**: Detailed performance tracking per wave/iteration
4. **Failure Recovery**: Automatic retry for failed agents
5. **Progress Visualization**: Real-time dashboard for long-running iterations

---

## Docker Image Cleanup

**Deprecated images to remove:**
```
cfn-intelligent-coordinator:latest
cfn-intelligent-coordinator:v1
(any other cfn-intelligent-coordinator:* variants)
```

**Cleanup procedure:**

1. Run the cleanup script to list images:
   ```bash
   bash /path/to/archive/cleanup-images.sh
   ```

2. Verify no running containers:
   ```bash
   docker ps | grep coordinator
   ```

3. Manually remove images:
   ```bash
   docker rmi cfn-intelligent-coordinator:latest
   ```

4. Confirm cleanup:
   ```bash
   docker images | grep intelligent
   # Should return empty
   ```

**Caution:**
- Do not auto-delete without review
- Check CI/CD pipelines for references (GitHub Actions, etc.)
- Verify Docker Compose files don't reference these images
- Keep images for 48 hours in case of rollback

---

## Reference Commit

This architecture was archived during refactoring to extract error-batching logic into reusable skills.

**Related commits:**
- 26fbe36b: fix(docker): Docker coordinator launch failures - comprehensive diagnosis and testing
- 2715d4f0: fix(tests): Resolve Docker core test suite infrastructure issues
- aab2992f: refactor(tests): Archive obsolete test files and update infrastructure tracking

**Replacement skill:**
- `./.claude/skills/cfn-error-batching-strategy/` - New reusable skill implementation

---

## File Sizes

For reference (compressed storage):

```
code/coordinator.js                ~20 KB
docker/Dockerfile.coordinator      ~2  KB
documentation/architecture.md      ~15 KB
documentation/handoff.md           ~5  KB
tests/intelligent-coordinator-test.sh  ~3 KB
cleanup-images.sh                  ~2  KB
                                   ----
Total archive size:                ~47 KB
```

---

## Questions?

For questions about the archived intelligent coordinator pattern:

1. **Architecture**: See `documentation/architecture.md` in this archive
2. **Implementation**: See `code/coordinator.js` with inline comments
3. **Testing**: See `tests/intelligent-coordinator-test.sh` for usage examples
4. **Migration**: Refer to "Migration Path" section above

For questions about the new skill-based approach:
- See `./.claude/skills/cfn-error-batching-strategy/SKILL.md`
- See `./.claude/agents/cfn-v3-coordinator/` for integration

---

## Version History

- **2025-11-14**: Intelligent coordinator archived during cfn-error-batching-strategy skill migration
  - All artifacts moved from active codebase
  - Architecture preserved in archive for reference
  - Cleanup script created for manual Docker image removal
  - Migration path documented

