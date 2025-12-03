# KeywordResearchCollection Test Examples

## Test Execution Overview

All 54 tests follow London School TDD principles with explicit focus on object collaboration, behavior contracts, and mock verification.

## Pattern Examples

### Pattern 1: Basic CRUD Operation Test

```typescript
describe('add()', () => {
  it('should create keyword research with all fields', async () => {
    // ARRANGE: Prepare test data with all required fields
    const keyword: KeywordResearch = {
      id: 'kr-001',
      primaryKeyword: 'machine learning basics',
      relatedKeywords: ['ML introduction', 'deep learning intro'],
      searchVolume: 12500,
      difficulty: 45,
      cpc: 2.35,
      trend: 'rising',
      niche: 'technology',
      clusterId: 'cluster-tech-001',
      searchIntent: 'informational',
      topResults: [
        { url: 'https://example.com/1', title: 'Guide to ML', authority: 0.85 },
      ],
      competitorAnalysis: { /* ... */ },
      contentRequirements: { /* ... */ },
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    };

    // ACT: Execute the operation
    await collection.add(keyword);

    // ASSERT: Verify the result
    const retrieved = await collection.getById('kr-001');
    expect(retrieved).toEqual(keyword);
  });
});
```

### Pattern 2: Filter and Search Test

```typescript
describe('search()', () => {
  it('should filter by searchIntent', async () => {
    // ARRANGE: Set up test data with various search intents
    await collection.add({
      id: 'kr-1',
      searchIntent: 'transactional',
      // ... other fields
    });

    // ACT: Perform filtered search
    const results = await collection.search('keyword', {
      searchIntent: 'transactional',
      limit: 10,
    });

    // ASSERT: Verify all results match filter
    expect(results.every(r => r.searchIntent === 'transactional')).toBe(true);
  });
});
```

### Pattern 3: Interaction Verification (London School)

```typescript
describe('London School interaction contracts', () => {
  it('should collaborate with vectorDB for add operations', async () => {
    // ARRANGE: Spy on vectorDB method
    const dbSpy = jest.spyOn(mockDb, 'add');

    // ACT: Trigger collection operation
    await collection.add({
      id: 'kr-contract-001',
      // ... fields
    });

    // ASSERT: Verify collaboration contract
    expect(dbSpy).toHaveBeenCalledTimes(1);
    expect(dbSpy).toHaveBeenCalledWith(
      'kr-contract-001',
      expect.any(Object),  // metadata
      expect.any(Array)     // embedding
    );
  });
});
```

### Pattern 4: Date-Based Freshness Calculation

```typescript
describe('hasFreshResearch()', () => {
  it('should calculate freshness score as 1 - (days_since_creation / 90)', async () => {
    // ARRANGE: Create keyword and mock Date
    const createdAt = new Date('2024-01-01');
    const keyword: KeywordResearch = {
      id: 'kr-freshness-001',
      createdAt: createdAt,
      // ... other fields
    };

    // Mock Date to be 30 days after creation
    // Freshness = 1 - (30/90) = 0.667
    const mockDate = new Date('2024-01-31');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

    // ACT: Add and check freshness
    await collection.add(keyword);
    const isFresh = await collection.hasFreshResearch('kr-freshness-001', 0.6);

    // ASSERT: Verify calculation
    expect(isFresh).toBe(true);  // 0.667 >= 0.6

    // CLEANUP: Restore original Date
    global.Date = originalDate;
  });
});
```

### Pattern 5: Nested Object Preservation

```typescript
describe('update()', () => {
  it('should preserve other fields during partial update', async () => {
    // ARRANGE: Add entry with nested objects
    const original: KeywordResearch = {
      id: 'kr-update-001',
      cpc: 2.0,
      competitorAnalysis: {
        topCompetitors: ['comp1.com'],
        contentGaps: ['gap1'],
        opportunityScore: 0.6,
      },
      // ... other fields
    };
    await collection.add(original);
    const originalCpc = (await collection.getById('kr-update-001'))!.cpc;

    // ACT: Update only difficulty field
    await collection.update('kr-update-001', { difficulty: 50 });

    // ASSERT: Verify unmodified fields preserved
    const updated = await collection.getById('kr-update-001');
    expect(updated!.cpc).toBe(originalCpc);
    expect(updated!.competitorAnalysis).toEqual(original.competitorAnalysis);
    expect(updated!.difficulty).toBe(50);
  });
});
```

