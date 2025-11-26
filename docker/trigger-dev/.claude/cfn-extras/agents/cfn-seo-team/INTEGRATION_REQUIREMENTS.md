# SEO Agent Integration Requirements

This document outlines the API integrations, service dependencies, and external tools required for the SEO specialist agents.

## API Integrations

### Google APIs

#### Google Search Console API
**Required by:**
- technical-seo-specialist
- seo-analytics-specialist

**Use cases:**
- Fetch crawl errors and index coverage
- Track search performance (impressions, clicks, CTR, position)
- Monitor Core Web Vitals
- Submit sitemaps

**Authentication:** OAuth 2.0
**Endpoints:**
- `searchconsole.sitemaps.list`
- `searchconsole.urlInspection.index.inspect`
- `searchanalytics.query`

---

#### Google Analytics 4 API
**Required by:**
- seo-analytics-specialist

**Use cases:**
- Track organic traffic and user behavior
- Analyze conversion funnels
- Segment traffic by device, location, demographics
- Set up custom events and conversions

**Authentication:** OAuth 2.0 or Service Account
**Endpoints:**
- `properties.runReport`
- `properties.batchRunReports`

---

#### PageSpeed Insights API
**Required by:**
- technical-seo-specialist

**Use cases:**
- Measure Core Web Vitals (LCP, FID, CLS)
- Analyze page performance scores
- Get optimization recommendations

**Authentication:** API Key
**Endpoint:**
- `https://www.googleapis.com/pagespeedonline/v5/runPagespeed`

---

#### Google Rich Results Test API
**Required by:**
- schema-markup-engineer
- technical-seo-specialist

**Use cases:**
- Validate JSON-LD schema markup
- Check rich result eligibility
- Identify schema errors and warnings

**Authentication:** None (public API)
**Endpoint:**
- `https://search.google.com/test/rich-results`

---

#### Google Business Profile API
**Required by:**
- local-seo-optimizer

**Use cases:**
- Manage GBP listing (update business info, hours, photos)
- Track GBP insights (views, clicks, calls)
- Respond to reviews

**Authentication:** OAuth 2.0
**Endpoints:**
- `accounts.locations.list`
- `accounts.locations.patch`
- `accounts.locations.reviews.list`

---

#### Google Knowledge Graph Search API
**Required by:**
- geo-optimization-expert
- eeat-content-auditor

**Use cases:**
- Verify entity recognition
- Check author credentials in Knowledge Graph
- Validate organization presence

**Authentication:** API Key
**Endpoint:**
- `https://kgsearch.googleapis.com/v1/entities:search`

---

### SEO Tool APIs

#### SE Ranking API
**Required by:**
- content-seo-strategist
- link-building-specialist
- seo-analytics-specialist
- competitive-seo-analyst

**Use cases:**
- Keyword research (search volume, keyword difficulty, CPC)
- Rank tracking (daily/weekly keyword position monitoring)
- Backlink tracking (new/lost backlinks)
- Competitor analysis (keyword gaps, backlink gaps)

**Authentication:** API Key
**Endpoints:**
- `/keywords/suggestions`
- `/rankings/get`
- `/backlinks/summary`
- `/competitors/organic`

**Pricing:** Included in SE Ranking subscription (Pro plan recommended)

---

#### Ahrefs API
**Required by:**
- link-building-specialist
- competitive-seo-analyst
- seo-analytics-specialist

**Use cases:**
- Backlink prospecting and analysis
- Competitor backlink profiles
- Domain Rating (DR) and URL Rating (UR)
- Content gap analysis

**Authentication:** API Key
**Endpoints:**
- `/site-explorer/v1/backlinks`
- `/site-explorer/v1/refdomains`
- `/keywords-explorer/v1/metrics`

**Pricing:** Requires Ahrefs subscription (Standard plan minimum)

---

#### Moz API
**Required by:**
- link-building-specialist
- competitive-seo-analyst
- eeat-content-auditor

