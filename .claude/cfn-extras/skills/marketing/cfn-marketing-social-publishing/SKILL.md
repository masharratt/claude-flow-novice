# CFN Marketing Social Publishing Skill

## Purpose
Manage social media publishing through n8n workflow integration. Create, schedule, and analyze social media posts across multiple platforms.

## Operations

### 1. create-post.sh
Create a new social media post.

**Parameters:**
- `--content` (required): Post text content
- `--platforms` (required): Comma-separated platforms (facebook,twitter,linkedin,instagram)
- `--media-ids` (optional): Comma-separated media attachment IDs
- `--link` (optional): URL to include in post
- `--hashtags` (optional): Comma-separated hashtags

**Example:**
```bash
./operations/create-post.sh \
  --content "Check out our new product launch!" \
  --platforms "facebook,twitter,linkedin" \
  --media-ids "media-123,media-456" \
  --link "https://company.com/product" \
  --hashtags "ProductLaunch,Innovation"
```

### 2. schedule-post.sh
Schedule post publication.

**Parameters:**
- `--post-id` (required): Post identifier
- `--schedule-time` (required): ISO 8601 datetime
- `--timezone` (optional): Timezone (default: UTC)

**Example:**
```bash
./operations/schedule-post.sh \
  --post-id "post-789" \
  --schedule-time "2025-11-01T14:00:00Z" \
  --timezone "America/Los_Angeles"
```

### 3. upload-media.sh
Upload media for social posts.

**Parameters:**
- `--file-path` (required): Local file path
- `--media-type` (required): Type (image, video, gif)
- `--alt-text` (optional): Accessibility description

**Example:**
```bash
./operations/upload-media.sh \
  --file-path "/path/to/image.jpg" \
  --media-type "image" \
  --alt-text "Product showcase image"
```

### 4. get-post-stats.sh
Retrieve post engagement statistics.

**Parameters:**
- `--post-id` (required): Post identifier

**Example:**
```bash
./operations/get-post-stats.sh --post-id "post-789"
```

### 5. delete-post.sh
Delete a scheduled or published post.

**Parameters:**
- `--post-id` (required): Post identifier
- `--platforms` (optional): Specific platforms to delete from (default: all)

**Example:**
```bash
./operations/delete-post.sh \
  --post-id "post-789" \
  --platforms "facebook,twitter"
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
