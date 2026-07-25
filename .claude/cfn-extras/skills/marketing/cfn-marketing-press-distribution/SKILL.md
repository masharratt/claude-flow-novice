# Press Release Distribution Skill

## Overview
Manage press release distribution through PR Newswire, Business Wire, and other distribution services. Track pickup metrics and distribution status.

## Operations

### 1. distribute-press-release.sh
Distribute press release through wire services.

**Parameters**:
- `--title` (required): Press release headline
- `--body` (required): Full press release text
- `--outlets` (required): Target outlets (national/regional/trade/tech)
- `--embargo-date` (optional): Embargo date/time (ISO 8601)
- `--contact-name` (optional): Media contact name
- `--contact-email` (optional): Media contact email

**Example**:
```bash
./.claude/skills/cfn-marketing-press-distribution/operations/distribute-press-release.sh \
  --title "Company Launches New Product" \
  --body "Full release text..." \
  --outlets "national,tech" \
  --contact-name "Jane Doe" \
  --contact-email "jane@company.com"
```

**Response**:
```json
{
  "distribution_id": "pr_abc123",
  "status": "scheduled",
  "estimated_reach": 500000,
  "distribution_time": "2025-10-29T14:00:00Z"
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error
- 3: Validation error

---

### 2. get-distribution-status.sh
Check press release distribution progress.

**Parameters**:
- `--distribution-id` (required): Distribution ID from distribute operation

**Example**:
```bash
./.claude/skills/cfn-marketing-press-distribution/operations/get-distribution-status.sh \
  --distribution-id "pr_abc123"
```

**Response**:
```json
{
  "distribution_id": "pr_abc123",
  "status": "distributed",
  "pickup_count": 45,
  "top_outlets": ["TechCrunch", "Bloomberg", "Reuters"],
  "distributed_at": "2025-10-29T14:00:00Z"
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error

---

### 3. get-pickup-metrics.sh
Retrieve detailed pickup metrics for distributed release.

**Parameters**:
- `--distribution-id` (required): Distribution ID
- `--timeframe` (optional): Metrics timeframe (24h/7d/30d, default: 7d)

**Example**:
```bash
./.claude/skills/cfn-marketing-press-distribution/operations/get-pickup-metrics.sh \
  --distribution-id "pr_abc123" \
  --timeframe "24h"
```

**Response**:
```json
{
  "distribution_id": "pr_abc123",
  "total_pickups": 67,
  "estimated_reach": 2500000,
  "outlets_by_type": {
    "national": 12,
    "regional": 23,
    "trade": 18,
    "online": 14
  },
  "top_outlets": [
    {"name": "TechCrunch", "reach": 500000},
    {"name": "Bloomberg", "reach": 800000}
  ]
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error

---

### 4. list-templates.sh
List available press release templates.

**Parameters**:
- `--category` (optional): Template category (product/funding/partnership/award)

**Example**:
```bash
./.claude/skills/cfn-marketing-press-distribution/operations/list-templates.sh \
  --category "product"
```

**Response**:
```json
{
  "templates": [
    {
      "id": "tmpl_product_launch",
      "name": "Product Launch Template",
      "category": "product",
      "sections": ["headline", "lead", "quote", "features", "availability", "boilerplate"]
    },
    {
      "id": "tmpl_product_update",
      "name": "Product Update Template",
      "category": "product",
      "sections": ["headline", "lead", "enhancements", "quote", "boilerplate"]
    }
  ]
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error

## Environment Variables
- `N8N_BASE_URL`: n8n instance URL
- `N8N_API_KEY`: n8n API authentication key

## Integration
All operations use n8n webhooks for PR distribution service integration (PR Newswire, Business Wire).
