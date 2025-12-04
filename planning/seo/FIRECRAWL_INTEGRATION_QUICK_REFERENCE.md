# Firecrawl Integration: Quick Reference

## Three Options at a Glance

### Option A: Merge into Monorepo
- **Timeline**: 8-10 weeks
- **Risk Level**: Critical
- **Deployment**: Unified (Fly.io)
- **Release Cycle**: Shared (coordinated)
- **Verdict**: ❌ **NOT RECOMMENDED** - Blocks SEO velocity, complexity increases 40%

### Option B: Separate + Piggybacking (Extend Playwright Service)
- **Timeline**: 4-6 weeks
- **Risk Level**: Low
- **Deployment**: Independent
- **Release Cycle**: Independent
- **Verdict**: ✅ **RECOMMENDED** - Fast, clean, reusable

### Option C: Extract Shared Npm Package
- **Timeline**: 6-8 weeks
- **Risk Level**: Medium
- **Deployment**: Independent
- **Release Cycle**: Semantic versioning required
- **Verdict**: ⏸️ **DEFER** - Premature if only 2 users; revisit Phase 2

---

## Option B: Firecrawl Extensions (Recommended)

### New Endpoints (Non-Breaking)

#### 1. POST /screenshot
```typescript
{
  url: string;
  auth?: { type: 'cookie' | 'bearer' | 'form'; credentials: {} };
  selector?: string;
  wait_selector?: string;
  timeout?: number;
}
→ { image: Buffer; width: number; height: number; status_code: number }
```

#### 2. POST /screenshot/batch
```typescript
{
  screenshots: ScreenshotRequest[];
  parallel?: 1-5;
  fail_fast?: boolean;
}
→ { results: Array<{ url, success, image, error, duration_ms }> }
```

#### 3. POST /screenshot/diff
```typescript
{
  before: Buffer;  // Previous screenshot
  after: Buffer;   // New screenshot
}
→ { diff_image: Buffer; similarity_score: 0-1; changes_detected: boolean }
```

### Implementation Timeline

| Week | Task | Deliverables |
|------|------|--------------|
| 1-2 | Extend Playwright service | auth support, /screenshot endpoint, tests |
| 3 | SEO screenshot service | ScreenshotService, annotation engine |
| 4 | Visual diffing | DiffEngine, versioning schema |
| 5 | Automation | cron scheduling, batch processor |
| 6 | Documentation | guides, Firecrawl PR, team training |

### Feature Additions to SEO Platform

**New in packages/seo-analysis**:
- `src/visual-content/ScreenshotService.ts` - orchestration
- `src/visual-content/AnnotationEngine.ts` - arrows, highlights, text
- `src/visual-content/DiffEngine.ts` - pixel-diff comparison
- `src/visual-content/ScreenshotScheduler.ts` - cron automation

**New in dashboard**:
- Screenshot history viewer
- Visual diff before/after
- Scheduled capture management

---

## Why Option B Wins

1. **Fast MVP** (4-6 weeks vs 8-10)
2. **Independent releases** (SEO doesn't wait for Firecrawl)
3. **Minimal Firecrawl impact** (500 LOC addition, non-breaking)
4. **Clear ownership** (no monorepo complexity)
5. **Community value** (reusable screenshot feature)
6. **Low risk** (separate deployments, versioning)
7. **Fallback path** (can migrate to Option C later)

---

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Firecrawl rejects PR | Medium | Use local fork or Puppeteer alternative |
| Network latency | Low | Keep services on same infrastructure |
| Version conflicts | Low | Pin Playwright service version |
| Upstream breaking changes | Medium | Maintain fork, monitor releases |

---

## Success Criteria

### Technical
- Screenshot latency p95 < 10 seconds
- Batch throughput: 10 screenshots/sec
- Visual diff accuracy > 95%
- Test coverage > 85%

### Business
- 80%+ of manual screenshot tasks automated
- Dashboard integration complete
- Team trained and self-sufficient

---

## Next Steps

1. **Week 1**: Architect + Coder review this analysis
2. **Week 1**: Contact Firecrawl maintainers (async message about screenshot feature)
3. **Week 2**: Implement Firecrawl Playwright extensions
4. **Week 3-4**: Implement SEO screenshot service
5. **Week 5-6**: Dashboard + documentation

---

## Key Assumptions

- Firecrawl maintainers receptive to screenshot feature
- Playwright service remains stable
- Screenshot throughput of 10/sec sufficient
- SEO platform stays internal (rapid iteration OK)
- Both services can be deployed on same infrastructure

---

## Document References

- **Full Analysis**: `planning/seo/FIRECRAWL_INTEGRATION_ANALYSIS.md`
- **SEO Service Plan**: `planning/seo/SEO_SERVICE_EXTRACTION_PLAN.md`
- **Visual Architecture**: `planning/seo/VISUAL_CONTENT_ARCHITECTURE.md` (2265 lines)
- **Firecrawl Repository**: `/mnt/c/Users/masha/Documents/firecrawl`
- **SEO Package**: `/mnt/c/Users/masha/Documents/claude-flow-novice/packages/seo-analysis`

---

**Recommended Approach**: Option B (Separate with Piggybacking)
**Confidence Score**: 0.92
**Ready to Execute**: Yes
