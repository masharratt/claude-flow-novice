# CFN Marketing Competitive Intelligence

**Version:** 1.0.0
**Status:** Production
**Phase:** 4 - Intelligence & Optimization

## Overview

Competitive intelligence monitoring skill for tracking competitors, brand mentions, trending topics, backlink profiles, and keyword rankings. Integrates with n8n workflows for data collection from multiple sources (social media, search engines, SEO tools).

## Operations

### 1. Search Brand Mentions

**Script:** `operations/search-brand-mentions.sh`

**Description:** Search for brand mentions across multiple sources (Twitter, Reddit, news sites, blogs)

**Parameters:**
- `--brand` (required): Brand name to search
- `--sources` (optional): Comma-separated sources (twitter,reddit,news,blogs). Default: all
- `--date-from` (optional): Start date (YYYY-MM-DD). Default: 7 days ago
- `--date-to` (optional): End date (YYYY-MM-DD). Default: today
- `--sentiment` (optional): Filter by sentiment (positive,negative,neutral). Default: all

**Example:**
```bash
./operations/search-brand-mentions.sh \
  --brand "Acme Corp" \
  --sources "twitter,reddit" \
  --date-from "2025-10-22" \
  --sentiment "negative"
```

**Response:**
```json
{
  "brand": "Acme Corp",
  "mentions": [
    {
      "source": "twitter",
      "author": "@user123",
      "content": "Acme Corp's new product is disappointing...",
      "url": "https://twitter.com/user123/status/...",
      "sentiment": "negative",
      "engagement": {"likes": 45, "shares": 12},
      "timestamp": "2025-10-22T14:30:00Z"
    }
  ],
  "total_mentions": 127,
  "sentiment_breakdown": {
    "positive": 45,
    "negative": 32,
    "neutral": 50
  }
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters
- `2`: API error
- `3`: Validation error

---

### 2. Monitor Competitor

**Script:** `operations/monitor-competitor.sh`

**Description:** Track competitor activity including content publishing, ad campaigns, and keyword targeting

**Parameters:**
- `--competitor` (required): Competitor domain or name
- `--activity-types` (optional): Comma-separated types (content,ads,keywords). Default: all
- `--lookback-days` (optional): Days to look back. Default: 30

**Example:**
```bash
./operations/monitor-competitor.sh \
  --competitor "competitor.com" \
  --activity-types "ads,keywords" \
  --lookback-days 14
```

**Response:**
```json
{
  "competitor": "competitor.com",
  "activity": {
    "ads": [
      {
        "platform": "google_ads",
        "headline": "Best Product - 50% Off",
        "description": "Limited time offer...",
        "landing_page": "https://competitor.com/promo",
        "first_seen": "2025-10-20T10:00:00Z",
        "last_seen": "2025-10-28T18:00:00Z",
        "estimated_budget": "high"
      }
    ],
    "keywords": [
      {
        "keyword": "best product 2025",
        "position": 3,
        "trend": "rising",
        "search_volume": 12000
      }
    ]
  },
  "lookback_period": "14 days"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid domain, lookback > 90 days)
- `2`: API error
- `3`: Validation error

---

### 3. Get Trending Topics

**Script:** `operations/get-trending-topics.sh`

**Description:** Discover trending topics in your industry using social media, news, and search trends

**Parameters:**
- `--industry` (required): Industry category (tech,finance,healthcare,retail,etc)
- `--region` (optional): Geographic region (us,uk,ca,global). Default: global
- `--limit` (optional): Max topics to return. Default: 10, Max: 50

**Example:**
```bash
./operations/get-trending-topics.sh \
  --industry "tech" \
  --region "us" \
  --limit 20
```