### Pattern 6: Collection Filtering Test

```typescript
describe('getByClusterId()', () => {
  it('should retrieve all research for a cluster', async () => {
    // ARRANGE: Add keywords to different clusters
    await collection.add({
      id: 'kr-c1-001',
      clusterId: 'cluster-seo-001',
      // ...
    });
    await collection.add({
      id: 'kr-c1-002',
      clusterId: 'cluster-seo-001',
      // ...
    });
    await collection.add({
      id: 'kr-c2-001',
      clusterId: 'cluster-seo-002',
      // ...
    });

    // ACT: Retrieve by cluster
    const results = await collection.getByClusterId('cluster-seo-001');

    // ASSERT: Verify cluster isolation
    expect(results.length).toBe(2);
    expect(results.every(r => r.clusterId === 'cluster-seo-001')).toBe(true);
  });
});
```

### Pattern 7: Error Handling Test

```typescript
describe('update()', () => {
  it('should throw error when updating non-existent entry', async () => {
    // ACT & ASSERT: Expect error for non-existent ID
    await expect(
      collection.update('non-existent-id', { searchVolume: 1000 })
    ).rejects.toThrow();
  });
});
```

### Pattern 8: Semantic Search with Ranking

```typescript
describe('search()', () => {
  it('should perform semantic search returning results sorted by relevance', async () => {
    // ARRANGE: Add multiple keywords with varying relevance
    await collection.add({
      id: 'kr-1',
      primaryKeyword: 'python programming',
      // ...
    });
    await collection.add({
      id: 'kr-2',
      primaryKeyword: 'java programming',
      // ...
    });

    // ACT: Perform semantic search
    const results = await collection.search('python programming', { limit: 10 });

    // ASSERT: Results should be ranked by relevance
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].primaryKeyword).toBeDefined();
    // Similarity of first result >= similarity of later results
  });
});
```

### Pattern 9: Multi-Filter Composition

```typescript
describe('search()', () => {
  it('should combine multiple filters', async () => {
    // ARRANGE: Add diverse test data
    await collection.add({
      id: 'kr-match',
      niche: 'programming',
      searchIntent: 'informational',
      // ...
    });
    await collection.add({
      id: 'kr-no-match-1',
      niche: 'programming',
      searchIntent: 'transactional',
      // ...
    });
    await collection.add({
      id: 'kr-no-match-2',
      niche: 'other',
      searchIntent: 'informational',
      // ...
    });

    // ACT: Search with multiple filters
    const results = await collection.search('python', {
      niche: 'programming',
      searchIntent: 'informational',
      limit: 10,
    });

    // ASSERT: All results satisfy both filters
    expect(
      results.every(
        r => r.niche === 'programming' && r.searchIntent === 'informational'
      )
    ).toBe(true);
  });
});
```

### Pattern 10: Stale Entry Detection

```typescript
describe('getStaleEntries()', () => {
  it('should find entries below freshness threshold', async () => {
    // ARRANGE: Create entries at different ages
    const very_old = new Date('2024-01-01');
    const recent = new Date('2024-10-01');

    await collection.add({
      id: 'kr-old',
      createdAt: very_old,
      // ...
    });
    await collection.add({
      id: 'kr-fresh',
      createdAt: recent,
      // ...
    });

    // Mock current date
    const mockDate = new Date('2024-10-16');
    jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

    // ACT: Find stale entries (freshness < 0.5)
    const stale = await collection.getStaleEntries(0.5);

    // ASSERT: Only old entry returned
    expect(stale.some(s => s.id === 'kr-old')).toBe(true);
    expect(stale.every(s => s.id !== 'kr-fresh')).toBe(true);

    global.Date = originalDate;
  });
});
```

## Test Data Builders

### Complete KeywordResearch Object

