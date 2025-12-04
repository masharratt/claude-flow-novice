# Firecrawl Integration: Tactical Implementation Roadmap

**Status**: Ready for Sprint Planning
**Duration**: 6 weeks
**Team**: System Architect + Coder (2-3 developers) + QA
**Success Probability**: 88%

---

## Phase 1: Firecrawl Playwright Service Extensions (Weeks 1-2)

### Objective
Extend Firecrawl's existing Playwright microservice with screenshot and authentication capabilities. All changes are **additive and non-breaking**.

### Work Breakdown

#### Task 1.1: Authentication Layer (3 days)
**Owner**: Coder (Senior)

**Requirements**:
- Support 3 auth methods: cookies, bearer tokens, form-based
- Inject auth into Playwright browser context
- Maintain session state across requests
- Error handling for failed auth

**Implementation**:
```typescript
// apps/playwright-service-ts/auth.ts (NEW)
interface AuthConfig {
  type: 'cookie' | 'bearer' | 'form';
  credentials: {
    // cookie: { name, value, domain }
    // bearer: { token }
    // form: { username, password, login_url, selector_username, selector_password }
  };
}

async function authenticateContext(
  context: BrowserContext,
  auth: AuthConfig
): Promise<void> {
  // Inject cookies or bearer tokens
  // OR navigate to login_url, fill form, submit
}
```

**Tests**:
- [ ] Cookie injection works
- [ ] Bearer token in Authorization header
- [ ] Form login with element selectors
- [ ] Session persistence across multiple navigations
- [ ] Error handling for invalid credentials

**Deliverables**:
- `apps/playwright-service-ts/auth.ts`
- `apps/playwright-service-ts/test/auth.test.ts`

---

#### Task 1.2: Screenshot Endpoint (5 days)
**Owner**: Coder (Senior)

**Requirements**:
- Capture full page or viewport
- Support device scale factor (1x, 2x retina)
- Element selector-based capture
- Wait for selector before capture
- Multiple output formats (PNG, JPEG)

**Implementation**:
```typescript
// apps/playwright-service-ts/api.ts (EXTEND)

app.post('/screenshot', async (req: Request, res: Response) => {
  const {
    url,
    auth,
    selector,
    wait_selector,
    full_page,
    device_scale_factor,
    format,
    timeout,
    headers
  } = req.body;

  try {
    const page = await context.newPage();

    // 1. Authenticate if provided
    if (auth) await authenticateContext(page.context(), auth);

    // 2. Navigate with headers
    if (headers) await page.setExtraHTTPHeaders(headers);
    await page.goto(url, { waitUntil: 'networkidle' });

    // 3. Wait for selector if provided
    if (wait_selector) {
      await page.waitForSelector(wait_selector, { timeout });
    }

    // 4. Capture screenshot
    const element = selector ? await page.$(selector) : null;
    const buffer = await (element
      ? element.screenshot({ type: format || 'png' })
      : page.screenshot({
          fullPage: full_page || false,
          type: format || 'png',
          scale: device_scale_factor || 1
        })
    );

    res.type(`image/${format || 'png'}`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
```

**Tests**:
- [ ] Full page screenshot
- [ ] Viewport screenshot
- [ ] Element selector screenshot
- [ ] Wait for selector works
- [ ] Device scale factor (1x, 2x)
- [ ] PNG and JPEG output
- [ ] Authenticated session screenshot
- [ ] Error handling (element not found, timeout, auth failed)

**Deliverables**:
- Extended `apps/playwright-service-ts/api.ts` with /screenshot endpoint
- `apps/playwright-service-ts/test/screenshot.test.ts` (comprehensive)

---

#### Task 1.3: Batch Screenshot Endpoint (3 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Process multiple screenshot requests in parallel
- Configurable parallelism (1-5 concurrent)
- Fail-fast or continue-on-error behavior
- Return individual success/failure status

