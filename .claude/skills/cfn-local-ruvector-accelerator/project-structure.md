# Project-Specific Local RuVector Structure

## Current (Global) Structure:
```
~/.local-ruvector/
├── storage/
├── indexes/
└── config/
```

## Proposed Project-Specific Structure:
```
.your-project/
├── .ruvector/
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
# Instead of ~/.local-ruvector
./init-local-ruvector.sh --project-path /path/to/project

# Or detect current directory
./init-local-ruvector.sh --here
```

### 2. Update index and query scripts:
```bash
# Auto-detect .ruvector directory
# Fall back to parent directories
# Respect .gitignore for .ruvector/
```

### 3. Add .gitignore entry:
```
# .gitignore
.ruvector/
```

### 4. Benefits:
- Patterns travel with the project
- Team members can share patterns
- No global state pollution
- Works with monorepos (each subproject has own patterns)
- Easy to clean up (just delete .ruvector/)