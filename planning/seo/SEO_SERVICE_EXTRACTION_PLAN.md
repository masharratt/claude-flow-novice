# SEO Service Extraction Plan

**Status**: Planning - Direct to Enterprise
**Target**: Full-Featured SEO Intelligence Platform with Visual Capabilities
**Key Value**: Cross-project learning + per-project dashboards + automated visual content
**Timeline**: Single-phase launch with complete feature set (6-8 weeks)

---

## Executive Summary

Extract the SEO pipeline from CFN into a full-featured intelligence platform that:
- Centralizes knowledge aggregation (SERP patterns, learnings, competitor intel)
- Provides per-project dashboards with real-time intelligence visualization
- Automates image generation and management for content
- Captures product screenshots via Playwright for authentic visuals
- Enables cross-project insights via RuVector semantic search
- Reduces costs through pattern reuse (80%+ cache hits)
- Maintains project autonomy while capturing collective intelligence

**Architecture Model**: Enterprise-grade platform with visual intelligence capabilities

---

## Current Architecture Analysis

### Components in Scope

**Location**: `.claude/skills/cfn-seo-pipeline/`

**Core Capabilities**:
1. **SEO Intelligence** (`lib/seo/`)
   - SERP feature optimization (featured snippets, PAA, schema)
   - CTR optimization engine (9-factor scoring)
   - Semantic completeness analysis
   - Content refresh triggers
   - Pre-publication audit (11-step weighted scoring)
   - RuVector pattern storage and retrieval

2. **Web Content Acquisition** (`lib/firecrawl/`)
   - Competitor scraping via Firecrawl API
   - SERP data gathering
   - Content extraction and normalization

3. **7-Phase Onboarding Pipeline** (`/seo-onboard` command)
   - Technical foundation analysis
   - Content inventory
   - Competitor discovery
   - Keyword universe generation (500+ keywords)
   - Gap analysis
   - Strategy creation
   - Roadmap generation

4. **RuVector Integration** (`lib/seo/lib/ruvector/`)
   - Pattern storage (SERP patterns, content strategies, competitor intel)
   - Pre-research queries (cache hits for known patterns)
   - Post-research storage (new learnings)
   - Analytics and confidence tracking
   - Cross-site semantic search

5. **Knowledge Store** (`knowledge-store/`)
   - SERP patterns with metadata
   - Learning successes/failures
   - Bidirectional sync capability (`/seo:seo-sync`)

### Dependencies

**External Services**:
- DataForSEO API (keyword research, SERP analysis)
- Firecrawl API (web scraping, competitor analysis)
- Z.ai embeddings (semantic indexing, cost-optimized)
- Redis (coordination, caching, scheduling)

**CFN Dependencies**:
- Task spawning system
- Agent coordination protocols
- Pre-edit backup hooks
- SQLite storage (`cfn-loop.db`)
- Redis coordination keys

**Technical Stack**:
- TypeScript 5.x
- Node.js runtime
- Jest testing framework
- RuVector vector database

### Current Integration Points

1. **Slash Commands**:
   - `/seo-onboard` - 7-phase site onboarding
   - `/seo:seo-blog` - 8-step blog generation
   - `/seo:seo-landing` - 6-step landing page
   - `/seo:seo-product` - 5-step product page
   - `/seo:seo-sync` - Pattern synchronization

2. **Agent System**:
   - `seo-onboarding-coordinator` - Orchestrates phases
   - `technical-seo-specialist` - Technical audits
   - `content-seo-strategist` - Strategy and planning
   - `competitive-seo-analyst` - Competitor analysis
   - `seo-analytics-specialist` - Performance tracking

3. **RuVector Collections**:
   - `codebase_index` - Semantic codebase search
   - `serp_patterns` - SERP feature patterns
   - `content_patterns` - Content strategy patterns
   - `competitor_intelligence` - Competitor data
   - `keyword_research` - Keyword data with cache

---

## Target Architecture: Centralized Service

### Service Name: **SEO Intelligence Platform (SIP)**

### Architecture Model: Hybrid

