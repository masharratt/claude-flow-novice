# VERIFY workbench 9col

Acceptance criteria for the workbench render skill with reference column.

## Acceptance Criteria

| id | check | kind | pass | evidence | maps_to | requires | trigger | reference |
|----|-------|------|------|----------|---------|----------|----------|-----------|
| AC1 | Renders 9-col table with reference column | functional | yes | test green | REQ-1 | n/a | manual | docs/ref.md |
| AC2 | Escapes script tag in evidence cell | security | yes | <script>alert(1)</script> | REQ-2 | n/a | auto | docs/xss.md |
| AC3 | Parses header by name not index | robustness | yes | both fixtures pass | REQ-3 | n/a | auto | docs/parser.md |

## Notes

This is a 9-column variant. Reference column is present.

```json
{
  "acs": [
    {"id": "AC1", "status": "pass", "evidence": "test-render.sh green"},
    {"id": "AC2", "status": "pass", "evidence": "<script>alert(1)</script> escaped"},
    {"id": "AC3", "status": "pass", "evidence": "header-name mapping works"}
  ]
}
```
