# Knowledge Store Directory

This directory contains the file-based knowledge store for the Intelligence Curator Agent.

## Directory Structure

```
knowledge-store/
├── competitive-intelligence/   # Competitor analysis data
│   ├── {domain}/               # One directory per competitor domain
│   │   ├── content-strategy.json
│   │   ├── keyword-targeting.json
│   │   └── backlink-profile.json
├── serp-patterns/              # SERP feature patterns
│   ├── {keyword-hash}/         # SHA-256 hash of keyword
│   │   ├── featured-snippets.json
│   │   ├── people-also-ask.json
│   │   ├── related-searches.json
│   │   └── metadata.json
└── learning/                   # Captured learning data
    ├── successes/              # Successful content outcomes
    │   └── {timestamp}-{topic-hash}.json
    └── failures/               # Failed content outcomes
        └── {timestamp}-{topic-hash}.json
```

## Data Organization

### Competitive Intelligence

Each competitor domain gets a subdirectory with three JSON files:

- **content-strategy.json**: Average word count, keyword density, content types
- **keyword-targeting.json**: Primary/secondary keywords, search volumes
- **backlink-profile.json**: Total backlinks, domain authority, top referrers

Example path: `competitive-intelligence/example.com/content-strategy.json`

### SERP Patterns

SERP patterns are stored by keyword hash to avoid filesystem issues with special characters.

- **featured-snippets.json**: Array of snippet types and examples
- **people-also-ask.json**: Array of PAA questions
- **related-searches.json**: Array of related search terms
- **metadata.json**: Keyword text and capture timestamp

Example path: `serp-patterns/a3b2c1d4.../featured-snippets.json`

### Learning Outcomes

Learning captures are stored by timestamp and topic hash, separated by outcome.

- **successes/**: Positive outcomes with lessons learned
- **failures/**: Negative outcomes with what to avoid

Each file contains:
- Outcome type (success/failure)
- Topic and target keyword
- Context (approach, metrics)
- Lessons learned
- Recommendations for future

Example path: `learning/successes/2025-12-01T12-00-00-000Z-a3b2c1d4.json`

## File Naming Conventions

| Type | Pattern | Example |
|------|---------|---------|
| Domain | Sanitized domain name | `example.com` or `my_domain_com` |
| Keyword Hash | SHA-256 hash (lowercase) | `a3b2c1d4e5f6...` |
| Timestamp | ISO 8601 with hyphens | `2025-12-01T12-00-00-000Z` |
| Topic Hash | First 8 chars of SHA-256 | `a3b2c1d4` |

## Usage

The Intelligence Curator Agent automatically manages this directory structure.

### Reading Intelligence

```typescript
import { intelligenceCurator } from '@cfn/seo-research-service';

const result = await intelligenceCurator.loadIntelligence({
  targetKeyword: 'typescript',
  includeHistorical: true
});

console.log(`Loaded ${result.competitive.length} competitors`);
console.log(`Found ${result.serpPatterns.length} SERP patterns`);
console.log(`Retrieved ${result.learnings.length} historical learnings`);
```

### Writing Intelligence

```typescript
import {
  intelligenceCurator,
  CompetitiveIntelligence,
  SERPPattern,
  LearningCapture
} from '@cfn/seo-research-service';

// Store competitive data
await intelligenceCurator.storeCompetitiveIntelligence(competitiveData);

// Store SERP patterns
await intelligenceCurator.storeSerpPattern(serpPattern);

// Capture learning outcome
await intelligenceCurator.captureLearning(learning);
```

## Data Retention

- Competitive intelligence: Refreshed periodically (default: 30 days)
- SERP patterns: Refreshed when stale (default: 30 days)
- Learning outcomes: Permanent (manually pruned if needed)

## Migration and Backup

To backup the knowledge store:

```bash
tar -czf knowledge-store-backup-$(date +%Y%m%d).tar.gz knowledge-store/
```

To restore from backup:

```bash
tar -xzf knowledge-store-backup-20251201.tar.gz
```

## Performance

The file-based approach is suitable for:
- Prototyping and development
- Small to medium datasets (< 10,000 items)
- Single-server deployments

For production scale, consider:
- Vector database (RuVector) for semantic search
- Redis for fast lookup
- PostgreSQL for structured queries

## Security

- No sensitive data should be stored in knowledge-store
- Sanitize all domain names and keywords before storage
- Use `.gitignore` to exclude sensitive competitive data if needed

## See Also

- [Intelligence Curator Implementation](../lib/intelligence-curator.ts)
- [Type Definitions](../types/index.ts)
- [Test Suite](../lib/__tests__/intelligence-curator.test.ts)
- [Main README](../README.md#part-3-intelligence-curator-agent-phase-1-sprint-2)
