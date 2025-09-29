# Python Development with Claude-Flow

A comprehensive guide to Python development using claude-flow-novice orchestration for enhanced productivity, automated testing, and intelligent code generation.

## 🐍 Python Development Workflow

### 🎯 Python Project Type Flow
```
                        🐍 PYTHON DEVELOPMENT WORKFLOW

    Python Project Start
              │
              ▼
    ┌─────────────────────┐
    │ What's your goal?   │
    └─────────────────────┘
              │
    ┌─────────┼─────────┼─────────┼─────────┐
    │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│ WEB     │ │ DATA    │ │ CLI/    │ │ API     │ │ ML/AI   │
│ APP     │ │ SCIENCE │ │ SCRIPTS │ │ SERVICE │ │ PROJECT │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
    │         │         │         │         │
    ▼         ▼         ▼         ▼         ▼
┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐
│Django   │ │Jupyter  │ │Click    │ │FastAPI  │ │PyTorch  │
│Flask    │ │Pandas   │ │Argparse │ │Flask    │ │TensorFlow│
│FastAPI  │ │NumPy    │ │Typer    │ │Django   │ │Scikit   │
│Pyramid  │ │Matplotlib│ │Rich     │ │Rest     │ │Hugging  │
└─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘
    │         │         │         │         │
    └─────────┼─────────┼─────────┼─────────┘
              │         │         │
              ▼         ▼         ▼
    ┌─────────────────────────────────────────┐
    │          AGENT SPECIALIZATION           │
    │                                        │
    │ Web:        backend-dev + frontend     │
    │ Data:       data-scientist + analyst   │
    │ CLI:        coder + system-architect   │
    │ API:        backend-dev + api-docs     │
    │ ML:         ml-developer + researcher  │
    └─────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────────────────────────┐
    │        ENVIRONMENT SETUP               │
    │                                        │
    │ 1. Virtual Environment (venv/conda)    │
    │ 2. Dependencies (requirements/poetry)   │
    │ 3. Code Quality (black/flake8/mypy)    │
    │ 4. Testing (pytest/coverage)           │
    │ 5. CI/CD (GitHub Actions)              │
    └─────────────────────────────────────────┘
              │
              ▼
    ┌─────────────────────────────────────────┐
    │         DEVELOPMENT FLOW               │
    │                                        │
    │ Start → Code → Test → Review → Deploy  │
    │   ↓       ↓      ↓       ↓       ↓    │
    │ Agent   Agent  Agent   Agent   Agent   │
    │ Setup   Code   Test    Review  Deploy  │
    └─────────────────────────────────────────┘
```

## 🐍 Overview

Python development with claude-flow-novice combines the simplicity of Python with the power of AI-assisted development workflows. This documentation covers everything from basic project setup to advanced data science workflows, web development, and testing automation.

## 📚 Documentation Structure

### [Setup & Environment Management](./setup/)
- Virtual environment management
- Dependency management with Poetry/pip
- Python version management with pyenv
- IDE configuration and tooling

### [Web Development](./web-development/)
- **Django**: Full-stack web applications with agent assistance
- **Flask**: API development and microservices
- **FastAPI**: Modern async API development
- Testing automation and deployment

### [Data Science](./data-science/)
- Jupyter notebook workflows
- Data analysis with pandas/numpy
- Machine learning pipelines
- Visualization and reporting

### [Testing & CI/CD](./testing/)
- pytest strategies and automation
- Continuous integration with GitHub Actions
- Code quality tools (black, flake8, mypy)
- Performance testing and monitoring

### [Practical Examples](./examples/)
- Real-world project templates
- Agent coordination patterns
- CLI and MCP usage examples
- Best practices and workflows

## 🚀 Quick Start with Claude-Flow

### 1. Initialize Python Project with Agents

```bash
# Set up coordination topology
npx claude-flow@alpha mcp swarm_init --topology hierarchical --maxAgents 5

# Spawn specialized Python agents
npx claude-flow@alpha sparc run architect "Python web API with FastAPI"
```

### 2. Agent-Assisted Development

