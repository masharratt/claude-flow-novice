# Loop 2 Output Processing Skill

## Purpose
Extract and structure feedback from Loop 2 validator agents, focusing on consensus assessment and actionable feedback categorization.

## Workflow
1. Spawn validator agent
2. Capture raw agent output
3. Parse and extract:
   - Confidence score
   - Feedback categories (critical, warning, suggestion)
4. Validate output structure
5. Prepare structured JSON for orchestrator

## Parsing Rules
- Confidence Calculation
  - Explicit percentage preferred
  - Fallback to natural language interpretation
  - Range: 0.0 - 1.0
  - Precision: 2 decimal places

## Feedback Categories
- **CRITICAL**:
  - Blocking issues
  - Security vulnerabilities
  - Fundamental functionality breaks
  - Must be addressed before proceeding

- **WARNING**:
  - Important non-blocking issues
  - Performance concerns
  - Maintainability problems
  - High-priority improvements

- **SUGGESTION**:
  - Optional improvements
  - Code style recommendations
  - Minor optimizations
  - No immediate impact on functionality

## Integration
- Called by CFN Loop orchestrator
- Provides structured input for Product Owner decision
- Zero-token waiting mode compatible
- Supports multiple iterations

## Testing Strategy
- Comprehensive unit tests
- Edge case coverage
- Simulated agent outputs
- Performance validation

## Performance Metrics
- Extraction time: <100ms
- Memory usage: <10MB
- Failure rate: <0.01%

## Security Considerations
- No external API calls
- Stateless processing
- Sanitized input handling