**Implementation**:
```typescript
// apps/playwright-service-ts/batch.ts (NEW)
import pLimit from 'p-limit';

app.post('/screenshot/batch', async (req: Request, res: Response) => {
  const { screenshots, parallel = 3, fail_fast = false } = req.body;

  const limit = pLimit(parallel);
  const results = [];

  for (const screenshotReq of screenshots) {
    try {
      const result = await limit(async () => {
        const startTime = Date.now();
        // Reuse screenshot logic
        const buffer = await captureScreenshot(screenshotReq);
        return {
          url: screenshotReq.url,
          success: true,
          image: buffer.toString('base64'),
          duration_ms: Date.now() - startTime
        };
      });
      results.push(result);
    } catch (error) {
      if (fail_fast) throw error;
      results.push({
        url: screenshotReq.url,
        success: false,
        error: error.message,
        duration_ms: Date.now() - startTime
      });
    }
  }

  res.json({
    results,
    total_duration_ms: Date.now() - batchStart,
    succeeded: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length
  });
});
```

**Tests**:
- [ ] Batch of 1, 3, 5 screenshots
- [ ] Parallelism respected
- [ ] Fail-fast stops on first error
- [ ] Continue-on-error returns partial results
- [ ] Duration tracking accurate
- [ ] Base64 encoding for image data

**Deliverables**:
- `apps/playwright-service-ts/batch.ts`
- `apps/playwright-service-ts/test/batch.test.ts`

---

#### Task 1.4: Visual Diff Endpoint (3 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Compare two screenshots pixel-by-pixel
- Generate diff image (changed regions highlighted)
- Return similarity score (0-1)
- Identify bounding boxes of changed regions

**Implementation** (use `pixelmatch` npm):
```typescript
// apps/playwright-service-ts/diff.ts (NEW)
import pixelmatch from 'pixelmatch';
import sharp from 'sharp';

app.post('/screenshot/diff', async (req: Request, res: Response) => {
  const { before, after, threshold = 0.1 } = req.body;

  // Decode base64 images
  const beforeBuffer = Buffer.from(before, 'base64');
  const afterBuffer = Buffer.from(after, 'base64');

  // Load images via sharp
  const beforeImg = await sharp(beforeBuffer).raw().toBuffer({ info: true });
  const afterImg = await sharp(afterBuffer).raw().toBuffer({ info: true });

  // Compare pixels
  const pixelDiff = pixelmatch(
    beforeImg.data, afterImg.data,
    null, beforeImg.info.width, beforeImg.info.height,
    { threshold }
  );

  // Calculate similarity
  const totalPixels = beforeImg.info.width * beforeImg.info.height;
  const similarityScore = 1 - (pixelDiff / totalPixels);

  // Find bounding boxes of changes (simplified)
  const changeBoundingBoxes = findChangedRegions(
    beforeBuffer, afterBuffer, pixelDiff
  );

  res.json({
    similarity_score: similarityScore,
    changes_detected: similarityScore < 0.99,
    pixel_diff_count: pixelDiff,
    bounding_boxes: changeBoundingBoxes,
    metadata: {
      width: beforeImg.info.width,
      height: beforeImg.info.height,
      threshold
    }
  });
});
```

**Tests**:
- [ ] Identical screenshots → 1.0 similarity
- [ ] Different screenshots → < 1.0 similarity
- [ ] Bounding boxes cover changed regions
- [ ] Threshold parameter works
- [ ] Error handling (invalid image formats)

**Deliverables**:
- `apps/playwright-service-ts/diff.ts`
- `apps/playwright-service-ts/test/diff.test.ts`

---

#### Task 1.5: Integration Testing & Documentation (4 days)
**Owner**: QA + Coder

**Requirements**:
- End-to-end tests for all endpoints
- Performance benchmarking
- Load testing (10 req/sec throughput)
- Error scenarios (auth failure, timeout, network error)
- README updates with examples

**Tests to Create**:
- `apps/playwright-service-ts/test/e2e-screenshot.test.ts`
- `apps/playwright-service-ts/test/performance.test.ts`

