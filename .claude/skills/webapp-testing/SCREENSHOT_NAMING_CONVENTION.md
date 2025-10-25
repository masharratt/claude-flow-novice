# Screenshot Naming Convention & Storage Strategy

**Version:** 1.0.0
**Last Updated:** 2025-10-24
**Purpose:** Robust, hierarchical naming for visual regression testing

---

## Naming Convention

### Primary Pattern

```
{project}/{component}/{viewport}/{state}/{variant}_{timestamp}.png
```

### Components Breakdown

| Component | Description | Format | Example |
|-----------|-------------|--------|---------|
| **project** | Application/feature namespace | `kebab-case` | `auth-system`, `dashboard` |
| **component** | UI component or page | `kebab-case` | `login-form`, `user-profile` |
| **viewport** | Screen size | `{width}x{height}` | `1920x1080`, `375x667` |
| **state** | Interaction state | `kebab-case` | `default`, `hover`, `error`, `loading` |
| **variant** | A/B test or theme | `kebab-case` | `dark-mode`, `variant-a` |
| **timestamp** | Capture time | `YYYYMMDDHHmmss` | `20251024143022` |

### Full Examples

```
# Desktop login form default state
auth-system/login-form/1920x1080/default/light-mode_20251024143022.png

# Mobile navigation hover state
dashboard/nav-menu/375x667/hover/dark-mode_20251024143535.png

# Tablet checkout error state
e-commerce/checkout-flow/768x1024/error/default_20251024144101.png

# Desktop modal loading state with A/B variant
user-profile/settings-modal/1920x1080/loading/variant-b_20251024144500.png
```

---

## Storage Strategy

### 1. SQLite Metadata Storage

**Table: `webapp_screenshots`**

```sql
CREATE TABLE IF NOT EXISTS webapp_screenshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  screenshot_key TEXT UNIQUE NOT NULL,  -- Full path without extension
  project TEXT NOT NULL,
  component TEXT NOT NULL,
  viewport TEXT NOT NULL,
  state TEXT NOT NULL,
  variant TEXT NOT NULL DEFAULT 'default',
  file_path TEXT NOT NULL,              -- Filesystem location
  file_hash TEXT NOT NULL,              -- SHA256 of image content
  baseline BOOLEAN DEFAULT 0,           -- Is this the baseline for comparison?
  captured_at INTEGER NOT NULL,         -- Unix timestamp
  task_id TEXT,                         -- Associated CFN task
  agent_id TEXT,                        -- Agent that captured it
  metadata TEXT,                        -- JSON: browser, OS, user, etc.
  UNIQUE(project, component, viewport, state, variant, baseline)
);

CREATE INDEX idx_baseline ON webapp_screenshots(project, component, viewport, state, variant, baseline);
CREATE INDEX idx_task ON webapp_screenshots(task_id);
CREATE INDEX idx_component ON webapp_screenshots(project, component);
CREATE INDEX idx_captured ON webapp_screenshots(captured_at DESC);
```

### 2. Filesystem Organization

```
/mnt/c/Users/masha/Documents/claude-flow-novice/
└── .screenshots/
    ├── baselines/                    # Reference images (version controlled)
    │   ├── auth-system/
    │   │   ├── login-form/
    │   │   │   ├── 1920x1080/
    │   │   │   │   ├── default/
    │   │   │   │   │   └── light-mode.png
    │   │   │   │   └── hover/
    │   │   │   │       └── light-mode.png
    │   │   │   └── 375x667/
    │   │   │       └── default/
    │   │   │           └── light-mode.png
    │   │   └── signup-form/
    │   │       └── [...]
    │   └── dashboard/
    │       └── [...]
    │
    ├── current/                      # Latest test captures (ephemeral)
    │   └── [same structure as baselines]
    │
    ├── diffs/                        # Visual diff outputs (ephemeral)
    │   └── {task_id}/
    │       └── {screenshot_key}_diff.png
    │
    └── archive/                      # Historical captures (TTL: 90 days)
        └── {YYYY-MM}/
            └── [same structure]
```