**Response:**
```json
{
  "industry": "tech",
  "region": "us",
  "topics": [
    {
      "topic": "AI chatbots for business",
      "trend_score": 95,
      "search_volume": 45000,
      "growth_rate": "+127%",
      "sources": ["twitter", "google_trends", "news"],
      "related_keywords": ["chatbot integration", "AI customer service"],
      "opportunity_score": 8.7
    }
  ],
  "total_topics": 20,
  "generated_at": "2025-10-29T12:00:00Z"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid industry, limit > 50)
- `2`: API error
- `3`: Validation error

---

### 4. Get Backlink Profile

**Script:** `operations/get-backlink-profile.sh`

**Description:** Analyze competitor backlink profiles to identify link building opportunities

**Parameters:**
- `--domain` (required): Target domain to analyze
- `--limit` (optional): Max backlinks to return. Default: 50, Max: 200
- `--min-authority` (optional): Minimum domain authority (0-100). Default: 20

**Example:**
```bash
./operations/get-backlink-profile.sh \
  --domain "competitor.com" \
  --limit 100 \
  --min-authority 40
```

**Response:**
```json
{
  "domain": "competitor.com",
  "backlink_summary": {
    "total_backlinks": 1547,
    "referring_domains": 312,
    "avg_domain_authority": 45.3,
    "new_backlinks_30d": 47
  },
  "top_backlinks": [
    {
      "source_url": "https://industry-blog.com/article",
      "source_domain": "industry-blog.com",
      "domain_authority": 67,
      "anchor_text": "best solution",
      "link_type": "dofollow",
      "first_seen": "2025-09-15T00:00:00Z"
    }
  ],
  "link_building_opportunities": [
    {
      "domain": "tech-review.com",
      "authority": 72,
      "reason": "Links to 3 competitors but not you",
      "contact_email": "editor@tech-review.com"
    }
  ]
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid domain, limit > 200, authority > 100)
- `2`: API error
- `3`: Validation error

---

### 5. Get Keyword Rankings

**Script:** `operations/get-keyword-rankings.sh`

**Description:** Monitor keyword rankings for your domain vs competitors

**Parameters:**
- `--domain` (required): Your domain
- `--keywords` (required): Comma-separated keywords
- `--competitors` (optional): Comma-separated competitor domains
- `--search-engine` (optional): Search engine (google,bing). Default: google
- `--location` (optional): Location code (us,uk,ca). Default: us

**Example:**
```bash
./operations/get-keyword-rankings.sh \
  --domain "example.com" \
  --keywords "cloud storage,file sharing,secure backup" \
  --competitors "dropbox.com,box.com" \
  --location "us"
```

**Response:**
```json
{
  "domain": "example.com",
  "rankings": [
    {
      "keyword": "cloud storage",
      "your_position": 7,
      "your_url": "https://example.com/cloud-storage",
      "search_volume": 89000,
      "competitors": [
        {
          "domain": "dropbox.com",
          "position": 2,
          "url": "https://dropbox.com/features"
        },
        {
          "domain": "box.com",
          "position": 5,
          "url": "https://box.com/cloud-storage"
        }
      ],
      "ranking_change_30d": -2,
      "opportunity_score": 6.8
    }
  ],
  "search_engine": "google",
  "location": "us",
  "checked_at": "2025-10-29T12:00:00Z"
}
```

**Exit Codes:**
- `0`: Success
- `1`: Invalid parameters (invalid domain, no keywords)
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
curl -X POST "$N8N_BASE_URL/webhook/competitive-intel-{operation}" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

## Dependencies

- bash ≥4.0
- jq (JSON processing)
- curl (HTTP requests)
- bc (numeric validation)

## Usage in Workflows

```bash
# Monitor competitor ads and content
COMPETITOR_ACTIVITY=$(./.claude/skills/cfn-marketing-competitive-intel/operations/monitor-competitor.sh \
  --competitor "competitor.com" \
  --activity-types "ads,content")

# Discover trending topics for content strategy
TRENDING=$(./.claude/skills/cfn-marketing-competitive-intel/operations/get-trending-topics.sh \
  --industry "tech" \
  --limit 10)

# Track brand sentiment
MENTIONS=$(./.claude/skills/cfn-marketing-competitive-intel/operations/search-brand-mentions.sh \
  --brand "YourBrand" \
  --sentiment "negative")
```

## Maintenance

- Review competitor list monthly
- Update industry categories quarterly
- Validate backlink data accuracy weekly
- Monitor API rate limits and adjust polling frequency
