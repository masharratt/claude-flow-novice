# Skill Composition Framework API

## Overview

The Skill Composition Framework enables chaining multiple skills into composite workflows with automatic dependency management, parallel execution, and robust error handling.

**Key Features:**
- Dependency graph analysis and circular dependency detection
- Topological sorting for execution order
- Parallel execution of independent steps
- Data passing via shared workspace
- Multiple error handling strategies (stop/continue/retry)
- Sequential and parallel execution modes

## Core Components

### 1. DependencyGraph

Builds and analyzes dependency graphs for workflow steps.

```python
from src.workflow_codification.composition import DependencyGraph

# Create from composite definition
composite = {
    "name": "my-workflow",
    "steps": [
        {
            "step_id": "step_a",
            "skill_name": "skill-a",
            "params": {}
        },
        {
            "step_id": "step_b",
            "skill_name": "skill-b",
            "params": {},
            "depends_on": ["step_a"]  # B depends on A
        }
    ]
}

graph = DependencyGraph.from_composite_definition(composite)

# Check for circular dependencies
if graph.has_circular_dependency():
    raise ValueError("Circular dependency detected!")

# Get prerequisites/dependents
prereqs = graph.get_prerequisites("step_b")  # Returns: ["step_a"]
dependents = graph.get_dependents("step_a")  # Returns: ["step_b"]
```

**Methods:**
- `add_step(step_id: str)` - Add step node
- `add_dependency(prerequisite: str, dependent: str)` - Add dependency edge
- `has_circular_dependency() -> bool` - Detect cycles using DFS
- `get_prerequisites(step_id: str) -> List[str]` - Get immediate prerequisites
- `get_dependents(step_id: str) -> List[str]` - Get immediate dependents
- `from_composite_definition(composite: Dict) -> DependencyGraph` - Build from composite

### 2. TopologicalSorter

Performs topological sorting to determine execution order.

```python
from src.workflow_codification.composition import TopologicalSorter

# Linear execution order
order = TopologicalSorter.sort(graph)
# Returns: ["step_a", "step_b", "step_c"]

# Grouped by parallel execution levels
levels = TopologicalSorter.sort_with_levels(graph)
# Returns: [["step_a"], ["step_b", "step_c"], ["step_d"]]
# Level 1: step_b and step_c can run in parallel
```

**Methods:**
- `sort(graph: DependencyGraph) -> List[str]` - Linear topological sort
- `sort_with_levels(graph: DependencyGraph) -> List[List[str]]` - Group into parallel levels

**Raises:**
- `ValueError` if circular dependency detected

### 3. Workspace

Manages shared workspace for data exchange between steps.

```python
from src.workflow_codification.composition import Workspace

# Create workspace
workspace = Workspace()  # Auto-creates temp dir
# Or use custom directory:
workspace = Workspace(base_dir="/path/to/workspace")

# Write step output
workspace.write_output("step_a", {
    "result": "success",
    "data": [1, 2, 3]
})

# Read step output (from memory or file)
output = workspace.read_output("step_a")
# Returns: {"result": "success", "data": [1, 2, 3]}

# Get workspace path
path = workspace.get_workspace_dir()

# Cleanup when done
workspace.cleanup()
```

**Methods:**
- `write_output(step_id: str, data: Dict)` - Write step output (JSON)
- `read_output(step_id: str) -> Dict` - Read step output (returns {} if not found)
- `get_workspace_dir() -> str` - Get workspace directory path
- `cleanup()` - Remove workspace directory

### 4. CompositeExecutor

Executes composite workflows with dependency management and error handling.

```python
from src.workflow_codification.composition import CompositeExecutor

executor = CompositeExecutor()

result = executor.execute_composite(
    composite,
    execution_mode="parallel",      # or "sequential"
    error_handling="stop_on_error"  # or "continue_on_error", "retry_on_error"
)

# Result structure:
{
    "status": "success",  # or "failed"
    "workspace_dir": "/tmp/composite_xyz",
    "step_results": {
        "step_a": {
            "step_id": "step_a",
            "success": True,
            "duration": 1.23,
            "exit_code": 0,
            "stdout": "output...",
            "stderr": None
        },
        "step_b": { ... }
    }
}
```

