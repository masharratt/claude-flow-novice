# CFN Marketing CRM Contacts Skill

## Purpose
Manage CRM contacts through n8n workflow integration. Create, update, retrieve contacts and manage contact segments.

## Operations

### 1. create-contact.sh
Create a new contact in CRM.

**Parameters:**
- `--email` (required): Contact email address
- `--first-name` (optional): First name
- `--last-name` (optional): Last name
- `--company` (optional): Company name
- `--phone` (optional): Phone number
- `--custom-fields` (optional): JSON string of custom fields

**Example:**
```bash
./operations/create-contact.sh \
  --email "john@example.com" \
  --first-name "John" \
  --last-name "Doe" \
  --company "Acme Corp" \
  --phone "+1-555-0100" \
  --custom-fields '{"industry":"Tech","size":"50-200"}'
```

### 2. update-contact.sh
Update existing contact information.

**Parameters:**
- `--contact-id` (required): Contact identifier
- `--email` (optional): Updated email address
- `--first-name` (optional): Updated first name
- `--last-name` (optional): Updated last name
- `--company` (optional): Updated company name
- `--phone` (optional): Updated phone number
- `--custom-fields` (optional): JSON string of custom fields to update

**Example:**
```bash
./operations/update-contact.sh \
  --contact-id "contact-123" \
  --company "New Company Inc" \
  --custom-fields '{"industry":"Finance"}'
```

### 3. get-contact.sh
Retrieve contact information.

**Parameters:**
- `--contact-id` (optional): Contact identifier
- `--email` (optional): Contact email (alternative to contact-id)
- `--include-history` (optional): Include interaction history (true/false)

**Example:**
```bash
./operations/get-contact.sh \
  --contact-id "contact-123" \
  --include-history true
```

### 4. add-to-segment.sh
Add contact to a segment/list.

**Parameters:**
- `--contact-id` (required): Contact identifier
- `--segment-id` (required): Segment/list identifier

**Example:**
```bash
./operations/add-to-segment.sh \
  --contact-id "contact-123" \
  --segment-id "active-customers"
```

### 5. remove-from-segment.sh
Remove contact from a segment/list.

**Parameters:**
- `--contact-id` (required): Contact identifier
- `--segment-id` (required): Segment/list identifier

**Example:**
```bash
./operations/remove-from-segment.sh \
  --contact-id "contact-123" \
  --segment-id "inactive-leads"
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
