---
description: "Parse natural language epic documents to structured JSON configuration"
argument-hint: "<epic-directory> [--output <file>] [--validate]"
allowed-tools: ["Read", "Write", "Bash", "Glob", "Grep"]
---

# Parse Epic - Natural Language to Structured JSON

Convert natural language epic markdown documents into structured JSON configuration for CFN Loop execution.

**Input**: Natural language epic directory with markdown files
**Output**: Structured JSON configuration with phases, sprints, dependencies

## Usage

```bash
# Basic parsing
/parse-epic planning/example-epic

# With custom output file
/parse-epic planning/my-epic --output epic-config.json

# With validation
/parse-epic planning/auth-epic --validate

# Full options
/parse-epic planning/example-epic --output custom-epic.json --validate
```

## Command Arguments

- `<epic-directory>`: **Required** - Path to epic directory containing markdown files
- `--output <file>`: Optional - Custom output JSON file (default: `<epic-name>-config.json`)
- `--validate`: Optional - Validate parsed configuration against schema

## Epic Directory Structure

```
planning/example-epic/
├── OVERVIEW.md              # Epic description, goals, scope
├── phase-1-authentication.md    # Phase 1 details
├── phase-2-authorization.md     # Phase 2 details
├── phase-3-session-mgmt.md      # Phase 3 details
└── dependencies.md          # Cross-phase dependencies (optional)
```

## Markdown Format

### OVERVIEW.md
```markdown
# Auth System Epic

**Goal**: Build complete authentication and authorization system

## Scope

### In Scope
- JWT-based authentication
- Role-based access control (RBAC)
- Session management
- Password security (bcrypt)

### Out of Scope
- OAuth/social login
- Multi-factor authentication
- Biometric authentication

## Risk Profile
public-facing-medium-risk

## Estimated Timeline
3 phases, 8 sprints total
```

### Phase Markdown (phase-1-authentication.md)
```markdown
# Phase 1: User Authentication

**Phase ID**: 1
**Dependencies**: None

## Deliverables
- Login API endpoint (POST /auth/login)
- JWT token generation
- Password validation
- bcrypt password hashing

## Sprints

### Sprint 1.1: Core Login API
- POST /auth/login endpoint
- JWT token generation
- Basic password validation
**Estimated Agents**: 3

### Sprint 1.2: Password Security
- bcrypt password hashing
- Salt generation
- Hash verification
**Estimated Agents**: 2

## Success Criteria
- All login tests passing
- Security audit complete
- API documentation updated
```

## Output JSON Structure

The parser generates a structured JSON configuration:

```json
{
  "epic_name": "auth-system",
  "epic_goal": "Build complete authentication and authorization system",
  "scope": {
    "in_scope": [
      "JWT-based authentication",
      "Role-based access control (RBAC)",
      "Session management",
      "Password security (bcrypt)"
    ],
    "out_of_scope": [
      "OAuth/social login",
      "Multi-factor authentication",
      "Biometric authentication"
    ],
    "risk_profile": "public-facing-medium-risk"
  },
  "phases": [
    {
      "phase_id": "1",
      "phase_name": "User Authentication",
      "dependencies": [],
      "deliverables": [
        "Login API endpoint (POST /auth/login)",
        "JWT token generation",
        "Password validation",
        "bcrypt password hashing"
      ],
      "sprints": [
        {
          "sprint_id": "1.1",
          "sprint_name": "Core Login API",
          "deliverables": [
            "POST /auth/login endpoint",
            "JWT token generation",
            "Basic password validation"
          ],
          "estimated_agents": 3
        },
        {
          "sprint_id": "1.2",
          "sprint_name": "Password Security",
          "deliverables": [
            "bcrypt password hashing",
            "Salt generation",
            "Hash verification"
          ],
          "estimated_agents": 2
        }
      ],
      "success_criteria": [
        "All login tests passing",
        "Security audit complete",
        "API documentation updated"
      ]
    }
  ],
  "decision_authority_config": {
    "auto_approve_threshold": 0.90,
    "auto_relaunch_max_iteration": 10,
    "escalation_criteria": [
      "security vulnerability",
      "data loss risk"
    ]
  }
}
```

## Validation

When using `--validate`, the parser checks:
- ✅ Valid phase IDs and naming
- ✅ Dependency resolution (no circular dependencies)
- ✅ Sprint numbering consistency (1.1, 1.2, etc.)
- ✅ Deliverables are non-empty
- ✅ Scope boundaries are defined
- ✅ Risk profile is valid (internal-only-low-risk, public-facing-medium-risk, critical-high-risk)
- ✅ Success criteria are specified