```
┌─────────────────────────────────────────────────────────────────┐
│                      Project Ecosystems                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Project A   │  │  Project B   │  │  Project C   │          │
│  │ (genealogy)  │  │   (SaaS)     │  │ (e-commerce) │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│         │                  │                  │                  │
│         └──────────────────┴──────────────────┘                  │
│                            │                                     │
│                    Local Execution                               │
│                  (workflows, agents)                             │
└─────────────────────────────────────────────────────────────────┘
                             ↕
                    Knowledge Sync API
                             ↕
┌─────────────────────────────────────────────────────────────────┐
│           SEO Intelligence Platform (Centralized)                │
├─────────────────────────────────────────────────────────────────┤
│  API Layer                                                       │
│  ├── /v1/patterns/query     (semantic search)                   │
│  ├── /v1/patterns/store     (contribute learnings)              │
│  ├── /v1/keywords/research  (cached lookup)                     │
│  ├── /v1/competitors/intel  (shared intelligence)               │
│  └── /v1/serp/analyze       (pattern extraction)                │
│                                                                  │
│  Knowledge Store (RuVector)                                      │
│  ├── SERP Patterns          (10,247 patterns across projects)   │
│  ├── Content Strategies     (1,523 successful patterns)         │
│  ├── Competitor Intelligence (8,932 competitor profiles)        │
│  ├── Keyword Universe       (500K+ cached keywords)             │
│  └── Learning Database      (successes + failures)              │
│                                                                  │
│  Intelligence Layer                                              │
│  ├── Cross-Project Pattern Detection                            │
│  ├── Industry Benchmark Analysis                                │
│  ├── Trend Identification                                       │
│  └── Algorithm Risk Assessment                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Service Components

**1. API Gateway**
- RESTful API for knowledge access
- Authentication/authorization (API keys, JWT)
- Rate limiting per project
- Request/response logging
- Multi-tenancy support

**2. RuVector Knowledge Store**
- Centralized vector database
- Tenant isolation (project namespaces)
- Semantic search across all projects
- Pattern deduplication
- Confidence scoring and feedback loops

**3. Intelligence Engine**
- Cross-project pattern detection
- Industry benchmark aggregation
- Algorithm risk assessment (Google updates)
- Trend identification (seasonal, emerging)
- Automated insight generation

**4. Caching Layer (Redis)**
- Keyword research cache (80%+ hit rate)
- Competitor intelligence cache
- SERP analysis cache
- Session management
- Queue coordination for async tasks

**5. Observability**
- Metrics (Prometheus/Grafana)
- Distributed tracing (Jaeger)
- Centralized logging (ELK/Loki)
- SLO/SLI tracking
- Cost analytics per project

### Data Model

**Project Registration**:
```typescript
interface Project {
  id: string;
  name: string;
  domain: string;
  industry: string;
  createdAt: Date;
  apiKey: string; // Authentication
  settings: {
    syncEnabled: boolean;
    cacheStrategy: 'aggressive' | 'balanced' | 'minimal';
    contributePatterns: boolean;
  };
}
```

**SERP Pattern**:
```typescript
interface SERPPattern {
  id: string;
  projectId: string; // Origin project
  targetKeyword: string;
  serpFeatures: string[]; // ['featured_snippet', 'paa', 'video']
  contentStructure: {
    format: string; // 'listicle', 'guide', 'howto'
    headingStructure: string[];
    wordCount: number;
    mediaTypes: string[];
  };
  performance: {
    rankingPosition: number;
    ctr: number;
    impressions: number;
  };
  metadata: {
    industry: string;
    contentType: string;
    confidence: number;
    lastUpdated: Date;
  };
  vector: Float32Array; // Semantic embedding
}
```

**Keyword Research Cache**:
```typescript
interface KeywordCache {
  keyword: string;
  searchVolume: number;
  difficulty: number;
  intent: 'informational' | 'commercial' | 'transactional' | 'navigational';
  cpc: number;
  trend: number[];
  cachedAt: Date;
  lastVerified: Date;
  source: 'dataforseo' | 'manual';
}
```

**Learning Entry**:
```typescript
interface Learning {
  id: string;
  projectId: string;
  category: 'success' | 'failure';
  taskId: string;
  pattern: string; // Description
  context: Record<string, any>;
  solution?: string; // For failures
  confidence: number;
  tags: string[];
  metadata: {
    industry: string;
    contentType: string;
    targetKeyword: string;
  };
  vector: Float32Array;
}
```

---

## Implementation Strategy: Direct to Enterprise

### Single-Phase Launch (6-8 weeks)

**Goal**: Full-featured platform with all capabilities from day one

---

### Week 1-2: Foundation & Service Architecture

**Tasks**:
1. **Package Extraction & API Service**
   - Create `@seo-intelligence/platform` monorepo
   - Extract core logic: `lib/seo/`, `lib/firecrawl/`, RuVector integration
   - Build Express/Fastify API with authentication
   - Multi-tenancy (project namespaces)
   - Rate limiting per project

2. **Centralized RuVector**
   - PostgreSQL + pgvector for production scale
   - Cross-project semantic search
   - Tenant isolation with row-level security
   - Performance indexes and caching

3. **Client SDK**
   - TypeScript SDK (`@seo-intelligence/client`)
   - Automatic sync, cache-first queries
   - Error handling and retries
   - Offline queue support

**Deliverables**:
- API service running locally
- Client SDK functional
- Authentication working
- RuVector multi-tenant setup

---

### Week 3-4: Intelligence Layer & Visual Capabilities

**Tasks**:
1. **Advanced Intelligence Engine**
   - Cross-project pattern detection
   - Industry benchmarking
   - Algorithm risk assessment
   - Anomaly detection (ranking drops, SERP changes)
   - Trend identification (seasonal, emerging)

2. **Image Generation System**
   - Integration with image generation APIs (DALL-E, Midjourney, Stable Diffusion)
   - Template-based image creation (featured images, social cards, infographics)
   - Image optimization pipeline (compression, responsive variants)
   - CDN integration (Cloudflare, AWS CloudFront)
   - Metadata tracking (alt text, captions, usage rights)

3. **Playwright Screenshot Service**
   - Headless browser automation for product screenshots
   - Authenticated session management (login flows)
   - Screenshot configuration (viewport, element selectors, wait conditions)
   - Annotation layer (arrows, highlights, text overlays)
   - Screenshot versioning (track UI changes over time)
   - Batch capture workflows

**Image Generation Capabilities**:
- **AI-Generated Images**: Generate custom illustrations, diagrams, hero images
- **Template-Based**: Social media cards, featured images, infographics from templates
- **Product Screenshots**: Automated capture of platform UI, dashboards, features
- **Annotated Screenshots**: Add callouts, arrows, highlights to product images
- **Comparison Images**: Side-by-side before/after, feature comparisons
- **Data Visualizations**: Generate charts, graphs from content data

**Deliverables**:
- Intelligence engine generating insights
- Image generation API operational
- Playwright service capturing screenshots
- Image CDN configured

---

### Week 5-6: Per-Project Dashboards

**Tasks**:
1. **Dashboard Frontend**
   - Next.js app with React components
   - Authentication (JWT, SSO)
   - Per-project workspace isolation
   - Responsive design (mobile + desktop)

2. **Intelligence Visualization**
   - Real-time metrics (rankings, traffic, CTR)
   - Pattern library browser (SERP patterns, content strategies)
   - Competitor tracking dashboard
   - Keyword universe explorer
   - Content performance analytics
   - Algorithm risk indicators

3. **Visual Content Management**
   - Image library browser (AI-generated, screenshots, templates)
   - Screenshot gallery with filtering (by page, date, annotation)
   - Image insertion workflow (search → select → insert to content)
   - Bulk image generation (generate 10 variations)
   - Screenshot scheduling (capture product UI daily/weekly)

4. **Interactive Features**
   - Content editor integration (insert images inline)
   - Live preview (see content with selected images)
   - Collaboration (comments, shared workspaces)
   - Export capabilities (PDF reports, CSV data)

**Dashboard Sections**:
```
┌─────────────────────────────────────────────────────────────┐
│  SEO Intelligence Platform - [Project Name]                 │
├─────────────────────────────────────────────────────────────┤
│  Navigation:                                                │
│  • Overview       • Content      • Images       • Reports   │
│  • Competitors    • Keywords     • Patterns     • Settings  │
└─────────────────────────────────────────────────────────────┘

┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
│   Rankings      │  │  Traffic        │  │  Opportunities  │
│   #3 → #2 ↑     │  │  +15% this week │  │  23 new gaps    │
└─────────────────┘  └─────────────────┘  └─────────────────┘

┌─────────────────────────────────────────────────────────────┐
│  Recent Insights                                            │
├─────────────────────────────────────────────────────────────┤
│  🔴 Algorithm Risk: Google Core Update detected             │
│  🟢 Opportunity: 12 competitors lost featured snippet       │
│  🟡 Pattern Match: SaaS comparison format working (0.89)    │
└─────────────────────────────────────────────────────────────┘

┌────────────────────────┐  ┌────────────────────────────────┐
│  Image Library (452)   │  │  Recent Screenshots (18)       │
├────────────────────────┤  ├────────────────────────────────┤
│  [img] [img] [img]     │  │  [screenshot] [screenshot]     │
│  AI-Generated: 203     │  │  Dashboard v2.1 (today)        │
│  Templates: 184        │  │  Pricing Page (yesterday)      │
│  Screenshots: 65       │  │  Signup Flow (2 days ago)      │
│  🔍 Search  ➕ Generate │  │  📅 Schedule  🎨 Annotate      │
└────────────────────────┘  └────────────────────────────────┘
```

**Deliverables**:
- Dashboard deployed and accessible
- All intelligence views functional
- Image management integrated
- Real-time updates working

---

### Week 7-8: Integration, Testing & Launch

**Tasks**:
1. **Content Workflow Integration**
   - WordPress plugin (insert images, view insights)
   - Ghost integration (custom editor cards)
   - Markdown editor plugin (CLI-based)
   - API webhooks (publish events, image requests)

2. **Automated Workflows**
   - Weekly intelligence reports (email, dashboard)
   - Screenshot schedules (capture product UI automatically)
   - Image generation triggers (new article → generate featured image)
   - Algorithm update alerts (Slack, email)
   - Opportunity notifications (new gaps, pattern matches)

3. **Production Deployment**
   - Kubernetes cluster setup
   - CI/CD pipeline (GitHub Actions)
   - Infrastructure as Code (Terraform)
   - Monitoring (Prometheus + Grafana)
   - Logging (ELK/Loki)
   - Backup strategy (RuVector, images, configs)

4. **Documentation & Onboarding**
   - API documentation (OpenAPI spec)
   - SDK documentation (TypeScript, examples)
   - Dashboard user guide (video + written)
   - Image generation cookbook (use cases, templates)
   - Playwright configuration guide (auth, selectors)
   - Migration guide (CFN → Platform)

**Deliverables**:
- Production deployment live
- First 2 projects migrated
- Documentation complete
- Monitoring/alerting operational

**Success Criteria**:
- Platform accessible at `seo.intelligence.platform` (or custom domain)
- 2+ projects using dashboards daily
- Image generation API handling 100+ requests/day
- Screenshot service capturing 50+ images/week
- Intelligence reports generating automatically
- Cache hit rate ≥70%
- API latency <300ms p95
- Zero critical bugs

---

## Service Boundaries

### What Stays Centralized

**1. Knowledge Store**
- All SERP patterns (deduplicated)
- Keyword research cache (500K+ keywords)
- Competitor intelligence (profiles, strategies)
- Content strategy patterns
- Success/failure learnings

**2. Intelligence Layer**
- Cross-project pattern detection
- Industry benchmarking
- Algorithm risk assessment
- Trend identification

**3. Caching Services**
- DataForSEO API response cache
- Firecrawl scraping cache
- Embedding generation cache

**4. Coordination**
- API authentication/authorization
- Rate limiting
- Usage analytics
- Billing/cost tracking

### What Stays Distributed (Local)

**1. Execution Workflows**
- 7-phase onboarding orchestration
- Agent spawning (coordinators, specialists)
- Loop coordination (CFN Loop patterns)
- Test execution

**2. Project-Specific Data**
- Brand guidelines
- Voice profiles
- Business goals
- Site-specific configuration
- Draft content (pre-publication)

**3. Output Artifacts**
- Generated content files
- Strategy documents
- Roadmaps
- Reports

**4. Local Development**
- Testing with mock data
- Offline pattern queries (cached)
- Experimentation without API costs

---

## Integration Patterns

### Pattern 1: Pre-Research Query (Cache Hit)

```typescript
// Project A queries shared knowledge
const client = new SEOIntelClient({ apiKey: 'proj-a-key' });

