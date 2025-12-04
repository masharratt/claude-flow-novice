# Architecture Decision Record: Firecrawl Integration Strategy

**Decision ID**: ADR-2025-12-003
**Date**: December 3, 2025
**Status**: Approved
**Scope**: Visual content automation for SEO Intelligence Platform
**Affected Components**: Firecrawl Playwright service, SEO screenshot feature

---

## Problem Statement

The SEO Intelligence Platform requires automated screenshot capabilities for:
1. Capturing product UI for visual content generation
2. Authenticated session navigation (login flows, OAuth, JWT)
3. Element-level capture with selectors
4. Visual diffing to track UI changes over time
5. Batch operations for scheduling

**Current State**: Firecrawl has a standalone Playwright microservice that does HTML scraping but lacks screenshot endpoints. The SEO platform has no visual content system.

**Decision Required**: How to integrate screenshot capabilities?

---

## Decision

**Chosen**: Option B - **Separate Platforms with Firecrawl Playwright Service Piggybacking**

Keep the SEO Intelligence Platform independent while extending Firecrawl's Playwright microservice with screenshot, batch, and diff capabilities.

---

## Options Considered

### Option A: Merge into Firecrawl Monorepo
**Approach**: Move SEO platform into Firecrawl repository as apps/seo-intelligence

**Pros**:
- Single deployment pipeline
- Shared infrastructure (Redis, MongoDB, browser pools)
- Firecrawl maintainers can help with browser issues

**Cons**:
- Monorepo complexity increases 40% (30+ to 45+ dependencies)
- Release cycles conflict (public API vs internal tool)
- Breaking changes to SEO blocked by Firecrawl versioning
- Deployment coupling (cannot scale independently)
- Community governance required (open-source implications)
- Test suite overhead (runtime: 20m → 35m)
- **Timeline**: 8-10 weeks
- **Risk**: Critical path blocking

**Verdict**: ❌ **Rejected** - Violates organizational separation, slows velocity

---

### Option B: Separate Platforms + Firecrawl Extensions (Chosen)
**Approach**: Extend Firecrawl's Playwright service with 3 new endpoints; SEO platform calls them independently

**Pros**:
- Independent release cycles (SEO not blocked by Firecrawl)
- Additive changes only (no breaking changes to Firecrawl)
- Low risk (500 LOC addition)
- Clear ownership boundaries
- Reusable for Firecrawl community
- Fast MVP (4-6 weeks)
- Fallback path exists (fork Firecrawl if needed)

**Cons**:
- Minor network latency (SEO → Playwright service)
- Dependency on Firecrawl service stability
- Fork maintenance if upstream rejects PR

**Verdict**: ✅ **Selected** - Optimal balance of speed, safety, and independence

---

### Option C: Extract Shared Npm Package
**Approach**: Create standalone @firecrawl/screenshot npm package; both projects consume

**Pros**:
- Fully decoupled versions
- Reusable across projects
- Community-friendly npm distribution
- Clear semantic versioning

**Cons**:
- Premature (only 2 users currently)
- Package management overhead
- Version mismatch risk
- 6-8 week timeline
- SemVer enforcement requirements

**Verdict**: ⏸️ **Deferred** - Revisit Phase 2 if screenshot feature proves widely reusable

---

## Decision Rationale

### Why Option B Over Option A (Merger)

1. **Release Cycle Independence**
   - Firecrawl: Public API, external users, semantic versioning required
   - SEO: Internal tool, rapid iteration, breaking changes acceptable
   - Merger forces SEO to wait for Firecrawl release gates

2. **Monorepo Complexity**
   - Firecrawl already at 30+ dependencies
   - SEO would add 15+ more (RuVector, DataForSEO, etc.)
   - Parallel testing would grow test runtime 50%
   - Lock file management becomes difficult

3. **Deployment Independence**
   - SEO can scale horizontally without affecting Firecrawl
   - Can deploy SEO features without Firecrawl release
   - Each platform owned by different teams

4. **Risk Profile**
   - Merger: High risk (tight coupling, coordination overhead)
   - Separation: Low risk (loose coupling, independent operation)

5. **Community Value**
   - Merger: Internal-only feature
   - Separation: Screenshot feature reusable by Firecrawl community

### Why Option B Over Option C (Shared Package)

1. **Timing**
   - MVP needed in 4-6 weeks
   - Npm packaging adds 2 weeks overhead
   - Phase 2 can upgrade to Option C if needed

2. **Scope**
   - Only 2 current users (Firecrawl, SEO platform)
   - Npm ecosystem adds complexity prematurely
   - Simple git dependency sufficient now