**Methods:**
- `execute_composite(composite, execution_mode, error_handling) -> Dict` - Execute workflow

**Execution Modes:**
- `sequential` - Execute steps one by one in topological order
- `parallel` - Execute independent steps concurrently (grouped by levels)

**Error Handling Strategies:**
- `stop_on_error` - Halt execution on first failure
- `continue_on_error` - Complete all steps despite failures
- `retry_on_error` - Retry failed steps once before stopping

## Composite Definition Format

```json
{
  "name": "workflow-name",
  "description": "Optional description",
  "steps": [
    {
      "step_id": "unique_step_id",
      "skill_name": "skill-name",
      "params": {
        "key": "value"
      },
      "depends_on": ["prerequisite_step_id"]  // Optional
    }
  ]
}
```

**Fields:**
- `name` - Workflow name (required)
- `description` - Human-readable description (optional)
- `steps` - Array of step definitions (required)

**Step Fields:**
- `step_id` - Unique step identifier (required)
- `skill_name` - Skill to execute (required)
- `params` - Skill parameters (optional)
- `depends_on` - Array of prerequisite step IDs (optional)

## Usage Examples

### Example 1: Linear Workflow (A → B → C)

```python
from src.workflow_codification.composition import CompositeExecutor

composite = {
    "name": "data-pipeline",
    "steps": [
        {
            "step_id": "extract",
            "skill_name": "data-extractor",
            "params": {"source": "database"}
        },
        {
            "step_id": "transform",
            "skill_name": "data-transformer",
            "params": {"format": "json"},
            "depends_on": ["extract"]
        },
        {
            "step_id": "load",
            "skill_name": "data-loader",
            "params": {"target": "warehouse"},
            "depends_on": ["transform"]
        }
    ]
}

executor = CompositeExecutor()
result = executor.execute_composite(
    composite,
    execution_mode="sequential",
    error_handling="stop_on_error"
)

if result["status"] == "success":
    print("Pipeline completed successfully!")
```

### Example 2: Diamond Pattern with Parallel Execution

```python
composite = {
    "name": "parallel-processing",
    "steps": [
        {
            "step_id": "fetch",
            "skill_name": "api-fetch",
            "params": {"endpoint": "/data"}
        },
        {
            "step_id": "validate",
            "skill_name": "validator",
            "depends_on": ["fetch"]
        },
        {
            "step_id": "enrich",
            "skill_name": "enricher",
            "depends_on": ["fetch"]
        },
        {
            "step_id": "report",
            "skill_name": "reporter",
            "depends_on": ["validate", "enrich"]
        }
    ]
}

# Validate and enrich will run in parallel
result = executor.execute_composite(
    composite,
    execution_mode="parallel",
    error_handling="continue_on_error"
)
```

### Example 3: Error Handling with Retry

```python
composite = {
    "name": "resilient-workflow",
    "steps": [
        {
            "step_id": "flaky_api_call",
            "skill_name": "external-api",
            "params": {"endpoint": "/unstable"}
        }
    ]
}

# Will retry failed steps once
result = executor.execute_composite(
    composite,
    execution_mode="sequential",
    error_handling="retry_on_error"
)
```

## CLI Tool

```bash
# Execute composite workflow
python3 src/workflow_codification/composition/cli.py \
    --composite=examples/skill-composition/diamond-workflow.json \
    --mode=parallel \
    --error-handling=stop_on_error

# Output as JSON
python3 src/workflow_codification/composition/cli.py \
    --composite=workflow.json \
    --json-output
```

