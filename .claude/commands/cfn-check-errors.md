---
description: "Check for similar past errors before implementing"
argument-hint: "<task description>"
---

# /check-errors - Learn from Past Mistakes

Queries the error pattern database to avoid repeating issues.

## Usage

```bash
/check-errors "implementing user authentication"
/check-errors "adding database migration"
/check-errors "fixing memory leak"
```

## What it returns

- Similar errors that occurred in the past
- How they were fixed
- What to avoid when implementing your task

## Example

```bash
/check-errors "adding Redis cache"
```

Might return:
- Previous issues with Redis connection timeouts
- Solutions that worked (connection pooling, retries)
- Common pitfalls to avoid
```