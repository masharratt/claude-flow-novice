# CFN Marketing SMS Campaigns Skill

**Version:** 1.0.0
**Status:** Active
**Owner:** CFN Marketing Team
**Last Updated:** 2025-10-29

## Overview

Manages SMS marketing campaigns with TCPA compliance enforcement, opt-in verification, and Do Not Call registry integration using n8n workflow automation.

## Purpose

Enable compliant SMS marketing campaigns for lead nurturing, event notifications, and customer engagement while ensuring strict adherence to TCPA regulations and opt-in requirements.

## Use Cases

1. **Campaign Execution**: Send bulk SMS campaigns to opted-in recipients
2. **Transactional SMS**: Send appointment confirmations, reminders, alerts
3. **Opt-Out Management**: Process and honor opt-out requests immediately
4. **Compliance Verification**: Check DNC registry and opt-in status before sending
5. **Delivery Tracking**: Monitor SMS delivery status and failures

## Legal Compliance (TCPA)

### Mandatory Requirements

1. **Prior Express Written Consent**: All recipients must opt-in before receiving marketing SMS
2. **Clear Identification**: Messages must identify sender
3. **Opt-Out Instructions**: Every message must include opt-out instructions
4. **Immediate Opt-Out Processing**: Opt-out requests processed within seconds
5. **Do Not Call Registry**: Check national DNC registry before sending
6. **Time Restrictions**: No messages before 8 AM or after 9 PM recipient local time

### Penalties for Non-Compliance

- $500-$1,500 per violation (per message)
- Class action lawsuits
- FTC enforcement actions

## Operations

### 1. send-sms.sh

**Purpose:** Send single SMS message with TCPA compliance checks

**Parameters:**
- `--phone` (required): Recipient phone number (E.164 format: +1XXXXXXXXXX)
- `--message` (required): Message content (max 160 characters)
- `--campaign-id` (optional): Associated campaign ID
- `--sender-id` (optional): Sender identifier (default: company name)

**TCPA Compliance Checks:**
1. Verify recipient opted-in
2. Check Do Not Call registry
3. Validate time restrictions (8 AM - 9 PM local time)
4. Include opt-out instructions

**Exit Codes:**
- 0: Success (SMS sent)
- 1: Validation error (invalid phone, message too long)
- 2: API error (network, authentication)
- 3: Compliance violation (no opt-in, DNC registry, time restriction)

**Example:**
```bash
./operations/send-sms.sh \
  --phone "+12125551234" \
  --message "Your demo is confirmed for Nov 5 at 2pm. Reply STOP to opt out." \
  --campaign-id "camp_demo_reminders"
```

**Response:**
```json
{
  "message_id": "sms_12345",
  "phone": "+12125551234",
  "status": "sent",
  "sent_at": "2025-10-29T14:30:00Z",
  "compliance_checks": {
    "opt_in_verified": true,
    "dnc_cleared": true,
    "time_restriction_ok": true
  }
}
```

### 2. create-campaign.sh

**Purpose:** Create SMS campaign configuration

**Parameters:**
- `--name` (required): Campaign name
- `--message` (required): Message template (max 160 characters)
- `--audience` (required): Target audience criteria (JSON)
- `--sender-id` (optional): Sender identifier
- `--schedule` (optional): ISO 8601 datetime for scheduling

**Audience Criteria:**
```json
{
  "segments": ["qualified_leads", "event_registrants"],
  "exclude_segments": ["opted_out", "dnc"],
  "min_qualification_score": 60
}
```

**Exit Codes:**
- 0: Success (campaign created)
- 1: Validation error
- 2: API error
- 3: Compliance violation (invalid audience)

**Example:**
```bash
./operations/create-campaign.sh \
  --name "Q4 Product Launch" \
  --message "New product launching Nov 15! Join our webinar. Reply STOP to opt out." \
  --audience '{"segments":["qualified_leads"],"min_qualification_score":60}'
```

**Response:**
```json
{
  "campaign_id": "camp_67890",
  "name": "Q4 Product Launch",
  "status": "draft",
  "created_at": "2025-10-29T14:30:00Z",
  "estimated_recipients": 1250,
  "compliance_cleared": true
}
```

### 3. schedule-campaign.sh

