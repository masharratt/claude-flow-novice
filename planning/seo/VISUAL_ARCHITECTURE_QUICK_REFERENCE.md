# Visual Content Architecture - Quick Reference

**Document**: `/planning/seo/VISUAL_CONTENT_ARCHITECTURE.md`
**Status**: Ready for Implementation (Confidence: 0.92)
**Total Lines**: 2,265

---

## High-Level Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    SEO Intelligence Platform                     │
│                    Visual Content System                         │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ├──────────────────────┐
                              │                      │
                    ┌─────────▼──────────┐  ┌───────▼────────┐
                    │ Image Generation   │  │ Screenshot     │
                    │ Service            │  │ Service        │
                    └───────────┬────────┘  └───────┬────────┘
                                │                   │
        ┌───────────────────────┼───────────────────┼───────────────────────┐
        │                       │                   │                       │
  ┌─────▼──────┐  ┌────────────▼──────────┐  ┌────▼──────┐  ┌────────────▼─┐
  │ DALL-E 3   │  │ Midjourney API        │  │ Stable    │  │ Playwright   │
  │ Premium    │  │ Artistic Quality      │  │ Diffusion │  │ Browser Pool │
  │ Quality    │  │ Complex Visuals       │  │ Fast &    │  │ + Auth Mgmt  │
  └────────────┘  └───────────────────────┘  └───────────┘  └──────────────┘
        │                       │                   │                  │
        └───────────────────────┼───────────────────┼──────────────────┘
                                │                   │
                    ┌───────────▼──────┬─────────────▼─┐
                    │  Smart Provider  │               │
                    │  Selector        │  Annotation   │
                    │                  │  Layer        │
                    └────────┬─────────┴───────────────┘
                             │
                    ┌────────▼─────────┐
                    │ Storage Backend  │
                    │                  │
                    │ S3 / R2 / Local  │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼────────────────────┐
        │                    │                    │
   ┌────▼──────┐  ┌──────────▼──────┐  ┌─────────▼──┐
   │ Original  │  │ Responsive      │  │ Thumbnail  │
   │ Image     │  │ Variants        │  │ (200x200)  │
   │ (1 copy)  │  │ (3 sizes)       │  │            │
   └───────────┘  └─────────────────┘  └────────────┘
        │                    │                    │
        └────────────────────┼────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │  CDN Distribution│
                    │  CloudFront +    │
                    │  Cloudflare R2   │
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────────┐
                    │ Dashboard UI          │
                    │ Image Library         │
                    │ Content Editor        │
                    │ Analytics             │
                    └───────────────────────┘
```

---

## Core Components Summary

### 1. Image Generation Service

**Providers Integrated**:
- DALL-E 3 (Primary): $0.045/image, 45s latency, best narrative quality
- Midjourney: $0.15/image, 60s latency, superior artistic quality
- Stable Diffusion: $0.005/image, 15s latency, cost-optimized, bulk operations

**Smart Selection**:
```
Priority: Quality (40%) > Cost (35%) > Speed (25%)

By Content Type:
  - Featured Image    → DALL-E (quality-first)
  - Social Card       → Stable Diffusion (speed, cost)
  - Infographic       → Midjourney (artistic)
  - Thumbnail         → Stable Diffusion (budget)
```

**Implemented**:
- ProviderInterface with estimateCost, healthCheck
- Provider-specific prompt enhancement
- Fallback chain on provider failures
- Cost tracking & budget management

### 2. Playwright Screenshot Service

**Core Features**:
- Headless browser pool (2-10 instances, auto-scaling)
- Authentication (form/OAuth/token) with session caching
- Wait conditions (selector, network idle, timeout)
- Annotation layer (arrows, highlights, text, circles)
- Versioning & visual diffing
- Scheduling (daily, weekly, custom cron)

**Performance Targets**:
- Single screenshot: 2-10 seconds
- Throughput: 5 concurrent, 10 screenshots/second max
- Session lifetime: 1 hour (auto-cleanup)

### 3. Storage Backend

**Multi-Backend Support**:
```
Recommended: Cloudflare R2
  - Cost: $0.015/GB (vs S3: $0.023/GB)
  - Egress: FREE (vs S3: $0.09/GB)
  - 10GB stored + variants = $0.15/month

Per-Project Cost:
  41GB stored + 10GB egress = $1.50/month vs $14/month (S3)
  Savings: 89% on storage costs