```bash
# Use Task tool for parallel development
Task("Backend Developer", "Create FastAPI application with authentication", "backend-dev")
Task("Database Architect", "Design SQLAlchemy models and migrations", "code-analyzer")
Task("Test Engineer", "Write pytest test suite with 90% coverage", "tester")
Task("DevOps Engineer", "Setup Docker and CI/CD pipeline", "cicd-engineer")
```

### 3. MCP Tool Integration

```bash
# GitHub integration for Python projects
npx claude-flow@alpha mcp github_repo_analyze --repo "username/python-project"
npx claude-flow@alpha mcp github_pr_manage --action review --repo "username/python-project"

# Performance monitoring
npx claude-flow@alpha mcp benchmark_run --type python
npx claude-flow@alpha mcp performance_report --format detailed
```

## 🛠️ Core Agent Types for Python Development

### Development Agents
- **`backend-dev`**: Python web backends (Django, Flask, FastAPI)
- **`ml-developer`**: Data science and machine learning
- **`api-docs`**: API documentation and OpenAPI specs
- **`code-analyzer`**: Code quality and performance analysis

### Specialized Agents
- **`tester`**: pytest, unittest, integration testing
- **`cicd-engineer`**: GitHub Actions, Docker, deployment
- **`reviewer`**: Code review and security analysis
- **`system-architect`**: System design and architecture

### Coordination Agents
- **`sparc-coord`**: SPARC methodology coordination
- **`task-orchestrator`**: Multi-agent task management
- **`memory-coordinator`**: Context and state management

## 📊 Python Development Workflow

### SPARC Methodology for Python

```bash
# 1. Specification - Analyze requirements
npx claude-flow@alpha sparc run spec-pseudocode "E-commerce API with payment integration"

# 2. Architecture - Design system
npx claude-flow@alpha sparc run architect "FastAPI microservices architecture"

# 3. Refinement - TDD implementation
npx claude-flow@alpha sparc tdd "User authentication system"

# 4. Completion - Integration and deployment
npx claude-flow@alpha sparc run integration "Deploy to production with monitoring"
```

### Concurrent Development Pattern

```javascript
// Single message parallel execution
[Parallel Agent Execution]:
  Task("Requirements Analyst", "Analyze Python project requirements and dependencies", "researcher")
  Task("Backend Developer", "Implement core Python application logic", "backend-dev")
  Task("Database Developer", "Design and implement database layer", "code-analyzer")
  Task("Test Engineer", "Create comprehensive test suite", "tester")
  Task("Documentation Writer", "Generate API docs and user guides", "api-docs")

  // Batch file operations
  Write "app/main.py"
  Write "app/models.py"
  Write "app/api/routes.py"
  Write "tests/test_main.py"
  Write "requirements.txt"
  Write "pyproject.toml"
```

## 🧠 Memory and Context Management

### Session Coordination

```bash
# Pre-task setup
npx claude-flow@alpha hooks pre-task --description "Python FastAPI development"
npx claude-flow@alpha hooks session-restore --session-id "python-api-dev"

# During development
npx claude-flow@alpha hooks post-edit --file "app/main.py" --memory-key "swarm/backend/fastapi"
npx claude-flow@alpha hooks notify --message "FastAPI routes implemented"

# Post-task cleanup
npx claude-flow@alpha hooks post-task --task-id "fastapi-implementation"
npx claude-flow@alpha hooks session-end --export-metrics true
```

### Memory Storage Patterns

```bash
# Store Python-specific context
npx claude-flow@alpha mcp memory_usage --action store --key "python/dependencies" --value "fastapi,sqlalchemy,pytest"
npx claude-flow@alpha mcp memory_usage --action store --key "python/architecture" --value "microservices"

# Retrieve context for agents
npx claude-flow@alpha mcp memory_search --pattern "python/*" --limit 10
```

## 🔧 Advanced Features

### Neural Pattern Learning
- Code pattern recognition for Python idioms
- Automatic best practice enforcement
- Performance optimization suggestions
- Security vulnerability detection

### GitHub Integration
- Automated code review for Python PRs
- Dependency vulnerability scanning
- CI/CD pipeline optimization
- Issue triage and management

### Performance Monitoring
- Real-time application performance tracking
- Memory usage analysis
- Database query optimization
- API response time monitoring

## 📈 Performance Benefits