const results = await client.patterns.query({
  description: 'featured snippet strategies for genealogy keywords',
  industry: 'genealogy',
  limit: 10,
});

// Result: 8 patterns from Projects A, B, C (aggregated)
// Cache hit: 75% (no new API calls needed)
```

### Pattern 2: Post-Research Storage (Contribution)

```typescript
// Project B contributes new pattern after success
await client.patterns.store({
  type: 'serp_pattern',
  targetKeyword: 'family tree software comparison',
  serpFeatures: ['featured_snippet', 'paa', 'comparison_table'],
  contentStructure: {
    format: 'comparison_matrix',
    headingStructure: ['H2: Overview', 'H2: Comparison Table', 'H2: Verdict'],
    wordCount: 2100,
    mediaTypes: ['comparison_table', 'product_images'],
  },
  performance: {
    rankingPosition: 1,
    ctr: 0.32,
    impressions: 12500,
  },
  confidence: 0.91,
});

// Pattern now available to all projects
```

### Pattern 3: Keyword Research (Cached Lookup)

```typescript
// Project C requests keyword data
const keywords = await client.keywords.research({
  seedKeyword: 'project management tools',
  industry: 'saas',
  cacheFirst: true, // Default
});

// Result: 450 keywords from cache (80% hit rate)
//         75 keywords from DataForSEO API (20% new)
// Cost: $3 (vs $15 without cache)
```

### Pattern 4: Competitor Intelligence (Shared Learning)

```typescript
// Project A queries competitor strategies
const competitors = await client.competitors.query({
  domain: 'competitor.com',
  industry: 'ecommerce',
});

