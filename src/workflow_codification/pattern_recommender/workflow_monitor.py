"""
Workflow Monitor
Tracks user command sequences and groups them into 5-minute windows
"""
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from collections import defaultdict


class WorkflowMonitor:
    """
    Monitor and track user workflow sequences
    Groups commands within 5-minute time windows
    """

    def __init__(self, time_window_minutes: int = 5):
        """
        Initialize workflow monitor

        Args:
            time_window_minutes: Time window for grouping commands (default: 5)
        """
        self.workflows = defaultdict(list)  # user_id → list of workflows
        self.time_window = timedelta(minutes=time_window_minutes)

    def record_command(
        self,
        user_id: str,
        command: str,
        timestamp: Optional[datetime] = None
    ) -> None:
        """
        Record a command execution

        Args:
            user_id: User identifier
            command: Command executed
            timestamp: Execution timestamp (default: now)
        """
        if timestamp is None:
            timestamp = datetime.utcnow()

        user_workflows = self.workflows[user_id]

        # Check if this belongs to an existing workflow (within time window)
        # Must be chronologically after the last command AND within time window
        if user_workflows:
            time_diff = timestamp - user_workflows[-1]["end_time"]
            # Check: 0 < time_diff <= time_window
            if timedelta(0) < time_diff <= self.time_window:
                # Append to current workflow
                user_workflows[-1]["commands"].append(command)
                user_workflows[-1]["end_time"] = timestamp
            else:
                # Start new workflow (either too far in future or in the past)
                user_workflows.append({
                    "commands": [command],
                    "start_time": timestamp,
                    "end_time": timestamp
                })
        else:
            # First workflow for this user
            user_workflows.append({
                "commands": [command],
                "start_time": timestamp,
                "end_time": timestamp
            })

    def get_workflow_sequences(self, user_id: str) -> List[List[str]]:
        """
        Get all workflow sequences for a user

        Args:
            user_id: User identifier

        Returns:
            List of command sequences (each sequence is a list of commands)
        """
        user_workflows = self.workflows.get(user_id, [])
        return [workflow["commands"] for workflow in user_workflows]

    def clear_user_workflows(self, user_id: str) -> None:
        """
        Clear all workflows for a user

        Args:
            user_id: User identifier
        """
        if user_id in self.workflows:
            del self.workflows[user_id]

    def get_workflow_count(self, user_id: str) -> int:
        """
        Get count of workflows for a user

        Args:
            user_id: User identifier

        Returns:
            Number of workflows
        """
        return len(self.workflows.get(user_id, []))
