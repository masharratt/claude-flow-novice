# Competitive Intelligence API Research

## BuzzSumo API

### Authentication
- **Type**: API Key-based authentication
- **Access**: Included with paid web app subscriptions
- **Documentation**: https://developers.buzzsumo.com/

### Endpoint URLs
- **Root URL**: https://api.buzzsumo.com/
- **Key Endpoints**:
  - Content discovery
  - Brand monitoring
  - Social media insights

### Rate Limits
- **Free Tier**: 100 calls to Search API
- **Paid Subscriptions**: 100K calls to Account API

### Key Fields
- `social_shares`
- `engagement_score`
- `author`
- `domain_authority`

## SEMrush API

### Authentication
- **Type**: OAuth 2.0
- **Token Endpoint**: https://oauth.semrush.com/dag/device/token
- **Authorization Flow**:
  1. Obtain device code
  2. User authorization via verification URI
  3. Token retrieval (7-day access token)
  4. Token refresh (30-day refresh token)

### Endpoint URLs
- **Root URL**: https://api.semrush.com
- **Key Endpoints**:
  - `/domain_rank`
  - `/organic_report`
  - `/backlinks`
  - `/site_audit`

### Rate Limits
- **Request Speed**: 10 requests/second from one IP
- **Concurrent Requests**: 10 simultaneous requests per user
- **Monthly Limit**: 10,000 requests (Trends API)

### Key Metrics
- Keyword rankings
- Organic search traffic
- Backlink profiles
- Competitive keyword insights

## Ahrefs API

### Authentication
- **Type**: API Token-based
- **Access**: Enterprise Plan Only
- **Authentication Method**: Bearer token in request headers

### Endpoint URLs
- **Key Endpoints**:
  - Domain Overview
  - Backlinks Analysis
  - Site Explorer
  - Keyword Research
  - Referring Domains

### Rate Limits
- **Monthly Units**: 2,000,000 API units per month (Enterprise Plan)
- **Additional Units**: 1,000,000 extra units for $500/year
- **Minimum Request Cost**: 50 API units

### Key Metrics
- Domain Rating (DR)
- Backlinks Count
- Organic Search Traffic
- Keyword Rankings
- Search Volume
- Keyword Difficulty (KD)

## Data Refresh Strategy

### Recommended Monitoring Workflow
- **Frequency**: Daily automated checks
- **Data Sources**: BuzzSumo, SEMrush, Ahrefs
- **Tracking Focus**:
  - Content performance
  - Keyword rankings
  - Backlink changes
  - Competitor content

### Implementation Considerations
- Use API tokens with appropriate rate limit management
- Implement exponential backoff for rate limit handling
- Store historical data for trend analysis
- Set up alerting for significant changes

**Confidence Score**: 0.92