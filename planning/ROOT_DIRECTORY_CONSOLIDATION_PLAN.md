# Root Directory Consolidation Plan

## Analysis Results

**Current State**: 43 root directories
**Target**: Reduce to ~20-25 essential directories
**Consolidation Candidates**: 18 directories with ≤3 files

---

## 📊 Consolidation Strategy

### Category 1: MERGE INTO EXISTING DIRECTORIES (9 directories → 0)

#### 1.1 Observability & Monitoring → `monitor/`
- **grafana/** (1 file: blocking-coordination-dashboard.json) → `monitor/grafana/`
- **prometheus/** (1 file: prometheus.yml) → `monitor/prometheus/`
- **public/** (1 file: blocking-coordination-dashboard.html) → `monitor/dashboards/`

**Rationale**: All observability tooling belongs together
**Savings**: 3 directories

#### 1.2 Infrastructure → `config/` or new `infrastructure/`
- **cron.d/** (2 files) → `config/cron/`
- **systemd/** (3 files) → `config/systemd/`
- **terraform/** (3 files) → `config/terraform/` or `infrastructure/terraform/`

**Rationale**: Infrastructure-as-code and system configs are related
**Savings**: 3 directories

#### 1.3 Documentation Examples → `examples/`
- **demo/** (1 file: phase5-demonstration.cjs) → `examples/demonstrations/`
- **templates/** (1 file: README.md) → `examples/templates/` or `docs/templates/`

**Rationale**: Demo and templates are examples for users
**Savings**: 2 directories

#### 1.4 Security & Audit → `reports/` or `docs/`
- **security/** (1 file: phase3-security-audit-report.md) → `reports/security/`

**Rationale**: Security audit report is a report artifact
**Savings**: 1 directory

---

### Category 2: MOVE TO .artifacts/ (GITIGNORED) (4 directories → 0)

#### 2.1 Ephemeral Test/Build Data
- **swarm-memory/** (2 files: entries.json, knowledge-bases.json) → `.artifacts/swarm-memory/`
- **playwright-report/** (2 files) → `.artifacts/playwright-report/`
- **database/** (2 files including swarm-memory.db) → `.artifacts/database/`

**Rationale**: Generated/temporary data should not be in root, should be gitignored
**Savings**: 3 directories

#### 2.2 Node.js Build Artifacts
- **node_modules/** already gitignored but consider symlink

**Rationale**: Standard npm practice
**Savings**: 0 directories (keep as-is)

---

### Category 3: KEEP AS-IS (JUSTIFIED) (5 directories)

#### 3.1 Project Artifacts
- **archive/** (2 files) - Historical data index
- **rollback/** (2 files) - Important rollback system
- **api-project/** (2 files) - Example API project

**Rationale**: Distinct purposes, appropriately organized
**Keep**: 3 directories

#### 3.2 Source Code Entry Points
- **src/** (3 files + subdirectories) - Main source code
- **monitor/** (3 files + dashboard) - Monitoring application

**Rationale**: Primary code locations
**Keep**: 2 directories

---

### Category 4: ASSETS & MEDIA (1 directory)

- **assets/** (1 file: image.png) → `docs/assets/` or `public/assets/`

**Rationale**: Single image file, merge into docs or public
**Savings**: 1 directory

---

## 🎯 Consolidation Actions

### Phase 1: Observability Consolidation (HIGH PRIORITY)

```bash
# Create monitor subdirectories
mkdir -p monitor/grafana monitor/prometheus monitor/dashboards

# Move files
git mv grafana/blocking-coordination-dashboard.json monitor/grafana/
git mv prometheus/prometheus.yml monitor/prometheus/
git mv public/blocking-coordination-dashboard.html monitor/dashboards/

# Remove empty directories
rmdir grafana prometheus public
```

**Impact**: 3 directories removed

---

### Phase 2: Infrastructure Consolidation (MEDIUM PRIORITY)

**Option A: Merge into config/**
```bash
mkdir -p config/cron config/systemd config/terraform

git mv cron.d/* config/cron/
git mv systemd/* config/systemd/
git mv terraform/* config/terraform/

rmdir cron.d systemd terraform
```

**Option B: Create infrastructure/ directory**
```bash
mkdir -p infrastructure/cron infrastructure/systemd infrastructure/terraform

git mv cron.d/* infrastructure/cron/
git mv systemd/* infrastructure/systemd/
git mv terraform/* infrastructure/terraform/

rmdir cron.d systemd terraform
```

**Recommendation**: Option B (infrastructure/) for better separation from application config
**Impact**: 3 directories removed (or consolidated into 1 new directory)

---

### Phase 3: Examples & Documentation (LOW PRIORITY)

```bash
mkdir -p examples/demonstrations examples/templates

git mv demo/phase5-demonstration.cjs examples/demonstrations/
git mv templates/* examples/templates/

rmdir demo templates
```

**Impact**: 2 directories removed

---

### Phase 4: Reports & Security (LOW PRIORITY)

```bash
mkdir -p reports/security

git mv security/phase3-security-audit-report.md reports/security/

rmdir security
```

**Impact**: 1 directory removed

---

### Phase 5: Ephemeral Data (.artifacts) (MEDIUM PRIORITY)

```bash
mkdir -p .artifacts/swarm-memory .artifacts/playwright-report .artifacts/database

# Move ephemeral data
mv swarm-memory/* .artifacts/swarm-memory/
mv playwright-report/* .artifacts/playwright-report/
mv database/* .artifacts/database/

# Remove empty directories
rmdir swarm-memory playwright-report database
```

**Impact**: 3 directories removed, properly gitignored

---

### Phase 6: Assets (LOW PRIORITY)

```bash
mkdir -p docs/assets

git mv assets/image.png docs/assets/

rmdir assets
```

**Impact**: 1 directory removed

---

## 📈 Expected Results

### Before Consolidation
- **Root directories**: 43
- **Directories with ≤3 files**: 18 (42%)
- **Root clutter**: HIGH

### After Consolidation (All Phases)
- **Root directories**: ~28-30 (depending on infrastructure/ decision)
- **Directories removed**: 13-15
- **Root clutter**: MEDIUM-LOW
- **Organization**: Improved logical grouping

### Root Directory Reduction Phases
- Phase 1: 43 → 40 (-3 directories)
- Phase 2: 40 → 37 (-3 directories) or 40 → 38 if creating infrastructure/
- Phase 3: 37 → 35 (-2 directories)
- Phase 4: 35 → 34 (-1 directory)
- Phase 5: 34 → 31 (-3 directories)
- Phase 6: 31 → 30 (-1 directory)

**Total Reduction**: 43 → 30 directories (30% reduction)

---

## ⚡ Quick Win Recommendation

**Immediate Action** (highest ROI, lowest risk):

1. **Phase 5** (ephemeral data → .artifacts/) - Clean separation, no logic changes
2. **Phase 1** (observability → monitor/) - Natural grouping, improves monitoring UX
3. **Phase 4** (security report → reports/) - Aligns with existing reports/ structure

**Estimated Time**: 30 minutes
**Directories Removed**: 7
**Risk**: LOW

---

## 🚫 Do NOT Consolidate

These directories are appropriately sized and organized:

- **bin/** (5 files) - Executable scripts
- **config/** (15 files) - Application configuration
- **consensus-validation/** (5 files) - Consensus test artifacts
- **docker/** (4 files) - Docker configurations
- **logs/** (4 files) - Application logs
- **memory/** (4 files) - Memory system data
- **protocols/** (4 files) - Protocol definitions
- **lib/** (20 files) - Library code
- **scripts/** (63 files) - Build/utility scripts
- **planning/** (54 files) - Sprint planning documents
- **reviews/** (11 files) - Code review artifacts
- **readme/** (12 files) - Documentation
- **examples/** (36 files) - User examples
- **tests/** (50 files) - Test suite
- **wiki/** (15 files) - Documentation wiki
- **benchmark/** (13 files) - Performance benchmarks
- **coverage/** (20 files) - Test coverage reports

---

## 🎯 Priority Recommendation

**PROCEED WITH**: Phases 1, 4, 5 (Quick wins, low risk)
**DEFER**: Phases 2, 3, 6 (Requires more planning/discussion)

**Expected Outcome**: 43 → 36 directories (16% reduction) with minimal effort