**Use cases:**
- Domain Authority (DA) scores
- Spam score calculation
- Link quality assessment

**Authentication:** Access ID + Secret Key
**Endpoints:**
- `/url-metrics`
- `/link-metrics`

**Pricing:** Requires Moz subscription or pay-per-use API credits

---

### AI & GEO APIs

#### Perplexity API
**Required by:**
- geo-optimization-expert

**Use cases:**
- Track citations in Perplexity search results
- Monitor AI search visibility
- Analyze citation patterns

**Authentication:** API Key
**Endpoint:** Custom (Perplexity API documentation)

---

#### OpenAI API
**Required by:**
- geo-optimization-expert

**Use cases:**
- Test content visibility in ChatGPT
- Analyze AI model retrieval patterns
- Optimize content for AI consumption

**Authentication:** API Key
**Endpoints:**
- `/v1/chat/completions`

---

### Email & Outreach APIs

#### Hunter.io API
**Required by:**
- link-building-specialist

**Use cases:**
- Find email addresses for link building outreach
- Verify email deliverability
- Build contact lists

**Authentication:** API Key
**Endpoints:**
- `/v2/email-finder`
- `/v2/email-verifier`

**Pricing:** Free tier (25 searches/month), paid plans available

---

### Local SEO APIs

#### BrightLocal API
**Required by:**
- local-seo-optimizer

**Use cases:**
- Track local citations
- Monitor NAP consistency
- Audit local search rankings

**Authentication:** API Key
**Endpoints:**
- `/v1/citations/get`
- `/v1/lsrc/get`

**Pricing:** Requires BrightLocal subscription

---

## Service Dependencies

### PostgreSQL
**Required by:** All agents

**Use cases:**
- Store keyword research data
- Track ranking history
- Store backlink data
- Cache API responses
- Store audit results

**Schema design:**
- `keywords` table (keyword, volume, difficulty, ranking)
- `backlinks` table (url, domain_authority, anchor_text)
- `schema_validation` table (page_url, schema_type, validation_status)
- `citations` table (directory, nap_status, link)

---

### Caching System
**Required by:**
- technical-seo-specialist (cache performance metrics)
- programmatic-seo-engineer (cache rendered templates)

**Use cases:**
- Cache API responses (reduce API costs)
- Store temporary data during execution
- Performance optimization for repeated operations

---

### n8n Workflow Automation
**Required by:** All agents (optional, recommended)

**Use cases:**
- Automate keyword research triggers
- Schedule weekly SEO audits
- Automate outreach follow-ups
- Generate scheduled reports

**Workflows:**
- Weekly technical audit trigger
- Keyword ranking alerts
- Backlink notification (new/lost)
- Review response automation (GBP)

---

## External Tools

### Screaming Frog SEO Spider
**Required by:**
- technical-seo-specialist

**Use cases:**
- Crawl site for technical issues
- Export crawl data (CSV format)
- Identify broken links, redirect chains

**Integration:** Export CSV → Parse with agent
**License:** Free (500 URLs) or paid license

---

### Copyscape
**Required by:**
- programmatic-seo-engineer
- eeat-content-auditor

**Use cases:**
- Detect duplicate content
- Check content uniqueness

**Integration:** Manual or API
**Pricing:** Pay-per-use ($0.03/search)

---

### Grammarly
**Required by:**
- eeat-content-auditor

**Use cases:**
- Assess readability scores
- Check grammar and clarity

**Integration:** Manual review or API (business plan)

---

### W3C Validator
**Required by:**
- eeat-content-auditor

**Use cases:**
- Validate HTML markup
- Ensure web standards compliance

**Integration:** Public API (free)
**Endpoint:** `https://validator.w3.org/nu/`

---

## Authentication & Security

### API Key Management
- Store all API keys in environment variables
- Use `.env` file for local development
- Use secrets manager in production (AWS Secrets Manager, Vault)

