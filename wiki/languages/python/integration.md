# Python Integration Guide

This guide provides comprehensive examples and patterns for integrating claude-flow-novice with Python projects.

## Table of Contents

1. [Basic Setup](#basic-setup)
2. [Flask Integration](#flask-integration)
3. [FastAPI Integration](#fastapi-integration)
4. [Django Integration](#django-integration)
5. [Data Science Integration](#data-science-integration)
6. [Testing Integration](#testing-integration)
7. [Deployment Patterns](#deployment-patterns)

## Basic Setup

### Python Package Integration

```python
# setup.py
from setuptools import setup, find_packages

setup(
    name="my-claude-flow-project",
    version="1.0.0",
    packages=find_packages(),
    install_requires=[
        "fastapi>=0.68.0",
        "uvicorn>=0.15.0",
        "pydantic>=1.8.0",
        "requests>=2.25.0"
    ],
    extras_require={
        "dev": [
            "pytest>=6.0.0",
            "pytest-asyncio>=0.15.0",
            "black>=21.0.0",
            "flake8>=3.9.0"
        ]
    },
    entry_points={
        "console_scripts": [
            "claude-flow-dev=src.cli:dev_command",
            "claude-flow-test=src.cli:test_command",
            "claude-flow-deploy=src.cli:deploy_command"
        ]
    }
)
```

### Claude Flow Python Wrapper

```python
# src/claude_flow_integration.py
import asyncio
import subprocess
import json
import logging
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from pathlib import Path

@dataclass
class TaskResult:
    success: bool
    result: Any
    error: Optional[str] = None
    duration: Optional[float] = None
    timestamp: Optional[str] = None

@dataclass
class AgentConfig:
    name: str
    capabilities: List[str]
    topology: str = "mesh"

class ClaudeFlowIntegration:
    """Python wrapper for claude-flow-novice CLI integration."""

    def __init__(
        self,
        topology: str = "mesh",
        agents: Optional[List[str]] = None,
        session_id: Optional[str] = None
    ):
        self.topology = topology
        self.default_agents = agents or ["coder", "tester", "reviewer"]
        self.session_id = session_id or f"python-session-{int(asyncio.get_event_loop().time())}"
        self.initialized = False
        self.logger = logging.getLogger(__name__)

    async def initialize(self) -> None:
        """Initialize Claude Flow environment."""
        if self.initialized:
            return

        try:
            # Setup MCP servers
            await self._run_cli(["mcp", "add", "claude-flow", "npx", "claude-flow@alpha", "mcp", "start"])
            await self._run_cli(["mcp", "add", "ruv-swarm", "npx", "ruv-swarm", "mcp", "start"])

            # Initialize swarm
            await self._run_cli([
                "sparc", "init",
                "--topology", self.topology,
                "--agents", str(len(self.default_agents))
            ])

            # Start session
            await self._run_cli([
                "sparc", "session", "start",
                "--name", self.session_id
            ])

            self.initialized = True
            self.logger.info(f"Claude Flow initialized with session: {self.session_id}")

        except Exception as e:
            self.logger.error(f"Failed to initialize Claude Flow: {e}")
            raise

    async def spawn_agents(
        self,
        agents: List[str],
        task: str,
        strategy: str = "parallel"
    ) -> TaskResult:
        """Spawn agents to execute a task."""
        if not self.initialized:
            raise RuntimeError("Claude Flow not initialized. Call initialize() first.")

        try:
            agent_list = ",".join(agents)
            result = await self._run_cli([
                "sparc", "batch",
                agent_list,
                task,
                "--strategy", strategy
            ])

            return TaskResult(
                success=True,
                result=result,
                timestamp=str(asyncio.get_event_loop().time())
            )

        except Exception as e:
            self.logger.error(f"Failed to spawn agents: {e}")
            return TaskResult(
                success=False,
                result=None,
                error=str(e)
            )

    async def orchestrate_task(
        self,
        task: str,
        agents: Optional[List[str]] = None,
        strategy: str = "adaptive",
        priority: str = "medium"
    ) -> TaskResult:
        """Orchestrate a complex task across multiple agents."""
        agents = agents or self.default_agents

        try:
            result = await self._run_cli([
                "sparc", "run", "task-orchestrator",
                task,
                "--agents", ",".join(agents),
                "--strategy", strategy,
                "--priority", priority
            ])

            return TaskResult(success=True, result=result)

        except Exception as e:
            return TaskResult(success=False, result=None, error=str(e))

    async def run_tdd(self, feature: str) -> TaskResult:
        """Run Test-Driven Development workflow for a feature."""
        try:
            result = await self._run_cli(["sparc", "tdd", feature])
            return TaskResult(success=True, result=result)
        except Exception as e:
            return TaskResult(success=False, result=None, error=str(e))

    async def execute_pipeline(self, task: str) -> TaskResult:
        """Execute a complete pipeline workflow."""
        try:
            result = await self._run_cli(["sparc", "pipeline", task])
            return TaskResult(success=True, result=result)
        except Exception as e:
            return TaskResult(success=False, result=None, error=str(e))

    async def _run_cli(self, args: List[str]) -> str:
        """Execute claude-flow-novice CLI command."""
        cmd = ["npx", "claude-flow"] + args

        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            raise RuntimeError(f"Command failed: {stderr.decode()}")

        return stdout.decode().strip()

    async def cleanup(self) -> None:
        """Clean up Claude Flow session."""
        try:
            await self._run_cli([
                "sparc", "session", "end",
                "--export-metrics", "true"
            ])
            self.logger.info("Claude Flow session cleaned up successfully")
        except Exception as e:
            self.logger.error(f"Failed to cleanup session: {e}")

# Context manager for automatic cleanup
class ClaudeFlowContext:
    def __init__(self, **kwargs):
        self.claude_flow = ClaudeFlowIntegration(**kwargs)

    async def __aenter__(self):
        await self.claude_flow.initialize()
        return self.claude_flow

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.claude_flow.cleanup()
```

## Flask Integration

### Flask Application with Claude Flow

```python
# app.py
from flask import Flask, request, jsonify
import asyncio
from src.claude_flow_integration import ClaudeFlowIntegration, ClaudeFlowContext

app = Flask(__name__)

# Global Claude Flow instance
claude_flow = ClaudeFlowIntegration(
    topology="hierarchical",
    agents=["backend-dev", "api-docs", "security-manager"]
)

@app.before_first_request
def initialize_claude_flow():
    """Initialize Claude Flow before handling requests."""
    async def init():
        await claude_flow.initialize()

    # Run in event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(init())
    loop.close()

@app.route('/api/claude-flow/task', methods=['POST'])
def spawn_task():
    """Endpoint to spawn Claude Flow agents for a task."""
    data = request.get_json()

    if not data or 'task' not in data:
        return jsonify({'error': 'Task description required'}), 400

    task = data['task']
    agents = data.get('agents', claude_flow.default_agents)
    strategy = data.get('strategy', 'parallel')

    async def execute_task():
        return await claude_flow.spawn_agents(agents, task, strategy)

    # Execute in event loop
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(execute_task())
    loop.close()

    return jsonify({
        'success': result.success,
        'result': result.result,
        'error': result.error,
        'timestamp': result.timestamp
    })

@app.route('/api/claude-flow/tdd', methods=['POST'])
def run_tdd():
    """Endpoint to run TDD workflow."""
    data = request.get_json()

    if not data or 'feature' not in data:
        return jsonify({'error': 'Feature name required'}), 400

    feature = data['feature']

    async def execute_tdd():
        return await claude_flow.run_tdd(feature)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(execute_tdd())
    loop.close()

    return jsonify({
        'success': result.success,
        'result': result.result,
        'error': result.error
    })

@app.route('/api/claude-flow/pipeline', methods=['POST'])
def execute_pipeline():
    """Endpoint to execute complete pipeline."""
    data = request.get_json()

    if not data or 'pipeline_task' not in data:
        return jsonify({'error': 'Pipeline task required'}), 400

    pipeline_task = data['pipeline_task']

    async def execute():
        return await claude_flow.execute_pipeline(pipeline_task)

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    result = loop.run_until_complete(execute())
    loop.close()

    return jsonify({
        'success': result.success,
        'result': result.result,
        'error': result.error
    })

@app.route('/health')
def health_check():
    """Health check endpoint."""
    return jsonify({
        'status': 'healthy',
        'claude_flow_initialized': claude_flow.initialized,
        'session_id': claude_flow.session_id
    })

@app.teardown_appcontext
def cleanup_claude_flow(error):
    """Cleanup Claude Flow on app teardown."""
    if claude_flow.initialized:
        async def cleanup():
            await claude_flow.cleanup()

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(cleanup())
        loop.close()

if __name__ == '__main__':
    app.run(debug=True, port=5000)
```

### Flask CLI Commands

```python
# cli.py
import click
import asyncio
from src.claude_flow_integration import ClaudeFlowContext

@click.group()
def cli():
    """Claude Flow CLI commands for Flask application."""
    pass

@cli.command()
@click.option('--agents', default='backend-dev,tester,reviewer', help='Comma-separated list of agents')
@click.argument('task')
def dev(agents, task):
    """Start development with Claude Flow agents."""
    async def run_dev():
        async with ClaudeFlowContext(topology="mesh") as cf:
            agent_list = agents.split(',')
            result = await cf.spawn_agents(agent_list, task, "parallel")
            click.echo(f"Development task completed: {result.success}")
            if result.error:
                click.echo(f"Error: {result.error}")

    asyncio.run(run_dev())

@cli.command()
@click.argument('feature')
def tdd(feature):
    """Run TDD workflow for a feature."""
    async def run_tdd():
        async with ClaudeFlowContext() as cf:
            result = await cf.run_tdd(feature)
            click.echo(f"TDD workflow completed: {result.success}")
            if result.error:
                click.echo(f"Error: {result.error}")

    asyncio.run(run_tdd())

@cli.command()
def build():
    """Build the Flask application with Claude Flow."""
    async def run_build():
        async with ClaudeFlowContext() as cf:
            result = await cf.execute_pipeline("Build Flask application with testing and optimization")
            click.echo(f"Build completed: {result.success}")
            if result.error:
                click.echo(f"Error: {result.error}")

    asyncio.run(run_build())

if __name__ == '__main__':
    cli()
```

## FastAPI Integration

### FastAPI Application with Claude Flow

```python
# main.py
from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import List, Optional
import asyncio
from contextlib import asynccontextmanager
from src.claude_flow_integration import ClaudeFlowIntegration

# Pydantic models
class TaskRequest(BaseModel):
    task: str
    agents: Optional[List[str]] = None
    strategy: str = "parallel"

class TDDRequest(BaseModel):
    feature: str

class PipelineRequest(BaseModel):
    pipeline_task: str

class TaskResponse(BaseModel):
    success: bool
    result: Optional[str] = None
    error: Optional[str] = None
    task_id: Optional[str] = None

# Global Claude Flow instance
claude_flow_instance = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global claude_flow_instance
    claude_flow_instance = ClaudeFlowIntegration(
        topology="mesh",
        agents=["backend-dev", "api-docs", "security-manager", "performance-benchmarker"]
    )
    await claude_flow_instance.initialize()
    yield
    # Shutdown
    if claude_flow_instance:
        await claude_flow_instance.cleanup()

app = FastAPI(
    title="Claude Flow API",
    description="FastAPI integration with Claude Flow for automated development",
    version="1.0.0",
    lifespan=lifespan
)

@app.post("/api/tasks/spawn", response_model=TaskResponse)
async def spawn_agents(task_request: TaskRequest):
    """Spawn Claude Flow agents to execute a task."""
    try:
        agents = task_request.agents or claude_flow_instance.default_agents
        result = await claude_flow_instance.spawn_agents(
            agents,
            task_request.task,
            task_request.strategy
        )

        return TaskResponse(
            success=result.success,
            result=result.result,
            error=result.error
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks/tdd", response_model=TaskResponse)
async def run_tdd_workflow(tdd_request: TDDRequest):
    """Run Test-Driven Development workflow."""
    try:
        result = await claude_flow_instance.run_tdd(tdd_request.feature)

        return TaskResponse(
            success=result.success,
            result=result.result,
            error=result.error
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/tasks/pipeline", response_model=TaskResponse)
async def execute_pipeline(pipeline_request: PipelineRequest):
    """Execute a complete development pipeline."""
    try:
        result = await claude_flow_instance.execute_pipeline(
            pipeline_request.pipeline_task
        )

        return TaskResponse(
            success=result.success,
            result=result.result,
            error=result.error
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/tasks/orchestrate")
async def orchestrate_task(
    task: str,
    agents: Optional[str] = None,
    strategy: str = "adaptive",
    priority: str = "medium"
):
    """Orchestrate a complex task across multiple agents."""
    try:
        agent_list = agents.split(',') if agents else None
        result = await claude_flow_instance.orchestrate_task(
            task, agent_list, strategy, priority
        )

        return TaskResponse(
            success=result.success,
            result=result.result,
            error=result.error
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "claude_flow_initialized": claude_flow_instance.initialized if claude_flow_instance else False,
        "session_id": claude_flow_instance.session_id if claude_flow_instance else None
    }

# Background task for long-running operations
@app.post("/api/tasks/background")
async def run_background_task(
    task_request: TaskRequest,
    background_tasks: BackgroundTasks
):
    """Run a task in the background."""
    task_id = f"bg-task-{int(asyncio.get_event_loop().time())}"

    async def background_execution():
        try:
            agents = task_request.agents or claude_flow_instance.default_agents
            result = await claude_flow_instance.spawn_agents(
                agents,
                task_request.task,
                task_request.strategy
            )
            # In a real application, you'd store this result in a database
            print(f"Background task {task_id} completed: {result.success}")
        except Exception as e:
            print(f"Background task {task_id} failed: {e}")

    background_tasks.add_task(background_execution)

    return TaskResponse(
        success=True,
        result=f"Background task started",
        task_id=task_id
    )

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
```

## Django Integration

### Django Settings Configuration

```python
# settings.py
import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent

# Claude Flow Configuration
CLAUDE_FLOW_CONFIG = {
    'TOPOLOGY': os.getenv('CLAUDE_FLOW_TOPOLOGY', 'mesh'),
    'DEFAULT_AGENTS': [
        'backend-dev',
        'tester',
        'reviewer',
        'security-manager'
    ],
    'SESSION_PREFIX': 'django-session',
    'AUTO_INITIALIZE': True,
    'CLEANUP_ON_SHUTDOWN': True
}

# Add Claude Flow app
INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'claude_flow_app',  # Custom Claude Flow Django app
]

# Async support
ASGI_APPLICATION = 'myproject.asgi.application'
```

### Django Claude Flow App

```python
# claude_flow_app/apps.py
from django.apps import AppConfig
import asyncio
from .integration import DjangoClaudeFlowIntegration

class ClaudeFlowAppConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'claude_flow_app'

    def ready(self):
        # Initialize Claude Flow when Django starts
        from django.conf import settings

        if getattr(settings, 'CLAUDE_FLOW_CONFIG', {}).get('AUTO_INITIALIZE'):
            integration = DjangoClaudeFlowIntegration()
            # Note: In production, you'd want to handle this more carefully
            try:
                loop = asyncio.get_event_loop()
                loop.run_until_complete(integration.initialize())
            except RuntimeError:
                # Event loop not running, create new one
                asyncio.run(integration.initialize())
```

```python
# claude_flow_app/integration.py
from django.conf import settings
from src.claude_flow_integration import ClaudeFlowIntegration
import asyncio

class DjangoClaudeFlowIntegration:
    _instance = None

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if not self._initialized:
            config = getattr(settings, 'CLAUDE_FLOW_CONFIG', {})
            self.claude_flow = ClaudeFlowIntegration(
                topology=config.get('TOPOLOGY', 'mesh'),
                agents=config.get('DEFAULT_AGENTS', ['coder', 'tester', 'reviewer'])
            )
            self._initialized = True

    async def initialize(self):
        await self.claude_flow.initialize()

    async def spawn_agents(self, agents, task, strategy='parallel'):
        return await self.claude_flow.spawn_agents(agents, task, strategy)

    async def run_tdd(self, feature):
        return await self.claude_flow.run_tdd(feature)

    async def execute_pipeline(self, task):
        return await self.claude_flow.execute_pipeline(task)

    async def cleanup(self):
        await self.claude_flow.cleanup()

# Singleton instance
django_claude_flow = DjangoClaudeFlowIntegration()
```

### Django Views

```python
# claude_flow_app/views.py
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
from django.utils.decorators import method_decorator
from django.views import View
import json
import asyncio
from .integration import django_claude_flow

@method_decorator(csrf_exempt, name='dispatch')
class ClaudeFlowTaskView(View):
    async def post(self, request):
        try:
            data = json.loads(request.body)
            task = data.get('task')
            agents = data.get('agents', django_claude_flow.claude_flow.default_agents)
            strategy = data.get('strategy', 'parallel')

            if not task:
                return JsonResponse({'error': 'Task description required'}, status=400)

            result = await django_claude_flow.spawn_agents(agents, task, strategy)

            return JsonResponse({
                'success': result.success,
                'result': result.result,
                'error': result.error,
                'timestamp': result.timestamp
            })

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

@method_decorator(csrf_exempt, name='dispatch')
class ClaudeFlowTDDView(View):
    async def post(self, request):
        try:
            data = json.loads(request.body)
            feature = data.get('feature')

            if not feature:
                return JsonResponse({'error': 'Feature name required'}, status=400)

            result = await django_claude_flow.run_tdd(feature)

            return JsonResponse({
                'success': result.success,
                'result': result.result,
                'error': result.error
            })

        except Exception as e:
            return JsonResponse({'error': str(e)}, status=500)

class HealthCheckView(View):
    def get(self, request):
        return JsonResponse({
            'status': 'healthy',
            'claude_flow_initialized': django_claude_flow.claude_flow.initialized
        })
```

### Django Management Commands

```python
# claude_flow_app/management/commands/claude_flow.py
from django.core.management.base import BaseCommand
import asyncio
from claude_flow_app.integration import django_claude_flow

class Command(BaseCommand):
    help = 'Claude Flow management commands'

    def add_arguments(self, parser):
        subparsers = parser.add_subparsers(dest='action', help='Available actions')

        # Spawn agents command
        spawn_parser = subparsers.add_parser('spawn', help='Spawn agents')
        spawn_parser.add_argument('--agents', required=True, help='Comma-separated list of agents')
        spawn_parser.add_argument('--task', required=True, help='Task description')
        spawn_parser.add_argument('--strategy', default='parallel', help='Execution strategy')

        # TDD command
        tdd_parser = subparsers.add_parser('tdd', help='Run TDD workflow')
        tdd_parser.add_argument('--feature', required=True, help='Feature name')

        # Pipeline command
        pipeline_parser = subparsers.add_parser('pipeline', help='Execute pipeline')
        pipeline_parser.add_argument('--task', required=True, help='Pipeline task')

    def handle(self, *args, **options):
        action = options['action']

        if action == 'spawn':
            self.handle_spawn(options)
        elif action == 'tdd':
            self.handle_tdd(options)
        elif action == 'pipeline':
            self.handle_pipeline(options)
        else:
            self.stdout.write(self.style.ERROR('Unknown action'))

    def handle_spawn(self, options):
        async def spawn():
            agents = options['agents'].split(',')
            task = options['task']
            strategy = options['strategy']

            result = await django_claude_flow.spawn_agents(agents, task, strategy)

            if result.success:
                self.stdout.write(self.style.SUCCESS(f'Task completed successfully'))
                self.stdout.write(f'Result: {result.result}')
            else:
                self.stdout.write(self.style.ERROR(f'Task failed: {result.error}'))

        asyncio.run(spawn())

    def handle_tdd(self, options):
        async def tdd():
            feature = options['feature']
            result = await django_claude_flow.run_tdd(feature)

            if result.success:
                self.stdout.write(self.style.SUCCESS(f'TDD workflow completed'))
                self.stdout.write(f'Result: {result.result}')
            else:
                self.stdout.write(self.style.ERROR(f'TDD failed: {result.error}'))

        asyncio.run(tdd())

    def handle_pipeline(self, options):
        async def pipeline():
            task = options['task']
            result = await django_claude_flow.execute_pipeline(task)

            if result.success:
                self.stdout.write(self.style.SUCCESS(f'Pipeline completed'))
                self.stdout.write(f'Result: {result.result}')
            else:
                self.stdout.write(self.style.ERROR(f'Pipeline failed: {result.error}'))

        asyncio.run(pipeline())
```

## Data Science Integration

### Jupyter Notebook Integration

```python
# jupyter_claude_flow.py
import asyncio
from IPython.display import display, HTML
import pandas as pd
import matplotlib.pyplot as plt
from src.claude_flow_integration import ClaudeFlowContext

class JupyterClaudeFlow:
    """Claude Flow integration for Jupyter notebooks."""

    def __init__(self):
        self.current_context = None

    async def start_session(self, topology="mesh", agents=None):
        """Start a Claude Flow session in Jupyter."""
        agents = agents or ["ml-developer", "code-analyzer", "performance-benchmarker"]

        self.current_context = ClaudeFlowContext(
            topology=topology,
            agents=agents
        )

        self.claude_flow = await self.current_context.__aenter__()

        display(HTML(f"""
        <div style="background-color: #e8f5e8; padding: 10px; border-radius: 5px;">
            <strong>Claude Flow Session Started</strong><br>
            Topology: {topology}<br>
            Agents: {', '.join(agents)}<br>
            Session ID: {self.claude_flow.session_id}
        </div>
        """))

        return self.claude_flow

    async def analyze_data(self, df, analysis_task):
        """Analyze data using Claude Flow agents."""
        if not self.claude_flow:
            raise RuntimeError("Session not started. Call start_session() first.")

        # Save dataframe info for agents to analyze
        data_info = {
            'shape': df.shape,
            'columns': list(df.columns),
            'dtypes': df.dtypes.to_dict(),
            'memory_usage': df.memory_usage(deep=True).sum(),
            'null_values': df.isnull().sum().to_dict()
        }

        task = f"""
        Analyze dataset with the following characteristics:
        - Shape: {data_info['shape']}
        - Columns: {data_info['columns']}
        - Data types: {data_info['dtypes']}
        - Memory usage: {data_info['memory_usage']} bytes
        - Null values: {data_info['null_values']}

        Analysis task: {analysis_task}
        """

        result = await self.claude_flow.spawn_agents(
            ["ml-developer", "code-analyzer"],
            task,
            "parallel"
        )

        display(HTML(f"""
        <div style="background-color: #fff3e0; padding: 10px; border-radius: 5px;">
            <strong>Data Analysis Results</strong><br>
            Success: {result.success}<br>
            {result.result if result.success else f'Error: {result.error}'}
        </div>
        """))

        return result

    async def optimize_code(self, code_cell):
        """Optimize code using Claude Flow agents."""
        if not self.claude_flow:
            raise RuntimeError("Session not started. Call start_session() first.")

        task = f"Optimize this Python data science code for performance and readability:\n\n{code_cell}"

        result = await self.claude_flow.spawn_agents(
            ["performance-benchmarker", "code-analyzer"],
            task,
            "sequential"
        )

        return result

    async def generate_ml_pipeline(self, problem_description):
        """Generate ML pipeline using Claude Flow."""
        if not self.claude_flow:
            raise RuntimeError("Session not started. Call start_session() first.")

        task = f"Create a complete machine learning pipeline for: {problem_description}"

        result = await self.claude_flow.run_tdd(f"ML Pipeline: {problem_description}")

        return result

    async def end_session(self):
        """End the Claude Flow session."""
        if self.current_context:
            await self.current_context.__aexit__(None, None, None)

            display(HTML("""
            <div style="background-color: #ffcdd2; padding: 10px; border-radius: 5px;">
                <strong>Claude Flow Session Ended</strong>
            </div>
            """))

            self.current_context = None
            self.claude_flow = None

# Usage in Jupyter cells:
jupyter_cf = JupyterClaudeFlow()

# In a Jupyter cell:
# await jupyter_cf.start_session()
# result = await jupyter_cf.analyze_data(df, "Find patterns and anomalies")
# await jupyter_cf.end_session()
```

### Data Science Workflow Script

```python
# data_science_workflow.py
import pandas as pd
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report
import asyncio
from src.claude_flow_integration import ClaudeFlowContext

async def automated_ml_workflow(dataset_path, target_column):
    """Automated ML workflow using Claude Flow."""

    async with ClaudeFlowContext(
        topology="hierarchical",
        agents=["ml-developer", "code-analyzer", "performance-benchmarker"]
    ) as cf:

        # Step 1: Data Analysis
        print("Step 1: Analyzing dataset...")
        analysis_result = await cf.spawn_agents(
            ["ml-developer"],
            f"Analyze dataset at {dataset_path} with target column {target_column}",
            "parallel"
        )

        if not analysis_result.success:
            print(f"Data analysis failed: {analysis_result.error}")
            return

        # Load and prepare data
        df = pd.read_csv(dataset_path)
        X = df.drop(columns=[target_column])
        y = df[target_column]

        # Step 2: Feature Engineering
        print("Step 2: Feature engineering...")
        feature_result = await cf.spawn_agents(
            ["ml-developer", "code-analyzer"],
            f"Suggest feature engineering for dataset with columns: {list(X.columns)}",
            "sequential"
        )

        # Step 3: Model Development with TDD
        print("Step 3: Developing ML model with TDD...")
        model_result = await cf.run_tdd(
            f"Machine learning model for {target_column} prediction"
        )

        # Step 4: Model Training (simplified)
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        model = RandomForestClassifier(random_state=42)
        model.fit(X_train, y_train)

        y_pred = model.predict(X_test)

        # Step 5: Performance Analysis
        print("Step 5: Analyzing model performance...")
        performance_result = await cf.spawn_agents(
            ["performance-benchmarker"],
            f"Analyze ML model performance with accuracy: {model.score(X_test, y_test):.3f}",
            "parallel"
        )

        print("ML Workflow completed!")
        print(f"Model accuracy: {model.score(X_test, y_test):.3f}")
        print(classification_report(y_test, y_pred))

        return {
            'model': model,
            'accuracy': model.score(X_test, y_test),
            'analysis': analysis_result,
            'features': feature_result,
            'model_development': model_result,
            'performance': performance_result
        }

# Usage
if __name__ == "__main__":
    result = asyncio.run(automated_ml_workflow("data/dataset.csv", "target"))
```

## Testing Integration

### Pytest Configuration

```python
# conftest.py
import pytest
import asyncio
from src.claude_flow_integration import ClaudeFlowIntegration

@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def claude_flow():
    """Setup Claude Flow for testing."""
    cf = ClaudeFlowIntegration(
        topology="mesh",
        agents=["tester", "code-analyzer", "security-auditor"]
    )

    await cf.initialize()
    yield cf
    await cf.cleanup()

@pytest.fixture
async def test_agents(claude_flow):
    """Provide test-specific agents."""
    async def spawn_test_agents(task):
        return await claude_flow.spawn_agents(
            ["tester", "code-analyzer"],
            task,
            "parallel"
        )

    return spawn_test_agents
```

### Test Suite with Claude Flow

```python
# test_claude_flow_integration.py
import pytest
import asyncio
from src.claude_flow_integration import ClaudeFlowContext

class TestClaudeFlowIntegration:

    @pytest.mark.asyncio
    async def test_agent_spawning(self, claude_flow):
        """Test basic agent spawning functionality."""
        result = await claude_flow.spawn_agents(
            ["coder", "tester"],
            "Create a simple function with unit tests"
        )

        assert result.success
        assert result.result is not None
        assert "function" in result.result.lower()

    @pytest.mark.asyncio
    async def test_tdd_workflow(self, claude_flow):
        """Test TDD workflow execution."""
        result = await claude_flow.run_tdd("User authentication system")

        assert result.success
        assert result.result is not None

    @pytest.mark.asyncio
    async def test_parallel_execution_performance(self, claude_flow):
        """Test that parallel execution is faster than sequential."""
        import time

        # Parallel execution
        start_time = time.time()
        parallel_result = await claude_flow.spawn_agents(
            ["backend-dev", "mobile-dev", "tester"],
            "Create API endpoints with tests",
            "parallel"
        )
        parallel_duration = time.time() - start_time

        # Sequential execution
        start_time = time.time()
        sequential_result = await claude_flow.spawn_agents(
            ["backend-dev", "mobile-dev", "tester"],
            "Create API endpoints with tests",
            "sequential"
        )
        sequential_duration = time.time() - start_time

        assert parallel_result.success
        assert sequential_result.success
        assert parallel_duration < sequential_duration

    @pytest.mark.asyncio
    async def test_error_handling(self, claude_flow):
        """Test error handling in agent execution."""
        result = await claude_flow.spawn_agents(
            ["invalid-agent"],
            "This should fail"
        )

        assert not result.success
        assert result.error is not None

    @pytest.mark.asyncio
    async def test_context_manager(self):
        """Test Claude Flow context manager."""
        async with ClaudeFlowContext() as cf:
            result = await cf.spawn_agents(
                ["coder"],
                "Simple test function"
            )
            assert result.success

    @pytest.mark.asyncio
    async def test_pipeline_execution(self, claude_flow):
        """Test complete pipeline execution."""
        result = await claude_flow.execute_pipeline(
            "Build, test, and optimize Python application"
        )

        assert result.success
        assert result.result is not None

# Performance tests
class TestPerformance:

    @pytest.mark.asyncio
    async def test_concurrent_tasks(self, claude_flow):
        """Test handling multiple concurrent tasks."""
        tasks = [
            claude_flow.spawn_agents(["coder"], f"Task {i}")
            for i in range(5)
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        successful_results = [r for r in results if not isinstance(r, Exception) and r.success]
        assert len(successful_results) >= 3  # At least 3 should succeed

    @pytest.mark.asyncio
    async def test_memory_usage(self, claude_flow):
        """Test memory usage doesn't grow excessively."""
        import psutil
        import os

        process = psutil.Process(os.getpid())
        initial_memory = process.memory_info().rss

        # Run multiple tasks
        for i in range(10):
            await claude_flow.spawn_agents(
                ["tester"],
                f"Memory test task {i}"
            )

        final_memory = process.memory_info().rss
        memory_growth = final_memory - initial_memory

        # Memory growth should be reasonable (less than 100MB)
        assert memory_growth < 100 * 1024 * 1024
```

## Deployment Patterns

### Docker Integration

```dockerfile
# Dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install Node.js for claude-flow
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install claude-flow
RUN npm install -g claude-flow@alpha

# Copy application code
COPY . .

# Setup Claude Flow MCP servers
RUN npx claude-flow-novice mcp add claude-flow-novice npx claude-flow@alpha mcp start
RUN npx claude-flow-novice mcp add ruv-swarm npx ruv-swarm mcp start

# Expose port
EXPOSE 8000

# Health check
HEALTHCHECK --interval=30s --timeout=30s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

# Start application
CMD ["python", "-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### Docker Compose for Development

```yaml
# docker-compose.yml
version: '3.8'

services:
  claude-flow-app:
    build: .
    ports:
      - "8000:8000"
    environment:
      - CLAUDE_FLOW_TOPOLOGY=mesh
      - CLAUDE_FLOW_AGENTS=backend-dev,tester,reviewer
      - NODE_ENV=development
    volumes:
      - ./src:/app/src
      - ./tests:/app/tests
      - claude-flow-cache:/app/.claude-flow
    depends_on:
      - redis
      - postgres
    networks:
      - claude-flow-network

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    networks:
      - claude-flow-network

  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: claude_flow_db
      POSTGRES_USER: user
      POSTGRES_PASSWORD: password
    ports:
      - "5432:5432"
    volumes:
      - postgres-data:/var/lib/postgresql/data
    networks:
      - claude-flow-network

volumes:
  claude-flow-cache:
  postgres-data:

networks:
  claude-flow-network:
    driver: bridge
```

### Kubernetes Deployment

```yaml
# k8s-deployment.yml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: claude-flow-python-app
  labels:
    app: claude-flow-python
spec:
  replicas: 3
  selector:
    matchLabels:
      app: claude-flow-python
  template:
    metadata:
      labels:
        app: claude-flow-python
    spec:
      containers:
      - name: claude-flow-app
        image: claude-flow-python:latest
        ports:
        - containerPort: 8000
        env:
        - name: CLAUDE_FLOW_TOPOLOGY
          value: "hierarchical"
        - name: CLAUDE_FLOW_AGENTS
          value: "backend-dev,api-docs,security-manager"
        resources:
          requests:
            memory: "512Mi"
            cpu: "250m"
          limits:
            memory: "1Gi"
            cpu: "500m"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 5
          periodSeconds: 5

---
apiVersion: v1
kind: Service
metadata:
  name: claude-flow-python-service
spec:
  selector:
    app: claude-flow-python
  ports:
  - protocol: TCP
    port: 80
    targetPort: 8000
  type: LoadBalancer
```

## Best Practices for Python Integration

### 1. Async/Await Patterns

```python
# Always use async/await for Claude Flow operations
async def process_data_pipeline():
    async with ClaudeFlowContext() as cf:
        # Parallel data processing
        tasks = [
            cf.spawn_agents(["ml-developer"], "Clean dataset"),
            cf.spawn_agents(["code-analyzer"], "Analyze data quality"),
            cf.spawn_agents(["performance-benchmarker"], "Optimize processing")
        ]

        results = await asyncio.gather(*tasks)
        return results
```

### 2. Error Handling and Logging

```python
import logging
from functools import wraps

def claude_flow_error_handler(func):
    @wraps(func)
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except Exception as e:
            logging.error(f"Claude Flow operation failed: {e}")
            # Implement fallback logic
            return {"success": False, "error": str(e), "fallback": True}
    return wrapper

@claude_flow_error_handler
async def robust_agent_execution(task):
    async with ClaudeFlowContext() as cf:
        return await cf.spawn_agents(["coder"], task)
```

### 3. Configuration Management

```python
# config.py
import os
from dataclasses import dataclass
from typing import List

@dataclass
class ClaudeFlowConfig:
    topology: str = "mesh"
    default_agents: List[str] = None
    session_prefix: str = "python-session"
    auto_cleanup: bool = True
    max_concurrent_tasks: int = 5

    def __post_init__(self):
        if self.default_agents is None:
            self.default_agents = ["coder", "tester", "reviewer"]

    @classmethod
    def from_env(cls):
        return cls(
            topology=os.getenv("CLAUDE_FLOW_TOPOLOGY", "mesh"),
            default_agents=os.getenv("CLAUDE_FLOW_AGENTS", "coder,tester,reviewer").split(","),
            session_prefix=os.getenv("CLAUDE_FLOW_SESSION_PREFIX", "python-session"),
            auto_cleanup=os.getenv("CLAUDE_FLOW_AUTO_CLEANUP", "true").lower() == "true",
            max_concurrent_tasks=int(os.getenv("CLAUDE_FLOW_MAX_TASKS", "5"))
        )
```

### 4. Resource Management

```python
import asyncio
from contextlib import asynccontextmanager

class ClaudeFlowResourceManager:
    def __init__(self, max_concurrent=5):
        self.semaphore = asyncio.Semaphore(max_concurrent)
        self.active_sessions = {}

    @asynccontextmanager
    async def get_session(self, session_id=None):
        async with self.semaphore:
            session_id = session_id or f"session-{len(self.active_sessions)}"

            if session_id not in self.active_sessions:
                session = ClaudeFlowIntegration()
                await session.initialize()
                self.active_sessions[session_id] = session

            try:
                yield self.active_sessions[session_id]
            finally:
                # Keep session alive for reuse
                pass

    async def cleanup_all(self):
        for session in self.active_sessions.values():
            await session.cleanup()
        self.active_sessions.clear()

# Global resource manager
resource_manager = ClaudeFlowResourceManager()
```

## Next Steps

- Explore [Rust Integration](../rust/integration.md)
- Review [Performance Optimization](../../wiki/performance-optimization-strategies.md)
- Study [CI/CD Integration Patterns](../../examples/integration-patterns.md#cicd-pipeline-integration)