# Claude Flow Novice - Backlog

Last Updated: 2025-11-02

## Active Items

### P0 - Critical

### P1 - High Priority

**[P1] - Audio Fixture Generation Implementation**
- **Sprint Backlogged**: Sprint 3.4
- **Category**: Technical-Debt
- **Description**: Audio Fixture Generation Implementation
- **Rationale**: Blocks James voice navigation tests and Sprint 3.4 accessibility scenarios. Tester identified 0/5 audio fixtures generated despite kokoro-js installed.
- **Proposed Solution**: Complete fixture generator with kokoro-js client integration. Generate audio for Margaret (af_bella), Marcus (am_michael), Lily (af_heart), David (TBD), Robert (TBD). Validate fixture quality (file size, duration, format). Estimated 2-4 hours in Sprint 3.4.
- **Tags**: `audio`, `fixtures`, `kokoro`, `accessibility`, `testing`
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P1] - Install kokoro-js dependency for audio test execution**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Install kokoro-js dependency for audio test execution
- **Rationale**: Audio test execution blocked by missing kokoro-js npm package. All James voice navigation tests and audio simulation tests cannot run. Tester validation score 0.78 due to this blocker.
- **Proposed Solution**: Run 'npm install --save-dev kokoro-js' in frontend directory. Verify package installation with 'npm list kokoro-js'. Test audio fixture generation with 'npx tsx tests/ai-agents/fixtures/generate-audio-fixtures.ts'. Validate at least one voice command test executes successfully. Estimated time: 5-10 minutes.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P1] - Z.ai Model Workflow Execution Failure**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Z.ai Model Workflow Execution Failure
- **Rationale**: Z.ai GLM-4.6 cannot complete agent workflows, blocking SEO content pipeline execution
- **Proposed Solution**: Investigate and patch Z.ai model behavior to support full agent workflow completion, including tool execution and JSON output generation
- **Tags**: `z-ai`, `infrastructure`, `workflow`
- **Status**: Backlogged
- **Date Added**: 2025-11-02

### P2 - Medium Priority

