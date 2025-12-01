# Media Monitoring Skill

## Overview
Monitor brand mentions across media outlets, analyze sentiment, detect crises, and generate monitoring reports using Meltwater/Brandwatch.

## Operations

### 1. search-mentions.sh
Search for brand mentions across all media sources.

**Parameters**:
- `--query` (required): Search query (brand name, product, executive)
- `--timeframe` (optional): Time range (24h/7d/30d, default: 24h)
- `--sources` (optional): Source types (news/social/blogs/forums, default: all)
- `--limit` (optional): Result limit (default: 50)

**Example**:
```bash
./.claude/skills/cfn-marketing-media-monitoring/operations/search-mentions.sh \
  --query "Company Inc" \
  --timeframe "24h" \
  --sources "news,social"
```

**Response**:
```json
{
  "total_mentions": 127,
  "mentions": [
    {
      "id": "mention_123",
      "source": "TechCrunch",
      "source_type": "news",
      "title": "Company Inc Launches New Product",
      "url": "https://techcrunch.com/...",
      "published_at": "2025-10-29T10:00:00Z",
      "sentiment": "positive",
      "reach": 500000
    }
  ],
  "sentiment_breakdown": {
    "positive": 89,
    "neutral": 32,
    "negative": 6
  }
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error

---

### 2. get-sentiment-analysis.sh
Analyze sentiment of brand mentions.

**Parameters**:
- `--query` (required): Search query
- `--timeframe` (optional): Time range (24h/7d/30d, default: 24h)
- `--breakdown` (optional): Breakdown dimension (source/source_type/date, default: source_type)

**Example**:
```bash
./.claude/skills/cfn-marketing-media-monitoring/operations/get-sentiment-analysis.sh \
  --query "Company Inc" \
  --timeframe "7d" \
  --breakdown "date"
```

**Response**:
```json
{
  "query": "Company Inc",
  "timeframe": "7d",
  "total_mentions": 456,
  "overall_sentiment": {
    "positive": 72.8,
    "neutral": 21.5,
    "negative": 5.7
  },
  "sentiment_by_date": [
    {
      "date": "2025-10-29",
      "positive": 45,
      "neutral": 12,
      "negative": 3
    }
  ],
  "sentiment_trend": "improving",
  "crisis_risk": "low"
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error

---

### 3. create-crisis-alert.sh
Set up crisis detection alert based on sentiment thresholds.

**Parameters**:
- `--query` (required): Search query to monitor
- `--negative-threshold` (optional): Negative sentiment % threshold (default: 50)
- `--positive-threshold` (optional): Positive sentiment % threshold (default: 30)
- `--alert-email` (required): Email for crisis alerts
- `--check-interval` (optional): Check interval in minutes (default: 15)

**Example**:
```bash
./.claude/skills/cfn-marketing-media-monitoring/operations/create-crisis-alert.sh \
  --query "Company Inc" \
  --negative-threshold 50 \
  --positive-threshold 30 \
  --alert-email "pr@company.com" \
  --check-interval 15
```

**Response**:
```json
{
  "alert_id": "alert_xyz789",
  "query": "Company Inc",
  "status": "active",
  "conditions": {
    "negative_threshold": 50,
    "positive_threshold": 30
  },
  "alert_email": "pr@company.com",
  "check_interval_minutes": 15,
  "created_at": "2025-10-29T14:00:00Z"
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error
- 3: Validation error

**Crisis Detection Requirements**:
- Alert latency: <15 minutes from negative mention
- Crisis response SLA: 2-hour tracking
- Sentiment threshold: <30% positive OR >50% negative

---

### 4. export-report.sh
Export daily/weekly brand mention report.

**Parameters**:
- `--query` (required): Search query
- `--report-type` (required): Report type (daily/weekly/monthly)
- `--format` (optional): Export format (json/csv/pdf, default: json)
- `--email` (optional): Email address to send report

**Example**:
```bash
./.claude/skills/cfn-marketing-media-monitoring/operations/export-report.sh \
  --query "Company Inc" \
  --report-type "weekly" \
  --format "pdf" \
  --email "marketing@company.com"
```

**Response**:
```json
{
  "report_id": "report_456",
  "query": "Company Inc",
  "report_type": "weekly",
  "format": "pdf",
  "period": {
    "start": "2025-10-22T00:00:00Z",
    "end": "2025-10-29T00:00:00Z"
  },
  "total_mentions": 456,
  "sentiment_summary": {
    "positive": 72.8,
    "neutral": 21.5,
    "negative": 5.7
  },
  "download_url": "https://reports.example.com/report_456.pdf",
  "sent_to": "marketing@company.com"
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
All operations use n8n webhooks for Meltwater/Brandwatch integration.
