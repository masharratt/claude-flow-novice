# A/B Testing Platform API Research

## Unbounce API

### A/B Testing Capabilities
- Split testing for landing pages
- Variant configuration and tracking
- Conversion rate optimization

### API Authentication
- OAuth credentials granted case-by-case
- Supports HTTP Request node integrations

### Endpoint Features
- Lead generation tracking
- Conversion event monitoring
- Page variation management

### Conversion Tracking Details
- **Tracking Window**: 72-hour visitor cookie
- **Cross-domain Tracking**: Limited (primarily GET requests)
- **Tracking Mechanism**:
  1. Detect Unbounce visitor cookie
  2. Send tracking request to Unbounce servers
  3. Attribute conversion to specific page variant

## Instapage API

### A/B Testing Configuration
- Single URL with multiple variations
- Random traffic distribution
- Visitor-level variation tracking

### Conversion Tracking Methodology
- URL parameter passing
  - Pageversion
  - Page ID
  - A/B Variation ID
- Google Tag Manager integration
- External conversion tracking support

## Statistical Significance Methodology

### Sample Size Calculation
Formula: n = (Z²pq) / e²
- Z = Z-score (1.96 for 95% confidence)
- p = Expected conversion rate
- q = 1 - p
- e = Margin of error

### Minimum Requirements
- **Confidence Level**: 95%
- **Minimum Sample Size**:
  - 100 visitors per variant
  - Minimum 7-day test duration
- **Statistical Power**: 80%

### Winner Declaration Criteria
1. Confidence level ≥ 95%
2. Minimum sample size met
3. Practical significance threshold
4. Consistent performance across key metrics

### Best Practices
- Account for weekly traffic patterns
- Use Bayesian or Frequentist statistical methods
- Monitor for statistical significance
- Avoid premature test termination

### Recommended Tools
- Unbounce A/B Testing
- Instapage Experiments
- Google Optimize
- VWO (Visual Website Optimizer)

### Implementation Workflow
1. Define clear hypothesis
2. Create page variants
3. Set up tracking
4. Run experiment
5. Collect and analyze data
6. Declare winner or iterate

### Error Prevention
- Avoid multiple simultaneous tests
- Ensure consistent traffic sources
- Use robust statistical methods
- Account for seasonal variations

**Confidence Score**: 0.90