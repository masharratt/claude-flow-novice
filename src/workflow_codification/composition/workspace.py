"""
Workspace Data Sharing

Manages shared workspace for data passing between workflow steps.
Each step writes outputs to workspace, next step reads them as inputs.
"""

import os
import tempfile
import shutil
import json
from typing import Dict, Any


class Workspace:
    """
    Shared workspace for data exchange between workflow steps

    Provides persistent storage (JSON files) and in-memory caching
    for step outputs. Enables data dependencies between steps.

    Attributes:
        base_dir: Workspace directory path
        step_outputs: In-memory cache of step outputs
    """

    def __init__(self, base_dir: str = None):
        """
        Create workspace for data sharing between steps

        Args:
            base_dir: Base directory (default: creates temp dir)
        """
        if base_dir:
            self.base_dir = base_dir
            os.makedirs(base_dir, exist_ok=True)
        else:
            self.base_dir = tempfile.mkdtemp(prefix="composite_")

        self.step_outputs = {}

    def write_output(self, step_id: str, data: Dict[str, Any]):
        """
        Write step output to workspace

        Stores data in both memory cache and JSON file for persistence.

        Args:
            step_id: Step identifier
            data: Output data dictionary (must be JSON serializable)
        """
        # Write to file (persistent)
        output_file = os.path.join(self.base_dir, f"{step_id}_output.json")
        with open(output_file, 'w') as f:
            json.dump(data, f, indent=2)

        # Cache in memory (fast access)
        self.step_outputs[step_id] = data

    def read_output(self, step_id: str) -> Dict[str, Any]:
        """
        Read output from previous step

        Checks memory cache first, falls back to file if needed.

        Args:
            step_id: Step identifier

        Returns:
            Output data dictionary (empty dict if not found)
        """
        # Try memory cache first (fast path)
        if step_id in self.step_outputs:
            return self.step_outputs[step_id]

        # Fall back to file (after restart or cache miss)
        output_file = os.path.join(self.base_dir, f"{step_id}_output.json")
        if os.path.exists(output_file):
            with open(output_file, 'r') as f:
                data = json.load(f)
                # Populate cache
                self.step_outputs[step_id] = data
                return data

        # Not found
        return {}

    def get_workspace_dir(self) -> str:
        """
        Get workspace directory path

        Returns:
            Absolute path to workspace directory
        """
        return self.base_dir

    def cleanup(self):
        """
        Remove workspace directory and all contents

        Use after workflow execution completes to free disk space.
        """
        if os.path.exists(self.base_dir):
            shutil.rmtree(self.base_dir)
