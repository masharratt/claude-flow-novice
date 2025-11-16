"""
Composite Executor

Executes composite skill workflows with dependency management,
parallel execution, and error handling strategies.
"""

import subprocess
import time
from typing import Dict, List
from concurrent.futures import ThreadPoolExecutor, as_completed
from .dependency_graph import DependencyGraph
from .topological_sorter import TopologicalSorter
from .workspace import Workspace


class CompositeExecutor:
    """
    Execute composite skill workflows

    Supports multiple execution modes (sequential, parallel) and
    error handling strategies (stop/continue/retry on error).

    Attributes:
        workspace: Shared workspace for data passing
    """

    def __init__(self):
        """Initialize composite executor"""
        self.workspace = None

    def execute_composite(
        self,
        composite: Dict,
        execution_mode: str = "sequential",
        error_handling: str = "stop_on_error"
    ) -> Dict:
        """
        Execute composite skill workflow

        Args:
            composite: Composite skill definition with steps
            execution_mode: Execution strategy
                - 'sequential': Execute steps one by one in topological order
                - 'parallel': Execute independent steps concurrently
            error_handling: Error handling strategy
                - 'stop_on_error': Halt on first failure
                - 'continue_on_error': Complete all steps despite failures
                - 'retry_on_error': Retry failed steps once

        Returns:
            Execution results dictionary:
            {
                "status": "success" | "failed",
                "step_results": {
                    "step_id": {
                        "success": bool,
                        "duration": float,
                        "exit_code": int,
                        "stdout": str,
                        "stderr": str
                    },
                    ...
                },
                "workspace_dir": str
            }
        """
        # Create workspace for data sharing
        self.workspace = Workspace()

        try:
            # Build dependency graph
            graph = DependencyGraph.from_composite_definition(composite)

            # Execute based on mode
            if execution_mode == "sequential":
                results = self._execute_sequential(graph, composite, error_handling)
            elif execution_mode == "parallel":
                results = self._execute_parallel(graph, composite, error_handling)
            else:
                raise ValueError(f"Unknown execution mode: {execution_mode}")

            # Determine overall status
            all_successful = all(r.get("success", False) for r in results.values())

            return {
                "status": "success" if all_successful else "failed",
                "step_results": results,
                "workspace_dir": self.workspace.get_workspace_dir()
            }

        finally:
            # Note: Workspace cleanup is optional - may want to inspect results
            # Uncomment to auto-cleanup:
            # self.workspace.cleanup()
            pass

    def _execute_sequential(
        self,
        graph: DependencyGraph,
        composite: Dict,
        error_handling: str
    ) -> Dict:
        """
        Execute steps sequentially in topological order

        Args:
            graph: Dependency graph
            composite: Composite definition
            error_handling: Error handling strategy

        Returns:
            Step results dictionary
        """
        # Get execution order
        execution_order = TopologicalSorter.sort(graph)
        steps_map = {step["step_id"]: step for step in composite["steps"]}

        results = {}

        for step_id in execution_order:
            step = steps_map[step_id]
            result = self._execute_step(step)
            results[step_id] = result

            # Error handling
            if not result.get("success", False):
                if error_handling == "stop_on_error":
                    # Halt execution
                    break
                elif error_handling == "retry_on_error":
                    # Retry once
                    result = self._execute_step(step)
                    results[step_id] = result
                    if not result.get("success", False):
                        # Still failed after retry - stop
                        break
                # continue_on_error: keep going

        return results

    def _execute_parallel(
        self,
        graph: DependencyGraph,
        composite: Dict,
        error_handling: str
    ) -> Dict:
        """
        Execute independent steps in parallel

        Uses topological levels - all steps in a level run concurrently.

        Args:
            graph: Dependency graph
            composite: Composite definition
            error_handling: Error handling strategy

        Returns:
            Step results dictionary
        """
        # Get execution levels (independent steps grouped)
        execution_levels = TopologicalSorter.sort_with_levels(graph)
        steps_map = {step["step_id"]: step for step in composite["steps"]}

        results = {}

        for level in execution_levels:
            # Execute all steps in this level in parallel
            with ThreadPoolExecutor(max_workers=len(level)) as executor:
                future_to_step = {
                    executor.submit(self._execute_step, steps_map[step_id]): step_id
                    for step_id in level
                }

                for future in as_completed(future_to_step):
                    step_id = future_to_step[future]
                    result = future.result()
                    results[step_id] = result

                    # Check for errors
                    if not result.get("success", False) and error_handling == "stop_on_error":
                        # Cancel remaining steps and exit
                        return results

        return results

    def _execute_step(self, step: Dict) -> Dict:
        """
        Execute single workflow step

        Reads dependency outputs from workspace, executes skill,
        writes outputs back to workspace.

        Args:
            step: Step definition

        Returns:
            Step execution result
        """
        step_id = step["step_id"]
        skill_name = step["skill_name"]
        params = step.get("params", {}).copy()

        # Read inputs from workspace (dependency outputs)
        dependencies = step.get("depends_on", [])
        for dep in dependencies:
            dep_output = self.workspace.read_output(dep)
            # Merge dependency outputs into params
            params.update(dep_output)

        # Build and execute command
        command = self._build_command(skill_name, params)
        start_time = time.time()

        try:
            process = subprocess.run(
                command,
                shell=True,
                capture_output=True,
                text=True,
                timeout=300,  # 5 minute timeout
                cwd=self.workspace.get_workspace_dir()
            )

            duration = time.time() - start_time
            success = process.returncode == 0

            # Parse output and write to workspace
            output_data = {
                "stdout": process.stdout,
                "exit_code": process.returncode
            }
            self.workspace.write_output(step_id, output_data)

            return {
                "step_id": step_id,
                "success": success,
                "duration": duration,
                "exit_code": process.returncode,
                "stdout": process.stdout[:200],  # First 200 chars
                "stderr": process.stderr[:200] if process.stderr else None
            }

        except subprocess.TimeoutExpired:
            duration = time.time() - start_time
            return {
                "step_id": step_id,
                "success": False,
                "duration": duration,
                "error": "Execution timeout (300s)"
            }
        except Exception as e:
            duration = time.time() - start_time
            return {
                "step_id": step_id,
                "success": False,
                "duration": duration,
                "error": str(e)
            }

    def _build_command(self, skill_name: str, params: Dict) -> str:
        """
        Build shell command from skill name and parameters

        Args:
            skill_name: Skill identifier
            params: Parameter dictionary

        Returns:
            Shell command string
        """
        # Build parameter string
        param_str = " ".join(f"--{k}={v}" for k, v in params.items())

        # Construct skill path (assumes skills in .claude/skills/)
        return f"./.claude/skills/{skill_name}/execute.sh {param_str}"