**Success Criteria**:
- [ ] All endpoints working
- [ ] p95 latency < 10 seconds per screenshot
- [ ] Batch throughput: 10 screenshots/sec
- [ ] No memory leaks (browser pool)
- [ ] Error recovery working (auto-restart browser)
- [ ] README updated with examples
- [ ] Firecrawl PR ready

**Deliverables**:
- Integration tests
- Performance benchmark results
- Updated README
- Firecrawl PR (or fork documentation)

---

### Acceptance Criteria (Week 2 End)
- [ ] All 3 new endpoints working reliably
- [ ] /screenshot, /screenshot/batch, /screenshot/diff tested
- [ ] Authentication working (cookies, bearer, form)
- [ ] Performance targets met (p95 < 10s, 10 req/sec)
- [ ] No regression to /scrape endpoint
- [ ] Ready for upstream PR to Firecrawl

---

## Phase 2: SEO Platform Visual Content Service (Weeks 3-4)

### Objective
Create a comprehensive screenshot orchestration and annotation service in the SEO platform, using the new Firecrawl endpoints.

### Work Breakdown

#### Task 2.1: Screenshot Service Foundation (3 days)
**Owner**: Coder (Senior)

**Requirements**:
- Wrapper around Firecrawl Playwright service
- Retry logic (exponential backoff)
- Connection pooling
- Error categorization
- Logging and metrics

**Implementation**:
```typescript
// packages/seo-analysis/src/visual-content/ScreenshotService.ts

interface ScreenshotConfig {
  firecrawlPlaywrightUrl: string;  // http://localhost:3003
  maxRetries: number;
  timeout: number;
  logLevel: 'debug' | 'info' | 'error';
}

class ScreenshotService {
  private client: AxiosInstance;

  async capture(request: ScreenshotRequest): Promise<Screenshot> {
    const response = await this.client.post(
      '/screenshot',
      request,
      { timeout: this.config.timeout }
    );
    return {
      imageUrl: await this.uploadToStorage(response.data),
      timestamp: new Date(),
      dimensions: { width: response.width, height: response.height },
      status: response.status_code
    };
  }

  async batchCapture(requests: ScreenshotRequest[]): Promise<BatchResult> {
    // Uses /screenshot/batch endpoint
    // Returns results with partial failures handled
  }

  private async uploadToStorage(buffer: Buffer): Promise<string> {
    // Upload to S3/R2, return URL
  }
}
```

**Tests**:
- [ ] Capture single URL
- [ ] Batch capture multiple URLs
- [ ] Retry on network error
- [ ] Storage upload integration
- [ ] Metrics collection
- [ ] Error logging

**Deliverables**:
- `packages/seo-analysis/src/visual-content/ScreenshotService.ts`
- `packages/seo-analysis/test/visual-content/ScreenshotService.test.ts`

---

#### Task 2.2: Annotation Engine (4 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Draw arrows (direction, color, thickness)
- Draw highlights (rectangles, circles, underlays)
- Add text overlays (labels, callouts)
- Compose annotations onto screenshots
- Support multiple annotation types simultaneously

**Implementation** (use canvas/jimp npm):
```typescript
// packages/seo-analysis/src/visual-content/AnnotationEngine.ts
import jimp from 'jimp';

interface Arrow {
  from: { x: number; y: number };
  to: { x: number; y: number };
  color?: string;  // hex, default #FF0000
  thickness?: number;  // 1-5, default 2
}

interface Highlight {
  type: 'rectangle' | 'circle' | 'underlay';
  bounds: { x: number; y: number; width: number; height: number };
  color?: string;
  opacity?: number;  // 0-1, default 0.3
}

interface TextOverlay {
  text: string;
  position: { x: number; y: number };
  fontSize?: number;  // 12-48, default 16
  color?: string;
  backgroundColor?: string;
}

class AnnotationEngine {
  async annotate(
    imageBuffer: Buffer,
    annotations: {
      arrows?: Arrow[];
      highlights?: Highlight[];
      text?: TextOverlay[];
    }
  ): Promise<Buffer> {
    let image = await jimp.read(imageBuffer);

    // Apply annotations in order
    for (const arrow of annotations.arrows || []) {
      image = this.drawArrow(image, arrow);
    }

    for (const highlight of annotations.highlights || []) {
      image = this.drawHighlight(image, highlight);
    }

    for (const text of annotations.text || []) {
      image = this.drawText(image, text);
    }

    return image.getBuffer('image/png');
  }

  private drawArrow(image: jimp, arrow: Arrow): jimp {
    // Canvas drawing logic for arrows
  }

  private drawHighlight(image: jimp, highlight: Highlight): jimp {
    // Canvas drawing logic for highlights
  }

  private drawText(image: jimp, text: TextOverlay): jimp {
    // Canvas drawing logic for text
  }
}
```

