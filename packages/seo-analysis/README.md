# SEO Analysis Package

Powerful competitor analysis package for deep SEO insights, powered by Firecrawl for site-wide crawling and intelligent pattern extraction.

## Features

- Site-wide web crawling via Firecrawl SDK
- Content strategy analysis
- Competitor pattern extraction
- Metadata and structure analysis
- Performance metrics collection
- TypeScript-first implementation
- Full test coverage
- Zero external dependencies (besides Firecrawl)

## Installation

```bash
npm install @claude-flow-novice/seo-analysis
```

## Setup

### 1. Get Firecrawl API Key

Visit [https://www.firecrawl.dev](https://www.firecrawl.dev) and sign up for a free account.

### 2. Configure Environment

Create a `.env` file in your project root (or use the package's `.env.example`):

```bash
FIRECRAWL_API_KEY=your_api_key_here
FIRECRAWL_API_URL=https://api.firecrawl.dev
MAX_URLS_PER_DOMAIN=100
REQUEST_TIMEOUT=30000
```

### 3. Load Environment Variables

```typescript
import dotenv from 'dotenv';
dotenv.config();
```

## Quick Start

### Basic Crawling

```typescript
import { FirecrawlAnalyzer } from '@claude-flow-novice/seo-analysis';

const analyzer = new FirecrawlAnalyzer({
  apiKey: process.env.FIRECRAWL_API_KEY!,
  maxUrls: 100
});

// Crawl a competitor's website
const results = await analyzer.crawlSite('https://example.com');

console.log(results.pages.length); // Number of pages crawled
console.log(results.metadata);     // Site metadata
console.log(results.patterns);     // Extracted patterns
```

### Pattern Analysis

```typescript
import { PatternExtractor } from '@claude-flow-novice/seo-analysis/patterns';

const extractor = new PatternExtractor();
const patterns = extractor.extract(crawlResults);

console.log(patterns.headingStructure);
console.log(patterns.contentStrategy);
console.log(patterns.linkingPatterns);
console.log(patterns.technicalSEO);
```

## API Reference

### FirecrawlAnalyzer

Main class for crawling and analyzing competitor websites.

```typescript
new FirecrawlAnalyzer(options: AnalyzerOptions)
```

#### Options

- `apiKey` (required): Your Firecrawl API key
- `maxUrls` (optional): Maximum URLs to crawl (default: 100)
- `timeout` (optional): Request timeout in ms (default: 30000)
- `retries` (optional): Number of retries (default: 3)

#### Methods

- `crawlSite(url: string): Promise<CrawlResult>` - Crawl an entire website
- `crawlPage(url: string): Promise<PageData>` - Crawl a single page
- `extractPatterns(results: CrawlResult): PatternAnalysis` - Extract patterns from crawl results

## Rate Limits

Firecrawl has rate limits based on your plan:

| Plan | Requests/Month | Concurrent Requests |
|------|---------------|-------------------|
| Free | 600 | 2 |
| Pro | 50,000 | 10 |
| Enterprise | Custom | Custom |

**Cost Estimate**: ~$10-50/month for competitive analysis of 5-10 sites.

## Alternatives Considered

### Crawlee
- Open-source, more control
- Steeper learning curve
- No managed infrastructure
- Good for complex custom crawling

### Scrapy
- Python-based, not suitable for Node.js
- More overhead for simple use cases

### Bright Data
- More expensive ($500+/month)
- Better for large-scale scraping
- More sophisticated proxy rotation

### Cheerio (HTML parsing only)
- No crawling capability
- Limited to single-page analysis
- No JavaScript rendering

## Configuration Guide

### Environment Variables

```bash
# Required
FIRECRAWL_API_KEY=your_key

# Optional (with defaults shown)
FIRECRAWL_API_URL=https://api.firecrawl.dev
MAX_URLS_PER_DOMAIN=100
REQUEST_TIMEOUT=30000
MAX_RETRIES=3
RETRY_DELAY_MS=1000
LOG_LEVEL=info
```

### Security Best Practices

1. **Never commit `.env` files** - Always use `.env.example` as template
2. **Use environment variables in CI/CD** - Set variables in GitHub Actions/CI system
3. **Rotate API keys regularly** - Update in Firecrawl dashboard
4. **Restrict API key scope** - Use Firecrawl's permission system if available
5. **Rate limit locally** - Implement backoff strategies

## Testing

```bash
# Run all tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

## Troubleshooting

### API Key Not Found
```
Error: FIRECRAWL_API_KEY is not set
```

**Solution**: Ensure `.env` file exists and `FIRECRAWL_API_KEY=your_key` is set.

### Rate Limit Hit
```
Error: 429 Too Many Requests
```

**Solution**: Reduce `MAX_URLS_PER_DOMAIN` or implement exponential backoff.

### Timeout Errors
```
Error: Request timeout after 30000ms
```

**Solution**: Increase `REQUEST_TIMEOUT` in `.env` for large websites.

### JavaScript Not Rendering
Some websites require JavaScript rendering. Firecrawl automatically handles this, but performance may degrade.

## License

MIT

## Support

For issues, questions, or feature requests, visit the [Claude Flow Novice GitHub Issues](https://github.com/claude-flow-novice/claude-flow-novice/issues).

## Related Packages

- `@claude-flow-novice/web-components` - Shared React component library
- `@claude-flow-novice/web-portal` - Web portal for visualizing analysis results
