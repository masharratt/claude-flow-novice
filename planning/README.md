# Planning Directory Structure

## 📁 Hierarchical Organization

The planning directory follows a **Phase > Sprint > Loop** hierarchy reflecting the CFN Loop execution model:

### `/phases/`
**Top-level organizational unit** - Phase-level completion reports and performance validation:
- Phase 0 completion and crash detection summaries
- Performance validation reports
- Contains nested `/sprints/` subdirectory

#### `/phases/sprints/`
**Mid-level organizational unit** - Sprint-level reports including:
- Migration summaries and quick references
- Agent confidence reports
- Sprint completion and validation reports
- Performance analysis
- Contains nested `/loops/` subdirectory

##### `/phases/sprints/loops/`
**Atomic execution unit** - CFN Loop execution artifacts organized by loop type:
- **`loop2-validation/`** - Loop 2 validator consensus reports and analysis
- **`loop4-product-owner/`** - Loop 4 GOAP product owner decisions and summaries

### `/reports/`
Categorized operational reports:
- **`completion/`** - Epic and consolidation completion reports
- **`validation/`** - CLI validation and coordination validation reports
- **`performance/`** - Metrics standardization and baseline tracking
- **`security/`** - Security audits and Redis health reports

### `/guides/`
Implementation and operational guides:
- Redis CLI coordination guide
- Validator implementation guide
- Root directory consolidation plan
- Agent spawning implementation

### `/documentation/`
Research, integration, and reference documentation:
- Upstream integration analysis and recommendations
- MCP endpoints reference
- Coordinator communication requirements
- Claude Flow research and executive summaries

### `/cfn-loop/`
CFN Loop flow diagrams and process documentation

### `/archive/`
Outdated or backup files for manual review before deletion:
- Claude MD optimization analysis backups
- Deprecated configuration files

### Existing Subdirectories
- **`artifact-reorganization/`** - Historical reorganization work
- **`cfn/`** - CFN-specific planning artifacts
- **`completed/`** - Completed planning items
- **`example-epic/`** - Epic structure examples
- **`legion/`** - Legion orchestration planning
- **`loop2-validators/`** - Loop 2 validator implementations
- **`merge-ruv-swarm/`** - RUV swarm merge planning
- **`parallelization/`** - Parallelization strategy docs
- **`redis-finalization/`** - Redis implementation finalization
- **`sprint-0/`** - Sprint 0 planning artifacts

## 📝 Navigation Guide

**For CFN Loop execution:** Start with `/cfn-loop/` for flow diagrams, then navigate the hierarchy:
- `/phases/` → top-level phase completion
- `/phases/sprints/` → sprint-level execution
- `/phases/sprints/loops/` → atomic loop artifacts (Loop 2 validation, Loop 4 decisions)

**For implementation work:** Reference `/guides/` for step-by-step implementation instructions.

**For validation/security:** Review `/reports/validation/` and `/reports/security/` for audit results.

**For research/analysis:** Explore `/documentation/` for upstream integration and research findings.

## 🗑️ Archive Policy

Files in `/archive/` are candidates for deletion after manual review. These include:
- Backup files (`.backup-*` suffixes)
- Outdated analysis reports
- Deprecated configuration files
- Superseded documentation

Review archive contents before permanent deletion to ensure no critical information is lost.