With claude-flow-novice orchestration:
- **84.8% faster development** with agent coordination
- **32.3% token reduction** through intelligent context management
- **2.8-4.4x speed improvement** in testing and deployment
- **Automated code review** with 95% accuracy

## 🎯 Getting Started

1. **[Setup Guide](./setup/README.md)** - Environment and tooling setup
2. **[Web Development](./web-development/README.md)** - Django and Flask tutorials
3. **[Data Science](./data-science/README.md)** - Jupyter and ML workflows
4. **[Testing](./testing/README.md)** - Comprehensive testing strategies

## 🔗 Related Resources

- [Claude-Flow Documentation](https://github.com/ruvnet/claude-flow)
- [Python Official Documentation](https://docs.python.org/)
- [SPARC Methodology Guide](../../methodology/sparc.md)
- [Agent Orchestration Patterns](../../patterns/agent-coordination.md)

---

**Ready to supercharge your Python development?** Start with the [Setup Guide](./setup/README.md) or jump into a [practical example](./examples/fastapi-microservice.md).

### Specialized Python Domains
```python
# Domain-specific agent spawning
Task("ML Engineer", "Create machine learning pipeline with scikit-learn and MLflow", "ml-developer")
Task("Data Scientist", "Build data analysis notebook with pandas and visualization", "data-scientist")
Task("Web Developer", "Create FastAPI microservice with async/await patterns", "backend-dev")
Task("DevOps Engineer", "Build Python automation scripts for CI/CD", "cicd-engineer")
```

## 🎯 Quick Start: Python Projects

### 1. FastAPI Microservice
```bash
# Initialize FastAPI project
npx claude-flow@alpha init --template fastapi-microservice

# Spawn Python backend expert
npx claude-flow@alpha agents spawn backend-dev \
  "create FastAPI microservice with SQLAlchemy, Pydantic, and PostgreSQL"

# Generated features:
# - FastAPI with automatic OpenAPI docs
# - SQLAlchemy ORM with Alembic migrations
# - Pydantic models for request/response validation
# - JWT authentication and authorization
# - Comprehensive pytest test suite
# - Docker configuration
```

### 2. Machine Learning Pipeline
```bash
# Initialize ML project
npx claude-flow@alpha init --template ml-pipeline

# Spawn ML specialist
npx claude-flow@alpha agents spawn ml-developer \
  "create end-to-end ML pipeline with model training, evaluation, and deployment"

# Pipeline components:
# - Data preprocessing with pandas
# - Feature engineering and selection
# - Model training with scikit-learn/TensorFlow
# - Model evaluation and validation
# - MLflow for experiment tracking
# - Model deployment with FastAPI
```

### 3. Data Science Notebook
```bash
# Complete SPARC workflow for data analysis
npx claude-flow@alpha sparc tdd \
  "customer segmentation analysis with visualization dashboard"

# Multi-agent coordination:
# - Data Engineer: ETL pipeline with pandas
# - Data Scientist: Analysis and modeling
# - Visualization Expert: Interactive dashboards
# - ML Engineer: Model deployment
```

## 🛠️ Python Agent Coordination

### Data Science Team Coordination
```python
# Coordinated data science workflow
mcp__claude-flow__swarm_init({
  topology: "hierarchical",
  coordinator: "data-science-lead",
  maxAgents: 5,
  strategy: "data-driven-development"
})

Task("Data Engineer", "Build ETL pipeline with pandas and Apache Airflow", "data-engineer")
Task("Data Scientist", "Exploratory analysis and feature engineering", "data-scientist")
Task("ML Engineer", "Model training and hyperparameter tuning", "ml-developer")
Task("MLOps Engineer", "Model deployment and monitoring", "cicd-engineer")
Task("Visualization Expert", "Create interactive dashboards with Plotly", "coder")

# Shared data schema and pipeline
mcp__claude-flow__memory_store({
  key: "project/data-pipeline",
  data: {
    schema: "Customer data with demographics and behavior",
    pipeline: "pandas -> feature_engineering -> model_training -> deployment",
    models: "RandomForest, XGBoost, Neural Networks",
    metrics: "accuracy, precision, recall, f1-score"
  },
  scope: "shared"
})
```

### Web Development Coordination
```python
# Full-stack Python web development
Task("Backend Developer", "Django REST API with PostgreSQL", "backend-dev")
Task("Frontend Developer", "React frontend consuming Python API", "frontend-dev")
Task("Database Architect", "PostgreSQL schema with Django ORM", "code-analyzer")
Task("API Designer", "RESTful API design with Django REST Framework", "api-docs")
```

## 📦 Python Project Templates

### Available Templates
```bash
# List Python-specific templates
npx claude-flow@alpha templates list --language python

# Popular templates:
# - fastapi-microservice: Modern async API
# - django-web-app: Full-featured web application
# - ml-pipeline: Machine learning workflow
# - data-science-notebook: Jupyter-based analysis
# - flask-api: Lightweight REST API
# - streamlit-dashboard: Interactive data dashboard
```

### Template Customization
```bash
# Customize ML template with specific requirements
npx claude-flow@alpha init --template ml-pipeline \
  --features "tensorflow,mlflow,docker,kubernetes" \
  --python-version "3.11" \
  --agent-preferences "best-practices,performance-focused"
```

## 🎭 Python-Specific Agents

### Web Development Agents
- **backend-dev**: Django, Flask, FastAPI expertise
- **api-designer**: RESTful API design, OpenAPI specs
- **database-architect**: SQLAlchemy, PostgreSQL, MongoDB
- **security-manager**: Python security best practices

### Data Science & ML Agents
- **data-scientist**: pandas, NumPy, statistical analysis
- **ml-developer**: TensorFlow, PyTorch, scikit-learn
- **data-engineer**: ETL pipelines, Apache Airflow
- **mlops-engineer**: Model deployment, monitoring

### Automation & DevOps Agents
- **automation-engineer**: Python scripting, task automation
- **cicd-engineer**: Python-based CI/CD, testing
- **performance-optimizer**: Python performance tuning
- **package-manager**: Poetry, pip, conda management

## 🔧 Python Development Workflow

### Modern Python Development
```bash
# 1. Project initialization with Poetry
npx claude-flow@alpha init --template python-modern --package-manager poetry

# 2. SPARC workflow with Python focus
npx claude-flow@alpha sparc tdd "recommendation system API"

# 3. Quality automation with Python tools
npx claude-flow@alpha hooks enable --language python
# Enables: Black, flake8, mypy, pytest, coverage

# 4. Python-specific quality gates
npx claude-flow@alpha hooks quality-gate \
  --requirements "black-formatted,flake8-clean,mypy-pass,coverage-90"
```

### Package Management
```python
# Poetry configuration generated by agents
[tool.poetry]
name = "my-python-project"
version = "0.1.0"
description = "AI-generated Python application"
authors = ["Claude Flow Agent <agent@claude-flow.ai>"]

[tool.poetry.dependencies]
python = "^3.11"
fastapi = "^0.104.1"
uvicorn = "^0.24.0"
sqlalchemy = "^2.0.23"
pydantic = "^2.5.0"

[tool.poetry.dev-dependencies]
pytest = "^7.4.3"
black = "^23.11.0"
flake8 = "^6.1.0"
mypy = "^1.7.1"
coverage = "^7.3.2"

[build-system]
requires = ["poetry-core>=1.0.0"]
build-backend = "poetry.core.masonry.api"
```

## 🚀 Advanced Python Patterns

### Async/Await Patterns
```python
# Modern asynchronous Python patterns
import asyncio
import aiohttp
from typing import List, Optional
from pydantic import BaseModel

class UserService:
    def __init__(self, db_pool):
        self.db_pool = db_pool

    async def get_user(self, user_id: int) -> Optional[User]:
        async with self.db_pool.acquire() as conn:
            result = await conn.fetchrow(
                "SELECT * FROM users WHERE id = $1", user_id
            )
            return User(**result) if result else None

    async def get_users_batch(self, user_ids: List[int]) -> List[User]:
        tasks = [self.get_user(user_id) for user_id in user_ids]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [user for user in results if isinstance(user, User)]

# FastAPI integration with dependency injection
from fastapi import FastAPI, Depends
from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    app.state.db_pool = await create_db_pool()
    yield
    # Shutdown
    await app.state.db_pool.close()

app = FastAPI(lifespan=lifespan)

async def get_user_service() -> UserService:
    return UserService(app.state.db_pool)

@app.get("/users/{user_id}")
async def get_user(
    user_id: int,
    user_service: UserService = Depends(get_user_service)
) -> User:
    user = await user_service.get_user(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user
```

### Machine Learning Patterns
```python
# MLOps pipeline with Python agents
import mlflow
import mlflow.sklearn
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report
import pandas as pd

class MLPipeline:
    def __init__(self, experiment_name: str):
        mlflow.set_experiment(experiment_name)
        self.model = None

    def load_and_preprocess_data(self, data_path: str) -> tuple:
        """Load and preprocess data with feature engineering"""
        df = pd.read_csv(data_path)

        # Feature engineering
        df = self.engineer_features(df)

        # Split features and target
        X = df.drop('target', axis=1)
        y = df['target']

        return train_test_split(X, y, test_size=0.2, random_state=42)

    def train_model(self, X_train, y_train, **hyperparams):
        """Train model with MLflow tracking"""
        with mlflow.start_run():
            # Log hyperparameters
            mlflow.log_params(hyperparams)

            # Train model
            self.model = RandomForestClassifier(**hyperparams)
            self.model.fit(X_train, y_train)

            # Log model
            mlflow.sklearn.log_model(self.model, "model")

            return self.model

    def evaluate_model(self, X_test, y_test):
        """Evaluate model and log metrics"""
        predictions = self.model.predict(X_test)
        accuracy = accuracy_score(y_test, predictions)

        with mlflow.start_run():
            mlflow.log_metric("accuracy", accuracy)
            mlflow.log_text(
                classification_report(y_test, predictions),
                "classification_report.txt"
            )

        return accuracy
```

### Data Engineering Patterns
```python
# Apache Airflow DAG for data pipeline
from airflow import DAG
from airflow.operators.python import PythonOperator
from datetime import datetime, timedelta
import pandas as pd
import numpy as np

default_args = {
    'owner': 'claude-flow-agent',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5)
}

def extract_data(**context):
    """Extract data from various sources"""
    # Data extraction logic
    df = pd.read_sql("SELECT * FROM source_table", connection)
    return df.to_json()

def transform_data(**context):
    """Transform and clean data"""
    # Get data from previous task
    df_json = context['task_instance'].xcom_pull(task_ids='extract_data')
    df = pd.read_json(df_json)

    # Data transformation logic
    df_cleaned = clean_data(df)
    df_features = engineer_features(df_cleaned)

    return df_features.to_json()

def load_data(**context):
    """Load processed data to destination"""
    # Get transformed data
    df_json = context['task_instance'].xcom_pull(task_ids='transform_data')
    df = pd.read_json(df_json)

    # Load to destination
    df.to_sql('processed_table', connection, if_exists='replace')

# Define DAG
dag = DAG(
    'data_pipeline',
    default_args=default_args,
    description='Data processing pipeline',
    schedule_interval=timedelta(hours=1),
    catchup=False
)

# Define tasks
extract_task = PythonOperator(
    task_id='extract_data',
    python_callable=extract_data,
    dag=dag
)

transform_task = PythonOperator(
    task_id='transform_data',
    python_callable=transform_data,
    dag=dag
)

load_task = PythonOperator(
    task_id='load_data',
    python_callable=load_data,
    dag=dag
)

# Set task dependencies
extract_task >> transform_task >> load_task
```

## 🧪 Python Testing Strategies

### Comprehensive Testing Framework
```python
# pytest configuration with comprehensive testing
import pytest
from fastapi.testclient import TestClient
from unittest.mock import Mock, patch
import pandas as pd
import numpy as np

# Fixture for test data
@pytest.fixture
def sample_dataframe():
    return pd.DataFrame({
        'feature1': np.random.randn(100),
        'feature2': np.random.randn(100),
        'target': np.random.choice([0, 1], 100)
    })

# Unit tests for ML pipeline
class TestMLPipeline:
    def test_feature_engineering(self, sample_dataframe):
        pipeline = MLPipeline("test_experiment")
        engineered_df = pipeline.engineer_features(sample_dataframe)

        assert engineered_df.shape[1] > sample_dataframe.shape[1]
        assert 'feature1_squared' in engineered_df.columns

    @patch('mlflow.start_run')
    def test_model_training(self, mock_mlflow, sample_dataframe):
        pipeline = MLPipeline("test_experiment")
        X = sample_dataframe.drop('target', axis=1)
        y = sample_dataframe['target']

        model = pipeline.train_model(X, y, n_estimators=10)

        assert model is not None
        assert hasattr(model, 'predict')
        mock_mlflow.assert_called()

# Integration tests for API
class TestUserAPI:
    @pytest.fixture
    def client(self):
        return TestClient(app)

    def test_get_user_success(self, client):
        response = client.get("/users/1")

        assert response.status_code == 200
        data = response.json()
        assert 'id' in data
        assert 'email' in data

    def test_get_user_not_found(self, client):
        response = client.get("/users/999999")

        assert response.status_code == 404
        assert "User not found" in response.json()['detail']

# Performance tests
class TestPerformance:
    def test_data_processing_performance(self, sample_dataframe):
        start_time = time.time()

        # Process large dataset
        result = process_large_dataset(sample_dataframe)

        end_time = time.time()
        processing_time = end_time - start_time

        assert processing_time < 5.0  # Should complete in under 5 seconds
        assert len(result) > 0
```

## 📊 Python Performance Optimization

### Performance Monitoring and Optimization
```python
# Performance optimization with profiling
import cProfile
import pstats
from memory_profiler import profile
import numpy as np
import pandas as pd

class PerformanceOptimizer:
    @staticmethod
    @profile
    def optimize_dataframe_operations(df: pd.DataFrame) -> pd.DataFrame:
        """Optimized pandas operations"""
        # Use vectorized operations instead of loops
        df['optimized_feature'] = np.where(
            df['condition'] > 0,
            df['value1'] * df['value2'],
            df['value1'] / df['value2']
        )

        # Use categorical data for memory optimization
        df['category'] = df['category'].astype('category')

        # Use efficient aggregations
        result = df.groupby('category').agg({
            'value1': ['mean', 'std'],
            'value2': 'sum'
        })

        return result

    @staticmethod
    def profile_function(func, *args, **kwargs):
        """Profile function execution"""
        profiler = cProfile.Profile()
        profiler.enable()

        result = func(*args, **kwargs)

        profiler.disable()
        stats = pstats.Stats(profiler)
        stats.sort_stats('cumulative')
        stats.print_stats(10)

        return result

# Async performance optimization
import asyncio
import aiohttp
from typing import List

async def fetch_data_concurrent(urls: List[str]) -> List[dict]:
    """Fetch data from multiple URLs concurrently"""
    async with aiohttp.ClientSession() as session:
        tasks = [fetch_single_url(session, url) for url in urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return [r for r in results if not isinstance(r, Exception)]

async def fetch_single_url(session: aiohttp.ClientSession, url: str) -> dict:
    async with session.get(url) as response:
        return await response.json()
```

## 🔒 Python Security Best Practices

### Security Implementation
```python
# Security-focused Python development
from typing import Optional
import hashlib
import secrets
import jwt
from datetime import datetime, timedelta
from passlib.context import CryptContext
from pydantic import BaseModel, validator, EmailStr

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

class SecurityManager:
    def __init__(self, secret_key: str):
        self.secret_key = secret_key

    def hash_password(self, password: str) -> str:
        """Hash password using bcrypt"""
        return pwd_context.hash(password)

    def verify_password(self, plain_password: str, hashed_password: str) -> bool:
        """Verify password against hash"""
        return pwd_context.verify(plain_password, hashed_password)

    def create_access_token(self, data: dict, expires_delta: Optional[timedelta] = None) -> str:
        """Create JWT access token"""
        to_encode = data.copy()
        if expires_delta:
            expire = datetime.utcnow() + expires_delta
        else:
            expire = datetime.utcnow() + timedelta(minutes=15)

        to_encode.update({"exp": expire})
        encoded_jwt = jwt.encode(to_encode, self.secret_key, algorithm="HS256")
        return encoded_jwt

# Input validation with Pydantic
class UserCreateRequest(BaseModel):
    email: EmailStr
    password: str
    full_name: str

    @validator('password')
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not any(c.isupper() for c in v):
            raise ValueError('Password must contain uppercase letter')
        if not any(c.islower() for c in v):
            raise ValueError('Password must contain lowercase letter')
        if not any(c.isdigit() for c in v):
            raise ValueError('Password must contain digit')
        return v

    @validator('full_name')
    def validate_name(cls, v):
        # Sanitize input to prevent injection
        import re
        if not re.match(r'^[a-zA-Z\s]+$', v):
            raise ValueError('Name can only contain letters and spaces')
        return v.strip()

# SQL injection prevention with SQLAlchemy
from sqlalchemy import text
from sqlalchemy.orm import Session

class UserRepository:
    def __init__(self, db: Session):
        self.db = db

    def find_by_email(self, email: str) -> Optional[User]:
        """Safe database query with parameterized statement"""
        query = text("SELECT * FROM users WHERE email = :email")
        result = self.db.execute(query, {"email": email}).fetchone()
        return User(**result) if result else None
```

## 🎯 Python Best Practices

### Code Quality and Style
```python
# Python code quality configuration
# pyproject.toml generated by agents
[tool.black]
line-length = 88
target-version = ['py311']
include = '\.pyi?$'
extend-exclude = '''
/(
  migrations
  | venv
  | env
)/
'''

[tool.isort]
profile = "black"
multi_line_output = 3
line_length = 88
known_first_party = ["app"]

[tool.mypy]
python_version = "3.11"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true

[tool.pytest.ini_options]
testpaths = ["tests"]
python_files = ["test_*.py", "*_test.py"]
python_classes = ["Test*"]
python_functions = ["test_*"]
addopts = [
    "--strict-markers",
    "--strict-config",
    "--cov=app",
    "--cov-report=term-missing",
    "--cov-report=html",
    "--cov-fail-under=90"
]
```

### Project Structure
```
my-python-project/
├── app/
│   ├── __init__.py
│   ├── main.py
│   ├── api/
│   │   ├── __init__.py
│   │   ├── endpoints/
│   │   └── dependencies.py
│   ├── core/
│   │   ├── config.py
│   │   ├── security.py
│   │   └── database.py
│   ├── models/
│   ├── schemas/
│   ├── services/
│   └── utils/
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_api/
│   ├── test_services/
│   └── test_utils/
├── alembic/
├── docs/
├── scripts/
├── requirements/
│   ├── base.txt
│   ├── development.txt
│   └── production.txt
├── pyproject.toml
├── README.md
└── Dockerfile
```

## 🚨 Python Troubleshooting

### Common Python Issues
```bash
# Debug Python-specific problems
npx claude-flow@alpha debug --language python --issue "import-errors"

# Common solutions:
# - Virtual environment issues
# - Package dependency conflicts
# - Python path problems
# - Async/await syntax errors
```

### Performance Debugging
```python
# Python performance analysis
Task("Performance Analyzer", "Profile Python application for bottlenecks", "performance-optimizer")

# Common performance issues:
# - Inefficient loops and iterations
# - Memory leaks in long-running processes
# - Blocking I/O operations
# - Large data processing optimization
```

## 📚 Python Learning Resources

### Python-Specific Tutorials
- **[Beginner: FastAPI Basics](../../tutorials/beginner/README.md)** - Learn modern Python web development
- **[Intermediate: ML Pipeline](../../tutorials/intermediate/README.md)** - Data science workflows
- **[Advanced: MLOps Platform](../../tutorials/advanced/README.md)** - Enterprise ML systems

### Community Examples
- **[Python Examples](../../examples/basic-projects/README.md)** - Ready-to-run Python projects
- **[Data Science Patterns](../../examples/integration-patterns/README.md)** - ML and data workflows
- **[Enterprise Python](../../examples/use-cases/README.md)** - Production applications

---

**Ready to start Python development?**
- **Web development**: Begin with [FastAPI microservice](#1-fastapi-microservice)
- **Data science**: Try [ML pipeline](#2-machine-learning-pipeline)
- **Full analysis**: Build [data science project](#3-data-science-notebook)
- **Need web frameworks**: Explore web development patterns