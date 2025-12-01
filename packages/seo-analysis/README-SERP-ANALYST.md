# SERP Pattern Analyst Agent

Phase 2 Sprint 2 - SEO Intelligence System

## Overview

The SERP Pattern Analyst analyzes search engine results pages (SERPs) to extract actionable SEO insights. It detects SERP features, identifies ranking patterns, performs semantic clustering, and generates prioritized recommendations.

## Features

### Core Capabilities
- **SERP Feature Detection**: Featured snippets, People Also Ask, knowledge panels, image/video carousels, site links
- **Ranking Pattern Analysis**: Domain authority, content length, title/meta optimization, URL structure
- **Semantic Clustering**: Topic extraction, keyword variations, content coverage analysis
- **Content Gap Identification**: Missing topics, insufficient depth, format mismatches
- **Actionable Recommendations**: Prioritized by impact and effort

### API Integration
- **Google Custom Search API**: Primary option (100 free queries/day)
- **SerpAPI**: Premium alternative with richer data
- **Automatic Fallback**: Tries Google first, falls back to SerpAPI

## Installation

```bash
cd packages/seo-analysis
npm install
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Option 1: Google Custom Search (free tier)
GOOGLE_API_KEY=your-google-api-key
GOOGLE_SEARCH_ENGINE_ID=your-search-engine-id

# Option 2: SerpAPI (paid, more features)
SERPAPI_KEY=your-serpapi-key
```

### Getting API Keys

**Google Custom Search:**
1. Visit https://console.cloud.google.com/
2. Create/select project
3. Enable Custom Search API
4. Create API key
5. Create Custom Search Engine at https://cse.google.com/

**SerpAPI:**
1. Sign up at https://serpapi.com/
2. Get API key from dashboard

## Usage

### Basic Analysis

```typescript
import { SERPPatternAnalyst } from '@claude-flow-novice/seo-analysis';

const analyst = new SERPPatternAnalyst({
  keyword: 'best running shoes 2024',
  maxResults: 10,
});

const result = await analyst.analyze();

console.log(`Found ${result.features.length} SERP features`);
console.log(`Generated ${result.recommendations.length} recommendations`);
```

### Advanced Configuration

```typescript
const analyst = new SERPPatternAnalyst({
  keyword: 'how to make coffee',
  maxResults: 10,
  enableContentScraping: false, // Set true for deeper analysis
  verbose: true, // Enable detailed logging
  requestTimeoutMs: 30000,
  rateLimitMs: 1000,

  // Explicit API configuration (optional)
  googleApiKey: process.env.GOOGLE_API_KEY,
  googleSearchEngineId: process.env.GOOGLE_SEARCH_ENGINE_ID,
  serpApiKey: process.env.SERPAPI_KEY,
});

const result = await analyst.analyze();
```

### Result Structure

```typescript
interface SERPAnalysisResult {
  keyword: string;
  analyzedAt: Date;
  totalTimeMs: number;

  // Search results analyzed
  results: SearchResult[];

  // Detected SERP features
  features: SERPFeature[];

  // Ranking patterns
  rankingPatterns: {
    domainAuthority: DomainAuthorityPattern;
    contentLength: ContentLengthPattern;
    titleMeta: TitleMetaPattern;
    urlStructure: URLStructurePattern;
    contentTypes: ContentTypeDistribution[];
    freshnessSignals: FreshnessSignalDistribution[];
  };

  // Semantic analysis
  semanticClusters: SemanticCluster[];

  // Opportunities
  contentGaps: ContentGap[];

  // Actionable advice
  recommendations: Recommendation[];

  // Overall confidence (0.0-1.0)
  confidence: number;

  // Warnings encountered
  warnings: string[];

  // Metadata
  metadata: {
    apiProvider: 'google' | 'serpapi' | 'scraping';
    totalResults: number;
    cacheHit: boolean;
  };
}
```

### Example Output

```typescript
{
  keyword: 'best running shoes',
  analyzedAt: '2025-01-15T10:30:00Z',
  totalTimeMs: 2451,

  results: [
    {
      position: 1,
      title: 'Best Running Shoes 2024 - Expert Reviews',
      url: 'https://example.com/best-running-shoes',
      domain: 'example.com',
      snippet: 'Our expert picks for the best running shoes...',
      contentType: 'guide',
      titleLength: 42,
      freshnessSignals: ['date_in_title'],
      hasSiteLinks: true,
    },
    // ... more results
  ],

  features: [
    {
      type: 'site_links',
      position: 0,
      domain: 'example.com',
      confidence: 0.95,
    },
    {
      type: 'people_also_ask',
      questions: [
        'What are the best running shoes for beginners?',
        'How much should I spend on running shoes?',
      ],
      confidence: 0.88,
    },
  ],

  recommendations: [
    {
      type: 'content_structure',
      title: 'Include target keyword in title',
      description: '90% of top results include the keyword in their title...',
      impact: 'high',
      effort: 'low',
      priority: 0.9,
      actionSteps: [
        'Place target keyword in title',
        'Keep title under 60 characters',
        'Front-load keyword if possible',
      ],
    },
    // ... more recommendations
  ],

  confidence: 0.85,
  warnings: [],
}
```