**Tests**:
- [ ] Draw single arrow
- [ ] Draw multiple arrows
- [ ] Draw rectangle highlight
- [ ] Draw circle highlight
- [ ] Add text overlay
- [ ] Combine multiple annotation types
- [ ] Error handling (invalid coordinates)

**Deliverables**:
- `packages/seo-analysis/src/visual-content/AnnotationEngine.ts`
- `packages/seo-analysis/test/visual-content/AnnotationEngine.test.ts`

---

#### Task 2.3: Visual Diff & Versioning (3 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Call Firecrawl /screenshot/diff endpoint
- Store screenshot version history
- Track changes over time
- Provide visual diff UI data

**Implementation**:
```typescript
// packages/seo-analysis/src/visual-content/DiffEngine.ts

interface ScreenshotVersion {
  id: string;
  url: string;
  imageUrl: string;
  timestamp: Date;
  version: number;
  diff?: {
    similarity: number;
    changesDetected: boolean;
    boundingBoxes: Array<{ x, y, width, height }>;
  };
}

class DiffEngine {
  async compareWithPrevious(
    current: Buffer,
    url: string
  ): Promise<ScreenshotVersion> {
    // Fetch previous version from DB
    const previous = await db.screenshots.findOne({ url }).sort({ version: -1 });

    if (!previous) {
      return { id: uuid(), url, imageUrl, timestamp: now, version: 1 };
    }

    // Call Firecrawl /screenshot/diff
    const diff = await this.firecrawlClient.post('/screenshot/diff', {
      before: previous.imageBuffer.toString('base64'),
      after: current.toString('base64')
    });

    // Store new version
    const version = previous.version + 1;
    return {
      id: uuid(),
      url,
      imageUrl,
      timestamp: now,
      version,
      diff: {
        similarity: diff.similarity_score,
        changesDetected: diff.changes_detected,
        boundingBoxes: diff.bounding_boxes
      }
    };
  }
}
```

**Database Schema** (migration):
```sql
CREATE TABLE screenshot_versions (
  id VARCHAR(36) PRIMARY KEY,
  url VARCHAR(255) NOT NULL,
  image_url VARCHAR(512) NOT NULL,
  image_buffer LONGBLOB NOT NULL,  -- PNG binary
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  version INT NOT NULL,

  -- Diff metadata
  previous_version_id VARCHAR(36),
  similarity_score DECIMAL(3,2),
  changes_detected BOOLEAN,
  change_bounds JSON,  -- Array of bounding boxes

  FOREIGN KEY (previous_version_id) REFERENCES screenshot_versions(id),
  UNIQUE KEY unique_url_version (url, version),
  INDEX idx_url (url),
  INDEX idx_timestamp (timestamp)
);

CREATE TABLE screenshot_annotations (
  id VARCHAR(36) PRIMARY KEY,
  version_id VARCHAR(36) NOT NULL,
  annotation_type ENUM('arrow', 'highlight', 'text') NOT NULL,
  annotation_data JSON NOT NULL,  -- Coordinates, colors, etc.

  FOREIGN KEY (version_id) REFERENCES screenshot_versions(id) ON DELETE CASCADE,
  INDEX (version_id)
);
```

**Tests**:
- [ ] Store new screenshot version
- [ ] Fetch previous version
- [ ] Calculate diff correctly
- [ ] Store diff metadata
- [ ] Query version history
- [ ] Error handling (no previous version)

