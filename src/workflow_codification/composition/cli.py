#!/usr/bin/env python3
"""
Skill Composition CLI

Command-line tool for executing composite skill workflows.

Usage:
    python3 cli.py --composite=workflow.json [--mode=sequential] [--error-handling=stop_on_error]
"""

import argparse
import json
import sys
from pathlib import Path

from .composite_executor import CompositeExecutor


def main():
    parser = argparse.ArgumentParser(
        description="Execute composite skill workflows",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Execute workflow with default settings (sequential, stop on error)
  python3 cli.py --composite=examples/linear-workflow.json

  # Execute with parallel execution
  python3 cli.py --composite=examples/diamond.json --mode=parallel

  # Continue execution despite errors
  python3 cli.py --composite=workflow.json --error-handling=continue_on_error

Composite Format:
  {
    "name": "workflow-name",
    "steps": [
      {
        "step_id": "step_1",
        "skill_name": "skill-name",
        "params": {"key": "value"},
        "depends_on": ["other_step"]  # optional
      }
    ]
  }
        """
    )

    parser.add_argument(
        "--composite",
        required=True,
        help="Path to composite skill definition (JSON)"
    )
    parser.add_argument(
        "--mode",
        choices=["sequential", "parallel"],
        default="sequential",
        help="Execution mode (default: sequential)"
    )
    parser.add_argument(
        "--error-handling",
        choices=["stop_on_error", "continue_on_error", "retry_on_error"],
        default="stop_on_error",
        help="Error handling strategy (default: stop_on_error)"
    )
    parser.add_argument(
        "--json-output",
        action="store_true",
        help="Output results as JSON"
    )

    args = parser.parse_args()

    # Load composite definition
    try:
        with open(args.composite, 'r') as f:
            composite = json.load(f)
    except FileNotFoundError:
        print(f"Error: Composite file not found: {args.composite}", file=sys.stderr)
        sys.exit(1)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON in composite file: {e}", file=sys.stderr)
        sys.exit(1)

    # Execute composite
    print(f"Executing composite: {composite.get('name', 'unnamed')}")
    print(f"Mode: {args.mode}, Error handling: {args.error_handling}")
    print("-" * 60)

    executor = CompositeExecutor()

    try:
        result = executor.execute_composite(
            composite,
            execution_mode=args.mode,
            error_handling=args.error_handling
        )

        # Output results
        if args.json_output:
            print(json.dumps(result, indent=2))
        else:
            print_human_readable(result)

        # Exit code based on status
        sys.exit(0 if result["status"] == "success" else 1)

    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)


def print_human_readable(result):
    """Print execution results in human-readable format"""
    print(f"\nOverall Status: {result['status'].upper()}")
    print(f"Workspace: {result['workspace_dir']}")
    print("\nStep Results:")
    print("-" * 60)

    for step_id, step_result in result["step_results"].items():
        status_symbol = "✓" if step_result.get("success") else "✗"
        duration = step_result.get("duration", 0)
        print(f"{status_symbol} {step_id:20} ({duration:.2f}s)")

        if not step_result.get("success"):
            error = step_result.get("error") or step_result.get("stderr")
            if error:
                print(f"  Error: {error[:100]}")

    print("-" * 60)

    # Summary
    total_steps = len(result["step_results"])
    successful_steps = sum(1 for r in result["step_results"].values() if r.get("success"))
    print(f"\nSummary: {successful_steps}/{total_steps} steps succeeded")


if __name__ == "__main__":
    main()
