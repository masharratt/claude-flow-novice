# RuVector Codebase Search Architecture

Semantic codebase search using vector embeddings for fast file discovery.

## Components

```
.claude/skills/cfn-ruvector-codebase-index/
├── index.sh        # Full/incremental indexing
├── search.sh       # Query interface
├── indexer.js      # Batch file processor
├── embeddings.js   # OpenAI embedding calls
├── search.js       # Vector similarity search
├── parser.js       # File content extraction
├── init-db.js      # Database initialization
├── config.json     # Settings (db path, extensions)
├── .cfn-manifest.json  # CFN vs custom file tracking
└── data/           # Vector database files
```

## Data Flow

```
1. index.sh --full
   → Find files matching extensions
   → parser.js extracts content
   → embeddings.js generates vectors (OpenAI text-embedding-3-small)
   → indexer.js stores in @ruvector/core database

2. search.sh "query"
   → embeddings.js generates query vector
   → search.js finds similar vectors
   → Returns ranked file paths with scores
```

## Database

Uses `@ruvector/core` (redb format):
- Collection: `codebase_index`
- Dimensions: 1536 (OpenAI embedding size)
- Storage: `.claude/skills/cfn-ruvector-codebase-index/data/`

## Commands

```bash
# Full reindex (first time or major changes)
./.claude/skills/cfn-ruvector-codebase-index/index.sh --full

# Incremental (git changes only)
/cfn-ruvector:codebase-reindex

# Search
./.claude/skills/cfn-ruvector-codebase-index/search.sh "authentication" --top 5
```

## Manifest System

`.cfn-manifest.json` tracks file ownership:

```json
{
  "cfn_files": ["search.js", "index.sh", ...],
  "protected_files": ["config.json", "data/*"],
  "notes": "Unlisted files are custom, never overwritten"
}
```

**Update behavior**:
- `cfn_files`: Overwritten by CFN updates
- `protected_files`: Never touched
- Unlisted: Custom files, preserved

## Distribution

When distributing to other projects:
1. Copy `cfn_files` only
2. Preserve existing `config.json` and `data/`
3. Add `.cfn-manifest.json` for tracking

## TypeScript Module

Integrated in `src/ruvector/`:

```typescript
import { RuVectorIndex, createOpenAIProvider } from 'claude-flow-novice';

const provider = createOpenAIProvider({ apiKey: process.env.OPENAI_API_KEY });
const index = new RuVectorIndex({ dbPath: './data', embeddingProvider: provider });

await index.indexDirectory('./src');
const results = await index.search('authentication logic', 5);
```

## Environment

Requires one of:
- `OPENAI_API_KEY`
- `ZAI_API_KEY` (routes to OpenAI-compatible endpoint)

## Performance

- Index: ~100 files/minute (depends on file size)
- Search: <100ms for query
- Storage: ~1KB per file indexed
