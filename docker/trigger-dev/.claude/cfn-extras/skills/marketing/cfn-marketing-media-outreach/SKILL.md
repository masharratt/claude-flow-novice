# Media Outreach Skill

## Overview
Manage journalist outreach, media pitching, and HARO (Help A Reporter Out) response automation. Find relevant journalists and track pitch engagement.

## Operations

### 1. search-journalists.sh
Search for journalists by beat, outlet, or topic using Muck Rack.

**Parameters**:
- `--beat` (optional): Journalist beat (tech/business/healthcare/finance)
- `--outlet` (optional): Media outlet name
- `--topic` (optional): Topic keyword
- `--limit` (optional): Result limit (default: 20)

**Example**:
```bash
./.claude/skills/cfn-marketing-media-outreach/operations/search-journalists.sh \
  --beat "tech" \
  --topic "AI automation" \
  --limit 10
```

**Response**:
```json
{
  "journalists": [
    {
      "id": "jour_123",
      "name": "John Smith",
      "outlet": "TechCrunch",
      "beat": "tech",
      "email": "john@techcrunch.com",
      "twitter": "@johnsmith",
      "recent_topics": ["AI", "automation", "SaaS"]
    }
  ],
  "total_results": 45
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error

---

### 2. send-pitch.sh
Send personalized pitch to journalist via Mailshake.

**Parameters**:
- `--journalist-id` (required): Journalist ID from search
- `--subject` (required): Email subject line
- `--body` (required): Pitch email body
- `--follow-up-days` (optional): Days until follow-up (default: 3)

**Example**:
```bash
./.claude/skills/cfn-marketing-media-outreach/operations/send-pitch.sh \
  --journalist-id "jour_123" \
  --subject "AI Automation Platform Launch" \
  --body "Hi John, I saw your recent piece on..." \
  --follow-up-days 3
```

**Response**:
```json
{
  "pitch_id": "pitch_abc123",
  "journalist_id": "jour_123",
  "status": "sent",
  "sent_at": "2025-10-29T14:00:00Z",
  "follow_up_scheduled": "2025-11-01T14:00:00Z"
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error
- 3: Validation error

---

### 3. submit-haro-response.sh
Submit response to HARO query.

**Parameters**:
- `--query-id` (required): HARO query ID
- `--response` (required): Response text
- `--expert-name` (required): Expert name for attribution
- `--expert-title` (required): Expert title
- `--company-name` (required): Company name

**Example**:
```bash
./.claude/skills/cfn-marketing-media-outreach/operations/submit-haro-response.sh \
  --query-id "haro_xyz789" \
  --response "As an AI automation expert..." \
  --expert-name "Jane Doe" \
  --expert-title "CTO" \
  --company-name "Company Inc"
```

**Response**:
```json
{
  "submission_id": "sub_123",
  "query_id": "haro_xyz789",
  "status": "submitted",
  "submitted_at": "2025-10-29T14:00:00Z",
  "response_deadline": "2025-10-29T17:00:00Z"
}
```

**Exit Codes**:
- 0: Success
- 1: Invalid parameters
- 2: API error (missed deadline)
- 3: Validation error

**HARO Requirements**:
- Response time: <2 hours from query publication
- Query monitoring: 2-5 responses per day
- Personalization: Match query to company expertise

---

### 4. track-pitch-engagement.sh
Track pitch email engagement (opens, clicks, responses).

**Parameters**:
- `--pitch-id` (required): Pitch ID from send operation
- `--include-follow-ups` (optional): Include follow-up metrics (true/false, default: true)

**Example**:
```bash
./.claude/skills/cfn-marketing-media-outreach/operations/track-pitch-engagement.sh \
  --pitch-id "pitch_abc123"
```

**Response**:
```json
{
  "pitch_id": "pitch_abc123",
  "journalist_id": "jour_123",
  "opens": 2,
  "clicks": 1,
  "replied": true,
  "reply_received_at": "2025-10-30T09:15:00Z",
  "follow_ups_sent": 1,
  "last_activity": "2025-10-30T09:15:00Z"
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
All operations use n8n webhooks for Muck Rack and Mailshake integration.