**[P2] - Emotional Pause Context Validation for Robert persona**
- **Sprint Backlogged**: Sprint 3.4
- **Category**: Feature
- **Description**: Emotional Pause Context Validation for Robert persona
- **Rationale**: Current tests validate pause frequency (35%) but not contextual appropriateness. Reduces confidence in memorial curator behavioral realism. Tester identified gap in emotional context validation.
- **Proposed Solution**: Add screenshot analysis to verify pauses during photo viewing, tribute writing, memorial curation. Use GPT-4o vision to analyze pause timing context against displayed content. Validate pauses occur at meaningful moments. Estimated 1-2 hours.
- **Tags**: `testing`, `personas`, `emotional-context`, `robert`, `memorial`
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P2] - Child Accessibility Tests for Lily persona**
- **Sprint Backlogged**: Sprint 3.4
- **Category**: Feature
- **Description**: Child Accessibility Tests for Lily persona
- **Rationale**: Enhances child safety validation beyond current parental control tests. Tester identified missing accessibility coverage for 8yo persona. WCAG 2.1 AA child-specific requirements not validated.
- **Proposed Solution**: Create lily-accessibility.spec.ts with WCAG 2.1 AA child-specific tests. Validate icon-based navigation, 60px touch targets, child-friendly error messages, reading level appropriateness (150 WPM). Estimated 2-3 hours.
- **Tags**: `accessibility`, `testing`, `child-safety`, `wcag`, `lily`
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P2] - Voice Mapping Documentation for David and Robert personas**
- **Sprint Backlogged**: Sprint 3.4
- **Category**: Technical-Debt
- **Description**: Voice Mapping Documentation for David and Robert personas
- **Rationale**: Missing voice mappings prevent audio fixture generation for 2/5 personas. Tester identified documentation gap in KOKORO_INTEGRATION.md.
- **Proposed Solution**: Assign am_adam or am_michael for David (tech-savvy male 45yo), am_adam for Robert (reflective male 52yo). Update KOKORO_INTEGRATION.md with voice profiles and persona mappings. Estimated 30 minutes.
- **Tags**: `documentation`, `kokoro`, `personas`, `audio`
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P2] - Enhance accessibility for voice navigation (WCAG 2.1 AA comp...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Enhance accessibility for voice navigation (WCAG 2.1 AA compliance)
- **Rationale**: Accessibility advocate validation score 0.78 due to missing keyboard fallback, limited screen reader support, and insufficient error handling. James persona (62yo, low vision, screen reader user) needs comprehensive accessibility features. WCAG 2.1 AA compliance gaps: 2.1.1 Keyboard (no fallback), 2.4.7 Focus Visible (partial), 3.3.2 Error Handling (limited), 4.1.3 Status Messages (partial).
- **Proposed Solution**: Implement keyboard navigation fallback for all voice commands. Add ARIA attributes and screen reader announcements. Create user-friendly error messages for voice recognition failures. Add high contrast mode explicit testing. Support voice command customization (speed, pitch, language). Add persona-specific accessibility settings (text size, contrast, voice preferences). Estimated time: 4-6 hours in Sprint 3.3.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P2] - AI Agent Framework Type System Unification**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: AI Agent Framework Type System Unification
- **Rationale**: Frontend and backend AI agent implementations have type conflicts preventing frontend test compilation (15+ TypeScript errors). Missing exports: COST_CONFIG, TEST_TIMEOUTS, US001_EXPECTATIONS in config.ts. Missing types: CostReport, MargaretTraits, TestResult. Constructor signature mismatches in MargaretPersona class.
- **Proposed Solution**: Unify type system by: (1) Export missing constants from config.ts, (2) Export missing types from types.ts, (3) Align MargaretPersona constructor with BehaviorEngine/DecisionEngine interfaces, (4) Remove duplicate frontend implementation, (5) Standardize on backend AgentRunner for all AI agent tests. Estimated effort: 1.5 hours in Sprint 3.2.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P2] - Enhance System Scalability**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Enhance System Scalability
- **Rationale**: Architectural assessment revealed partial readiness for large-scale unit simulation
- **Proposed Solution**: 1. Complete Rayon parallel implementation 2. Develop spatial partitioning strategy 3. Create 500-unit load test infrastructure
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-02

**[P2] - Resolve async-nats dependency**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Resolve async-nats dependency
- **Rationale**: Critical infrastructure blocker preventing intake-orchestrator testing
- **Proposed Solution**: Upgrade or patch async-nats to support 'jetstream' feature
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-01

**[P2] - Implement backlog query interface for coordinators to check ...**
- **Sprint Backlogged**: Sprint 10 - Backlog Management
- **Category**: Feature
- **Description**: Implement backlog query interface for coordinators to check related items before spawning agents
- **Rationale**: Test implementation of backlog skill. Coordinators need backlog awareness for better context injection.
- **Proposed Solution**: Add query-backlog.sh helper script with grep/awk filters for tags, priority, category. Return JSON array of matching items with confidence scores for relevance.
- **Tags**: `backlog`, `coordination`, `context-injection`, `testing`
- **Status**: Backlogged
- **Date Added**: 2025-10-31

### P3 - Low Priority / Nice-to-Have

**[P3] - Test backlog preservation mechanism**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Test backlog preservation mechanism
- **Rationale**: Verifying AWK logic preserves existing entries
- **Proposed Solution**: Run script and inspect BACKLOG.md to confirm all previous entries remain
- **Tags**: `testing`, `validation`
- **Status**: Backlogged
- **Date Added**: 2025-11-02

## Completed Items

---

## Item Template

**[PRIORITY] - [Item Title]**
- **Sprint Backlogged**: Sprint X
- **Category**: Feature/Bug/Technical-Debt/Optimization
- **Description**: What needs to be done
- **Rationale**: Why it was deferred
- **Proposed Solution**: How to implement
- **Tags**: `tag1`, `tag2`, `tag3`
- **Status**: Backlogged
- **Date Added**: YYYY-MM-DD