```typescript
const createKeyword = (overrides?: Partial<KeywordResearch>): KeywordResearch => ({
  id: 'kr-test-001',
  primaryKeyword: 'test keyword',
  relatedKeywords: ['rel1', 'rel2'],
  searchVolume: 1000,
  difficulty: 25,
  cpc: 1.5,
  trend: 'stable',
  niche: 'test',
  clusterId: 'cluster-test',
  searchIntent: 'informational',
  topResults: [
    { url: 'https://example.com', title: 'Example', authority: 0.9 },
  ],
  competitorAnalysis: {
    topCompetitors: ['comp1.com', 'comp2.com'],
    contentGaps: ['gap1', 'gap2'],
    opportunityScore: 0.75,
  },
  contentRequirements: {
    minLength: 2000,
    recommendedSections: ['Intro', 'Details'],
    requiredCoverage: ['overview', 'benefits'],
  },
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  ...overrides,
});
```

### Usage

```typescript
// Create with defaults
const keyword = createKeyword();

// Create with custom values
const customKeyword = createKeyword({
  primaryKeyword: 'custom keyword',
  searchIntent: 'commercial',
  searchVolume: 5000,
});
```

## Common Test Setup Patterns

### Fresh Data Setup

```typescript
beforeEach(async () => {
  mockDb = new MockVectorDB();
  collection = new KeywordResearchCollection(mockDb as any);
  originalDate = Date;
});

afterEach(() => {
  global.Date = originalDate;
});
```

### Pre-populated Collection

```typescript
beforeEach(async () => {
  // ... setup collection ...

  const keywords = [
    createKeyword({ id: 'kr-1', niche: 'tech' }),
    createKeyword({ id: 'kr-2', niche: 'tech' }),
    createKeyword({ id: 'kr-3', niche: 'other' }),
  ];

  for (const kw of keywords) {
    await collection.add(kw);
  }
});
```

### Date Mocking Pattern

```typescript
const createdAt = new Date('2024-01-01');
const currentDate = new Date('2024-01-31');  // 30 days later

jest.spyOn(global, 'Date').mockImplementation(() => currentDate as any);

try {
  // Test code
} finally {
  global.Date = originalDate;
}
```

## Mock Interaction Examples

### Verify Method Called

```typescript
const spy = jest.spyOn(mockDb, 'add');
await collection.add(keyword);
expect(spy).toHaveBeenCalledWith(
  'kr-001',
  expect.objectContaining({ primaryKeyword: 'test' }),
  expect.any(Array)
);
```

### Verify Call Count

```typescript
const spy = jest.spyOn(mockDb, 'update');
await collection.update('kr-001', { searchVolume: 5000 });
expect(spy).toHaveBeenCalledTimes(1);
```

### Verify Call Not Made

```typescript
const spy = jest.spyOn(mockDb, 'delete');
await collection.getById('kr-001');
expect(spy).not.toHaveBeenCalled();
```

## Assertion Patterns

### Field Equality

```typescript
expect(retrieved!.primaryKeyword).toBe('expected value');
expect(retrieved!.searchVolume).toBe(5000);
```

### Object Deep Equality

```typescript
expect(retrieved!.competitorAnalysis).toEqual({
  topCompetitors: ['comp1.com'],
  contentGaps: ['gap1'],
  opportunityScore: 0.75,
});
```

### Array Predicates

```typescript
expect(results.every(r => r.niche === 'tech')).toBe(true);
expect(results.some(r => r.searchIntent === 'transactional')).toBe(true);
expect(results.length).toBeLessThanOrEqual(limit);
```

### Null/Undefined Checks

```typescript
expect(result).toBeNull();
expect(result).toBeDefined();
expect(result).toBeDefined();
```

### Error Assertions

```typescript
await expect(collection.update('bad-id', {})).rejects.toThrow();
await expect(collection.delete('bad-id')).rejects.toThrow();
```

## Test Execution Commands

### Run All Tests
```bash
npm test keyword-research.test.ts
```

### Run Specific Suite
```bash
npm test keyword-research.test.ts -t "add()"
```

### Run With Coverage
```bash
npm test keyword-research.test.ts --coverage
```

### Run In Watch Mode
```bash
npm test keyword-research.test.ts --watch
```

### Run In Debug Mode
```bash
node --inspect-brk node_modules/.bin/jest keyword-research.test.ts
```

## Test Success Criteria

- All 54 tests pass
- No console errors or warnings
- Mock spies verify all collaboration points
- Coverage includes: all methods, error paths, filters, calculations
- Tests are deterministic (same result every run)
- Tests complete in < 2 seconds total