### 3. Redis Storage (Ephemeral Metadata)

**Use for:**
- Current test run progress
- Agent coordination signals
- Temporary diff results

**Keys:**

```bash
# Test run metadata
screenshot:test:{task_id}:metadata
  → JSON: { started_at, agent_id, total_screenshots, completed, failed }

# Screenshot capture queue
screenshot:queue:{task_id}
  → LIST: ["auth-system/login-form/1920x1080/default/light-mode", ...]

# Comparison results (TTL: 1 hour)
screenshot:diff:{task_id}:{screenshot_key}
  → JSON: { similarity_score, diff_pixels, status, diff_path }

# Baseline registry (TTL: 24 hours, cache)
screenshot:baseline:{project}:{component}:{viewport}:{state}:{variant}
  → STRING: file_hash
```

---

## Screenshot Key Format

### Primary Key (Unique Identifier)

```
{project}/{component}/{viewport}/{state}/{variant}
```

**Example:** `auth-system/login-form/1920x1080/default/light-mode`

### Lookup Pattern

```bash
# Get baseline for a specific configuration
SELECT * FROM webapp_screenshots
WHERE project = 'auth-system'
  AND component = 'login-form'
  AND viewport = '1920x1080'
  AND state = 'default'
  AND variant = 'light-mode'
  AND baseline = 1;

# Get all baselines for a component
SELECT * FROM webapp_screenshots
WHERE project = 'auth-system'
  AND component = 'login-form'
  AND baseline = 1;

# Get recent captures for comparison
SELECT * FROM webapp_screenshots
WHERE project = 'auth-system'
  AND component = 'login-form'
  AND baseline = 0
ORDER BY captured_at DESC
LIMIT 10;
```

---

## Naming Conventions

### Project Names

**Format:** `kebab-case`, descriptive

**Examples:**
- `auth-system` - Authentication flows
- `dashboard` - Main dashboard UI
- `e-commerce` - Shopping/checkout
- `admin-panel` - Admin interface
- `marketing-site` - Public website

### Component Names

**Format:** `kebab-case`, specific UI element

**Examples:**
- `login-form` - Login page/modal
- `nav-menu` - Navigation component
- `user-profile` - User profile page
- `settings-modal` - Settings dialog
- `checkout-flow` - Multi-step checkout

### Viewport Sizes

**Standard Sizes:**

| Name | Dimensions | Use Case |
|------|------------|----------|
| `1920x1080` | Desktop HD | Default desktop |
| `1366x768` | Laptop | Common laptop |
| `375x667` | iPhone SE | Small mobile |
| `390x844` | iPhone 12/13 | Modern mobile |
| `768x1024` | iPad | Tablet portrait |
| `1024x768` | iPad Landscape | Tablet landscape |

**Custom:** `{width}x{height}` for specific needs

### State Names

**Standard States:**

| State | Description | When to Use |
|-------|-------------|-------------|
| `default` | Initial render | Baseline state |
| `hover` | Mouse over | Interactive elements |
| `focus` | Keyboard focus | Form inputs, buttons |
| `active` | Mouse down | Button press |
| `disabled` | Non-interactive | Disabled state |
| `error` | Validation error | Form errors |
| `loading` | Async operation | Spinners, skeletons |
| `success` | Successful action | Confirmation states |
| `empty` | No data | Empty states |
| `populated` | With data | Data-rich states |

### Variant Names

**Standard Variants:**

| Variant | Description | When to Use |
|---------|-------------|-------------|
| `default` | Default theme | Baseline |
| `light-mode` | Light theme | Explicit light mode |
| `dark-mode` | Dark theme | Dark theme support |
| `variant-a` | A/B test version A | A/B testing |
| `variant-b` | A/B test version B | A/B testing |
| `high-contrast` | Accessibility mode | High contrast |
| `rtl` | Right-to-left | i18n support |

