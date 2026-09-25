# Phase 3: Operational Playbooks - Architecture

**Version:** 1.0.0
**Status:** Implemented
**Date:** 2025-11-15

---

## Overview

Phase 3 operational playbooks follow a **layered documentation architecture** designed for progressive skill development and rapid incident response. This document describes the structural organization, relationships, and access patterns for the playbook system.

---

## 1. Architectural Principles

### 1.1 Progressive Disclosure

**Principle:** Information organized from quick-reference (novice) to comprehensive (expert)

**Implementation:**
```
QUICK_REFERENCE.md (1 page)
    ↓ (links to)
OPERATIONAL_RUNBOOK.md (detailed procedures)
    ↓ (links to)
TROUBLESHOOTING_PLAYBOOK.md (issue resolution)
    ↓ (escalates to)
INCIDENT_RESPONSE_GUIDE.md (critical incidents)
    ↓ (disaster scenarios)
DISASTER_RECOVERY_GUIDE.md (catastrophic failures)
```

**User Journey:**
1. **Emergency?** → Quick Reference (2 min read)
2. **Daily work?** → Operational Runbook (specific procedure)
3. **Something broken?** → Troubleshooting Playbook (diagnosis)
4. **Critical incident?** → Incident Response Guide (SEV-1/2/3)
5. **Disaster?** → Disaster Recovery Guide (RTO/RPO)

### 1.2 Single Source of Truth

**Principle:** No duplication, everything links to canonical source

**Implementation:**
- Team configurations: `docker/config/teams/*.yaml` (not duplicated in playbooks)
- Automation scripts: `docker/scripts/*.sh` (referenced, not reproduced)
- Technical specs: `docker/docs/SPARC/*.md` (linked for deep dives)
- Infrastructure code: `docker/coordinator/`, `docker/skills/` (referenced)

**Example:**
```markdown
<!-- PLAYBOOK: OPERATIONAL_RUNBOOK.md -->
## Team Provisioning

See team configuration: `docker/config/teams/seo.yaml`
Execute script: `./docker/scripts/provision-team.sh --config docker/config/teams/seo.yaml`

For technical details: See `docker/docs/SPARC/CFN_DOCKER_TEAM_PROVISIONING_GUIDE.md`
```

### 1.3 Audience-Specific Content

**Principle:** Each playbook targets specific user personas

**Mapping:**
| Playbook | Primary Audience | Secondary Audience |
|----------|------------------|-------------------|
| QUICK_REFERENCE | All operators | New hires |
| OPERATIONAL_RUNBOOK | Operations staff | Team leads |
| TROUBLESHOOTING_PLAYBOOK | Operations staff | On-call engineers |
| INCIDENT_RESPONSE_GUIDE | On-call engineers | Incident commanders |
| DISASTER_RECOVERY_GUIDE | Infrastructure leads | Senior engineers |
| README | New hires | Training coordinators |

---

## 2. Document Structure

### 2.1 Hierarchical Organization

```
docker/playbooks/
│
├── README.md                          # Layer 0: Navigation Hub
│   ├── Quick navigation (emergencies)
│   ├── Document overview (purpose, audience)
│   ├── Training path (3 levels, 4 weeks)
│   └── Document maintenance procedures
│
├── QUICK_REFERENCE.md                 # Layer 1: Rapid Access
│   ├── Emergency commands
│   ├── Daily health check (5 min)
│   ├── Common tasks (copy-paste)
│   ├── Incident severity guide
│   └── Contact information
│
├── OPERATIONAL_RUNBOOK.md             # Layer 2: Standard Procedures
│   ├── Daily Operations
│   │   ├── Morning health check (10 min)
│   │   └── End-of-day summary (5 min)
│   ├── Team Management
│   │   ├── Provisioning (20-30 min)
│   │   └── Deprovisioning (15-20 min)
│   ├── Resource Management
│   ├── Maintenance Windows
│   ├── Backup Procedures
│   ├── Log Management
│   └── Security Operations
│
├── TROUBLESHOOTING_PLAYBOOK.md        # Layer 3: Issue Resolution
│   ├── Quick Reference Table (80% of issues)
│   ├── Coordinator Issues (3 scenarios)
│   ├── Team Provisioning Issues (2 scenarios)
│   ├── Network Issues (2 scenarios)
│   ├── Resource Exhaustion (2 scenarios)
│   ├── Agent Issues (2 scenarios)
│   ├── Skill Access Issues (2 scenarios)
│   ├── Database Connection Issues (1 scenario)
│   ├── Health Check Failures (1 scenario)
│   └── Escalation Procedures
│
├── INCIDENT_RESPONSE_GUIDE.md         # Layer 4: Critical Incidents
│   ├── Severity Levels (SEV-1/2/3)
│   ├── Incident Response Process (6 steps)
│   ├── Critical Incidents (SEV-1)
│   ├── Major Incidents (SEV-2)
│   ├── Minor Incidents (SEV-3)
│   ├── Post-Incident Review Template
│   └── Communication Templates
│
└── DISASTER_RECOVERY_GUIDE.md         # Layer 5: Catastrophic Failures
    ├── Disaster Scenarios (3 types)
    ├── Recovery Procedures
    ├── Backup Verification
    ├── Failover Procedures
    └── Recovery Checklist
```

