# Firecrawl Integration Skill

**Version:** 1.0.0
**Last Updated:** 2025-11-28

## Overview

Self-hosted Firecrawl API integration for the SEO content pipeline. Provides web scraping, crawling, mapping, and AI-powered extraction capabilities.

## Configuration

### Environment Variables

```bash
# Required
FIRECRAWL_API_KEY=cf-miifwovbc742201a14340138f3d48001e2036a6078eab91a44c20b5ac1bca03f
FIRECRAWL_BASE_URL=https://firecrawl-api-ourstories.fly.dev

# Optional
FIRECRAWL_PROJECT_ID=claude-flow-novice
FIRECRAWL_TEAM_ID=2260a711-047c-4bf9-81b7-5bb50e2dbf67
```

### Base URL

**Production:** `https://firecrawl-api-ourstories.fly.dev`

## API Endpoints (v2)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/v2/scrape` | POST | Scrape single URL |
| `/v2/crawl` | POST | Crawl website (async) |
| `/v2/crawl/{id}` | GET | Get crawl status |
| `/v2/crawl/{id}` | DELETE | Cancel crawl |
| `/v2/map` | POST | Map website URLs |
| `/v2/search` | POST | Web search + scrape |
| `/v2/extract` | POST | AI data extraction |
| `/v2/batch/scrape` | POST | Batch scrape URLs |
| `/v2/health` | GET | Health check |

## Usage in SEO Pipeline

### Step 2: Competitor Analysis

```javascript
import { scrapeCompetitors } from './firecrawl-client.js';

const competitorUrls = [
  'https://competitor1.com/article',
  'https://competitor2.com/article',
  // ... top 5 SERP results
];

const analysis = await scrapeCompetitors(competitorUrls);
```

### Step 3: SERP Analysis

```javascript
import { search } from './firecrawl-client.js';

const serpResults = await search(targetKeyword, {
  limit: 10,
  lang: 'en',
  country: 'us',
  scrapeOptions: { onlyMainContent: true }
});
```

### Step 4: Research / Source Scraping

```javascript
import { batchScrape } from './firecrawl-client.js';

const sources = await batchScrape(sourceUrls, {
  formats: ['markdown'],
  scrapeOptions: { onlyMainContent: true }
});
```

### SEO Data Extraction

```javascript
import { extractSeoData } from './firecrawl-client.js';

const seoData = await extractSeoData('https://example.com/article');
// Returns: H1, H2s, meta description, word count, structure, etc.
```

## Authentication

All requests use Bearer token authentication:

```
Authorization: Bearer cf-miifwovbc742201a14340138f3d48001e2036a6078eab91a44c20b5ac1bca03f
```

## Rate Limits

| Endpoint | Rate Limit |
|----------|-----------|
| `/v2/scrape` | 10 req/min |
| `/v2/crawl` | 3 req/min |
| `/v2/map` | 5 req/min |
| `/v2/search` | 5 req/min |
| `/v2/extract` | 5 req/min |
| `/v2/batch/scrape` | 3 req/min |

## Output Formats

- `markdown` - Clean text in Markdown format
- `html` - Raw HTML content
- `json` - Structured data extraction
- `screenshot` - Base64 encoded image
- `links` - List of URLs found on page

## Error Handling

```javascript
import { scrape, FirecrawlError } from './firecrawl-client.js';

try {
  const result = await scrape(url);
} catch (error) {
  if (error instanceof FirecrawlError) {
    console.error(`Status: ${error.status}, Message: ${error.message}`);
    console.error('Details:', error.details);
  }
}
```

## Integration with Agent Pipeline

### CLI Spawn Pattern

```bash
# Agent receives Firecrawl config via environment
export FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY"
export FIRECRAWL_BASE_URL="$FIRECRAWL_BASE_URL"

npx cfn-spawn competitive-seo-analyst \
  --task-id "$TASK_ID" \
  --context "Scrape competitors: $COMPETITOR_URLS"
```

### Task Mode Pattern

```javascript
Task("competitive-seo-analyst", `
  Use Firecrawl to scrape competitor URLs:
  ${competitorUrls.join('\n')}

  Extract:
  - Content structure
  - Word count
  - Headers
  - Key topics

  Config:
  - API: ${process.env.FIRECRAWL_BASE_URL}
  - Timeout: 45s
  - Format: markdown
`)
```

## Files

- `firecrawl-client.js` - Main API client module
- `SKILL.md` - This documentation