**Purpose:** Schedule bulk SMS campaign

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--schedule-time` (required): ISO 8601 datetime
- `--timezone` (required): IANA timezone (e.g., America/New_York)
- `--batch-size` (optional): Messages per batch (default: 100)
- `--batch-delay` (optional): Delay between batches in seconds (default: 60)

**Throttling:** Automatic rate limiting to comply with carrier restrictions (1 message/second per number)

**Exit Codes:**
- 0: Success (campaign scheduled)
- 1: Validation error
- 2: API error
- 3: Compliance violation (time restrictions)

**Example:**
```bash
./operations/schedule-campaign.sh \
  --campaign-id "camp_67890" \
  --schedule-time "2025-11-01T10:00:00" \
  --timezone "America/New_York" \
  --batch-size 50
```

**Response:**
```json
{
  "campaign_id": "camp_67890",
  "scheduled_at": "2025-11-01T10:00:00-05:00",
  "status": "scheduled",
  "estimated_duration_minutes": 25,
  "batch_count": 25,
  "total_recipients": 1250
}
```

### 4. get-delivery-status.sh

**Purpose:** Check SMS delivery status

**Parameters:**
- `--message-id` (required): Message identifier
- `--phone` (optional): Recipient phone number (for filtering)
- `--campaign-id` (optional): Campaign identifier (for bulk status)

**Exit Codes:**
- 0: Success (status retrieved)
- 1: Validation error
- 2: API error
- 3: Message not found

**Example:**
```bash
./operations/get-delivery-status.sh \
  --message-id "sms_12345"
```

**Response:**
```json
{
  "message_id": "sms_12345",
  "phone": "+12125551234",
  "status": "delivered",
  "delivered_at": "2025-10-29T14:30:15Z",
  "carrier": "T-Mobile",
  "error": null
}
```

**Status Values:**
- `queued`: Message accepted, pending delivery
- `sent`: Sent to carrier
- `delivered`: Confirmed delivered to device
- `failed`: Delivery failed (invalid number, carrier error)
- `undelivered`: Temporary failure (device off, no signal)

### 5. opt-out.sh

**Purpose:** Process opt-out request (CRITICAL - must execute within seconds)

**Parameters:**
- `--phone` (required): Phone number to opt out
- `--source` (optional): Opt-out source (inbound_sms|web|manual)
- `--reason` (optional): Opt-out reason

**TCPA Compliance:**
- Immediate execution (<5 seconds)
- Persist to Redis and database
- No further messages allowed (ever)
- Confirmation message sent

**Exit Codes:**
- 0: Success (opted out)
- 1: Validation error
- 2: API error
- 3: Already opted out

**Example:**
```bash
./operations/opt-out.sh \
  --phone "+12125551234" \
  --source "inbound_sms" \
  --reason "STOP keyword received"
```

**Response:**
```json
{
  "phone": "+12125551234",
  "opted_out": true,
  "opted_out_at": "2025-10-29T14:30:00Z",
  "source": "inbound_sms",
  "confirmation_sent": true,
  "message": "You have been unsubscribed. No further messages will be sent."
}
```

## Environment Variables

```bash
# Required
N8N_BASE_URL=https://n8n.example.com
N8N_API_KEY=n8n_api_key_xxx

# SMS Provider (Twilio or Plivo)
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+12125551000

# Alternative: Plivo
PLIVO_AUTH_ID=MAxxxxxxxxxxxxxx
PLIVO_AUTH_TOKEN=xxxxxxxxxxxxxxxx
PLIVO_PHONE_NUMBER=+12125551000

# Redis for opt-in/opt-out tracking
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=redis_password
```

## TCPA Compliance Implementation

### Opt-In Verification

```bash
# Every send operation MUST check opt-in status
OPT_IN=$(redis-cli GET "sms:opt_in:$PHONE")
if [[ "$OPT_IN" != "true" ]]; then
  echo '{"error": "Recipient has not opted-in (TCPA violation)", "code": "NO_OPT_IN"}' >&2
  exit 3
fi
```

### Do Not Call Registry

```bash
# Check DNC registry before sending
DNC=$(redis-cli GET "sms:dnc:$PHONE")
if [[ "$DNC" == "true" ]]; then
  echo '{"error": "Phone number on DNC registry", "code": "DNC_VIOLATION"}' >&2
  exit 3
