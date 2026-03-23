# CFN Marketing Landing Pages

**Version:** 1.0.0
**Status:** Production
**Phase:** 4 - Intelligence & Optimization

## Overview

Landing page management and A/B testing skill for creating, publishing, and optimizing landing pages. Implements statistical significance testing with minimum sample sizes and confidence levels to ensure valid test results.

## A/B Testing Framework

**Statistical Requirements:**
- Minimum sample size: 100 conversions per variant
- Confidence level: 95% (p-value < 0.05)
- Minimum test duration: 7 days
- Validation enforced in create-ab-test.sh before launch

**Test Lifecycle:**
1. Create landing page from template
2. Set up A/B test (Variant A vs B)
3. Collect traffic and conversions (min 7 days)
4. Validate statistical significance
5. Declare winner and implement changes

## Operations

### 1. Create Landing Page

**Script:** `operations/create-landing-page.sh`

**Description:** Create new landing page from template with customization options

**Parameters:**
- `--page-name` (required): Landing page name (alphanumeric, hyphens)
- `--template` (required): Template ID (product,lead-gen,webinar,ebook,demo)
- `--headline` (required): Main headline text
- `--cta-text` (required): Call-to-action button text
- `--cta-url` (required): CTA destination URL
- `--description` (optional): Page description
- `--image-url` (optional): Hero image URL

**Example:**
```bash
./operations/create-landing-page.sh \
  --page-name "summer-sale-2025" \
  --template "product" \
  --headline "50% Off Summer Sale" \
  --cta-text "Shop Now" \
  --cta-url "https://example.com/checkout" \
  --description "Limited time offer on all products"
```

**Response:**
```json
{
  "page_id": "lp_1698765432",
  "page_name": "summer-sale-2025",
  "status": "draft",
  "template": "product",
  "url": "https://pages.example.com/summer-sale-2025",
  "preview_url": "https://pages.example.com/preview/summer-sale-2025",
  "created_at": "2025-10-29T12:00:00Z"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid template, page name format)
- `2`: API error
- `3`: Validation error

---

### 2. Create A/B Test

**Script:** `operations/create-ab-test.sh`

**Description:** Set up A/B test with statistical validation requirements

**Parameters:**
- `--page-id` (required): Landing page ID
- `--variant-a-name` (required): Name for Variant A (control)
- `--variant-b-name` (required): Name for Variant B (treatment)
- `--variant-b-changes` (required): JSON describing changes (headline, cta, image)
- `--traffic-split` (optional): Traffic split percentage (default: 50/50)
- `--goal-metric` (required): Conversion goal (form_submit,purchase,signup,download)

**Example:**
```bash
./operations/create-ab-test.sh \
  --page-id "lp_1698765432" \
  --variant-a-name "Original" \
  --variant-b-name "New Headline" \
  --variant-b-changes '{"headline":"New Compelling Headline","cta_text":"Get Started Free"}' \
  --traffic-split "50/50" \
  --goal-metric "form_submit"
```

**Response:**
```json
{
  "test_id": "test_1698765555",
  "page_id": "lp_1698765432",
  "status": "active",
  "variants": [
    {
      "variant_id": "var_a",
      "name": "Original",
      "traffic_percentage": 50,
      "url": "https://pages.example.com/summer-sale-2025?variant=a"
    },
    {
      "variant_id": "var_b",
      "name": "New Headline",
      "traffic_percentage": 50,
      "url": "https://pages.example.com/summer-sale-2025?variant=b",
      "changes": {
        "headline": "New Compelling Headline",
        "cta_text": "Get Started Free"
      }
    }
  ],
  "requirements": {
    "min_conversions_per_variant": 100,
    "min_duration_days": 7,
    "confidence_level": 0.95
  },
  "goal_metric": "form_submit",
  "started_at": "2025-10-29T12:00:00Z",
  "earliest_conclusion_date": "2025-11-05T12:00:00Z"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid JSON, traffic split != 100)
- `2`: API error
- `3`: Validation error (page not found, test already exists)

---

### 3. Publish Page

**Script:** `operations/publish-page.sh`

**Description:** Publish landing page to production (makes page live)

**Parameters:**
- `--page-id` (required): Landing page ID
- `--custom-domain` (optional): Custom domain (e.g., promo.example.com)

**Example:**
```bash
./operations/publish-page.sh \
  --page-id "lp_1698765432" \
  --custom-domain "promo.example.com"
```

