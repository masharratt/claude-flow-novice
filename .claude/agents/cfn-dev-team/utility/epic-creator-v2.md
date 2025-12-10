# Epic Creator v2 - Sequential Persona Review Agent

## Purpose
Creates comprehensive epic definitions with sequential reviews from 6 key personas: Product Owner, Architect, Security Specialist, Performance Specialist, Accessibility Advocate, and DevOps Engineer.

## Usage
```bash
./.claude/agents/cfn-dev-team/utility/epic-creator-v2.sh "<epic-description>" [--mode=mvp|standard|enterprise] [--enforce-devops] [--output=<path>]
```

### Parameters
- **epic-description**: Required. Detailed description of the epic to be analyzed
- **--mode**: Optional. Review thoroughness level (default: standard)
  - mvp: Basic reviews, focus on critical items only
  - standard: Full comprehensive reviews (default)
  - enterprise: Deep dive with compliance and governance focus
- **--enforce-devops**: Optional. Makes DevOps recommendations blocking instead of suggested
- **--output**: Optional. Output file path (default: epic-with-personas-YYYY-MM-DD-HH-mm-ss.json)

## Persona Review Order
1. **Product Owner** (reviewOrder: 1) - Business value, user stories, market fit
2. **Architect** (reviewOrder: 2) - System design, technology choices, scalability
3. **Security Specialist** (reviewOrder: 3) - Security posture, vulnerabilities, compliance
4. **Performance Specialist** (reviewOrder: 4) - Performance metrics, optimization, monitoring
5. **Accessibility Advocate** (reviewOrder: 5) - WCAG compliance, inclusive design
6. **DevOps Engineer** (reviewOrder: 6) - Deployment, operations, infrastructure (non-blocking unless --enforce-devops)

## Output Structure

The agent generates a JSON file with the following structure:

```json
{
  "epic": {
    "id": "EPIC-XXXXXX",
    "title": "Extracted from description",
    "description": "Full epic description",
    "priority": "high",
    "estimatedDuration": "TBD",
    "budget": "TBD",
    "status": "in-review",
    "metadata": {
      "createdAt": "2024-01-01T00:00:00.000Z",
      "reviewMode": "standard|enterprise|mvp",
      "devopsEnforced": true|false
    },
    "personas": [
      {
        "name": "product-owner|architect|security-specialist|performance-specialist|accessibility-advocate|devops-engineer",
        "reviewOrder": 1-6,
        "status": "completed",
        "insights": [
          "Strategic insight 1",
          "Strategic insight 2"
        ],
        "recommendations": [
          {
            "id": "PO-001|ARCH-001|SEC-001|PERF-001|A11Y-001|DEVOPS-001",
            "title": "Recommendation title",
            "type": "blocking|suggested",
            "priority": "critical|high|medium|low",
            "estimatedCost": "$X,XXX",
            "description": "Detailed description"
          }
        ],
        "costAnalysis": {
          "category1": "$X,XXX",
          "category2": "$X,XXX"
        }
      }
    ],
    "implementationRoadmap": [],
    "totalCostBreakdown": {},
    "riskAssessment": {}
  }
}
```

## Implementation Details

### Mode Differences

#### MVP Mode
- Focus on critical blocking recommendations only
- Reduces total recommendations by ~60%
- Essential for rapid prototyping and early validation

#### Standard Mode (Default)
- Comprehensive mix of blocking and suggested recommendations
- Suitable for most production projects
- Balanced depth and breadth

#### Enterprise Mode
- Includes compliance, governance, and audit requirements
- Additional validation and documentation recommendations
- Formal review processes and risk assessments

### Persona-Specific Insights

The agent dynamically generates insights based on keywords in the epic description:

**Product Owner:**
- "user", "customer", "market" → User-centric approach
- "mvp", "prototype", "feature" → MVP prioritization

**Architect:**
- "scalable", "scale", "performance" → Scalability focus
- "api", "service", "microservice" → Service boundaries

**Security Specialist:**
- "user", "auth", "login" → Authentication focus
- "data", "storage", "database" → Data protection

**Performance Specialist:**
- "real-time", "latency", "speed" → Performance critical
- "database", "data", "storage" → Query optimization

**Accessibility Advocate:**
- "ui", "interface", "frontend", "web" → WCAG compliance
- "mobile", "responsive", "device" → Responsive design

**DevOps Engineer:**
- "deploy", "release", "production" → Deployment strategy
- "monitor", "observe", "metric" → Observability

## Dependencies
- `jq` for JSON formatting and validation
- Standard bash utilities (grep, cut, date, etc.)

## Integration Examples

### CFN Loop Integration
```bash
/cfn-loop-task "Analyze epic: Implement real-time data processing pipeline" \
  --agent epic-creator-v2 \
  --context epic-description="Implement a scalable real-time data processing pipeline capable of handling 1M events per second with sub-second latency, including data ingestion, processing, storage, and analytics capabilities" \
  --context mode=enterprise \
  --context enforce-devops=true
```

### Command Line Usage
```bash
# Basic usage
./epic-creator-v2.sh "Build a customer-facing dashboard for analytics"

# With all options
./epic-creator-v2.sh \
  "Develop a mobile banking application with biometric authentication, real-time transaction notifications, and AI-powered fraud detection" \
  --mode=enterprise \
  --enforce-devops \
  --output=banking-app-epic.json

# MVP mode for rapid prototyping
./epic-creator-v2.sh \
  "Create a proof-of-concept for AR-powered furniture placement" \
  --mode=mvp
```

## Output Integration

### Downstream Tool Compatibility
The generated JSON structure is compatible with:
- Epic tracking systems (Jira, Azure DevOps)
- Project management platforms
- Cost estimation tools
- Risk assessment frameworks
- Roadmap planning tools

### Cost Summary
The agent automatically calculates:
- Total number of recommendations per persona
- Count of blocking vs suggested recommendations
- Estimated costs by category
- Mode-based cost variations

## Post-Edit Validation
After creating or modifying this agent, run:
```bash
./.claude/hooks/cfn-invoke-post-edit.sh ".claude/agents/cfn-dev-team/utility/epic-creator-v2.sh" --agent-id "epic-creator-v2"
```

## Testing
```bash
# Test with different modes
./epic-creator-v2.sh "Test epic for validation" --mode=mvp
./epic-creator-v2.sh "Test epic for validation" --mode=standard
./epic-creator-v2.sh "Test epic for validation" --mode=enterprise

# Test with devops enforcement
./epic-creator-v2.sh "Test epic" --enforce-devops

# Validate JSON output
./epic-creator-v2.sh "Test validation" | jq '.'
```
