# CFN Marketing Analytics Data Skill

## Purpose
Retrieve marketing analytics data through n8n workflow integration. Access website traffic, social engagement, email performance, ad performance, and conversion funnel metrics.

## Operations

### 1. get-website-traffic.sh
Retrieve website traffic analytics.

**Parameters:**
- `--start-date` (required): Start date (YYYY-MM-DD)
- `--end-date` (required): End date (YYYY-MM-DD)
- `--metrics` (optional): Comma-separated metrics (pageviews,sessions,users,bounceRate)
- `--dimensions` (optional): Comma-separated dimensions (page,source,device)

**Example:**
```bash
./operations/get-website-traffic.sh \
  --start-date "2025-10-01" \
  --end-date "2025-10-31" \
  --metrics "pageviews,sessions,users" \
  --dimensions "page,source"
```

### 2. get-social-engagement.sh
Retrieve social media engagement metrics.

**Parameters:**
- `--start-date` (required): Start date (YYYY-MM-DD)
- `--end-date` (required): End date (YYYY-MM-DD)
- `--platforms` (optional): Comma-separated platforms (facebook,twitter,linkedin,instagram)
- `--metrics` (optional): Comma-separated metrics (likes,shares,comments,reach)

**Example:**
```bash
./operations/get-social-engagement.sh \
  --start-date "2025-10-01" \
  --end-date "2025-10-31" \
  --platforms "facebook,linkedin" \
  --metrics "likes,shares,comments"
```

### 3. get-email-performance.sh
Retrieve email campaign performance metrics.

**Parameters:**
- `--start-date` (required): Start date (YYYY-MM-DD)
- `--end-date` (required): End date (YYYY-MM-DD)
- `--campaign-ids` (optional): Comma-separated campaign IDs
- `--metrics` (optional): Comma-separated metrics (opens,clicks,bounces,unsubscribes)

**Example:**
```bash
./operations/get-email-performance.sh \
  --start-date "2025-10-01" \
  --end-date "2025-10-31" \
  --campaign-ids "campaign-123,campaign-456" \
  --metrics "opens,clicks"
```

### 4. get-ad-performance.sh
Retrieve advertising campaign performance metrics.

**Parameters:**
- `--start-date` (required): Start date (YYYY-MM-DD)
- `--end-date` (required): End date (YYYY-MM-DD)
- `--platforms` (optional): Comma-separated platforms (google,facebook,linkedin)
- `--metrics` (optional): Comma-separated metrics (impressions,clicks,conversions,spend)

**Example:**
```bash
./operations/get-ad-performance.sh \
  --start-date "2025-10-01" \
  --end-date "2025-10-31" \
  --platforms "google,facebook" \
  --metrics "impressions,clicks,conversions,spend"
```

### 5. get-conversion-funnel.sh
Retrieve conversion funnel analytics.

**Parameters:**
- `--start-date` (required): Start date (YYYY-MM-DD)
- `--end-date` (required): End date (YYYY-MM-DD)
- `--funnel-id` (optional): Specific funnel identifier
- `--segment` (optional): Customer segment filter

**Example:**
```bash
./operations/get-conversion-funnel.sh \
  --start-date "2025-10-01" \
  --end-date "2025-10-31" \
  --funnel-id "signup-flow" \
  --segment "new-visitors"
```

## N8N Integration

All operations invoke n8n workflows via HTTP POST to endpoints configured in `.env`:
- `N8N_BASE_URL`: Base URL for n8n instance
- `N8N_API_KEY`: Authentication key

## Error Handling

Scripts return:
- Exit code 0: Success
- Exit code 1: Parameter validation error
- Exit code 2: Network/API error
- Exit code 3: Authentication error

## Response Format

All operations return JSON with structure:
```json
{
  "success": true,
  "data": {
    "metrics": [ ... ],
    "period": { "start": "...", "end": "..." }
  },
  "message": "Operation completed successfully"
}
```
