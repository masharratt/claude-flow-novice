# Epic Configuration Specification

## Overview

Epic configurations are JSON files that describe the structure, phases, goals, and execution strategy for an epic in the CFN (Collaborative Flow Novice) methodology.

## Structure

### Top-Level Fields

```json
{
  "epicId": "string",                 // Unique identifier for the epic
  "name": "string",                   // Human-readable epic name
  "description": "string",            // Detailed description of epic goals
  "status": "string",                 // Current epic status (e.g., "not_started", "in_progress")
  "priority": "string",               // Epic priority level
  "estimatedDuration": "string",      // Expected time to complete the epic

  "backlog": [                        // NEW: Optional backlog of deferred items
    {
      "id": "string",                 // Unique backlog item identifier
      "description": "string",        // Detailed description of the backlog item
      "priority": "low|medium|high",  // Priority of the backlog item
      "source": "string",             // Origin or related phase/context
      "deferredAt": "ISO8601 timestamp", // When the item was deferred
      "reason": "string"              // Why the item is not currently being pursued
    }
  ],

  "phases": [                         // Existing phase structure remains unchanged
    {
      "phaseId": "string",
      "name": "string",
      "description": "string",
      ...
    }
  ]
}
```

### Backlog Array Details

The new `backlog` array allows teams to track items that are:
- Not critical for current epic completion
- Potential future enhancements
- Out of current scope but valuable
- Require additional research or dependency resolution

#### Recommended Usage

1. Use meaningful, unique `id` values
2. Provide clear, actionable descriptions
3. Set appropriate priority levels
4. Link backlog items to their source context
5. Include a timestamp of when the item was deferred
6. Explain why the item is not currently being pursued

## Best Practices

- Keep backlog items concise and specific
- Regularly review and update the backlog
- Consider moving backlog items to active phases when appropriate
- Use backlog as a planning and communication tool

## Example

```json
{
  "backlog": [
    {
      "id": "backlog-001",
      "description": "Implement multi-factor authentication",
      "priority": "high",
      "source": "phase-2-security",
      "deferredAt": "2025-10-13T14:30:00Z",
      "reason": "Postponed to focus on core authentication flow"
    }
  ]
}
```

## Validation Recommendations

Implement JSON schema validation to ensure:
- Required fields are present
- Timestamps are valid ISO8601 format
- Priority is one of "low", "medium", "high"
- `id` values are unique within the backlog array

## Version History

- 2025-10-17: Added `backlog` array specification