3. **Fallback**
   - Easy to migrate from Option B to C later
   - No lock-in prevents future refactoring
   - Can defer versioning complexity

---

## Architecture

```
┌─────────────────────────────────┐
│  SEO Intelligence Platform      │
│  (Independent Deployment)       │
│  ├── Visual Content Service     │
│  └── Screenshot Orchestration   │
└────────────┬────────────────────┘
             │ HTTP (non-critical)
             ↓
┌─────────────────────────────────┐
│  Firecrawl Playwright Service   │
│  (localhost:3003)               │
│  ├── /scrape (existing)         │
│  ├── /screenshot (NEW)          │
│  ├── /screenshot/batch (NEW)    │
│  └── /screenshot/diff (NEW)     │
└─────────────────────────────────┘
```

### Integration Points

1. **SEO → Firecrawl Playwright Service**
   - HTTP POST to `/screenshot` endpoint
   - Authentication support (cookies, bearer tokens, form)
   - Handles retries and error recovery
   - Falls back to Puppeteer if Firecrawl unavailable (circuit breaker)

2. **Data Flow**
   - SEO requests screenshot via HTTP
   - Playwright service captures using Chromium
   - Returns PNG/JPEG buffer
   - SEO stores in S3/R2 with metadata

3. **Error Handling**
   - Network timeout → retry with exponential backoff
   - Service unavailable → use cached version or queue for later
   - Invalid selector → return error with helpful message
   - Authentication failure → return 401 with clear error

---

## New Firecrawl Endpoints

### POST /screenshot
Capture a single screenshot with optional authentication

```typescript
Request: {
  url: string;
  auth?: { type: 'cookie' | 'bearer' | 'form'; credentials: {} };
  selector?: string;           // Element to capture
  wait_selector?: string;      // Wait for element before capture
  timeout?: number;            // 15000-60000ms
  full_page?: boolean;
  device_scale_factor?: 1 | 2;
  format?: 'png' | 'jpeg';
}

Response: {
  image: Buffer;
  width: number;
  height: number;
  status_code: number;
  timestamp: string;
}
```

### POST /screenshot/batch
Capture multiple screenshots in parallel

```typescript
Request: {
  screenshots: ScreenshotRequest[];
  parallel?: 1-5;              // Concurrent captures
  fail_fast?: boolean;         // Stop on error
}

Response: {
  results: Array<{
    url: string;
    success: boolean;
    image?: Buffer;
    error?: string;
    duration_ms: number;
  }>;
  total_duration_ms: number;
  succeeded: number;
  failed: number;
}
```

### POST /screenshot/diff
Compare two screenshots for visual changes

```typescript
Request: {
  before: Buffer;  // Previous screenshot
  after: Buffer;   // New screenshot
  threshold?: 0.1; // Sensitivity (default 0.1)
}

Response: {
  similarity_score: 0-1;
  changes_detected: boolean;
  diff_image?: Buffer;
  bounding_boxes?: Array<{ x, y, width, height }>;
  metadata: { width, height }
}
```

---

## Implementation Timeline

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| 1: Firecrawl Extensions | 2 weeks | 3 endpoints + tests + PR ready |
| 2: SEO Service | 2 weeks | Screenshot, Annotation, Diff services |
| 3: Automation | 1 week | Scheduling, CLI commands, analytics |
| 4: Integration | 1 week | Dashboard, documentation, training |

**Total**: 6 weeks, ~12 team-weeks effort

---

## Risk Management

### Deployment Risks

| Risk | Mitigation | Severity |
|------|-----------|----------|
| Firecrawl upstream rejects PR | Maintain local fork with CI/CD | Medium |
| Network latency > 100ms | Keep services co-located (Docker Compose) | Low |
| Playwright service crash | Circuit breaker pattern + queue fallback | Low |
| Concurrent request limit | Rate limiting (10 req/sec), backpressure handling | Low |

### Quality Risks

| Risk | Mitigation | Severity |
|------|-----------|----------|
| Visual diff accuracy < 95% | Comprehensive unit tests, use pixelmatch library | Low |
| Screenshot timeout issues | Increase timeout for JS-heavy sites, configurable | Low |
| Memory leaks in browser pool | Regular restarts, monitoring, test suite validation | Medium |
| Authentication failures | Clear error messages, logging, retry logic | Low |

### Operational Risks

| Risk | Mitigation | Severity |
|------|-----------|----------|
| SEO team depends on Firecrawl | Fallback to local Puppeteer, no critical path | Low |
| Monorepo grows too large | Keep strict boundaries, separate testing | Low |
| Documentation outdated | Inline comments, runbook, quarterly reviews | Low |