**Required environment variables:**
```bash
# Google APIs
GOOGLE_API_KEY=your_key_here
GOOGLE_OAUTH_CLIENT_ID=your_client_id
GOOGLE_OAUTH_CLIENT_SECRET=your_secret

# SEO Tools
SE_RANKING_API_KEY=your_key_here
AHREFS_API_KEY=your_key_here
MOZ_ACCESS_ID=your_id
MOZ_SECRET_KEY=your_key

# Outreach
HUNTER_API_KEY=your_key_here

# AI & GEO
OPENAI_API_KEY=your_key_here
PERPLEXITY_API_KEY=your_key_here

# Local SEO
BRIGHTLOCAL_API_KEY=your_key_here
```

---

## Rate Limits & Quotas

### Google APIs
- **PageSpeed Insights:** 25,000 requests/day (free tier)
- **Google Search Console:** 600 queries/minute
- **Google Analytics 4:** 10 concurrent requests

### SEO Tool APIs
- **SE Ranking:** Varies by plan (Pro: 10,000 API calls/month)
- **Ahrefs:** 500 requests/month (Standard plan)
- **Moz:** 10 API calls/10 seconds (free tier)

### Best Practices
- Implement exponential backoff for rate limit errors
- Cache API responses in caching system (TTL: 24 hours)
- Batch API requests when possible

---

## Cost Estimates

### Monthly API Costs (Standard Setup)
| Service | Cost | Notes |
|---------|------|-------|
| Google APIs | $0 | Free tier sufficient for most use cases |
| SE Ranking (Pro) | $119/month | Keyword research, rank tracking |
| Ahrefs (Standard) | $199/month | Backlink analysis, competitor research |
| Moz (Medium) | $179/month | DA scores, spam score |
| Hunter.io (Starter) | $49/month | Email finding for outreach |
| BrightLocal (Single Business) | $35/month | Local SEO tracking |
| **Total Estimated Cost** | **$581/month** | For full SEO agent capabilities |

### Cost Optimization Strategies
- Use SE Ranking as primary tool (combines keyword + backlink tracking)
- Ahrefs optional if budget constrained (use SE Ranking backlink data)
- Moz optional (can estimate DA using other metrics)
- Hunter.io free tier (25 searches/month) may suffice for small campaigns

**Minimum Viable Setup:** $119/month (SE Ranking only)

---

## Setup Instructions

### 1. Google API Setup
```bash
# Enable required APIs in Google Cloud Console
1. Create project in Google Cloud Console
2. Enable APIs:
   - PageSpeed Insights API
   - Google Search Console API
   - Google Analytics Data API
   - Google Business Profile API
   - Knowledge Graph Search API
3. Create credentials (API key for public APIs, OAuth 2.0 for others)
4. Store credentials in .env file
```

### 2. SE Ranking Setup
```bash
# Get API key from SE Ranking dashboard
1. Login to SE Ranking
2. Navigate to Settings → API
3. Generate API key
4. Add to .env: SE_RANKING_API_KEY=your_key_here
```

### 3. Database Setup (PostgreSQL)
```sql
-- Create database
CREATE DATABASE seo_agent_db;

-- Create tables
CREATE TABLE keywords (
    id SERIAL PRIMARY KEY,
    keyword VARCHAR(255),
    search_volume INT,
    keyword_difficulty INT,
    current_ranking INT,
    competitor_ranking INT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE backlinks (
    id SERIAL PRIMARY KEY,
    source_url TEXT,
    target_url TEXT,
    domain_authority INT,
    anchor_text VARCHAR(255),
    link_type VARCHAR(50),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE schema_validation (
    id SERIAL PRIMARY KEY,
    page_url TEXT,
    schema_type VARCHAR(100),
    validation_status VARCHAR(50),
    errors TEXT,
    warnings TEXT,
    validated_at TIMESTAMP DEFAULT NOW()
);
```

### 4. Caching System Setup
Set up your preferred caching system for performance optimization and temporary data storage.

**Recommended Options:**
- High-performance caching system for large-scale operations
- Simple key-value caching for basic use cases
- Application-level caching for minimal dependencies

