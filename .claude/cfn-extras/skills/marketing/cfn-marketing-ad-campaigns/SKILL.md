# CFN Marketing Ad Campaigns Skill

**Version:** 1.0.0
**Status:** Production
**Platform Support:** Google Ads, Meta Ads, LinkedIn Ads

## Purpose

Multi-platform paid advertising campaign management skill. Enables creation, budget control, bid strategy optimization, and performance monitoring for digital advertising campaigns across major platforms.

## Core Operations

### 1. Create Campaign
Create new advertising campaign with budget constraints and targeting parameters.

**Script:** `operations/create-campaign.sh`

**Parameters:**
- `--platform` (required): google_ads | meta_ads | linkedin_ads
- `--campaign-name` (required): Campaign display name
- `--daily-budget` (required): Daily spend limit (USD)
- `--lifetime-budget` (required): Total campaign budget (USD)
- `--target-audience` (required): JSON audience definition
- `--start-date` (optional): YYYY-MM-DD format (default: immediate)
- `--end-date` (optional): YYYY-MM-DD format (default: ongoing)
- `--bid-strategy` (optional): Bidding strategy (default: enhanced_cpc)

**Budget Validation:**
- Daily budget: $1 - $500 maximum
- Lifetime budget: $10 - $5,000 maximum
- Exit code 3 on budget violation

**Example:**
```bash
./.claude/skills/cfn-marketing-ad-campaigns/operations/create-campaign.sh \
  --platform google_ads \
  --campaign-name "Q4 Product Launch" \
  --daily-budget 150 \
  --lifetime-budget 3000 \
  --target-audience '{"age":"25-44","interests":["technology","business"],"locations":["US","CA"]}' \
  --bid-strategy maximize_conversions
```

**Response:**
```json
{
  "campaign_id": "cmp_a1b2c3d4",
  "status": "active",
  "daily_budget": 150,
  "lifetime_budget": 3000,
  "budget_remaining": 3000,
  "start_date": "2025-10-29",
  "platform": "google_ads"
}
```

---

### 2. Set Budget
Update campaign budget allocation with validation.

**Script:** `operations/set-budget.sh`

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--daily-budget` (optional): New daily budget (USD)
- `--lifetime-budget` (optional): New lifetime budget (USD)
- At least one budget parameter required

**Budget Validation:**
- Daily budget: $1 - $500 maximum
- Lifetime budget: $10 - $5,000 maximum
- Cannot decrease lifetime budget below current spend
- Exit code 3 on budget violation

**Example:**
```bash
./.claude/skills/cfn-marketing-ad-campaigns/operations/set-budget.sh \
  --campaign-id cmp_a1b2c3d4 \
  --daily-budget 200 \
  --lifetime-budget 4000
```

**Response:**
```json
{
  "campaign_id": "cmp_a1b2c3d4",
  "daily_budget": {
    "previous": 150,
    "updated": 200
  },
  "lifetime_budget": {
    "previous": 3000,
    "updated": 4000
  },
  "budget_remaining": 3850
}
```

---

### 3. Update Bid Strategy
Modify campaign bidding strategy for optimization.

**Script:** `operations/update-bid-strategy.sh`

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--bid-strategy` (required): Strategy type

**Supported Strategies:**
- `manual_cpc`: Manual cost-per-click bidding
- `enhanced_cpc`: Automated CPC with conversion optimization
- `maximize_conversions`: Automated bidding to maximize conversions
- `target_cpa`: Target cost per acquisition
- `target_roas`: Target return on ad spend

**Example:**
```bash
./.claude/skills/cfn-marketing-ad-campaigns/operations/update-bid-strategy.sh \
  --campaign-id cmp_a1b2c3d4 \
  --bid-strategy target_cpa
```

**Response:**
```json
{
  "campaign_id": "cmp_a1b2c3d4",
  "bid_strategy": {
    "previous": "enhanced_cpc",
    "updated": "target_cpa"
  },
  "estimated_impact": {
    "cpa_change": "-15%",
    "conversion_volume": "+8%"
  },
  "status": "active"
}
```

---

### 4. Pause/Resume Campaign
Control campaign active status.

**Script:** `operations/pause-campaign.sh`

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--action` (required): pause | resume

**Example (Pause):**
```bash
./.claude/skills/cfn-marketing-ad-campaigns/operations/pause-campaign.sh \
  --campaign-id cmp_a1b2c3d4 \
  --action pause
```

**Response:**
```json
{
  "campaign_id": "cmp_a1b2c3d4",
  "status": "paused",
  "paused_at": "2025-10-29T14:30:00Z",
  "budget_remaining": 2850
}
```

**Example (Resume):**
```bash
./.claude/skills/cfn-marketing-ad-campaigns/operations/pause-campaign.sh \
  --campaign-id cmp_a1b2c3d4 \
  --action resume
```

**Response:**
```json
{
  "campaign_id": "cmp_a1b2c3d4",
  "status": "active",
  "resumed_at": "2025-10-29T15:45:00Z",
  "budget_remaining": 2850
}
```

---

### 5. Get Campaign Performance
Fetch performance metrics and analytics.

**Script:** `operations/get-campaign-performance.sh`

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--date-range` (optional): last_7_days | last_30_days | custom (default: last_7_days)
- `--start-date` (optional): YYYY-MM-DD (required if date-range=custom)
- `--end-date` (optional): YYYY-MM-DD (required if date-range=custom)
- `--metrics` (optional): Comma-separated metric list (default: all)