**Deliverables**:
- `packages/seo-analysis/src/visual-content/DiffEngine.ts`
- `packages/seo-analysis/src/db/migrations/add-screenshot-versions.sql`
- `packages/seo-analysis/test/visual-content/DiffEngine.test.ts`

---

#### Task 2.4: Integration & Unit Tests (4 days)
**Owner**: QA + Coder

**Requirements**:
- End-to-end tests for screenshot pipeline
- Mock Firecrawl service for unit tests
- Real Firecrawl service for integration tests
- Coverage > 85%

**Test Suites**:
- `packages/seo-analysis/test/visual-content/integration.test.ts` (real Firecrawl)
- `packages/seo-analysis/test/visual-content/unit.test.ts` (mocked)

**Success Criteria**:
- [ ] All screenshot operations tested
- [ ] Annotation engine tested
- [ ] Diff engine tested
- [ ] Database migrations validated
- [ ] Coverage > 85%
- [ ] Performance tests pass

**Deliverables**:
- Comprehensive test suite
- Coverage report (>85%)
- Integration test results

---

### Acceptance Criteria (Week 4 End)
- [ ] ScreenshotService working with Firecrawl
- [ ] AnnotationEngine functional
- [ ] DiffEngine storing versions and diffs
- [ ] Database migrations applied
- [ ] Unit tests: >85% coverage
- [ ] Integration tests: all passing
- [ ] Ready for dashboard integration

---

## Phase 3: Automation & Scheduling (Week 5)

### Objective
Add cron-based screenshot scheduling, batch processing, and analytics.

### Work Breakdown

#### Task 3.1: Screenshot Scheduler (3 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Cron expression support
- Schedule daily/weekly/monthly screenshots
- Persist schedules to database
- Background job execution
- Retry on failure

**Implementation**:
```typescript
// packages/seo-analysis/src/visual-content/ScreenshotScheduler.ts
import cron from 'node-cron';

interface ScreenshotSchedule {
  id: string;
  url: string;
  cronExpression: string;  // "0 9 * * *" = 9am daily
  enabled: boolean;
  auth?: AuthConfig;
  selector?: string;
  lastRun?: Date;
  nextRun?: Date;
}

class ScreenshotScheduler {
  private tasks: Map<string, cron.ScheduledTask> = new Map();

  async createSchedule(config: ScreenshotSchedule): Promise<ScreenshotSchedule> {
    // Validate cron expression
    // Save to database
    // Start cron task
    const task = cron.schedule(config.cronExpression, async () => {
      await this.executeScreenshot(config);
    });

    this.tasks.set(config.id, task);
    return config;
  }

  async executeScreenshot(config: ScreenshotSchedule): Promise<void> {
    try {
      const screenshot = await this.screenshotService.capture({
        url: config.url,
        auth: config.auth,
        selector: config.selector
      });

      // Update schedule metadata
      await db.schedules.updateOne(
        { id: config.id },
        { lastRun: now, nextRun: calculateNext(config.cronExpression) }
      );
    } catch (error) {
      logger.error(`Screenshot schedule ${config.id} failed`, error);
      // Retry logic via queue
    }
  }

  async listSchedules(status?: 'active' | 'disabled'): Promise<ScreenshotSchedule[]> {
    // Query database
  }

  async disableSchedule(id: string): Promise<void> {
    const task = this.tasks.get(id);
    if (task) task.stop();
    await db.schedules.updateOne({ id }, { enabled: false });
  }
}
```