// Result: Profile cached from Project D analysis last month
// Includes: backlinks, content strategy, SERP ownership
// No new Firecrawl API call needed
```

### Pattern 5: Offline-First Sync

```typescript
// Project runs onboarding with intermittent connectivity
const onboarder = new SEOOnboarder({
  client,
  offlineMode: true, // Queue sync requests
});

await onboarder.execute({
  domain: 'example.com',
  industry: 'finance',
});

// Patterns queried from local cache (last sync)
// New patterns queued for background sync when online
```

---

## Cost-Benefit Analysis

### Current State (Distributed, No Centralization)

**Per-Project Costs (Annual)**:
- DataForSEO API: $1,200 (keyword research, SERP analysis)
- Firecrawl API: $600 (competitor scraping)
- Embeddings (Z.ai): $120 (semantic indexing)
- **Total per project**: $1,920

**Knowledge Waste**:
- Pattern reuse: 0% (each project isolated)
- Redundant API calls: 100% (no cache sharing)
- Learning transfer: Manual (docs, tribal knowledge)

### Future State (Centralized Service)

**Service Infrastructure Costs (Annual)**:
- API server (2 instances): $1,200
- RuVector database (PostgreSQL + pgvector): $800
- Redis cache cluster: $600
- Monitoring/observability: $400
- **Total infrastructure**: $3,000

**Per-Project Costs (Annual)**:
- DataForSEO API: $240 (80% cache hit)
- Firecrawl API: $120 (80% cache hit)
- Embeddings: $30 (75% cache hit)
- SIP API subscription: $500 (covers infra share)
- **Total per project**: $890

**Break-Even Analysis**:
- Infrastructure cost: $3,000
- Cost per project (current): $1,920
- Cost per project (future): $890
- Savings per project: $1,030

**Break-even**: 3 projects (2.9 exactly)
- 5 projects: $2,150 annual savings + knowledge benefits
- 10 projects: $7,300 annual savings + exponential knowledge value

### Intangible Benefits

**Knowledge Aggregation**:
- Pattern library grows with every project
- Cross-industry insights (e.g., SaaS patterns applied to genealogy)
- Failure avoidance (learn from others' mistakes)
- Accelerated onboarding (75%+ time savings for similar niches)

**Quality Improvements**:
- Higher confidence patterns (validated across projects)
- Industry benchmarks (real data vs guesses)
- Algorithm risk mitigation (early warnings)
- Competitive intelligence (aggregated view)

**Developer Experience**:
- Single source of truth for SEO intelligence
- Consistent API across projects
- Centralized updates (bug fixes benefit everyone)
- Community contributions (open-source SDK)

---

## Risk Assessment

### Technical Risks

**1. Single Point of Failure**
- **Risk**: Service downtime affects all projects
- **Mitigation**:
  - Offline-first SDK design (local cache fallback)
  - 99.9% SLA with multi-region deployment
  - Degraded mode (core features work without service)

**2. Data Privacy/Isolation**
- **Risk**: Project data leaking across tenants
- **Mitigation**:
  - Strict tenant isolation (project namespaces)
  - Row-level security in database
  - Audit logging for all access
  - Compliance review (GDPR, CCPA)

**3. Scaling Complexity**
- **Risk**: Knowledge store grows unbounded
- **Mitigation**:
  - Pattern deduplication (semantic similarity)
  - TTL-based expiration for stale patterns
  - Tiered storage (hot/cold data)
  - Horizontal scaling (sharding by industry)

**4. Migration Disruption**
- **Risk**: Existing projects broken during migration
- **Mitigation**:
  - Backward-compatible SDK (supports local + remote)
  - Gradual rollout (opt-in per project)
  - Dual-write period (local + remote sync)
  - Rollback plan (keep local RuVector)

### Operational Risks

**1. Service Maintenance Burden**
- **Risk**: Now running production service (24/7 ops)
- **Mitigation**:
  - Start with managed services (AWS, GCP)
  - Automated monitoring/alerting
  - Runbooks for common incidents
  - On-call rotation if 5+ projects

**2. API Version Management**
- **Risk**: Breaking changes affect multiple projects
- **Mitigation**:
  - Semantic versioning (v1, v2 coexist)
  - Deprecation notices (6-month warning)
  - SDK auto-upgrade (with opt-out)

**3. Cost Overruns**
- **Risk**: Infrastructure costs exceed projections
- **Mitigation**:
  - Usage-based billing per project
  - Cost alerts at 80% budget
  - Auto-scaling with caps
  - Regular cost reviews

---

## Success Metrics

### Phase 1 (MVP)
- [ ] NPM package installable and functional
- [ ] CLI can execute 7-phase onboarding
- [ ] Local RuVector stores/queries patterns
- [ ] Test coverage ≥80%
- [ ] Documentation complete

### Phase 2 (Standard)
- [ ] API service deployed with 99% uptime
- [ ] 3+ projects connected to centralized service
- [ ] Cache hit rate ≥60% for keyword research
- [ ] API latency <500ms p95
- [ ] Cost savings ≥50% per project

### Phase 3 (Enterprise)
- [ ] Intelligence engine generating weekly insights
- [ ] Dashboard live with 5+ projects visualized
- [ ] Algorithm risk scores accurate (validated)
- [ ] Cross-project pattern detection working
- [ ] Industry benchmarks automated

### Overall Success (12 months)
- [ ] 5+ projects using centralized service
- [ ] $5,000+ annual cost savings realized
- [ ] 10,000+ patterns in knowledge store
- [ ] 80%+ cache hit rate sustained
- [ ] 2-3 "intelligent insights" per week actioned by projects
- [ ] 0 security incidents
- [ ] 99.9% uptime achieved

---

## Next Steps

1. **Immediate (This Week)**
   - [ ] Stakeholder review of this plan
   - [ ] Prioritize Phase 1 vs Phase 2 start
   - [ ] Identify pilot project for testing

2. **Short Term (2 Weeks)**
   - [ ] Set up `@cfn/seo-intelligence` NPM package scaffolding
   - [ ] Extract core SEO logic to package
   - [ ] Create CLI interface
   - [ ] Write migration guide draft

3. **Medium Term (1 Month)**
   - [ ] Phase 1 MVP complete
   - [ ] Pilot project migrated and validated
   - [ ] Decision point: continue to Phase 2 or iterate MVP

4. **Long Term (3 Months)**
   - [ ] Phase 2 centralized service deployed
   - [ ] 3 projects migrated and syncing
   - [ ] ROI analysis (cost savings, knowledge benefits)
   - [ ] Go/no-go for Phase 3 intelligence layer

---

## Open Questions

1. **Pricing Model**: Free (infrastructure cost-sharing) or subscription tiers?
2. **Multi-Tenancy Strategy**: Project namespaces vs separate databases?
3. **Open Source**: Should SDK and/or service be open-sourced?
4. **DataForSEO Negotiation**: Bulk discount for centralized usage?
5. **Hosting**: Self-hosted vs managed (AWS, GCP, Vercel)?
6. **Community Contributions**: Allow external projects to join?

---

## Conclusion

The SEO pipeline has matured into a valuable cross-project asset. Extracting it to a centralized service with RuVector knowledge aggregation unlocks:

- **Cost Optimization**: 50%+ savings per project through cache sharing
- **Knowledge Compounding**: Every project benefits from collective learnings
- **Intelligence Layer**: Cross-project insights impossible in isolation
- **Scalability**: Serve 10+ projects without N× infrastructure costs

**Recommendation**: Proceed with **Phase 1 (MVP)** immediately to validate extraction complexity and pilot with 1 project. Upon success, fast-track **Phase 2 (Standard)** to realize centralized benefits.

The hybrid architecture (distributed execution + centralized knowledge) balances autonomy with collective intelligence - the best of both worlds.

---

**Document Version**: 1.0
**Last Updated**: 2025-12-03
**Author**: Claude (CFN System)
**Reviewers**: [TBD]
**Status**: Awaiting Approval
