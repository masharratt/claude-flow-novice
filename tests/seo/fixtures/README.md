# SEO Test Fixtures

This directory contains mock data fixtures for SEO onboarding pipeline tests.

## Structure

```
fixtures/
├── phase1-technical.json     # Phase 1: Technical audit outputs
├── phase2-content.json        # Phase 2: Content inventory outputs
├── phase3-competitors.json    # Phase 3: Competitor analysis outputs
├── phase4-keywords.json       # Phase 4: Keyword universe outputs
├── phase5-gaps.json          # Phase 5: Gap analysis outputs
├── phase6-strategy.json      # Phase 6: Strategy outputs
├── phase7-roadmap.json       # Phase 7: Roadmap outputs
├── complete-pipeline.json    # All phases combined
└── ruvector-patterns.json    # Pattern extraction fixtures
```

## Usage

Load fixtures in test files:

```bash
# Load Phase 1 fixture
PHASE1_DATA=$(cat "$PROJECT_ROOT/tests/seo/fixtures/phase1-technical.json")

# Load complete pipeline
COMPLETE_DATA=$(cat "$PROJECT_ROOT/tests/seo/fixtures/complete-pipeline.json")
```

## Maintenance

- Update fixtures when phase schemas change
- Keep fixtures realistic but minimal
- Use consistent domain names (test-site.com)
- Include edge cases and error scenarios