fi
```

### Time Restrictions

```bash
# Validate time restrictions (8 AM - 9 PM recipient local time)
CURRENT_HOUR=$(TZ="$RECIPIENT_TIMEZONE" date +%H)
if [[ "$CURRENT_HOUR" -lt 8 ]] || [[ "$CURRENT_HOUR" -ge 21 ]]; then
  echo '{"error": "Time restriction violation (8 AM - 9 PM)", "code": "TIME_RESTRICTION"}' >&2
  exit 3
fi
```

### Immediate Opt-Out Processing

```bash
# opt-out.sh - CRITICAL compliance requirement
redis-cli SET "sms:opt_in:$PHONE" "false"
redis-cli SET "sms:dnc:$PHONE" "true"
redis-cli SADD "sms:global_opt_out" "$PHONE"

# Persist to database (async)
curl -X POST "${N8N_BASE_URL}/webhook/sms/opt-out" \
  -H "Content-Type: application/json" \
  -d '{"phone":"'"$PHONE"'","opted_out_at":"'"$(date -u +%Y-%m-%dT%H:%M:%SZ)"'"}'
```

## Performance Requirements

- **Single SMS Send:** <3 seconds
- **Opt-In Verification:** <100ms (Redis lookup)
- **Opt-Out Processing:** <5 seconds (legal requirement)
- **Campaign Creation:** <2 seconds
- **Delivery Status:** <1 second

## Error Handling

All operations return standardized JSON error responses:

```json
{
  "error": "Recipient has not opted-in (TCPA violation)",
  "code": "NO_OPT_IN",
  "timestamp": "2025-10-29T14:30:00Z",
  "phone": "+12125551234",
  "severity": "critical"
}
```

## Monitoring & Alerts

### Critical Alerts (Immediate Response)

- Compliance violations detected
- Opt-out processing failures
- DNC registry check failures

### Warning Alerts (Review Within 1 Hour)

- Delivery rate below 95%
- High bounce rate (>5%)
- API rate limiting

### Metrics Tracking

- Opt-in rate
- Opt-out rate
- Delivery rate
- Response rate
- Compliance violation rate (target: 0%)

## Integration Points

- **n8n Workflows:** SMS webhook triggers
- **CRM Systems:** Lead qualification sync
- **Analytics:** Campaign performance tracking
- **DNC Registry:** Real-time compliance checks
- **Redis:** Opt-in/opt-out state management

## Testing

```bash
# Test single SMS send (with mock opt-in)
redis-cli SET "sms:opt_in:+11234567890" "true"
./operations/send-sms.sh \
  --phone "+11234567890" \
  --message "Test message - Reply STOP to opt out"

# Test compliance violation (no opt-in)
redis-cli DEL "sms:opt_in:+11234567890"
./operations/send-sms.sh \
  --phone "+11234567890" \
  --message "Test message"
# Expected: Exit code 3, error: "NO_OPT_IN"

# Test opt-out processing
./operations/opt-out.sh \
  --phone "+11234567890" \
  --source "manual"
# Verify: redis-cli GET "sms:opt_in:+11234567890" returns "false"

# Test campaign creation
./operations/create-campaign.sh \
  --name "Test Campaign" \
  --message "Test campaign message. Reply STOP to opt out." \
  --audience '{"segments":["test_segment"]}'
```

## Maintenance

- **Opt-Out List Backup:** Daily backup to S3
- **DNC Registry Sync:** Weekly sync from national registry
- **Carrier Updates:** Monitor carrier policy changes
- **Performance Review:** Monthly campaign performance analysis
- **Compliance Audit:** Quarterly TCPA compliance audit

## Related Skills

- `cfn-marketing-chatbot-conversations`: Lead qualification for SMS targeting
- `cfn-marketing-email-campaigns`: Multi-channel campaign coordination
- `cfn-marketing-crm-integration`: Contact management and opt-in tracking
- `cfn-marketing-analytics-reporting`: SMS campaign analytics

## References

- [TCPA Compliance Guide](https://www.fcc.gov/general/telemarketing-and-robocalls)
- [Twilio SMS Best Practices](https://www.twilio.com/docs/sms/best-practices)
- [Plivo SMS API](https://www.plivo.com/docs/sms/)
- [National Do Not Call Registry](https://www.donotcall.gov/)
- [n8n Twilio Node Documentation](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.twilio/)
