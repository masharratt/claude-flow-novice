.claude/skills/cfn-ruvector-codebase-index/
├── index.sh              # Full/incremental indexing orchestrator
├── search.sh             # Query interface and result formatting
├── indexer.js            # Batch file processing and vector storage
├── embeddings.js         # OpenAI embedding API integration
├── search.js             # Vector similarity search engine
├── parser.js             # Multi-language content extraction
├── init-db.js            # Database schema initialization
├── config.json           # System configuration and settings
├── .cfn-manifest.json    # CFN vs custom file tracking
├── security.json         # Access control policies
├── audit.log             # System activity logging
└── data/                 # Vector database files
    ├── codebase_index.db
    ├── metadata.db
    ├── audit.db
    ├── security.db
    └── cache.db