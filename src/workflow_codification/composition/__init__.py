"""
Skill Composition Framework

Enables chaining multiple skills into composite workflows with:
- Dependency graph analysis
- Topological sorting
- Parallel execution
- Data passing via shared workspace
- Error handling strategies
"""

from .dependency_graph import DependencyGraph
from .topological_sorter import TopologicalSorter
from .workspace import Workspace
from .composite_executor import CompositeExecutor

__all__ = [
    'DependencyGraph',
    'TopologicalSorter',
    'Workspace',
    'CompositeExecutor'
]
