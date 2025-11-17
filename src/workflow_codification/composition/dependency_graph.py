"""
Dependency Graph Builder

Builds and analyzes dependency graphs for composite skill workflows.
Detects circular dependencies and provides graph traversal utilities.
"""

from typing import List, Dict, Set
from collections import defaultdict


class DependencyGraph:
    """
    Directed graph representing dependencies between workflow steps

    Attributes:
        graph: Forward edges (prerequisite -> dependents)
        reverse_graph: Reverse edges (dependent -> prerequisites)
        nodes: Set of all step IDs
    """

    def __init__(self):
        """Initialize empty dependency graph"""
        self.graph = defaultdict(list)  # step → [dependent steps]
        self.reverse_graph = defaultdict(list)  # step → [prerequisite steps]
        self.nodes = set()

    def add_step(self, step_id: str):
        """
        Add step to graph

        Args:
            step_id: Unique step identifier
        """
        self.nodes.add(step_id)

    def add_dependency(self, prerequisite: str, dependent: str):
        """
        Add dependency edge (prerequisite must run before dependent)

        Args:
            prerequisite: Step that must run first
            dependent: Step that depends on prerequisite
        """
        self.graph[prerequisite].append(dependent)
        self.reverse_graph[dependent].append(prerequisite)
        self.nodes.add(prerequisite)
        self.nodes.add(dependent)

    def has_circular_dependency(self) -> bool:
        """
        Detect circular dependencies using depth-first search

        Returns:
            True if circular dependency exists, False otherwise
        """
        visited = set()
        rec_stack = set()

        def has_cycle(node):
            """DFS helper to detect cycles"""
            visited.add(node)
            rec_stack.add(node)

            for neighbor in self.graph[node]:
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in rec_stack:
                    # Back edge found - circular dependency
                    return True

            rec_stack.remove(node)
            return False

        # Check all nodes (handles disconnected components)
        for node in self.nodes:
            if node not in visited:
                if has_cycle(node):
                    return True

        return False

    def get_prerequisites(self, step_id: str) -> List[str]:
        """
        Get immediate prerequisites for a step

        Args:
            step_id: Step identifier

        Returns:
            List of prerequisite step IDs
        """
        return self.reverse_graph.get(step_id, [])

    def get_dependents(self, step_id: str) -> List[str]:
        """
        Get immediate dependents of a step

        Args:
            step_id: Step identifier

        Returns:
            List of dependent step IDs
        """
        return self.graph.get(step_id, [])

    @staticmethod
    def from_composite_definition(composite: Dict) -> 'DependencyGraph':
        """
        Build dependency graph from composite skill definition

        Args:
            composite: Composite skill definition with steps array
                Expected format:
                {
                    "name": "workflow-name",
                    "steps": [
                        {
                            "step_id": "step_a",
                            "skill_name": "skill-a",
                            "params": {...},
                            "depends_on": ["step_b"]  # Optional
                        },
                        ...
                    ]
                }

        Returns:
            DependencyGraph instance
        """
        graph = DependencyGraph()
        steps = composite.get("steps", [])

        for step in steps:
            step_id = step["step_id"]
            graph.add_step(step_id)

            # Check for explicit dependencies
            dependencies = step.get("depends_on", [])
            for dep in dependencies:
                graph.add_dependency(dep, step_id)

        return graph