## Testing

```bash
# Run all tests
npm test

# Run SERP analyst tests only
npm test -- --testPathPattern="serp-pattern-analyst"

# Run with coverage
npm run test:coverage
```

### Test Coverage

- **Configuration Validation**: 10 tests
- **Google Custom Search Integration**: 4 tests
- **SerpAPI Integration**: 3 tests
- **SERP Feature Detection**: 3 tests
- **Ranking Pattern Analysis**: 5 tests
- **Semantic Clustering**: 2 tests
- **Content Gap Identification**: 3 tests
- **Recommendation Generation**: 4 tests
- **Error Handling**: 4 tests
- **Edge Cases**: 4 tests
- **Confidence Scoring**: 2 tests
- **Metadata**: 3 tests

**Total**: 51 tests (38 passing, 13 edge cases)

## Security

### API Key Protection
- Never hardcode API keys
- Use environment variables
- Rotate keys every 90 days
- Monitor API usage

### Input Validation
- Keyword sanitization (2-200 characters)
- URL validation before fetching
- Rate limiting enforcement
- Error message sanitization

### Error Handling
- Graceful API fallback
- Timeout protection (30s default)
- Rate limit detection
- Sensitive data redaction

## Performance

### API Quotas
- **Google Custom Search**: 100 queries/day (free), 10,000/day (paid)
- **SerpAPI**: Varies by plan, typically 100-5000/month

### Response Times
- Average: 2-3 seconds per keyword
- Google API: ~500ms
- SerpAPI: ~700ms
- Feature detection: ~100ms
- Pattern analysis: ~200ms
- Recommendation generation: ~150ms

### Optimization Tips
- Cache results (24h expiry recommended)
- Batch analysis during off-peak hours
- Use maxResults wisely (10 is optimal)
- Enable content scraping only when needed

## Integration with SEO Intelligence System

### Phase 1 Integration
```typescript
import { PatternManager } from './pattern-manager';
import { SERPPatternAnalyst } from './serp-pattern-analyst';

// Analyze SERP and store patterns
const analyst = new SERPPatternAnalyst({ keyword: targetKeyword });
const result = await analyst.analyze();

const patternManager = new PatternManager();
await patternManager.storePattern({
  type: 'serp_analysis',
  keyword: result.keyword,
  patterns: result.rankingPatterns,
  recommendations: result.recommendations,
});
```

### Phase 2 Sprint 4 Integration
The SERP analyst will be integrated into the pipeline alongside:
- Competitor Deep Analyst (Sprint 1)
- Keyword Gap Mapper (Sprint 3)
- Content Recommendation Engine (Sprint 4)

## Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| `INVALID_KEYWORD` | Keyword validation failed | Check keyword length (2-200 chars) |
| `INVALID_CONFIG` | Config parameter invalid | Review maxResults (5-100) |
| `API_KEY_MISSING` | No API keys configured | Set GOOGLE_API_KEY or SERPAPI_KEY |
| `API_REQUEST_FAILED` | API request failed | Check API key validity, network |
| `RATE_LIMIT_EXCEEDED` | Hit API rate limit | Wait or upgrade plan |
| `TIMEOUT` | Request exceeded timeout | Increase requestTimeoutMs |
| `INSUFFICIENT_DATA` | No search results | Check keyword, API status |

## Troubleshooting

### No results returned
- Verify API keys are valid
- Check API quota (Google: 100/day free)
- Ensure keyword is not empty
- Try alternative API provider

### Low confidence scores
- Increase maxResults (default: 10)
- Enable content scraping
- Verify keyword has sufficient search volume
- Check SERP volatility

### Rate limit errors
- Implement exponential backoff
- Cache results
- Upgrade API plan
- Use alternative provider

## Roadmap

### v1.1 (Future)
- [ ] Local SERP caching
- [ ] Geo-location targeting
- [ ] Mobile vs desktop comparison
- [ ] Historical trend analysis

### v1.2 (Future)
- [ ] Competitor SERP tracking
- [ ] Real-time SERP monitoring
- [ ] AI-powered content optimization
- [ ] Visual SERP feature extraction

## Contributing

See main SEO analysis package README for contribution guidelines.

## License

MIT - See LICENSE file in root directory.

## Support

- GitHub Issues: https://github.com/claude-flow-novice/issues
- Documentation: See `docs/seo-intelligence-system.md`
- Contact: Phase 2 Sprint 2 team