```

**Variants Generated**:
- Thumbnail: 200x200 (WEBP)
- Responsive: 320w, 640w, 1280w (WEBP + AVIF)
- Original: Full resolution, converted to WebP

**Optimization Gains**:
- Original image: 500KB JPEG
- WEBP variant: 80KB (84% smaller)
- AVIF variant: 40KB (92% smaller)

### 4. Database Schema

**Key Tables**:
- `images`: Metadata, CDN URLs, usage tracking
- `image_variants`: Responsive sizes, formats, CDN URLs
- `image_usage`: Tracking context, content references
- `screenshots`: Versions, URLs, diffs
- `image_generation_jobs`: Queue, status, costs
- `screenshot_annotations`: Geometry, styling, text

**Indexing Strategy**:
- Project + Content Type (fast filtering)
- Created date (timeline queries)
- FULLTEXT on generation prompts (semantic search prep)

### 5. CDN Integration

**Primary CDN**: Cloudflare with R2 origin
- Cache TTL: 1 year (generated images, immutable)
- Screenshot TTL: 7 days (more frequent updates)
- Image compression: Brotli + gzip
- Origin shield: Reduce origin load

**Performance Target**: <1 second p99 delivery

### 6. Dashboard Components

**Image Library Gallery**:
- Grid/list view toggle
- Infinite scroll pagination
- Filter by type, date, tags
- Bulk selection & operations
- Usage statistics

**Image Generator Modal**:
- Prompt input with suggestions
- Content type selector
- Dimension presets
- Provider selection (auto, manual)
- Cost estimation

**Content Editor Integration**:
- Inline image card insertion
- Live preview with SEO metrics
- Image library sidebar
- Drag-to-insert workflow

**Analytics Section**:
- Total images, storage used, monthly cost
- Top images by usage
- Cost breakdown by source
- Generation statistics per provider

---

## Cost Breakdown (10 Projects, 5,000+ images/month)

```
MONTHLY COST:
┌─────────────────────────────────────────────────────┐
│ Storage (Cloudflare R2)        $60                 │
│ Image Generation               $35                 │
│ Screenshot Service             $25                 │
├─────────────────────────────────────────────────────┤
│ TOTAL MONTHLY                  $120                │
└─────────────────────────────────────────────────────┘

PER-PROJECT: $12/month
PER-IMAGE: $0.24 (all-inclusive)

MANUAL VS AUTOMATED:
┌────────────────────────────────────────────────────┐
│ Manual content creation/month       $1,900        │
│ Automated platform                  $174         │
├────────────────────────────────────────────────────┤
│ Monthly savings/project             $1,726       │
│ Annual savings (10 projects)        $207,120     │
└────────────────────────────────────────────────────┘

BREAKEVEN: 3.5 weeks with 10 projects
```

---

## API Endpoints

### Image Generation
```
POST /api/v1/images/generate
  Request: { prompt, contentType, style, dimensions, quantity, quality }
  Response: { jobId, status, estimatedCost, pollUrl }

GET /api/v1/images/generation/{jobId}
  Response: { status, images[], error?, completedAt? }

POST /api/v1/images/generate-batch
  Request: { contentType, topics[], basePrompt, quantity, totalBudget }
  Response: { jobIds[], estimatedTotalCost }
```

### Screenshots
```
POST /api/v1/screenshots/capture
  Request: { url, pageTitle, viewport, authentication, waitSelector, annotations }
  Response: { screenshotId, imageId, cdnUrl, thumbnailUrl }

POST /api/v1/screenshots/schedule
  Request: { url, pageTitle, recurrence, schedule, timezone }
  Response: { scheduleId, nextCapture, status }

GET /api/v1/screenshots/{screenshotId}/diff
  Response: { previousScreenshotId, diffImageUrl, changePercentage, changedAreas[] }
```

### Image Library
```
GET /api/v1/images
  Query: { limit, offset, contentType, source, dateRange, tags, sort }
  Response: { images[], total, limit, offset }

GET /api/v1/images/search
  Query: { query, limit }
  Response: { results: [{ image, relevanceScore }] }

POST /api/v1/images/{imageId}/usage
  Request: { context, contentId }
  Response: { success }

GET /api/v1/images/analytics
  Response: { totalImages, totalStorage, monthlyCost, topImages[], stats }
