# TodoWrite Batching Validator

Automated validation system that detects and warns about TodoWrite anti-patterns where multiple small calls are made instead of a single batched call.

## Overview

The TodoWrite Batching Validator tracks TodoWrite calls within a sliding time window and detects when agents make multiple small calls instead of batching all todos in a single call.

### Anti-Pattern (Bad)
```typescript
TodoWrite([{ content: "Task 1", ... }])  // Call 1
TodoWrite([{ content: "Task 2", ... }])  // Call 2
TodoWrite([{ content: "Task 3", ... }])  // Call 3

// ⚠️ Warning: 3 calls within 5 minutes
```

### Best Practice (Good)
```typescript
TodoWrite([
  { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
  { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
  { content: "Task 3", status: "pending", activeForm: "Doing task 3" },
  { content: "Task 4", status: "pending", activeForm: "Doing task 4" },
  { content: "Task 5", status: "pending", activeForm: "Doing task 5" }
])

// ✅ Success: 5+ items in single batched call
```

## Architecture

### Core Components

1. **TodoWriteValidator** (`todowrite-batching-validator.ts`)
   - Main validation class
   - Tracks call frequency in sliding time window
   - Configurable thresholds and warnings

2. **Integration Layer** (`todowrite-integration.ts`)
   - CLI flag support (`--validate-batching`)
   - Environment variable configuration
   - Express middleware for HTTP APIs
   - Tool integration helpers

3. **Test Suite** (`tests/validators/todowrite-batching-validator.test.ts`)
   - Comprehensive unit tests
   - Real-world scenario validation
   - Edge case coverage

## Usage

### Basic Usage

```typescript
import { TodoWriteValidator } from './validators';

const validator = new TodoWriteValidator();

// Validate a TodoWrite call
const todos = [
  { content: "Task 1", status: "pending", activeForm: "Doing task 1" },
  { content: "Task 2", status: "pending", activeForm: "Doing task 2" },
  // ... more todos
];

const result = validator.validateBatching(todos);

if (!result.isValid) {
  console.warn('Anti-pattern detected:', result.warnings);
  console.warn('Recommendations:', result.recommendations);
}
```

### CLI Integration

```bash
# Enable validation
npx claude-flow-novice task --validate-batching

# Enable strict mode (throw error on anti-pattern)
npx claude-flow-novice task --validate-batching --strict

# Custom configuration
npx claude-flow-novice task --validate-batching \
  --threshold 3 \
  --time-window 600000 \
  --min-items 10
```

### Environment Variables

```bash
# Enable globally
export VALIDATE_TODOWRITE_BATCHING=true

# Enable strict mode
export TODOWRITE_STRICT_MODE=true

# Enable verbose logging
export TODOWRITE_VERBOSE=true
```

### Programmatic Integration

```typescript
import { validateTodoWrite } from './validators';

// In your TodoWrite implementation
function todoWrite(todos: Todo[]) {
  // Validate first
  const result = validateTodoWrite(todos, {
    enabled: true,
    strictMode: false,
    verbose: true
  });

  if (result && !result.isValid) {
    // Handle validation warning
  }

  // Proceed with actual TodoWrite
  // ...
}
```

## Configuration

### Default Configuration

```typescript
{
  timeWindowMs: 300000,        // 5 minutes
  callThreshold: 2,            // 2+ calls trigger warning
  strictMode: false,           // Warn instead of error
  minRecommendedItems: 5,      // Recommend 5+ items per call
  verbose: false               // Quiet mode
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeWindowMs` | number | 300000 | Time window in milliseconds (5min) |
| `callThreshold` | number | 2 | Number of calls before warning |
| `strictMode` | boolean | false | Throw error instead of warning |
| `minRecommendedItems` | number | 5 | Recommended items per call |
| `verbose` | boolean | false | Enable detailed logging |

## Validation Process

### 1. Call Tracking
```typescript
// Each TodoWrite call is logged with timestamp and item count
{
  timestamp: 1735567890000,
  count: 3,
  callIndex: 1
}
```

