# CFN Marketing Chatbot Conversations Skill

**Version:** 1.0.0
**Status:** Active
**Owner:** CFN Marketing Team
**Last Updated:** 2025-10-29

## Overview

Manages chatbot conversations for lead qualification, demo scheduling, and human escalation using n8n workflow automation.

## Purpose

Enable automated customer conversations through chatbot interfaces (Intercom, Drift) with BANT-based lead qualification, appointment scheduling, and seamless human handoff.

## Use Cases

1. **Lead Qualification**: Score leads using BANT framework (60-point threshold)
2. **Demo Scheduling**: Book appointments based on qualified lead status
3. **Human Escalation**: Transfer complex conversations to human agents
4. **Conversation Tracking**: Retrieve and analyze conversation history
5. **Real-time Engagement**: Send context-aware messages (<2 seconds response time)

## Operations

### 1. send-message.sh

**Purpose:** Send chatbot message to visitor

**Parameters:**
- `--visitor-id` (required): Unique visitor identifier
- `--message` (required): Message content
- `--platform` (required): Chatbot platform (intercom|drift)
- `--context` (optional): Conversation context JSON

**Exit Codes:**
- 0: Success
- 1: Validation error (missing parameters)
- 2: API error (network, authentication)
- 3: Platform error (visitor not found)

**Example:**
```bash
./operations/send-message.sh \
  --visitor-id "vis_12345" \
  --message "Hello! How can I help you today?" \
  --platform "intercom" \
  --context '{"page": "/pricing", "source": "website"}'
```

**Response:**
```json
{
  "message_id": "msg_67890",
  "visitor_id": "vis_12345",
  "sent_at": "2025-10-29T14:30:00Z",
  "status": "delivered"
}
```

### 2. get-conversation-history.sh

**Purpose:** Retrieve conversation transcript

**Parameters:**
- `--visitor-id` (required): Unique visitor identifier
- `--platform` (required): Chatbot platform
- `--limit` (optional): Maximum messages to retrieve (default: 50)
- `--since` (optional): ISO 8601 timestamp for filtering

**Exit Codes:**
- 0: Success
- 1: Validation error
- 2: API error
- 3: Visitor not found

**Example:**
```bash
./operations/get-conversation-history.sh \
  --visitor-id "vis_12345" \
  --platform "intercom" \
  --limit 20
```

**Response:**
```json
{
  "visitor_id": "vis_12345",
  "messages": [
    {
      "id": "msg_1",
      "sender": "bot",
      "text": "Hello! How can I help you today?",
      "timestamp": "2025-10-29T14:30:00Z"
    },
    {
      "id": "msg_2",
      "sender": "visitor",
      "text": "I need pricing information",
      "timestamp": "2025-10-29T14:31:00Z"
    }
  ],
  "total_messages": 12
}
```

### 3. qualify-lead.sh

**Purpose:** Score lead using BANT framework

**Parameters:**
- `--visitor-id` (required): Unique visitor identifier
- `--budget` (required): Budget indicator (0-40 points)
- `--authority` (required): Authority indicator (0-20 points)
- `--need` (required): Need indicator (0-20 points)
- `--timeline` (required): Timeline indicator (0-20 points)

**BANT Scoring:**
- **Budget** (40 points max): Financial capacity
  - 40: Budget confirmed and approved
  - 30: Budget range discussed
  - 20: Budget awareness shown
  - 10: Budget concerns mentioned
  - 0: No budget discussion
- **Authority** (20 points max): Decision-making power
  - 20: C-level or final decision maker
  - 15: Manager with approval authority
  - 10: Influencer in decision process
  - 5: Individual contributor
  - 0: Unknown authority level
- **Need** (20 points max): Problem severity
  - 20: Critical pain point identified
  - 15: Significant need expressed
  - 10: Moderate interest shown
  - 5: Exploratory discussion
  - 0: No clear need
- **Timeline** (20 points max): Purchase urgency
  - 20: Immediate need (within 1 month)
  - 15: Short-term (1-3 months)
  - 10: Medium-term (3-6 months)
  - 5: Long-term (6+ months)
  - 0: No timeline mentioned

**Qualification Threshold:** 60 points

**Exit Codes:**
- 0: Success (lead scored)
- 1: Validation error
- 2: API error
- 3: Visitor not found

**Example:**
```bash
./operations/qualify-lead.sh \
  --visitor-id "vis_12345" \
  --budget 30 \
  --authority 20 \
  --need 15 \
  --timeline 10
```

**Response:**
```json
{
  "visitor_id": "vis_12345",
  "qualified": true,
  "score": 75,
  "tier": "MQL",
  "breakdown": {
    "budget": 30,
    "authority": 20,
    "need": 15,
    "timeline": 10
  },
  "recommendation": "Schedule demo immediately"
}
```