**Database Schema**:
```sql
CREATE TABLE screenshot_schedules (
  id VARCHAR(36) PRIMARY KEY,
  url VARCHAR(255) NOT NULL,
  cron_expression VARCHAR(50) NOT NULL,  -- "0 9 * * *"
  enabled BOOLEAN DEFAULT TRUE,
  auth_config JSON,
  selector VARCHAR(255),
  last_run DATETIME,
  next_run DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY unique_url_cron (url, cron_expression),
  INDEX idx_next_run (next_run),
  INDEX idx_enabled (enabled)
);

CREATE TABLE screenshot_schedule_runs (
  id VARCHAR(36) PRIMARY KEY,
  schedule_id VARCHAR(36) NOT NULL,
  run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  status ENUM('success', 'failed') NOT NULL,
  screenshot_id VARCHAR(36),
  error_message VARCHAR(500),
  duration_ms INT,

  FOREIGN KEY (schedule_id) REFERENCES screenshot_schedules(id),
  FOREIGN KEY (screenshot_id) REFERENCES screenshot_versions(id),
  INDEX (schedule_id, run_at DESC)
);
```

**Tests**:
- [ ] Create schedule with valid cron
- [ ] Execute scheduled screenshot
- [ ] Update metadata (lastRun, nextRun)
- [ ] Disable schedule
- [ ] List schedules filtered by status
- [ ] Error handling (invalid cron)

**Deliverables**:
- `packages/seo-analysis/src/visual-content/ScreenshotScheduler.ts`
- `packages/seo-analysis/src/db/migrations/add-screenshot-schedules.sql`
- `packages/seo-analysis/test/visual-content/ScreenshotScheduler.test.ts`

---

#### Task 3.2: CLI Commands (2 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Create screenshot on-demand
- Schedule recurring screenshots
- View schedule status
- Disable schedules
- Export screenshots

**CLI Commands**:
```bash
# Capture single screenshot
/seo:screenshot --url "https://example.com" --selector ".product"

# Schedule daily screenshots
/seo:screenshot --schedule "0 9 * * *" --url "https://example.com"

# List all schedules
/seo:screenshot --list-schedules

# View recent screenshots for URL
/seo:screenshot --history --url "https://example.com" --limit 5

# Get visual diff between versions
/seo:screenshot --diff --url "https://example.com" --from 1 --to 2

# Disable schedule
/seo:screenshot --disable-schedule "{schedule_id}"
```

**Deliverables**:
- CLI command handlers
- Help documentation
- Example outputs

---

#### Task 3.3: Analytics & Reporting (3 days)
**Owner**: Coder (Mid-level)

**Requirements**:
- Track screenshot success/failure rates
- Performance metrics (capture time, upload time)
- Cost tracking (API calls to Firecrawl)
- Storage usage
- Report generation

**Deliverables**:
- Analytics queries
- Dashboard metrics
- Report generation

---

### Acceptance Criteria (Week 5 End)
- [ ] Cron scheduling working
- [ ] Schedules persisted to database
- [ ] CLI commands functioning
- [ ] Analytics data collected
- [ ] Ready for dashboard integration

---

## Phase 4: Dashboard & Documentation (Week 6)

### Objective
Integrate visual content into dashboard, document changes, train team.

### Work Breakdown

#### Task 4.1: Dashboard Integration (3 days)
**Owner**: Frontend team

**Requirements**:
- Screenshot history viewer (grid, carousel, timeline)
- Visual diff viewer (before/after slider)
- Schedule management UI
- Screenshot metadata display

**Deliverables**:
- Dashboard components
- Screenshot history view
- Visual diff viewer
- Schedule management interface

---

#### Task 4.2: Documentation & Guides (2 days)
**Owner**: Technical writer + Architect

**Requirements**:
- Update VISUAL_CONTENT_ARCHITECTURE.md with implementation details
- Create migration guide for team
- Document Firecrawl extensions
- Add troubleshooting guide

**Deliverables**:
- `FIRECRAWL_INTEGRATION_IMPLEMENTATION.md`
- Updated `VISUAL_CONTENT_ARCHITECTURE.md`
- Team migration guide
- Troubleshooting FAQ

---

#### Task 4.3: Firecrawl Upstream (2 days)
**Owner**: Architect

**Requirements**:
- Submit PR to Firecrawl upstream (if receptive)
- Or document fork maintenance strategy
- Create Firecrawl contribution guide

**Deliverables**:
- Firecrawl PR (if accepted)
- Fork documentation (if maintaining separately)

---