### 2.2 Cross-Document Linking

**Link Types:**

1. **Escalation Links:** Troubleshooting → Incident Response → Disaster Recovery
2. **Reference Links:** Procedures → Automation Scripts → Technical Specs
3. **Training Links:** README → Specific Sections (progressive learning)
4. **Emergency Links:** Quick Reference → Full Procedures (when needed)

**Example Link Chain:**
```
User encounters issue
    ↓
QUICK_REFERENCE (tries emergency fix)
    ↓ (if not resolved)
TROUBLESHOOTING_PLAYBOOK (diagnoses issue)
    ↓ (if critical)
INCIDENT_RESPONSE_GUIDE (declares SEV-1)
    ↓ (if disaster)
DISASTER_RECOVERY_GUIDE (executes recovery)
```

---

## 3. Content Architecture

### 3.1 Standard Procedure Format

**Template Structure:**
```markdown
### Procedure: [Name]

**Frequency:** [Daily/Weekly/Monthly/As Needed]
**Duration:** [Expected time]
**Prerequisites:** [What must be true before starting]

**Steps:**
1. [Step 1 description]
   ```bash
   # Exact command to execute
   [command]
   ```

2. [Step 2 description]
   ```bash
   [command]
   ```

**Verification:**
```bash
# Command to verify success
[verification command]
```

**Troubleshooting:**
If [expected issue], see [TROUBLESHOOTING_PLAYBOOK section]

**Checklist:**
- [ ] Step 1 completed
- [ ] Step 2 completed
- [ ] Verification passed
```

### 3.2 Troubleshooting Scenario Format

**Template Structure:**
```markdown
### Issue: [Problem Description]

**Symptoms:**
- [Observable behavior 1]
- [Observable behavior 2]

**Diagnosis:**
```bash
# Command to check status
[diagnostic command]

# Expected output:
[what to look for]
```

**Common Causes:**

1. **[Cause 1]**
   ```bash
   # Solution
   [fix command]
   ```

2. **[Cause 2]**
   ```bash
   # Solution
   [fix command]
   ```

**Resolution Steps:**
1. [Step 1]
2. [Step 2]
3. Verify: [verification step]

**Escalation:**
If not resolved in [time limit], escalate to [team/person]
```

### 3.3 Incident Response Format

**Template Structure:**
```markdown
### Incident: [Incident Type]

**Impact:** [Who/what is affected]

**Immediate Actions:**

1. **[Action 1]**
   ```bash
   [command]
   ```

2. **[Action 2]**
   ```bash
   [command]
   ```

**Escalation:**
If not resolved in [time limit], [escalation action]

**Post-Incident:**
- [ ] Incident documented
- [ ] Post-incident review scheduled (if SEV-1/2)
- [ ] Playbook updated (if new scenario)
```

---

## 4. Information Flow

### 4.1 Operator Decision Tree

