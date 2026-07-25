---
description: "Update CodeSearch search index automatically"
---

# /update-search-index - Refresh Search Index

Runs incremental CodeSearch index update. For full rebuild, use `/codebase-reindex --force`. This command is a convenience alias for the cfn-codesearch reindex functionality.

See `/cfn-codesearch:cfn-codebase-reindex` for the full implementation, including OpenAI key validation, binary resolution, and logging.