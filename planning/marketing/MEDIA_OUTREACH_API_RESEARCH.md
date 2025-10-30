# Media Outreach API Research

## Muck Rack API

### Key Findings
- Available as an add-on for Premier customers
- Provides programmatic access to article and broadcast searches
- **API Availability**: Requires direct contact with Muck Rack for API access

### Potential Search Filters
- Journalist beat
- Media outlet
- Topic
- Geographic location

### Key Fields
- `journalist_id`
- `beat`
- `outlet`
- `twitter_handle`
- `email`
- `influence_score`

### Authentication
- Likely requires direct customer engagement
- OAuth or API key authentication (to be confirmed)

## Mailshake API

### Authentication
- API Key-based authentication
- Base URL: https://api.mailshake.com/2017-04-01
- Authentication method: Simple API key
- Rate Limit: 1000 API calls per minute per account

### Pitch Tracking Endpoints
1. **Opens Endpoint**
   - Returns paginated Open models
   - Tracks email open events

2. **Clicks Endpoint**
   - Returns paginated Click models
   - Tracks link click events

### Key Tracking Metrics
- Email open rates
- Link click-through rates
- Personalization variables tracking
- Response tracking

## HARO (Help a Reporter Out) API

### API Characteristics
- Query retrieval endpoints
- Response submission capabilities
- Strict usage limits:
  - Estimated 2-5 queries per day
  - Response time target: <2 hours from query publication

### Authentication
- Likely requires API token
- Direct registration with HARO required

## Comparative Analysis

| Platform    | Authentication | Query Limit | Response Time | Key Capabilities                   |
|-------------|----------------|-------------|--------------|-------------------------------------|
| Muck Rack   | Custom         | Unlimited   | N/A          | Journalist database search          |
| Mailshake   | API Key        | 1000/min    | N/A          | Pitch tracking, email engagement    |
| HARO        | API Token      | 2-5/day     | <2 hours     | Journalist query matching           |

## Outreach Strategy Metrics
- Target: 500+ journalist database
- Goal: ≥15% response rate
- Personalization variables support
- Multi-platform integration

## Recommended Next Steps
1. Contact each platform for detailed API documentation
2. Request developer credentials
3. Develop integration proof-of-concept
4. Performance and reliability testing

## Confidence Score: 0.70
- Incomplete API documentation
- Requires further verification with platform representatives
- Some platforms require direct engagement for full API details