#### Task 4.4: Team Training (1 day)
**Owner**: Architect + Coder

**Requirements**:
- Walk-through of new screenshot features
- Demo of scheduling and annotations
- Q&A session
- Runbook for support

**Deliverables**:
- Training slides
- Recorded demo (optional)
- Runbook

---

### Acceptance Criteria (Week 6 End)
- [ ] Dashboard integration complete
- [ ] Documentation updated
- [ ] Team trained
- [ ] Firecrawl PR submitted (or fork documented)
- [ ] Ready for production deployment

---

## Success Criteria Summary

### By End of Week 6

**Technical Achievements**:
- ✅ Firecrawl Playwright service extended (3 new endpoints)
- ✅ SEO visual content service fully functional
- ✅ Screenshot scheduling working
- ✅ Dashboard integration complete
- ✅ Test coverage > 85%
- ✅ Performance targets met (p95 < 10s, 10 screenshots/sec)

**Operational Achievements**:
- ✅ Firecrawl PR submitted upstream
- ✅ Documentation complete
- ✅ Team trained and confident
- ✅ Runbook in place
- ✅ Ready for production deployment

**Business Metrics**:
- ✅ 80%+ of manual screenshot tasks automated
- ✅ Time to capture product screenshot < 5 seconds
- ✅ 100% team adoption rate (internal)

---

## Risk Mitigation Strategies

| Risk | Mitigation |
|------|-----------|
| Firecrawl upstream rejects PR | Maintain fork or switch to Puppeteer alternative |
| Playwright service performance issues | Performance tests in Week 2, optimization sprint if needed |
| Visual diff accuracy < 95% | Use commercial diff service (Applitools, Percy) as fallback |
| Database migration issues | Test migrations on staging; rollback procedures documented |
| Team insufficient capacity | Prioritize critical path; defer non-essential tasks |
| Firecrawl service downtime | Local fallback using Puppeteer; circuit breaker pattern |

---

## Resource Allocation

**Recommended Team**:
- 1x System Architect (oversight, PRs, decisions)
- 2x Senior Coder (Firecrawl extensions, SEO service core)
- 1x Mid-level Coder (batch, diff, scheduler)
- 1x QA Engineer (testing, performance validation)
- 1x Frontend Developer (dashboard integration, Week 5-6)
- 1x Technical Writer (documentation, Week 6)

**Total Team-Weeks**: ~12 (2 people × 6 weeks)

---

## Deliverables Checklist

### Week 1-2: Firecrawl Extensions
- [ ] `apps/playwright-service-ts/auth.ts`
- [ ] `apps/playwright-service-ts/api.ts` (extended with /screenshot)
- [ ] `apps/playwright-service-ts/batch.ts`
- [ ] `apps/playwright-service-ts/diff.ts`
- [ ] Comprehensive test suite
- [ ] Updated README with examples
- [ ] Firecrawl PR ready

### Week 3-4: SEO Service
- [ ] `packages/seo-analysis/src/visual-content/ScreenshotService.ts`
- [ ] `packages/seo-analysis/src/visual-content/AnnotationEngine.ts`
- [ ] `packages/seo-analysis/src/visual-content/DiffEngine.ts`
- [ ] Database migrations
- [ ] Unit tests (>85% coverage)
- [ ] Integration tests

### Week 5: Automation
- [ ] `packages/seo-analysis/src/visual-content/ScreenshotScheduler.ts`
- [ ] CLI command handlers
- [ ] Analytics queries
- [ ] Schedule database schema

### Week 6: Integration & Docs
- [ ] Dashboard integration
- [ ] Updated documentation
- [ ] Team training materials
- [ ] Firecrawl contribution submitted

---

## Exit Criteria

**Project is complete when**:
1. All endpoints functioning and tested
2. Team trained and confident
3. Documentation complete
4. Dashboard integration done
5. Firecrawl PR submitted (or fork strategy documented)
6. No critical bugs found in UAT

---

**Next Step**: Architect to review and approve roadmap; schedule Week 1 kickoff meeting.