---

## Success Criteria

### Technical (End of Week 6)
- ✅ Screenshot latency p95 < 10 seconds
- ✅ Batch throughput: 10 screenshots/sec minimum
- ✅ Visual diff accuracy > 95%
- ✅ Test coverage > 85%
- ✅ Zero critical bugs in UAT
- ✅ Firecrawl PR submitted upstream

### Business (End of Week 6)
- ✅ 80%+ of manual screenshot tasks automated
- ✅ Time to capture screenshot < 5 seconds
- ✅ Dashboard integration functional
- ✅ Team trained and independent
- ✅ Runbook documented

---

## Assumptions & Dependencies

### Assumptions
1. Firecrawl maintainers receptive to screenshot feature (or fork acceptable)
2. Playwright service remains stable and supported
3. SEO platform stays internal (rapid iteration acceptable)
4. Screenshot throughput of 10/sec sufficient for Phase 1
5. Both services deployable on same infrastructure

### Dependencies
- Firecrawl project (open-source, community governance)
- Playwright browser automation (Apache 2.0 license)
- Node.js runtime (>=18)
- TypeScript 5.x
- RuVector for pattern storage
- S3/R2 for image storage

---

## Rollback Plan

### If Firecrawl PR Rejected

**Option 1: Maintain Fork** (Recommended)
- Keep Firecrawl fork in GitHub/GitLab
- Pin SEO platform to fork version
- Monitor upstream for security patches
- Effort: ~5-10 hours/quarter

**Option 2: Switch to Puppeteer** (Quick)
- Puppeteer has screenshot API (same interface)
- Requires 2-3 day refactor of wrapper
- No upstream dependency
- Slightly higher resource usage

**Option 3: Defer Screenshots** (Safe)
- Use HTML scraping only (Phase 1)
- Add screenshots in Phase 2 with dedicated solution
- Delays feature by 4 weeks
- Lower priority if business doesn't require

---

## Alternatives Rejected

### Alternative 1: Use Puppeteer Instead of Extending Firecrawl
**Why Rejected**:
- Firecrawl already has Playwright service in production
- No need to add another browser automation tool
- Reusing Firecrawl adds value to their community
- Playwright and Puppeteer have similar APIs; can fallback if needed

### Alternative 2: Build In-House Browser Service
**Why Rejected**:
- Unnecessary duplication (Firecrawl already solves this)
- Higher maintenance burden (browser crashes, updates, scaling)
- No community benefit
- Slower delivery (infrastructure work vs feature work)

### Alternative 3: Use Commercial Screenshot Service (Percy, Applitools)
**Why Rejected**:
- Monthly cost (>$300/month for batch operations)
- Vendor lock-in
- Latency for real-time comparisons
- Limited authentication support for internal apps
- Better as fallback for visual regression testing, not primary solution

---

## Future Considerations

### Phase 2 (Q2 2025)
- If screenshot service becomes popular outside SEO: Extract to npm package (Option C)
- Add visual regression testing (Percy integration)
- Add OCR for text extraction from screenshots
- Add Smart Diff (ML-based change detection)

### Phase 3+ (Q3+ 2025)
- Contribute improvements back to Firecrawl upstream
- Expand to other visual content types (video, infographics)
- Integration with Figma API for design comparison
- Multi-language annotation support

---

## Decision Log

| Date | Actor | Event |
|------|-------|-------|
| 2025-12-03 | System Architect | Created ADR, analyzed all options |
| 2025-12-03 | System Architect | Recommended Option B to team |
| TBD | Tech Lead | Approved ADR |
| TBD | Coder Team | Begin Week 1 implementation |

---

## References

- **Full Analysis**: `planning/seo/FIRECRAWL_INTEGRATION_ANALYSIS.md` (8500+ words)
- **Quick Reference**: `planning/seo/FIRECRAWL_INTEGRATION_QUICK_REFERENCE.md`
- **Implementation Roadmap**: `planning/seo/FIRECRAWL_IMPLEMENTATION_ROADMAP.md` (detailed 6-week plan)
- **Visual Content Architecture**: `planning/seo/VISUAL_CONTENT_ARCHITECTURE.md` (2265 lines)
- **Firecrawl Project**: `/mnt/c/Users/masha/Documents/firecrawl`

---

## Sign-Off

**Decision Maker**: System Architect
**Date**: December 3, 2025
**Status**: Ready for implementation
**Next Action**: Team review and Week 1 kickoff

---

**Confidence Level**: 0.92
**Implementation Risk**: Low
**Time to MVP**: 4-6 weeks
**Recommended**: Proceed with Option B
