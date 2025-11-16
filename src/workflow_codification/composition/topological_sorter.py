"""
Topological Sorter

Performs topological sorting on dependency graphs to determine execution order.
Supports both linear sorting and level-based sorting for parallel execution.
"""

from typing import List
from collections import deque
from .dependency_graph import DependencyGraph


class TopologicalSorter:
    """
    Topological sorting algorithms for workflow execution order

    Uses Kahn's algorithm for robust cycle detection and sorting.
    """

    @staticmethod
    def sort(graph: DependencyGraph) -> List[str]:
        """
        Topological sort using Kahn's algorithm

        Returns a linear execution order where all dependencies
        are satisfied (prerequisites always run before dependents).

        Args:
            graph: Dependency graph

        Returns:
            List of step IDs in valid execution order

        Raises:
            ValueError: If graph has circular dependencies
        """
        if graph.has_circular_dependency():
            raise ValueError("Cannot sort: circular dependency detected")

        # Calculate in-degree (number of prerequisites) for each node
        in_degree = {node: len(graph.get_prerequisites(node)) for node in graph.nodes}

        # Queue of nodes with in-degree 0 (no prerequisites)
        queue = deque([node for node in graph.nodes if in_degree[node] == 0])

        sorted_order = []

        while queue:
            # Remove node with no prerequisites
            node = queue.popleft()
            sorted_order.append(node)

            # Reduce in-degree for all dependents
            for dependent in graph.get_dependents(node):
                in_degree[dependent] -= 1
                if in_degree[dependent] == 0:
                    queue.append(dependent)

        # Verify all nodes were sorted (double-check for cycles)
        if len(sorted_order) != len(graph.nodes):
            raise ValueError("Topological sort failed: graph has cycles")

        return sorted_order

    @staticmethod
    def sort_with_levels(graph: DependencyGraph) -> List[List[str]]:
        """
        Topological sort grouped by execution levels

        Returns steps grouped into levels where all steps in a level
        can execute in parallel (no dependencies between them).

        Example:
            Diamond pattern (A -> B,C -> D) returns:
            [
                ["A"],        # Level 0
                ["B", "C"],   # Level 1 (parallel)
                ["D"]         # Level 2
            ]

        Args:
            graph: Dependency graph

        Returns:
            List of execution levels (each level contains independent steps)

        Raises:
            ValueError: If graph has circular dependencies
        """
        if graph.has_circular_dependency():
            raise ValueError("Cannot sort: circular dependency detected")

        # Calculate in-degree for each node
        in_degree = {node: len(graph.get_prerequisites(node)) for node in graph.nodes}

        levels = []
        current_level = [node for node in graph.nodes if in_degree[node] == 0]

        while current_level:
            # Add current level to results
            levels.append(current_level[:])
            next_level = []

            # Process all nodes in current level
            for node in current_level:
                # Reduce in-degree for all dependents
                for dependent in graph.get_dependents(node):
                    in_degree[dependent] -= 1
                    if in_degree[dependent] == 0:
                        next_level.append(dependent)

            current_level = next_level

        return levels
