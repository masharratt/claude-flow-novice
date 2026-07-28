# VERIFY workbench

Acceptance criteria for the workbench render skill.

## Acceptance Criteria

| id | check | kind | pass | maps_to |
|----|-------|------|------|---------|
| AC1 | Renders 5-col table without reference column | functional | yes | REQ-1 |
| AC2 | Escapes script tag in check cell <script>alert(1)</script> | security | yes | REQ-2 |
| AC3 | Tolerates missing data sources | robustness | yes | REQ-3 |

## Notes

This is a 5-column variant. No reference column.

```json
{
  "acs": [
    {"id": "AC1", "status": "pass", "evidence": "test-render.sh green"},
    {"id": "AC2", "status": "pass", "evidence": "<script>alert(1)</script> escaped in output"},
    {"id": "AC3", "status": "pass", "evidence": "missing sources recorded as gaps"}
  ]
}
```