---

## File Naming Rules

### 1. Baseline Files (Version Controlled)

**Pattern:** `{variant}.png`

**Location:** `.screenshots/baselines/{project}/{component}/{viewport}/{state}/{variant}.png`

**Example:** `.screenshots/baselines/auth-system/login-form/1920x1080/default/light-mode.png`

**Commit Policy:**
- ✅ Commit baseline changes with PR
- ✅ Include visual review in PR
- ✅ Tag with `[visual-update]` in commit message

### 2. Current Test Files (Ephemeral)

**Pattern:** `{variant}_{timestamp}.png`

**Location:** `.screenshots/current/{project}/{component}/{viewport}/{state}/{variant}_{timestamp}.png`

**Example:** `.screenshots/current/auth-system/login-form/1920x1080/default/light-mode_20251024143022.png`

**Retention:** Delete after comparison (not version controlled)

### 3. Diff Files (Ephemeral)

**Pattern:** `{screenshot_key}_diff.png`

**Location:** `.screenshots/diffs/{task_id}/{screenshot_key}_diff.png`

**Example:** `.screenshots/diffs/task-123/auth-system_login-form_1920x1080_default_light-mode_diff.png`

**Retention:** Keep for task duration, delete after task complete

### 4. Archive Files (Historical)

**Pattern:** `{variant}_{timestamp}.png`

**Location:** `.screenshots/archive/{YYYY-MM}/{project}/{component}/{viewport}/{state}/{variant}_{timestamp}.png`

**Example:** `.screenshots/archive/2025-10/auth-system/login-form/1920x1080/default/light-mode_20251024143022.png`

**Retention:** 90 days (configurable)

---

## Metadata Storage

### Screenshot Metadata (JSON in SQLite)

```json
{
  "browser": "chromium",
  "browser_version": "119.0.6045.105",
  "os": "linux",
  "os_version": "Ubuntu 22.04",
  "playwright_version": "1.40.0",
  "viewport_actual": { "width": 1920, "height": 1080 },
  "device_scale_factor": 1,
  "user_agent": "Mozilla/5.0...",
  "url": "http://localhost:3000/login",
  "test_name": "Login form renders correctly",
  "git_commit": "4fb837c7",
  "git_branch": "main",
  "captured_by": "playwright-tester-agent-123"
}
```

---

## Baseline Management

### Setting a Baseline

```bash
# Via skill
./.claude/skills/webapp-testing/set-baseline.sh \
  --project "auth-system" \
  --component "login-form" \
  --viewport "1920x1080" \
  --state "default" \
  --variant "light-mode" \
  --file ".screenshots/current/auth-system/login-form/1920x1080/default/light-mode_20251024143022.png"

# Result:
# 1. Copy to baselines directory (remove timestamp)
# 2. Update SQLite: set baseline=1, copy metadata
# 3. Update Redis cache
# 4. Return baseline record
```

### Updating a Baseline

```bash
# Automatically when visual changes are approved
./.claude/skills/webapp-testing/update-baseline.sh \
  --screenshot-key "auth-system/login-form/1920x1080/default/light-mode" \
  --new-file ".screenshots/current/auth-system/login-form/1920x1080/default/light-mode_20251024150000.png" \
  --reason "Updated button style per design review"

# Result:
# 1. Archive old baseline to archive/
# 2. Copy new file to baselines/
# 3. Update SQLite record
# 4. Clear Redis cache
# 5. Log change to audit trail
```

---

## Query Examples

### Get All Baselines for Component

```sql
SELECT
  screenshot_key,
  viewport,
  state,
  variant,
  file_path,
  captured_at
FROM webapp_screenshots
WHERE project = 'auth-system'
  AND component = 'login-form'
  AND baseline = 1
ORDER BY viewport, state, variant;
```

### Find Screenshots Needing Baselines