### 4. schedule-demo.sh

**Purpose:** Book demo appointment

**Parameters:**
- `--visitor-id` (required): Unique visitor identifier
- `--email` (required): Contact email
- `--preferred-date` (required): ISO 8601 date
- `--timezone` (required): IANA timezone (e.g., America/New_York)
- `--notes` (optional): Additional context

**Exit Codes:**
- 0: Success
- 1: Validation error
- 2: API error
- 3: No available slots

**Example:**
```bash
./operations/schedule-demo.sh \
  --visitor-id "vis_12345" \
  --email "contact@example.com" \
  --preferred-date "2025-11-05T14:00:00" \
  --timezone "America/New_York" \
  --notes "Interested in enterprise plan"
```

**Response:**
```json
{
  "appointment_id": "apt_78901",
  "visitor_id": "vis_12345",
  "scheduled_at": "2025-11-05T14:00:00-05:00",
  "calendar_link": "https://calendly.com/demo/apt_78901",
  "confirmation_sent": true
}
```

### 5. transfer-to-human.sh

**Purpose:** Escalate conversation to human agent

**Parameters:**
- `--visitor-id` (required): Unique visitor identifier
- `--platform` (required): Chatbot platform
- `--reason` (required): Escalation reason
- `--priority` (optional): Priority level (low|medium|high, default: medium)

**Exit Codes:**
- 0: Success
- 1: Validation error
- 2: API error
- 3: No agents available

**Example:**
```bash
./operations/transfer-to-human.sh \
  --visitor-id "vis_12345" \
  --platform "intercom" \
  --reason "Complex pricing question" \
  --priority "high"
```

**Response:**
```json
{
  "transfer_id": "trf_45678",
  "visitor_id": "vis_12345",
  "agent_id": "agt_111",
  "agent_name": "Sarah Johnson",
  "transferred_at": "2025-10-29T14:35:00Z",
  "eta_minutes": 2
}
```

## Environment Variables

```bash
# Required
N8N_BASE_URL=https://n8n.example.com
N8N_API_KEY=n8n_api_key_xxx

# Platform-specific
INTERCOM_ACCESS_TOKEN=intercom_token_xxx
DRIFT_API_TOKEN=drift_token_xxx
```

## Performance Requirements

- **Message Delivery:** <2 seconds
- **Lead Qualification:** <1 second (local calculation)
- **History Retrieval:** <3 seconds
- **Demo Scheduling:** <5 seconds
- **Human Transfer:** <2 seconds

## Error Handling

All operations return standardized JSON error responses:

```json
{
  "error": "Visitor not found",
  "code": "VISITOR_NOT_FOUND",
  "timestamp": "2025-10-29T14:30:00Z",
  "visitor_id": "vis_12345"
}
```

## Integration Points

- **n8n Workflows:** Chatbot message webhook triggers
- **CRM Systems:** Lead qualification sync
- **Calendar Systems:** Demo scheduling (Calendly, Google Calendar)
- **Support Platforms:** Human transfer (Intercom, Drift)
- **Analytics:** Conversation tracking and scoring

## Testing

```bash
# Test message sending
./operations/send-message.sh \
  --visitor-id "test_visitor" \
  --message "Test message" \
  --platform "intercom"

# Test BANT qualification
./operations/qualify-lead.sh \
  --visitor-id "test_visitor" \
  --budget 40 \
  --authority 20 \
  --need 20 \
  --timeline 15
# Expected: qualified=true, score=95, tier=MQL

# Test demo scheduling
./operations/schedule-demo.sh \
  --visitor-id "test_visitor" \
  --email "test@example.com" \
  --preferred-date "2025-11-01T10:00:00" \
  --timezone "America/Los_Angeles"
```

## Maintenance

- **Log Rotation:** Conversation logs rotated daily
- **Performance Monitoring:** Response time alerts (<2 seconds)
- **BANT Calibration:** Review scoring threshold quarterly
- **Platform Updates:** Monitor Intercom/Drift API changes

## Related Skills

- `cfn-marketing-email-campaigns`: Email follow-up for qualified leads
- `cfn-marketing-sms-campaigns`: SMS notifications for scheduled demos
- `cfn-marketing-analytics-reporting`: Conversation performance analytics
- `cfn-marketing-crm-integration`: Lead sync to CRM

## References

- [Intercom API Documentation](https://developers.intercom.com/)
- [Drift API Documentation](https://devdocs.drift.com/)
- [BANT Framework Guide](https://www.salesforce.com/resources/articles/bant/)
- [n8n Template #3558](https://n8n.io/workflows/3558)