```

---

## Implementation Roadmap

### Phase 1: MVP (Weeks 5-6)
- DALL-E image generation
- S3 storage backend
- Playwright screenshots (no annotations)
- Basic image library UI
- Cost tracking

### Phase 2: Enhancement (Weeks 7-8)
- Multi-provider support
- Smart provider selection
- Screenshot annotations
- Scheduling system
- Dashboard analytics

### Phase 3: Advanced (Post-Launch)
- Semantic search (RuVector)
- Template system
- Image versioning & diffing
- CMS plugins
- Advanced analytics

---

## Success Criteria

**Technical**:
- Image generation: <30s p95
- Screenshots: <10s p95
- CDN delivery: <1s p99
- Uptime: 99.95%
- Cache hit rate: >70%

**Business**:
- User adoption: 70%+
- Template reuse: 70%+
- Monthly images: 500+/project
- Cost per image: <$0.25

**Quality**:
- File size savings: >80%
- Ranking improvement: +20%
- Core Web Vitals: Excellent
- User satisfaction: 4.5+/5.0

---

## Key Design Decisions

1. **Cloudflare R2 over S3**: Free egress saves $140/month (10 projects)
2. **Smart provider selection**: 40% quality, 35% cost, 25% speed weighting
3. **Responsive variants**: 4 formats (original, AVIF, WEBP, JPEG) x 3 sizes
4. **Browser pool with cleanup**: Prevents session leaks, scales on demand
5. **Annotation canvas layer**: Non-destructive, rendered in Playwright
6. **Semantic search prep**: Metadata structure ready for RuVector integration
7. **Template system**: 70%+ image reuse target via standardized prompts
8. **Strict tenant isolation**: Row-level security, project-scoped API keys

---

## Risk Mitigations

| Risk | Mitigation | Impact |
|------|-----------|--------|
| Provider API failure | Fallback chain, retry logic | User can select alternate |
| Storage overflow | Auto-cleanup, archive strategy | Transparent to user |
| CDN degradation | Multi-CDN (CloudFront + R2) | <1% probability |
| Cost overrun | Budget caps, quotas, alerts | Prevents surprise bills |
| Session leaks | 1-hour timeout, health checks | Memory pressure managed |
| Data privacy | Row-level security, encryption | GDPR/CCPA compliant |

---

## Security Features

- **Authentication**: Project API keys (pk_live_XXXXX format)
- **Encryption**: AES-256 at rest, TLS 1.3 in transit
- **Access Control**: Role-based (owner, editor, viewer)
- **Audit Logging**: All generation/access requests logged, 90-day retention
- **Data Deletion**: GDPR right-to-delete supported
- **Rate Limiting**: 1000 requests/hour per project

---

## Integration Points

### Existing Systems
1. **SEO Intelligence Platform**: Image metadata via RuVector (future)
2. **Dashboard**: Live image library, analytics section
3. **Content Editor**: Inline image card insertion
4. **Scheduling System**: Cron-based screenshot capture

### External Services
1. **DALL-E 3 API** (image generation)
2. **Midjourney API** (artistic images)
3. **Replicate API** (Stable Diffusion hosting)
4. **Cloudflare R2** (object storage)
5. **CloudFront** (CDN, optional)
6. **Playwright** (browser automation)

---

## Performance Targets

```
Image Generation Timeline:
  Stable Diffusion:     5-15 seconds
  DALL-E:              15-45 seconds
  Midjourney:          45-90 seconds

Screenshot Capture Timeline:
  Authentication:       2-5 seconds
  Page load:           5-10 seconds
  Annotation render:   1-2 seconds
  Total:               8-17 seconds

CDN Delivery (from cache):
  First byte:          100-300ms
  Full image:          500ms-2s

Database Query Times:
  List images (50):    50-150ms
  Search (semantic):   200-500ms (post-RuVector)
  Update usage:        10-50ms
```

---

## File Structure Reference

```
packages/seo-analysis/src/
├── image-generation/
│   ├── providers/
│   │   ├── dalle.provider.ts
│   │   ├── midjourney.provider.ts
│   │   └── stable-diffusion.provider.ts
│   ├── selector.ts         (smart provider selection)
│   └── queue.ts            (job management)
├── screenshot/
│   ├── service.ts          (browser pool, capture)
│   ├── annotations.ts      (layer rendering)
│   ├── scheduler.ts        (recurring capture)
│   └── diffing.ts          (version comparison)
├── storage/
│   ├── backends/
│   │   ├── s3.backend.ts
│   │   ├── r2.backend.ts
│   │   └── local.backend.ts
│   ├── optimizer.ts        (image optimization)
│   └── cdn.ts              (CDN management)
├── dashboard/
│   ├── components/
│   │   ├── ImageGallery.tsx
│   │   ├── ImageGenerator.tsx
│   │   ├── ScreenshotGallery.tsx
│   │   └── Analytics.tsx
│   └── hooks/
│       └── useImageLibrary.ts
└── api/
    ├── routes.ts
    └── handlers/
        ├── generation.handler.ts
        ├── screenshot.handler.ts
        └── library.handler.ts
```

---

**Document Status**: Ready for Implementation
**Last Updated**: 2025-12-03
**Next Step**: Begin Phase 1 MVP implementation