```
┌─────────────────────────────────────────────┐
│ Operator encounters situation               │
└───────────────┬─────────────────────────────┘
                │
                ▼
        ┌───────────────┐
        │ Is it urgent? │
        └───┬───────┬───┘
            │       │
       Yes  │       │  No
            │       │
            ▼       ▼
    ┌───────────┐  ┌────────────────────┐
    │   QUICK   │  │ What type of work? │
    │ REFERENCE │  └────┬───────┬───────┘
    └───────────┘       │       │
                        │       │
            Daily ops   │       │  Something broken
                        │       │
                        ▼       ▼
            ┌─────────────────┐  ┌─────────────────┐
            │   OPERATIONAL   │  │ TROUBLESHOOTING │
            │    RUNBOOK      │  │    PLAYBOOK     │
            └────────┬────────┘  └────────┬────────┘
                     │                    │
                     │          ┌─────────┴─────────┐
                     │          │                   │
                     │    Issue resolved?    Issue critical?
                     │          │                   │
                     │         Yes                 Yes
                     │          │                   │
                     ▼          ▼                   ▼
              ┌──────────┐  ┌──────┐  ┌────────────────────┐
              │ Continue │  │ Done │  │   INCIDENT         │
              │   work   │  └──────┘  │   RESPONSE         │
              └──────────┘             │   GUIDE            │
                                       └─────────┬──────────┘
                                                 │
                                       ┌─────────┴─────────┐
                                       │                   │
                                  Disaster?           Resolved?
                                       │                   │
                                      Yes                 Yes
                                       │                   │
                                       ▼                   ▼
                             ┌─────────────────┐    ┌──────────┐
                             │   DISASTER      │    │   Done   │
                             │   RECOVERY      │    │ Schedule │
                             │   GUIDE         │    │   PIR    │
                             └─────────────────┘    └──────────┘
```

### 4.2 Training Progression Flow

```
┌──────────────────────────────────────────────────────────────┐
│ New Operator Onboarding                                      │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
         ┌───────────────┐
         │  README.md    │ ← Navigation hub, understand structure
         │ (Training     │
         │   Path)       │
         └───────┬───────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
  Week 1: Basic     Week 2-3: Advanced
        │                 │
        ▼                 ▼
  ┌──────────┐      ┌──────────────┐
  │  QUICK   │      │ OPERATIONAL  │
  │REFERENCE │      │   RUNBOOK    │
  │          │      │   (Full)     │
  │    +     │      │      +       │
  │          │      │TROUBLESHOOT  │
  │  Daily   │      │   PLAYBOOK   │
  │  Health  │      │   (Full)     │
  │  Check   │      └──────┬───────┘
  └────┬─────┘             │
       │                   │
       └─────────┬─────────┘
                 │
        Week 1 Assessment
                 │
        ┌────────┴────────┐
        │                 │
     Pass              Fail
        │                 │
        ▼                 ▼
  Week 4+: Incident  Repeat Training
        │
        ▼
  ┌────────────────┐
  │   INCIDENT     │
  │   RESPONSE     │
  │   GUIDE        │
  │      +         │
  │   DISASTER     │
  │   RECOVERY     │
  │   GUIDE        │
  └───────┬────────┘
          │
 Final Assessment
          │
     ┌────┴─────┐
     │          │
   Pass      Fail
     │          │
     ▼          ▼
┌─────────┐  Extended
│On-Call  │  Training
│ Ready   │
└─────────┘
```

---

## 5. Integration Architecture

### 5.1 Playbook-to-Script Integration

```
┌──────────────────────────────────────────────────────────────┐
│                    OPERATIONAL PLAYBOOKS                     │
│                  (Human-Readable Procedures)                 │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 │ References & Invokes
                 ▼
┌──────────────────────────────────────────────────────────────┐
│              PHASE 0B AUTOMATION SCRIPTS                     │
│                  (Machine-Executable)                        │
├──────────────────────────────────────────────────────────────┤
│ • provision-team.sh                                          │
│ • deprovision-team.sh                                        │
│ • validate-team-config.sh                                    │
│ • create-networks.sh                                         │
│ • cfn-daily-backup.sh (cron)                                 │
│ • cfn-log-rotation.sh (cron)                                 │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 │ Operates On
                 ▼
┌──────────────────────────────────────────────────────────────┐
│              PHASE 1 DOCKER INFRASTRUCTURE                   │
│              (Containers & Configuration)                    │
├──────────────────────────────────────────────────────────────┤
│ • Main Coordinator (cfn-docker-main-coordinator)             │
│ • Team Coordinators (7 teams)                                │
│ • Redis (shared + per-team)                                  │
│ • PostgreSQL (shared)                                        │
│ • Team Workspaces (/workspace/[team]/)                       │
│ • Skills (database-readonly, database-readwrite)             │
└──────────────────────────────────────────────────────────────┘
```