```sql
-- Captures without corresponding baselines
SELECT DISTINCT
  c.project,
  c.component,
  c.viewport,
  c.state,
  c.variant
FROM webapp_screenshots c
LEFT JOIN webapp_screenshots b
  ON c.project = b.project
  AND c.component = b.component
  AND c.viewport = b.viewport
  AND c.state = b.state
  AND c.variant = b.variant
  AND b.baseline = 1
WHERE c.baseline = 0
  AND b.id IS NULL;
```

### Get Recent Test Results for Task

```sql
SELECT
  screenshot_key,
  file_path,
  captured_at,
  metadata
FROM webapp_screenshots
WHERE task_id = 'cfn-task-456'
  AND baseline = 0
ORDER BY captured_at DESC;
```

---

## Best Practices

### 1. Screenshot Organization

✅ **DO:**
- Use consistent naming across projects
- Group by project → component → viewport → state
- Version control baselines
- Clean up ephemeral files after tests

❌ **DON'T:**
- Mix baseline and test captures in same directory
- Use timestamps in baseline filenames
- Version control current/diff/archive directories
- Use spaces or special characters in names

### 2. Baseline Management

✅ **DO:**
- Review visual changes in PR
- Update baselines with design changes
- Archive old baselines before updating
- Document baseline change reasons

❌ **DON'T:**
- Auto-approve baseline changes
- Update baselines without review
- Delete old baselines immediately
- Skip metadata/audit trail

### 3. Storage Efficiency

✅ **DO:**
- Compress PNGs (pngquant, oxipng)
- Set TTLs on ephemeral data
- Archive old screenshots periodically
- Use file hashes to detect duplicates

❌ **DON'T:**
- Store uncompressed screenshots
- Keep all test runs indefinitely
- Duplicate baselines across branches
- Store screenshots in git unnecessarily

### 4. Search & Discovery

✅ **DO:**
- Index by project, component, viewport
- Use consistent component naming
- Tag screenshots with git metadata
- Enable full-text search on metadata

❌ **DON'T:**
- Use cryptic component names
- Skip metadata fields
- Mix naming conventions
- Rely solely on filesystem search

---

## Integration Points

### CFN Loop Integration

**Loop 3 (Implementation):**
- Capture screenshots during frontend development
- Store in `current/` with task_id

**Loop 2 (Validation):**
- Compare current captures to baselines
- Generate diffs for reviewers
- Store comparison results in Redis

**Product Owner Decision:**
- Review visual diffs
- Approve/reject baseline updates
- Document visual changes

### Git Integration

```gitignore
# .gitignore
.screenshots/current/
.screenshots/diffs/
.screenshots/archive/

# Version control baselines only
!.screenshots/baselines/
```

### CI/CD Integration

```yaml
# .github/workflows/visual-regression.yml
- name: Run Visual Regression Tests
  run: |
    npx claude-flow-novice skill webapp-testing \
      --project "auth-system" \
      --component "login-form" \
      --task-id "${{ github.sha }}"

- name: Upload Diffs as Artifacts
  uses: actions/upload-artifact@v3
  with:
    name: visual-diffs
    path: .screenshots/diffs/
```

---

## Future Enhancements

### Phase 2: Advanced Features
- [ ] Responsive screenshot matrices (auto-generate all viewports)
- [ ] Animation frame capture (multi-frame GIF/video)
- [ ] Component isolation (auto-detect and crop component bounds)
- [ ] Smart diff highlighting (ML-based change detection)
- [ ] Baseline branching (per-branch baselines for feature work)

### Phase 3: AI Integration
- [ ] Auto-suggest baseline updates based on design intent
- [ ] Anomaly detection (unexpected visual changes)
- [ ] Visual test generation from designs (Figma → screenshots)
- [ ] Natural language screenshot queries ("show me all error states")

---

**Last Updated:** 2025-10-24
**Version:** 1.0.0
**Status:** Ready for Implementation
