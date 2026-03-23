# Project-Specific Local CodeSearch Structure

## Current (Global) Structure:
```
~/.local-codesearch/
├── storage/
├── indexes/
└── config/
```

## Proposed Project-Specific Structure:
```
.your-project/
├── .codesearch/
│   ├── storage/
│   │   ├── embeddings.bin
│   │   └── cache.db
│   ├── indexes/
│   └── config/
│       └── settings.json
└── .gitignore
```

## Changes Needed:

### 1. Update init script to accept project path:
```bash
# Instead of ~/.local-codesearch
./init-local-codesearch.sh --project-path /path/to/project

# Or detect current directory
./init-local-codesearch.sh --here
```

### 2. Update index and query scripts:
```bash
# Auto-detect .codesearch directory
# Fall back to parent directories
# Respect .gitignore for .codesearch/
```

### 3. Add .gitignore entry:
```
# .gitignore
.codesearch/
```

### 4. Benefits:
- Patterns travel with the project
- Team members can share patterns
- No global state pollution
- Works with monorepos (each subproject has own patterns)
- Easy to clean up (just delete .codesearch/)