# CLI Mode Redefinition Implementation Plan

**Date:** November 2025
**Purpose:** Redefine CLI mode from Redis-based coordination to Main Chat coordinator with CLI background agents for different AI services

## Executive Summary

This document outlines the comprehensive implementation plan to redefine CLI mode from its current complex Redis coordination system to a simplified architecture where:

1. **Main Chat acts as coordinator**
2. **Agents launched via CLI in background**
3. **Primary purpose: using different AI services for agents**
4. **Main Chat uses Redis BLPOP to wait for CLI agent signals**

## Current Architecture Analysis

### Current State: Complex Redis Coordination
- **3-layer system:** Main Chat → Coordinator via CLI → Complex TypeScript orchestration
- **Redis-heavy:** Multi-loop coordination with complex key patterns
- **Complex agent selection:** Mode-based classification with fallbacks
- **Resource intensive:** Multiple coordination layers and consensus collection

### Target State: Simplified Main Chat Coordination
- **2-layer system:** Main Chat → Direct CLI agent spawning
- **Simple signaling:** Basic Redis BLPOP for completion signals
- **AI service routing:** Direct provider selection (Kimi, Z.ai, etc.)
- **Lightweight coordination:** Minimal Redis overhead

## Implementation Phases

### Phase 1: Core Infrastructure Simplification

#### 1.1 CLI Command Updates
**File:** `.claude/commands/cfn-loop-cli.md`
- **Remove:** Complex Redis coordination setup
- **Add:** Main Chat coordinator pattern
- **Implement:** BLPOP waiting logic for Main Chat
- **Simplify:** Command parameters and execution flow

**Priority:** HIGH
**Estimated Effort:** 4-6 hours

#### 1.2 Coordinator Agent Simplification
**File:** `.claude/agents/cfn-dev-team/coordinators/cfn-v3-coordinator.md`
- **Remove:** TypeScript orchestration complexity
- **Replace:** With simple CLI agent spawning
- **Simplify:** Signal coordination to basic Redis messaging
- **Maintain:** Agent lifecycle management

**Priority:** HIGH
**Estimated Effort:** 6-8 hours

#### 1.3 Orchestration Infrastructure
**Files:**
- `src/orchestrator/orchestrate.ts`
- `.claude/skills/cfn-loop-orchestration/src/orchestrate.ts`

- **Replace:** Multi-loop workflows with direct execution
- **Remove:** Complex Redis coordination patterns
- **Simplify:** To basic CLI spawning and signal collection
- **Maintain:** Process health monitoring

**Priority:** HIGH
**Estimated Effort:** 8-10 hours

#### 1.4 Coordination Wrapper Updates
**File:** `src/coordination/coordination-wrapper.ts`
- **Simplify:** To basic BLPOP signaling
- **Remove:** Complex consensus collection mechanisms
- **Focus:** On agent completion signaling only
- **Maintain:** Type safety and error handling

**Priority:** MEDIUM
**Estimated Effort:** 4-6 hours

### Phase 2: AI Service Integration

#### 2.1 Agent Selection System
**Directory:** `.claude/skills/cfn-agent-selection-with-fallback/`
- **Simplify:** Task classification for AI service routing
- **Add:** Support for different AI providers (Kimi, Z.ai, etc.)
- **Remove:** Complex fallback mechanisms
- **Implement:** Direct provider-to-agent mapping

**Priority:** MEDIUM
**Estimated Effort:** 6-8 hours

#### 2.2 Spawning Infrastructure Updates
**Files:** Multiple CLI spawning scripts
- **Add:** AI provider flagging support
- **Implement:** Model/provider parameter passing
- **Enhance:** Background execution with proper signal handling
- **Maintain:** Process isolation and cleanup

**Priority:** MEDIUM
**Estimated Effort:** 4-6 hours

### Phase 3: Configuration & Testing

#### 3.1 Environment & Configuration
- **Update:** Redis key patterns for simplified signaling
- **Add:** Environment variables for AI service routing
- **Simplify:** Mode-based configuration
- **Maintain:** Backward compatibility where possible

**Priority:** LOW
**Estimated Effort:** 2-4 hours

#### 3.2 Test Infrastructure Updates
**Primary File:** `tests/cli-mode/core/e2e/test-cfn-loop-cli-real-execution.sh`
- **Create:** New tests for simplified Main Chat coordination
- **Update:** E2E tests to validate BLPOP patterns
- **Remove:** Tests for complex Redis coordination
- **Add:** AI service integration tests

**Priority:** MEDIUM
**Estimated Effort:** 8-10 hours

#### 3.3 Documentation Updates
- **Update:** Architecture documentation
- **Simplify:** CLI mode descriptions
- **Document:** New AI service integration patterns
- **Create:** Migration guide for existing users

**Priority:** LOW
**Estimated Effort:** 4-6 hours

## Deliverables

### Immediate Deliverables (This Sprint)

1. **Temporary Flag Implementation** - Model/provider flagging when spawning agents
2. **Kimi API Integration Tests** - Validate CLI agent spawning with Kimi APIs
3. **Main Chat BLPOP Testing** - Validate Redis signal waiting in practice

### Future Deliverables (Following Sprints)

1. **Full CLI Mode Redefinition** - Complete Phase 1-3 implementation
2. **AI Service Provider Framework** - Support for multiple AI providers
3. **Updated Documentation** - Complete architecture and usage guides

## Risk Assessment

### High Risks
- **Breaking existing workflows:** Current CLI mode users may experience breaking changes
- **Redis dependency:** Still requires Redis for BLPOP signaling
- **AI provider reliability:** Dependent on external AI service availability

### Medium Risks
- **Signal handling:** Background agent signal reliability
- **Error handling:** Simplified error reporting vs. complex coordination
- **Performance:** May lose some optimization from complex coordination

### Mitigation Strategies
- **Backward compatibility:** Maintain existing patterns during transition
- **Comprehensive testing:** Extensive test coverage for new patterns
- **Gradual rollout:** Feature flags for gradual adoption
- **Fallback mechanisms:** Graceful degradation on AI provider failures

## Success Criteria

### Technical Success
- [ ] CLI agents can be spawned with different AI providers
- [ ] Main Chat can successfully wait for agent completion via BLPOP
- [ ] Signal handling is reliable in practice (not just theory)
- [ ] Tests validate the new architecture end-to-end

### Business Success
- [ ] Simplified CLI mode is easier to understand and maintain
- [ ] Users can leverage different AI services for cost/quality optimization
- [ ] Reduced complexity leads to better reliability
- [ ] Performance is maintained or improved

## Implementation Timeline

### Week 1: Foundation
- Complete architecture analysis ✓
- Create implementation plan ✓
- Implement temporary flag testing
- Validate Kimi API integration

### Week 2: Core Changes
- Simplify CLI command coordination
- Update coordinator agent
- Implement basic BLPOP signaling

### Week 3: Integration
- Update orchestration infrastructure
- Implement AI service routing
- Create comprehensive tests

### Week 4: Polish & Documentation
- Update all documentation
- Performance testing
- Production readiness validation

## Next Steps

1. **Implement temporary flag** for model/provider testing (immediate)
2. **Create Kimi API tests** for CLI agent spawning (immediate)
3. **Test Main Chat BLPOP** functionality with CLI agents (immediate)
4. **Begin Phase 1 implementation** following successful validation

---

**Document Status:** Active Implementation Plan
**Last Updated:** November 22, 2025
**Next Review:** Upon completion of immediate deliverables