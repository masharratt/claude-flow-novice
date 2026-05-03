import { parseEpicMarkdown, slugify } from '../../../src/planning/dependency-extractor/parser.js';
import { buildDAG, topologicalLevels, detectCycles, criticalPath } from '../../../src/planning/dependency-extractor/graph.js';
import type { EpicDoc, DAG } from '../../../src/planning/dependency-extractor/types.js';

describe('parseEpicMarkdown', () => {
  it('extracts phases from markdown with ### Phase N: headings', () => {
    const md = `# My Epic

### Phase 1: Core Authentication
**Dependencies**: None

### Phase 2: Session Management
**Dependencies**: Phase 1
`;
    const doc = parseEpicMarkdown(md);
    expect(doc.phases).toHaveLength(2);
    expect(doc.phases[0].name).toBe('Phase 1: Core Authentication');
    expect(doc.phases[1].name).toBe('Phase 2: Session Management');
  });

  it('identifies Dependencies: None as empty dep array', () => {
    const md = `### Phase 1: Core Authentication
**Dependencies**: None
`;
    const doc = parseEpicMarkdown(md);
    expect(doc.phases[0].dependencies).toEqual([]);
  });

  it('identifies Dependencies: Phase 1 as [\'phase-1\'] (slugified)', () => {
    const md = `### Phase 1: Core Authentication
**Dependencies**: None

### Phase 2: Session Management
**Dependencies**: Phase 1
`;
    const doc = parseEpicMarkdown(md);
    expect(doc.phases[1].dependencies).toEqual(['phase-1']);
  });

  it('handles multiple deps: Dependencies: Phase 1, Phase 2 => [\'phase-1\', \'phase-2\']', () => {
    const md = `### Phase 1: Core
**Dependencies**: None

### Phase 2: Sessions
**Dependencies**: None

### Phase 3: Dashboard
**Dependencies**: Phase 1, Phase 2
`;
    const doc = parseEpicMarkdown(md);
    expect(doc.phases[2].dependencies).toEqual(['phase-1', 'phase-2']);
  });

  it('returns empty array for text with no phase structure (graceful fallback)', () => {
    const doc = parseEpicMarkdown('This is just plain text with no structure.');
    expect(doc.phases).toEqual([]);
    expect(doc.title).toBe('unknown');
  });
});

describe('buildDAG', () => {
  it('creates node for each phase with adjacency list', () => {
    const epic: EpicDoc = {
      title: 'Test',
      phases: [
        { id: 'phase-1', name: 'Phase 1', dependencies: [] },
        { id: 'phase-2', name: 'Phase 2', dependencies: ['phase-1'] },
      ],
    };
    const dag = buildDAG(epic);
    expect(dag.nodes).toContain('phase-1');
    expect(dag.nodes).toContain('phase-2');
    expect(dag.edges.get('phase-2')).toEqual(['phase-1']);
    expect(dag.edges.get('phase-1')).toEqual([]);
  });
});

describe('topologicalLevels', () => {
  it('returns phases in dependency order (deps before dependents)', () => {
    const epic: EpicDoc = {
      title: 'Test',
      phases: [
        { id: 'phase-1', name: 'Phase 1', dependencies: [] },
        { id: 'phase-2', name: 'Phase 2', dependencies: ['phase-1'] },
        { id: 'phase-3', name: 'Phase 3', dependencies: ['phase-2'] },
      ],
    };
    const dag = buildDAG(epic);
    const levels = topologicalLevels(dag);
    expect(levels[0]).toContain('phase-1');
    expect(levels[1]).toContain('phase-2');
    expect(levels[2]).toContain('phase-3');
  });

  it('puts independent phases at same level (parallel opportunity)', () => {
    const epic: EpicDoc = {
      title: 'Test',
      phases: [
        { id: 'phase-1', name: 'Phase 1', dependencies: [] },
        { id: 'phase-2', name: 'Phase 2', dependencies: [] },
        { id: 'phase-3', name: 'Phase 3', dependencies: ['phase-1', 'phase-2'] },
      ],
    };
    const dag = buildDAG(epic);
    const levels = topologicalLevels(dag);
    expect(levels[0]).toContain('phase-1');
    expect(levels[0]).toContain('phase-2');
    expect(levels[1]).toContain('phase-3');
  });
});

describe('detectCycles', () => {
  it('returns empty array for valid DAG', () => {
    const epic: EpicDoc = {
      title: 'Test',
      phases: [
        { id: 'phase-1', name: 'Phase 1', dependencies: [] },
        { id: 'phase-2', name: 'Phase 2', dependencies: ['phase-1'] },
      ],
    };
    const dag = buildDAG(epic);
    expect(detectCycles(dag)).toEqual([]);
  });

  it('returns cycle participants for circular dependency', () => {
    const dag: DAG = {
      nodes: ['a', 'b', 'c'],
      edges: new Map([
        ['a', ['c']],
        ['b', ['a']],
        ['c', ['b']],
      ]),
    };
    const cycles = detectCycles(dag);
    expect(cycles.length).toBeGreaterThan(0);
    expect(cycles).toEqual(expect.arrayContaining(['a', 'b', 'c']));
  });
});

describe('criticalPath', () => {
  it('returns the longest dependency chain', () => {
    const epic: EpicDoc = {
      title: 'Test',
      phases: [
        { id: 'phase-1', name: 'Phase 1', dependencies: [] },
        { id: 'phase-2', name: 'Phase 2', dependencies: ['phase-1'] },
        { id: 'phase-3', name: 'Phase 3', dependencies: ['phase-2'] },
        { id: 'phase-4', name: 'Phase 4', dependencies: ['phase-1'] },
      ],
    };
    const dag = buildDAG(epic);
    const path = criticalPath(dag);
    expect(path).toEqual(['phase-1', 'phase-2', 'phase-3']);
  });
});
