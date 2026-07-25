# CFN Marketing Email Campaigns Skill

## Purpose
Manage email marketing campaigns through n8n workflow integration. Create, schedule, test, and analyze email campaigns.

## Operations

### 1. create-campaign.sh
Create a new email campaign.

**Parameters:**
- `--name` (required): Campaign name
- `--subject` (required): Email subject line
- `--template-id` (required): Email template identifier
- `--segment-id` (required): Target audience segment
- `--from-email` (optional): Sender email address
- `--from-name` (optional): Sender name

**Example:**
```bash
./operations/create-campaign.sh \
  --name "Spring Sale 2025" \
  --subject "Save 30% This Spring!" \
  --template-id "spring-sale-template" \
  --segment-id "active-customers" \
  --from-email "marketing@company.com" \
  --from-name "Marketing Team"
```

### 2. schedule-campaign.sh
Schedule campaign delivery.

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--schedule-time` (required): ISO 8601 datetime (e.g., 2025-11-01T10:00:00Z)
- `--timezone` (optional): Timezone (default: UTC)

**Example:**
```bash
./operations/schedule-campaign.sh \
  --campaign-id "campaign-123" \
  --schedule-time "2025-11-01T10:00:00Z" \
  --timezone "America/New_York"
```

### 3. send-test-email.sh
Send test email to specified addresses.

**Parameters:**
- `--campaign-id` (required): Campaign identifier
- `--recipients` (required): Comma-separated email addresses

**Example:**
```bash
./operations/send-test-email.sh \
  --campaign-id "campaign-123" \
  --recipients "test1@company.com,test2@company.com"
```

### 4. get-campaign-stats.sh
Retrieve campaign performance statistics.

**Parameters:**
- `--campaign-id` (required): Campaign identifier

**Example:**
```bash
./operations/get-campaign-stats.sh --campaign-id "campaign-123"
```

### 5. list-templates.sh
List available email templates.

**Parameters:**
- `--category` (optional): Filter by template category
- `--limit` (optional): Maximum results (default: 50)

**Example:**
```bash
./operations/list-templates.sh --category "promotional" --limit 20
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
  "data": { ... },
  "message": "Operation completed successfully"
}
```