**Validation Errors:**
```
❌ Validation Failed:
- Phase 2 dependency on Phase 5 (does not exist)
- Sprint 1.3 missing deliverables
- Risk profile "high" invalid (use: internal-only-low-risk, public-facing-medium-risk, critical-high-risk)
```

## Integration with CFN Loop

After parsing, use the JSON configuration with CFN Loop commands:

```bash
# 1. Parse epic to JSON
/parse-epic planning/auth-epic --output auth-config.json --validate

# 2. Execute epic using parsed configuration
/cfn-loop-epic "$(cat auth-config.json)"

# Or manually reference phases
/cfn-loop-sprints "Phase 1: User Authentication (from auth-config.json)"
```

## Automatic Scope Storage

The parser automatically stores scope boundaries in memory for Product Owner access:

```javascript
// Automatically executed during parsing
mcp__claude-flow-novice__memory_usage({
  action: "store",
  namespace: "scope-control",
  key: "project-boundaries",
  value: JSON.stringify({
    primary_goal: epicConfig.epic_goal,
    in_scope: epicConfig.scope.in_scope,
    out_of_scope: epicConfig.scope.out_of_scope,
    risk_profile: epicConfig.scope.risk_profile,
    decision_authority_config: epicConfig.decision_authority_config
  })
})
```

## Example Workflows

### Workflow 1: Parse and Execute Epic
```bash
# Step 1: Create epic markdown files in planning/auth-epic/
# Step 2: Parse to JSON
/parse-epic planning/auth-epic --output auth-config.json --validate

# Step 3: Execute epic (automatic phase orchestration)
/cfn-loop-epic "$(cat auth-config.json)"
```

### Workflow 2: Parse and Execute Single Phase
```bash
# Step 1: Parse epic
/parse-epic planning/my-epic --validate

# Step 2: Extract specific phase (manual)
# Read my-epic-config.json, copy Phase 1 details

# Step 3: Execute single phase
/cfn-loop-sprints "Phase 1 content from parsed JSON"
```

### Workflow 3: Validate Epic Structure
```bash
# Validate epic structure before execution
/parse-epic planning/complex-epic --validate

# Review validation output
# Fix any errors in markdown files
# Re-run validation until clean
```

## Output Files

**Generated Files:**
- `<epic-name>-config.json` - Structured epic configuration
- `<epic-name>-validation-report.json` - Validation results (if --validate)

**Example Output:**
```bash
🔍 Epic Parser - Natural Language to Structured JSON

📂 Epic directory: planning/auth-epic
📄 Overview file: OVERVIEW.md

✅ Parsed successfully:
   - Epic: auth-system
   - Phases: 3
   - Total Sprints: 8
   - Scope boundaries: ✓
   - Dependencies: ✓

📄 Output: auth-config.json
✅ Validation: PASSED

Ready for CFN Loop execution!
```

## Error Handling

**Common Errors:**

1. **Missing OVERVIEW.md**
   ```
   ❌ Epic directory must contain OVERVIEW.md
   ```

2. **Invalid Phase Dependencies**
   ```
   ❌ Phase 3 depends on Phase 5 (not found)
   ```

3. **Circular Dependencies**
   ```
   ❌ Circular dependency detected: Phase 1 → Phase 2 → Phase 1
   ```

4. **Invalid Sprint Numbering**
   ```
   ❌ Sprint 1.5 follows 1.2 (expected 1.3)
   ```

## Advanced Features

### Custom Risk Profiles
```markdown
## Risk Profile
custom-high-security-critical

## Decision Authority
- Auto-approve threshold: 0.95
- Max iteration: 5
- Escalation: security-team-approval-required
```

### Cross-Phase Dependencies
Create `dependencies.md`:
```markdown
# Epic Dependencies

- Phase 2 requires Phase 1 (authentication must complete first)
- Phase 3 requires Phase 1, Phase 2 (session needs auth + authorization)
- Phase 4 requires Phase 3 (admin panel needs sessions)
```

### Sprint Estimation
```markdown
### Sprint 2.3: Complex Authorization Logic
**Estimated Agents**: 8
**Complexity**: High
**Rationale**: Multi-tenant RBAC with custom permission system
```

## Tips for Epic Creation

1. **Start with OVERVIEW.md** - Define clear scope boundaries
2. **One phase per file** - Keep phase definitions modular
3. **Explicit dependencies** - Document all cross-phase requirements
4. **Realistic sprint sizing** - 2-5 deliverables per sprint
5. **Validate early** - Use `--validate` during epic creation
6. **Clear success criteria** - Define measurable phase completion criteria