### 5. n8n Setup (Optional)
```bash
# Install n8n
npm install n8n -g

# Start n8n
n8n start

# Access n8n UI at http://localhost:5678
```

---

## Testing & Validation

### API Connection Tests
```bash
# Test Google PageSpeed Insights
curl "https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=https://example.com&key=YOUR_API_KEY"

# Test SE Ranking
curl -H "Authorization: Bearer YOUR_API_KEY" "https://api4.seranking.com/keywords/suggestions?keyword=genealogy"

# Test Ahrefs
curl -H "Authorization: Bearer YOUR_API_KEY" "https://api.ahrefs.com/v3/site-explorer/backlinks?target=example.com"
```

### Database Connection Test
```bash
psql -h localhost -U postgres -d seo_agent_db -c "SELECT 1;"
```

### Caching System Connection Test
Test your chosen caching system to ensure it's working properly for agent operations.

---

## Troubleshooting

### Common Issues

**1. Google API authentication errors**
- Verify OAuth credentials are correct
- Check API is enabled in Google Cloud Console
- Ensure service account has correct permissions

**2. SE Ranking rate limits**
- Implement caching (TTL: 24 hours)
- Batch requests when possible
- Upgrade to higher plan if needed

**3. Database connection errors**
- Check PostgreSQL service is running
- Verify database credentials in .env
- Ensure database exists and tables are created

**4. Caching system connection errors**
- Check caching service is running and accessible
- Verify caching system host and port in configuration
- Check firewall rules if using remote caching system
- Validate authentication credentials if required

---

## Security Best Practices

1. **Never commit API keys to Git**
   - Use `.env` file (add to `.gitignore`)
   - Use environment variables in production

2. **Rotate API keys regularly**
   - Set reminder to rotate keys every 90 days
   - Revoke old keys after rotation

3. **Limit API key permissions**
   - Use read-only keys where possible
   - Restrict API key usage by IP (if supported)

4. **Monitor API usage**
   - Set up alerts for unusual API activity
   - Track costs in real-time

5. **Encrypt sensitive data**
   - Encrypt database backups
   - Use HTTPS for all API calls
   - Store credentials in secure secrets manager

---

## Agent-Specific Integration Notes

### technical-seo-specialist
- Primary APIs: PageSpeed Insights, Google Search Console
- Heavy user of caching systems (performance metrics)
- Requires Screaming Frog export data

### content-seo-strategist
- Primary API: SE Ranking
- No external tools required
- Moderate PostgreSQL usage (keyword data)

### programmatic-seo-engineer
- Primary service: PostgreSQL (source data)
- Heavy caching usage (template caching)
- Requires Copyscape for duplicate detection

### geo-optimization-expert
- Primary APIs: Perplexity, OpenAI, Knowledge Graph
- Emerging field (APIs may change)
- Light PostgreSQL usage

### link-building-specialist
- Primary APIs: Ahrefs, SE Ranking, Hunter.io
- Heavy PostgreSQL usage (prospect tracking)
- Requires manual outreach tools (email client)

### local-seo-optimizer
- Primary APIs: Google Business Profile, BrightLocal
- Moderate PostgreSQL usage (citation data)
- Requires manual GBP management

### seo-analytics-specialist
- Primary APIs: Google Analytics 4, Google Search Console, SE Ranking
- Heavy PostgreSQL usage (historical data)
- Requires data visualization tools (Google Data Studio)

### eeat-content-auditor
- Primary APIs: Knowledge Graph, LinkedIn (manual)
- Requires Copyscape, Grammarly, W3C Validator
- Heavy content analysis (manual review)

### competitive-seo-analyst
- Primary APIs: SE Ranking, Ahrefs, SEMrush
- Heavy PostgreSQL usage (competitor data)
- No external tools required

### schema-markup-engineer
- Primary API: Google Rich Results Test
- Light PostgreSQL usage (validation results)
- No external tools required