**Response:**
```json
{
  "page_id": "lp_1698765432",
  "status": "published",
  "url": "https://promo.example.com/summer-sale-2025",
  "published_at": "2025-10-29T12:00:00Z"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (page not in draft/unpublished state)
- `2`: API error
- `3`: Validation error

---

### 4. Get Page Performance

**Script:** `operations/get-page-performance.sh`

**Description:** Get conversion metrics and A/B test results with statistical significance

**Parameters:**
- `--page-id` (required): Landing page ID
- `--date-from` (optional): Start date (YYYY-MM-DD). Default: 30 days ago
- `--date-to` (optional): End date (YYYY-MM-DD). Default: today

**Example:**
```bash
./operations/get-page-performance.sh \
  --page-id "lp_1698765432" \
  --date-from "2025-10-01"
```

**Response:**
```json
{
  "page_id": "lp_1698765432",
  "page_name": "summer-sale-2025",
  "status": "published",
  "date_range": {
    "from": "2025-10-01",
    "to": "2025-10-29"
  },
  "performance": {
    "visits": 5432,
    "conversions": 487,
    "conversion_rate": 0.0897,
    "bounce_rate": 0.32,
    "avg_time_on_page": 145
  },
  "ab_test": {
    "test_id": "test_1698765555",
    "status": "complete",
    "duration_days": 14,
    "variants": [
      {
        "variant_id": "var_a",
        "name": "Original",
        "visits": 2716,
        "conversions": 217,
        "conversion_rate": 0.0799
      },
      {
        "variant_id": "var_b",
        "name": "New Headline",
        "visits": 2716,
        "conversions": 270,
        "conversion_rate": 0.0994,
        "improvement": "+24.4%"
      }
    ],
    "statistical_significance": {
      "is_significant": true,
      "p_value": 0.0023,
      "confidence_level": 0.9977,
      "winner": "var_b"
    },
    "recommendation": "Implement Variant B (New Headline) - statistically significant improvement"
  }
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid date format)
- `2`: API error
- `3`: Validation error

---

### 5. Unpublish Page

**Script:** `operations/unpublish-page.sh`

**Description:** Take landing page offline (returns to draft state)

**Parameters:**
- `--page-id` (required): Landing page ID
- `--reason` (optional): Reason for unpublishing

**Example:**
```bash
./operations/unpublish-page.sh \
  --page-id "lp_1698765432" \
  --reason "Campaign ended"
```

**Response:**
```json
{
  "page_id": "lp_1698765432",
  "status": "unpublished",
  "reason": "Campaign ended",
  "unpublished_at": "2025-10-29T12:00:00Z",
  "previous_url": "https://promo.example.com/summer-sale-2025"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (page not published)
- `2`: API error
- `3`: Validation error

---

## Environment Variables

- `N8N_BASE_URL`: Base URL for n8n instance (e.g., https://n8n.dailyautomations.com)
- `N8N_API_KEY`: API key for authentication

## Error Handling

All operations return structured JSON error responses:

```json
{
  "error": "Description of error",
  "code": "ERROR_CODE",
  "details": {}
}
```

## Integration Pattern

Each operation calls n8n webhook:

```bash
curl -X POST "$N8N_BASE_URL/webhook/landing-pages-{operation}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

## Statistical Significance Calculation

A/B test results are considered statistically significant when:
1. Both variants have ≥100 conversions
2. Test has run for ≥7 days
3. P-value < 0.05 (95% confidence)

Formula used: Two-proportion Z-test

## Dependencies

- bash ≥4.0
- jq (JSON processing)
- curl (HTTP requests)
- bc (numeric validation)

## Usage in Workflows

```bash
# Create and publish landing page
PAGE_ID=$(./.claude/skills/cfn-marketing-landing-pages/operations/create-landing-page.sh \
  --page-name "q4-promo" \
  --template "product" \
  --headline "Limited Time Offer" \
  --cta-text "Buy Now" \
  --cta-url "https://example.com/checkout" | jq -r '.page_id')

./.claude/skills/cfn-marketing-landing-pages/operations/publish-page.sh \
  --page-id "$PAGE_ID"

# Set up A/B test
./.claude/skills/cfn-marketing-landing-pages/operations/create-ab-test.sh \
  --page-id "$PAGE_ID" \
  --variant-a-name "Control" \
  --variant-b-name "Test" \
  --variant-b-changes '{"headline":"New Headline"}' \
  --goal-metric "purchase"

# Check results after 7+ days
./.claude/skills/cfn-marketing-landing-pages/operations/get-page-performance.sh \
  --page-id "$PAGE_ID"
```

## Best Practices

1. **Always run A/B tests for minimum 7 days** to account for day-of-week variations
2. **Test one element at a time** (headline OR CTA, not both) for clear attribution
3. **Validate statistical significance** before declaring winners
4. **Archive completed tests** and document learnings
5. **Use custom domains** for brand consistency