**CLI Options:**
- `--composite PATH` - Composite definition file (required)
- `--mode {sequential,parallel}` - Execution mode (default: sequential)
- `--error-handling {stop_on_error,continue_on_error,retry_on_error}` - Error strategy (default: stop_on_error)
- `--json-output` - Output results as JSON

## Performance Characteristics

### Dependency Graph Building
- **Time Complexity**: O(V + E) where V = steps, E = dependencies
- **Space Complexity**: O(V + E)

### Topological Sorting
- **Time Complexity**: O(V + E) using Kahn's algorithm
- **Space Complexity**: O(V)

### Execution
- **Sequential Mode**: Steps run one at a time (safe, predictable)
- **Parallel Mode**: Independent steps run concurrently (faster for diamond/parallel patterns)
  - Uses ThreadPoolExecutor with max_workers = steps per level
  - I/O-bound tasks benefit most from parallel execution

### Workspace I/O
- **Write Output**: O(1) memory + O(n) file write where n = data size
- **Read Output**: O(1) from memory cache, O(n) from file
- **Storage**: JSON files in temp directory (auto-cleanup available)

## Error Handling

### Circular Dependencies
```python
try:
    result = executor.execute_composite(composite)
except ValueError as e:
    print(f"Invalid workflow: {e}")
```

### Step Execution Failures
- **stop_on_error**: Stops immediately, returns partial results
- **continue_on_error**: Completes all steps, marks failed steps
- **retry_on_error**: Retries each failed step once

### Timeouts
- Default: 300 seconds (5 minutes) per step
- Configurable in `composite_executor.py`

## Testing

Run comprehensive test suite:
```bash
python3 -m pytest tests/workflow_codification/composition/test_skill_composition.py -v
```

Check code coverage:
```bash
python3 -m pytest tests/workflow_codification/composition/test_skill_composition.py \
    --cov=src.workflow_codification.composition \
    --cov-report=term-missing
```

## Integration with CFN Workflow Codification

The Skill Composition Framework integrates with the larger Workflow Codification Enhancement v2 epic:

1. **Skill Registry** (FR-1) - Composite executor resolves skills from registry
2. **Skill Templates** (FR-2) - Steps can use templated parameters
3. **Code Generation** (FR-3) - Composites can be generated from templates
4. **Skill Versioning** (FR-4) - Steps specify skill versions
5. **Pattern Recommender** (FR-6) - Suggests composite patterns

## File Locations

**Source Code:**
- `/home/user/claude-flow-novice/src/workflow_codification/composition/`
  - `dependency_graph.py` - Dependency graph builder
  - `topological_sorter.py` - Topological sorting
  - `workspace.py` - Shared workspace
  - `composite_executor.py` - Workflow executor
  - `cli.py` - Command-line tool

**Tests:**
- `/home/user/claude-flow-novice/tests/workflow_codification/composition/`
  - `test_skill_composition.py` - Comprehensive test suite (32 tests)

**Examples:**
- `/home/user/claude-flow-novice/examples/skill-composition/`
  - `linear-workflow.json` - Linear dependency chain
  - `diamond-workflow.json` - Diamond pattern
  - `parallel-workflow.json` - Fully parallel workflow

**Documentation:**
- `/home/user/claude-flow-novice/docs/workflow-codification/SKILL_COMPOSITION_API.md` (this file)

## Next Steps

1. **Integrate with Skill Registry** - Resolve skills dynamically
2. **Add Conditional Execution** - Support if/else logic in workflows
3. **Implement Workflow Validation** - Pre-execution validation hooks
4. **Add Progress Monitoring** - Real-time execution progress
5. **Support Remote Execution** - Distribute steps across workers

## Support

For issues or questions, see:
- Implementation Plan: `planning/workflow-codification/priority-features/IMPLEMENTATION_PLAN.md`
- Architecture: `planning/workflow-codification/priority-features/ARCHITECTURE.md`
- Database Schema: `src/workflow_codification/migrations/005_composite_skills.sql`
