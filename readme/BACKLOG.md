# Claude Flow Novice - Backlog

Last Updated: 2025-11-12

## Active Items

### P0 - Critical

**[P0] - Process: Implement verification requirements for claimed com...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Process: Implement verification requirements for claimed completions
- **Rationale**: CRITICAL: Developer claimed security fixes without verification, creating credibility issues and security risks
- **Proposed Solution**: Require automated testing, security scanning, and peer review for all claimed completions. Implement 'trust but verify' process.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-06

**[P0] - Accessibility: Implement WCAG compliance for PhotoEditorModa...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Accessibility: Implement WCAG compliance for PhotoEditorModal and Enhanced blocks
- **Rationale**: CRITICAL: Major components completely inaccessible to keyboard and screen reader users
- **Proposed Solution**: Add focus management, keyboard navigation, ARIA labels, and screen reader support to all enhanced components
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-06

**[P0] - Security: Eliminate localStorage tokens from 23 production f...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Security: Eliminate localStorage tokens from 23 production files
- **Rationale**: CRITICAL: LocalStorage tokens create XSS vulnerability and credential theft risk
- **Proposed Solution**: Audit all frontend files, replace localStorage with secure httpOnly cookies or secure storage, implement proper token management
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-06

### P1 - High Priority

**[P1] - Fix 50 remaining TS2353 errors (unknown properties in stores...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Fix 50 remaining TS2353 errors (unknown properties in stores/services)
- **Rationale**: Remaining errors require architectural changes to store state management (11), performance metrics (10), and auth/service interfaces (29)
- **Proposed Solution**: Refactor store state interfaces, enhance performance metrics types, align auth hooks with backend contracts. Cross-service coordination required.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-09

**[P1] - Create memory Redis dashboard for real-time monitoring**
- **Sprint Backlogged**: Unknown
- **Category**: Feature
- **Description**: Create memory Redis dashboard for real-time monitoring
- **Rationale**: Need a web dashboard to monitor agent memory usage, container status, and performance metrics from Redis data in production
- **Proposed Solution**: Build a web dashboard (React/Node) that connects to Redis to display:
- Real-time memory usage per agent
- Container status (running/stopped/exited)
- Memory alerts and thresholds
- Historical performance charts
- Agent spawn/destroy events
- System resource utilization

Implementation:
1. Redis subscriber for real-time updates
2. REST API for historical data
3. React dashboard with charts
4. WebSocket for live updates
5. Docker containerization
- **Tags**: `redis`, `dashboard`, `monitoring`, `memory`, `production`
- **Status**: Backlogged
- **Date Added**: 2025-11-04

### P2 - Medium Priority

**[P2] - Add Kimi and OpenRouter provider support to Docker agents fo...**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Add Kimi and OpenRouter provider support to Docker agents for per-agent API routing
- **Rationale**: Enable cost optimization by allowing mixed provider usage across agent swarms. Z.ai (/bin/bash.50/1M) for bulk tasks, Kimi (/1M) for medium complexity, OpenRouter for specialized models, Anthropic (5/1M) for premium work. Currently only Z.ai and Anthropic are supported.
- **Proposed Solution**: 1. Extend src/cli/anthropic-client.ts getAPIConfig() to handle 'kimi' and 'openrouter' providers
2. Add provider-specific configurations:
   - Kimi: baseURL='https://api.moonshot.cn/v1', apiKey from KIMI_API_KEY
   - OpenRouter: baseURL='https://openrouter.ai/api/v1', apiKey from OPENROUTER_API_KEY
3. Update model mapping for each provider (Kimi uses moonshot-v1-*, OpenRouter supports 400+ models)
4. Test per-agent provider switching: docker run -e CLAUDE_API_PROVIDER=kimi
5. Document cost optimization strategies in docs/MULTI_PROVIDER_ROUTING.md
6. Update Dockerfile.agent if needed (already copies .env via --env-file)
7. Rebuild dist/ and Docker image
8. Add integration tests for all 4 providers
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-12

**[P2] - Fix 30 remaining TS2305 errors (TypeScript module exports)**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Fix 30 remaining TS2305 errors (TypeScript module exports)
- **Rationale**: These errors are NOT lucide-react imports - they require TypeScript module/interface export definitions across multiple service files
- **Proposed Solution**: Create missing type exports in auth, analytics, and service modules. Requires coordination with backend type definitions.
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-09

**[P2] - GraphQL endpoint**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: GraphQL endpoint
- **Rationale**: Not prioritized for MVP
- **Proposed Solution**: Implement apollo-server in API enhancement sprint
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-04

**[P2] - Rate limiting implementation**
- **Sprint Backlogged**: Unknown
- **Category**: Technical-Debt
- **Description**: Rate limiting implementation
- **Rationale**: Out of scope for authentication sprint
- **Proposed Solution**: Add express-rate-limit middleware in security sprint
- **Tags**: 
- **Status**: Backlogged
- **Date Added**: 2025-11-04

### P3 - Low Priority / Nice-to-Have

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