### 5.2 Playbook-to-Config Integration

```
┌────────────────────────────────────────────────────┐
│         TROUBLESHOOTING_PLAYBOOK.md                │
│     "Check team resource usage vs budget"          │
└────────────────┬───────────────────────────────────┘
                 │
                 │ References
                 ▼
┌────────────────────────────────────────────────────┐
│      docker/config/teams/backend.yaml              │
│                                                    │
│      team:                                         │
│        resources:                                  │
│          memory: 16GB                              │
│          cpu_cores: 5                              │
│          max_agents: 6                             │
└────────────────┬───────────────────────────────────┘
                 │
                 │ Executed Command Reads
                 ▼
┌────────────────────────────────────────────────────┐
│   $ yq -r '.team.resources' \                      │
│       docker/config/teams/backend.yaml             │
│                                                    │
│   Output:                                          │
│     memory: 16GB                                   │
│     cpu_cores: 5                                   │
│     max_agents: 6                                  │
└────────────────────────────────────────────────────┘
```

---

## 6. Maintenance Architecture

### 6.1 Version Control Structure

```
docker/playbooks/                     # Git tracked
├── README.md                         # v1.0.0 (2025-11-15)
├── QUICK_REFERENCE.md                # v1.0.0 (2025-11-15)
├── OPERATIONAL_RUNBOOK.md            # v1.0.0 (2025-11-15)
├── TROUBLESHOOTING_PLAYBOOK.md       # v1.0.0 (2025-11-15)
├── INCIDENT_RESPONSE_GUIDE.md        # v1.0.0 (2025-11-15)
└── DISASTER_RECOVERY_GUIDE.md        # v1.0.0 (2025-11-15)

# Version history tracked in:
# - Git commit history
# - Version table at end of each document
# - Changelog (if needed for major updates)
```

### 6.2 Update Workflow

```
┌──────────────────────────────────────────────────────────────┐
│ Trigger: New incident type OR Procedure outdated            │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 1. Operations staff reports issue to #cfn-ops                │
│    "Procedure X didn't work for scenario Y"                  │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 2. Operations lead creates GitHub issue                      │
│    Label: "documentation", "playbook-update"                 │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 3. Technical writer or senior engineer updates playbook      │
│    - Creates feature branch                                  │
│    - Updates relevant playbook                               │
│    - Tests commands in staging                               │
│    - Updates version number                                  │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 4. Peer review (PR)                                          │
│    Reviewers: Operations lead + 1 senior engineer            │
└────────────────┬─────────────────────────────────────────────┘
                 │
                 ▼
┌──────────────────────────────────────────────────────────────┐
│ 5. Merge to main                                             │
│    - Playbook updated                                        │
│    - Team notified via Slack (#cfn-ops)                      │
│    - Training materials updated (if needed)                  │
└──────────────────────────────────────────────────────────────┘
```

### 6.3 Feedback Loop

```
┌──────────────┐
│   Operator   │
│  Uses        │
│  Playbook    │
└──────┬───────┘
       │
       ├─── Works? ───> Continue using
       │
       └─── Doesn't work?
                │
                ▼
        ┌───────────────┐
        │ Report to     │
        │ #cfn-ops      │
        └───────┬───────┘
                │
                ▼
        ┌───────────────┐
        │ Ops lead      │
        │ triages       │
        └───────┬───────┘
                │
        ┌───────┴────────┐
        │                │
     Critical        Non-critical
        │                │
        ▼                ▼
  ┌──────────┐    ┌──────────────┐
  │ Immediate│    │ Monthly      │
  │ hotfix   │    │ review cycle │
  └──────────┘    └──────────────┘
```

---

## 7. Access Patterns

### 7.1 Emergency Access

**Scenario:** Critical incident, main coordinator down