### 2. Window Cleanup
```typescript
// Calls older than timeWindowMs are automatically removed
callLog = callLog.filter(entry =>
  now - entry.timestamp < timeWindowMs
);
```

### 3. Anti-Pattern Detection
```typescript
// Warning triggered when callCount >= threshold
if (callLog.length >= callThreshold) {
  // Display warning with statistics
  // Provide actionable recommendations
}
```

### 4. Validation Result
```typescript
{
  isValid: false,
  callCount: 3,
  totalItems: 7,
  averageItemsPerCall: 2.33,
  warnings: [...],
  recommendations: [...]
}
```

## Warning Output

When an anti-pattern is detected, the validator displays:

```
⚠️ TODOWRITE BATCHING ANTI-PATTERN DETECTED

You have made 3 TodoWrite calls in the last 5 minutes.

Best Practice: Batch ALL todos in SINGLE TodoWrite call with 5-10+ items.

Current calls (within 5min window):
  1. Call #1: 2 items (3m ago)
  2. Call #2: 3 items (1m ago)
  3. Call #3: 2 items (0s ago)

Statistics:
  - Total calls: 3
  - Total items: 7
  - Average items per call: 2.33
  - Recommended: 1 call with 5+ items

Impact:
  - Multiple calls waste API resources
  - Harder to track task relationships
  - Violates "1 MESSAGE = ALL RELATED OPERATIONS" principle

See CLAUDE.md: "TodoWrite batching requirement"
```

## Test Coverage

Comprehensive test suite covering:

- ✅ Single batched calls (best practice)
- ✅ Multiple calls anti-pattern detection
- ✅ Time window management and cleanup
- ✅ Strict mode error throwing
- ✅ Configuration customization
- ✅ Statistics tracking
- ✅ Global singleton pattern
- ✅ Verbose logging mode
- ✅ Edge cases and error handling
- ✅ Real-world scenarios

Run tests:
```bash
npm test tests/validators/todowrite-batching-validator.test.ts
```

## Integration Points

### 1. TodoWrite Tool Hook
```typescript
// Hook into TodoWrite before execution
function todoWriteImpl(todos: Todo[]) {
  getGlobalValidator().validateBatching(todos);
  // ... actual implementation
}
```

### 2. CLI Command Integration
```typescript
// Add flag to CLI commands
program
  .option('--validate-batching', 'Enable TodoWrite batching validation')
  .option('--strict', 'Use strict validation mode');
```

### 3. Express Middleware
```typescript
import { createValidationMiddleware } from './validators';

app.use('/api/todos', createValidationMiddleware({
  enabled: true,
  strictMode: true
}));
```

### 4. Pre-Command Hook
```bash
# Validate before executing command
npx claude-flow-novice hooks pre-command \
  --command "todowrite" \
  --validate-batching
```

## Best Practices

### DO ✅
- Batch ALL todos in SINGLE call with 5-10+ items
- Plan all tasks upfront before calling TodoWrite
- Use meaningful content and activeForm for each todo
- Follow the "1 MESSAGE = ALL RELATED OPERATIONS" principle

### DON'T ❌
- Make multiple small TodoWrite calls in sequence
- Add todos incrementally as you think of them
- Split logically related todos across multiple calls
- Ignore validator warnings

## Performance Impact

- **Minimal overhead**: ~0.1ms per validation call
- **Memory efficient**: Only tracks calls within time window
- **Automatic cleanup**: Old entries removed automatically
- **No external dependencies**: Pure TypeScript implementation

## Future Enhancements

Potential improvements for future versions:

1. **Machine Learning**: Learn project-specific patterns
2. **Auto-batching**: Automatically batch pending calls
3. **Integration Dashboard**: Visual analytics of TodoWrite patterns
4. **Team Metrics**: Track batching compliance across team
5. **Custom Rules**: Project-specific validation rules

## Support

For issues or questions:
- Review CLAUDE.md: "TodoWrite batching requirement"
- Check test suite for usage examples
- Review validation warnings for specific guidance
- Open issue if validation behavior seems incorrect

## License

MIT License - See project LICENSE file