**Available Metrics:**
- impressions: Ad view count
- clicks: Click count
- conversions: Conversion count
- spend: Total spend (USD)
- ctr: Click-through rate (%)
- cpa: Cost per acquisition (USD)
- roas: Return on ad spend (ratio)

**Example:**
```bash
./.claude/skills/cfn-marketing-ad-campaigns/operations/get-campaign-performance.sh \
  --campaign-id cmp_a1b2c3d4 \
  --date-range last_30_days \
  --metrics impressions,clicks,conversions,spend,cpa,roas
```

**Response:**
```json
{
  "campaign_id": "cmp_a1b2c3d4",
  "date_range": {
    "start": "2025-09-29",
    "end": "2025-10-29"
  },
  "metrics": {
    "impressions": 45230,
    "clicks": 1876,
    "conversions": 142,
    "spend": 1150.00,
    "ctr": 4.15,
    "cpa": 8.10,
    "roas": 3.85
  },
  "budget": {
    "total": 4000,
    "spent": 1150,
    "remaining": 2850
  },
  "status": "active"
}
```

---

## Technical Implementation

### Environment Variables
```bash
N8N_BASE_URL="https://your-n8n-instance.com"
N8N_API_KEY="your-api-key"
```

### Budget Validation (Enforced)
All budget operations validate against limits:

```bash
DAILY_MAX=500
LIFETIME_MAX=5000

if (( $(echo "$DAILY_BUDGET > $DAILY_MAX" | bc -l) )); then
  echo '{"error": "Daily budget exceeds maximum ($500)", "code": "BUDGET_EXCEEDED"}' >&2
  exit 3
fi
```

### Exit Codes
- `0`: Success
- `1`: Validation error (invalid parameters)
- `2`: API error (network/platform failure)
- `3`: Budget violation

### Error Response Format
```json
{
  "error": "Error description",
  "code": "ERROR_CODE",
  "details": {
    "field": "field_name",
    "constraint": "constraint_description"
  }
}
```

---

## Integration Example

```bash
#!/bin/bash
# Create campaign and monitor performance

CAMPAIGN_ID=$(
  ./.claude/skills/cfn-marketing-ad-campaigns/operations/create-campaign.sh \
    --platform google_ads \
    --campaign-name "Black Friday Sale" \
    --daily-budget 250 \
    --lifetime-budget 5000 \
    --target-audience '{"age":"25-54","interests":["shopping","deals"]}' \
    --bid-strategy maximize_conversions | jq -r '.campaign_id'
)

echo "Campaign created: $CAMPAIGN_ID"

# Wait 7 days
sleep 604800

# Check performance
./.claude/skills/cfn-marketing-ad-campaigns/operations/get-campaign-performance.sh \
  --campaign-id "$CAMPAIGN_ID" \
  --date-range last_7_days

# Adjust budget if performing well
ROAS=$(get-campaign-performance.sh --campaign-id "$CAMPAIGN_ID" | jq -r '.metrics.roas')

if (( $(echo "$ROAS > 4.0" | bc -l) )); then
  echo "Strong performance, increasing budget"
  ./.claude/skills/cfn-marketing-ad-campaigns/operations/set-budget.sh \
    --campaign-id "$CAMPAIGN_ID" \
    --daily-budget 350
fi
```

---

## Testing

### Mock Data Setup
```bash
# Set test environment
export N8N_BASE_URL="http://localhost:5678"
export N8N_API_KEY="test-key-12345"

# Test campaign creation
./.claude/skills/cfn-marketing-ad-campaigns/operations/create-campaign.sh \
  --platform google_ads \
  --campaign-name "Test Campaign" \
  --daily-budget 50 \
  --lifetime-budget 500 \
  --target-audience '{"test":true}'
```

### Budget Validation Tests
```bash
# Test daily budget violation
./.claude/skills/cfn-marketing-ad-campaigns/operations/create-campaign.sh \
  --platform google_ads \
  --campaign-name "Over Budget Test" \
  --daily-budget 600 \
  --lifetime-budget 1000 \
  --target-audience '{}'
# Expected: Exit code 3, error message

# Test lifetime budget violation
./.claude/skills/cfn-marketing-ad-campaigns/operations/set-budget.sh \
  --campaign-id test_campaign \
  --lifetime-budget 6000
# Expected: Exit code 3, error message
```

---

## Security Considerations

1. **API Key Protection**: Never log N8N_API_KEY
2. **Input Validation**: All parameters sanitized before API calls
3. **Budget Limits**: Hard-coded maximum limits prevent overspending
4. **Rate Limiting**: Respect platform API rate limits
5. **Audit Logging**: All budget changes logged to stderr

---

## Maintenance

**Dependencies:**
- bash 4.0+
- jq 1.6+
- curl 7.0+
- bc (for budget calculations)

**Update Frequency:** Monthly platform API compatibility checks

**Support Contact:** cfn-marketing-team@example.com

---

## Changelog

**v1.0.0** (2025-10-29)
- Initial release
- 5 core operations
- Budget validation enforcement
- Multi-platform support (Google Ads, Meta Ads, LinkedIn Ads)