**Access Pattern:**
```
Operator
    ↓
QUICK_REFERENCE.md (printed copy at desk)
    ↓ (reads "Emergency Commands")
docker restart cfn-docker-main-coordinator
    ↓ (if fails)
INCIDENT_RESPONSE_GUIDE.md (SEV-1)
    ↓ (declares incident)
Page on-call engineer
```

**Latency:** <2 minutes to first action

### 7.2 Daily Access

**Scenario:** Morning health check

**Access Pattern:**
```
Operator
    ↓
OPERATIONAL_RUNBOOK.md (bookmarked)
    ↓ (navigates to "Daily Health Check")
Follows 5-step procedure
    ↓ (all passing)
Generates health report
```

**Latency:** 10 minutes total

### 7.3 Learning Access

**Scenario:** New operator training

**Access Pattern:**
```
New Operator
    ↓
README.md (starting point)
    ↓ (reads "Training Path")
Week 1: QUICK_REFERENCE + Daily ops section
    ↓
Week 2-3: Full runbook + troubleshooting
    ↓
Week 4+: Incident response + disaster recovery
    ↓
On-call ready
```

**Latency:** 4 weeks to competency

---

## 8. Scalability Considerations

### 8.1 Adding New Procedures

**When:** New operational procedure needed (e.g., "GPU resource management")

**Process:**
1. Identify target playbook (OPERATIONAL_RUNBOOK.md)
2. Create new section following standard format
3. Test procedure in staging
4. Add to table of contents
5. Update cross-references
6. Submit PR for review

**Impact:** Localized to single playbook

### 8.2 Adding New Teams

**When:** Organization adds 8th team (e.g., "legal")

**Process:**
1. Create team config: `docker/config/teams/legal.yaml`
2. Update OPERATIONAL_RUNBOOK resource tables
3. Update QUICK_REFERENCE resource limits table
4. No changes to procedures (team-agnostic)

**Impact:** Minimal (2-3 tables updated)

### 8.3 Adding New Issue Types

**When:** New class of issues discovered

**Process:**
1. Create new scenario in TROUBLESHOOTING_PLAYBOOK
2. Add to Quick Reference Table (if common)
3. Update escalation procedures (if needed)
4. Add to training materials

**Impact:** Localized to troubleshooting section

---

## 9. Quality Attributes

### 9.1 Maintainability

- **Modular structure:** Each playbook is independent
- **Version controlled:** All changes tracked in Git
- **Standardized format:** Consistent structure across documents
- **Single source of truth:** No duplication

### 9.2 Usability

- **Progressive disclosure:** Information layered by complexity
- **Quick access:** Emergency info in QUICK_REFERENCE
- **Copy-paste ready:** All commands tested and validated
- **Visual aids:** Tables, diagrams, checklists

### 9.3 Reliability

- **Tested procedures:** All commands validated in staging
- **Peer reviewed:** Updates require 2+ approvals
- **Regular validation:** Monthly review cycle
- **Feedback integration:** User-reported issues tracked

### 9.4 Accessibility

- **Markdown format:** Portable, version-controllable
- **Print-friendly:** QUICK_REFERENCE fits on one page
- **Search-friendly:** Clear keywords, consistent terminology
- **Offline capable:** All docs work without internet

---

## 10. Future Architecture

### 10.1 Phase 3.1: Interactive Playbooks

```
Current: Static Markdown
    ↓
Future: Web-based UI
    ├── Step-by-step wizard
    ├── Command execution tracking
    ├── Automated verification
    └── Metrics collection
```

### 10.2 Phase 3.2: Automated Validation

```
Current: Manual testing
    ↓
Future: CI/CD Pipeline
    ├── Command syntax validation
    ├── Link checking
    ├── Staging environment testing
    └── Automated playbook regression tests
```

### 10.3 Phase 3.3: AI Integration

```
Current: Static procedures
    ↓
Future: AI-Assisted Troubleshooting
    ├── ChatBot interface
    ├── Symptom-based playbook search
    ├── Intelligent command suggestions
    └── Root cause prediction
```

---

**End of Phase 3 Architecture v1.0.0**

**Status:** ✅ Documented (2025-11-15)
**Deliverables:** 6 playbooks organized in 5-layer hierarchy
**Next:** Commit SPARC documentation to Git
