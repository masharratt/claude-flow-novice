# Date and Time Handling Rules

## Storage Format

### Rule: Always UTC
```typescript
// Store as UTC
const createdAt = new Date().toISOString(); // "2024-01-15T10:30:00.000Z"
```

### Database Columns
| Type | Format | Example |
|------|--------|---------|
| Timestamps | `TIMESTAMPTZ` (Postgres) | `2024-01-15T10:30:00.000Z` |
| Dates only | `DATE` | `2024-01-15` |
| Duration | Integer (milliseconds) | `3600000` |

### Never Store
- Local timezone strings
- Unix timestamps without timezone context
- Formatted date strings (`01/15/2024`)

## API Format

### ISO 8601 Required
```json
{
  "created_at": "2024-01-15T10:30:00.000Z",
  "expires_at": "2024-01-15T11:30:00.000Z",
  "date": "2024-01-15"
}
```

### Rules
1. **Timestamps**: Full ISO 8601 with `Z` suffix (UTC)
2. **Date-only**: `YYYY-MM-DD` format
3. **Duration**: ISO 8601 duration or milliseconds
   - ISO: `PT1H30M` (1 hour 30 minutes)
   - Milliseconds: `5400000`

### Request Parsing
```typescript
function parseDate(input: string): Date {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid date format: ${input}`);
  }
  return date;
}
```

## Display Formatting

### Rule: Format at presentation layer only
```typescript
// API returns UTC
const response = { created_at: "2024-01-15T10:30:00.000Z" };

// Client formats for display
const localTime = new Date(response.created_at).toLocaleString('en-US', {
  timeZone: userTimezone,
});
```

### Common Formats
| Use Case | Format | Example |
|----------|--------|---------|
| Log timestamps | ISO 8601 | `2024-01-15T10:30:00.000Z` |
| User display (date) | Localized | `January 15, 2024` |
| User display (datetime) | Localized | `Jan 15, 2024, 10:30 AM` |
| File names | Compact | `20240115_103000` |

## Timezone Handling

### Server-Side: UTC Only
```typescript
// Always use UTC on server
const now = new Date(); // Already UTC internally
const isoString = now.toISOString();
```

### Client-Side: Convert for Display
```typescript
// User's timezone from profile or browser
const userTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

function formatForUser(utcDate: string, timezone: string): string {
  return new Date(utcDate).toLocaleString('en-US', { timeZone: timezone });
}
```

### Scheduling with Timezones
```typescript
// Store user's intended timezone alongside the time
interface ScheduledEvent {
  scheduledAt: string;  // UTC ISO string
  timezone: string;     // User's intended timezone (e.g., "America/New_York")
}
```

## Duration Handling

### Storage
```typescript
// Store as milliseconds
const durationMs = 3600000; // 1 hour
```

### API Representation
```json
{
  "timeout_ms": 30000,
  "duration": "PT30M",
  "estimated_duration": "2h 30m"
}
```

### Parsing
```typescript
function parseDuration(input: string): number {
  // Handle ISO 8601 duration
  const isoMatch = input.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (isoMatch) {
    const [, h, m, s] = isoMatch;
    return ((parseInt(h || '0') * 60 + parseInt(m || '0')) * 60 + parseInt(s || '0')) * 1000;
  }

  // Handle milliseconds
  const ms = parseInt(input, 10);
  if (!isNaN(ms)) return ms;

  throw new Error(`Invalid duration: ${input}`);
}
```

## Comparison and Arithmetic

### Safe Comparison
```typescript
// Compare as Date objects or timestamps
const isExpired = new Date(expiresAt).getTime() < Date.now();
const isAfter = new Date(dateA) > new Date(dateB);
```

### Date Arithmetic
```typescript
// Add duration
function addMs(date: Date, ms: number): Date {
  return new Date(date.getTime() + ms);
}

// Add calendar units (use a library for month/year)
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
```

## Validation

### Input Validation
```typescript
function validateDateInput(input: unknown): Date {
  if (typeof input !== 'string') {
    throw new Error('Date must be a string');
  }

  // Must be ISO 8601
  if (!/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?Z)?$/.test(input)) {
    throw new Error('Date must be ISO 8601 format');
  }

  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid date');
  }

  return date;
}
```

### Range Validation
```typescript
function validateDateRange(start: Date, end: Date): void {
  if (start >= end) {
    throw new Error('Start date must be before end date');
  }

  const maxRange = 365 * 24 * 60 * 60 * 1000; // 1 year
  if (end.getTime() - start.getTime() > maxRange) {
    throw new Error('Date range exceeds maximum of 1 year');
  }
}
```

## Test Requirements

### Required Test Cases
1. ISO 8601 parsing (with/without milliseconds)
2. ISO 8601 with Z suffix
3. Invalid date format rejection
4. UTC storage verification
5. Timezone conversion accuracy
6. Duration parsing (ISO and ms)
7. Date arithmetic across DST boundaries
8. Leap year handling
9. Date comparison edge cases
10. Future/past date validation

### Test Utilities
```typescript
// Freeze time for deterministic tests
function withFrozenTime(date: string, fn: () => void): void {
  const original = Date.now;
  Date.now = () => new Date(date).getTime();
  try {
    fn();
  } finally {
    Date.now = original;
  }
}
```

## Anti-Patterns to Avoid

| Anti-Pattern | Correct Approach |
|--------------|------------------|
| `new Date().toString()` | `new Date().toISOString()` |
| Storing `MM/DD/YYYY` | Store ISO 8601 |
| Local time in DB | Always UTC |
| String comparison | Compare Date objects |
| Manual timezone math | Use library or `Intl` |
| Ignoring leap seconds | Use Date objects |
