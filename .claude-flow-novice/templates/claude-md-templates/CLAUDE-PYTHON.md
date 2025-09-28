# Claude Code Configuration - SPARC Development Environment (Python)

## 🚨 CRITICAL: CONCURRENT EXECUTION & FILE MANAGEMENT

**ABSOLUTE RULES**:
1. ALL operations MUST be concurrent/parallel in a single message
2. **NEVER save working files, text/mds and tests to the root folder**
3. ALWAYS organize files in appropriate subdirectories
4. **USE CLAUDE CODE'S TASK TOOL** for spawning agents concurrently, not just MCP

### ⚡ GOLDEN RULE: "1 MESSAGE = ALL RELATED OPERATIONS"

**MANDATORY PATTERNS:**
- **TodoWrite**: ALWAYS batch ALL todos in ONE call (5-10+ todos minimum)
- **Task tool (Claude Code)**: ALWAYS spawn ALL agents in ONE message with full instructions
- **File operations**: ALWAYS batch ALL reads/writes/edits in ONE message
- **Bash commands**: ALWAYS batch ALL terminal operations in ONE message
- **Memory operations**: ALWAYS batch ALL memory store/retrieve in ONE message

### 🎯 CRITICAL: Claude Code Task Tool for Agent Execution

**Claude Code's Task tool is the PRIMARY way to spawn agents:**
```javascript
// ✅ CORRECT: Use Claude Code's Task tool for parallel agent execution
[Single Message]:
  Task("Python researcher", "Analyze Python patterns and package ecosystem...", "researcher")
  Task("Python coder", "Implement core Python modules with type hints...", "coder")
  Task("Python tester", "Create comprehensive tests with pytest and coverage...", "tester")
  Task("Python reviewer", "Review code for Python best practices and PEP 8...", "reviewer")
  Task("Python architect", "Design system architecture with Python patterns...", "system-architect")
```

### 📁 Python File Organization Rules

**NEVER save to root folder. Use Python project structure:**
- `/src` or `/app` - Source Python files (.py)
- `/tests` - Test files (test_*.py, *_test.py)
- `/docs` - Documentation and markdown files
- `/scripts` - Utility and build scripts
- `/config` - Configuration files
- `/data` - Data files (for data science projects)
- `/notebooks` - Jupyter notebooks (for data science)
- `requirements.txt` - Production dependencies
- `requirements-dev.txt` - Development dependencies
- `pyproject.toml` - Modern Python project configuration
- `setup.py` - Package setup (legacy, prefer pyproject.toml)

## Project Overview

This Python project uses SPARC (Specification, Pseudocode, Architecture, Refinement, Completion) methodology with Claude-Flow orchestration for systematic Test-Driven Development with strong typing.

## Python-Specific SPARC Commands

### Core Commands
- `npx claude-flow sparc modes` - List available modes
- `npx claude-flow sparc run <mode> "<python-task>"` - Execute Python-specific mode
- `npx claude-flow sparc tdd "<python-feature>"` - Run complete TDD workflow for Python
- `npx claude-flow sparc info <mode>` - Get mode details

### Python Environment Commands
- `python -m venv venv` - Create virtual environment
- `source venv/bin/activate` - Activate virtual environment (Linux/Mac)
- `venv\Scripts\activate` - Activate virtual environment (Windows)
- `pip install -r requirements.txt` - Install dependencies
- `pip install -e .` - Install package in development mode
- `python -m pip install --upgrade pip` - Upgrade pip

### Python Development Commands
- `python -m pytest` - Run tests
- `python -m pytest --cov=src` - Run tests with coverage
- `python -m pytest --cov=src --cov-report=html` - Generate HTML coverage report
- `python -m flake8 src/` - Code linting
- `python -m black src/` - Code formatting
- `python -m isort src/` - Import sorting
- `python -m mypy src/` - Type checking
- `python -m bandit -r src/` - Security analysis

### Python Quality Commands
- `python -m pylint src/` - Advanced linting
- `python -m safety check` - Security vulnerability check
- `python -m pip-audit` - Audit pip packages for vulnerabilities
- `python -m pydocstyle src/` - Docstring style checking

## Python SPARC Workflow Phases

1. **Specification** - Requirements analysis with Python design patterns (`sparc run spec-pseudocode`)
2. **Pseudocode** - Algorithm design with Python idioms (`sparc run spec-pseudocode`)
3. **Architecture** - System design with Python modules and packages (`sparc run architect`)
4. **Refinement** - TDD implementation with pytest (`sparc tdd`)
5. **Completion** - Integration with proper packaging (`sparc run integration`)

## Python Code Style & Best Practices

- **PEP 8**: Follow Python Enhancement Proposal 8 style guide
- **Type Hints**: Use type annotations for better code documentation
- **Docstrings**: Comprehensive docstrings following PEP 257
- **Virtual Environments**: Always use virtual environments
- **Package Management**: Use pip-tools or poetry for dependency management
- **Testing**: Comprehensive testing with pytest
- **Error Handling**: Proper exception handling and custom exceptions
- **Logging**: Use the logging module instead of print statements

## 🚀 Python-Specific Agents (78+ Total)

### Core Python Development
`python-coder`, `python-architect`, `python-tester`, `python-reviewer`, `pep8-expert`

### Framework Specialists
`django-dev`, `flask-dev`, `fastapi-dev`, `tornado-dev`, `pyramid-dev`

### Data Science & ML
`data-scientist`, `ml-engineer`, `pandas-expert`, `numpy-specialist`, `sklearn-dev`

### Scientific Computing
`scipy-expert`, `matplotlib-specialist`, `jupyter-dev`, `research-scientist`

### Testing & Quality
`pytest-expert`, `unittest-specialist`, `coverage-analyst`, `mypy-expert`

### Package & Deployment
`pip-expert`, `poetry-specialist`, `docker-python`, `setuptools-expert`

### All Standard Agents Available
`coder`, `reviewer`, `tester`, `planner`, `researcher`, `system-architect`, `code-analyzer`, `performance-benchmarker`, `cicd-engineer`, `security-manager`

## 🎯 Python Development Patterns

### ✅ CORRECT PYTHON WORKFLOW

```javascript
// Step 1: Set up Python project coordination
[Single Message - Coordination Setup]:
  mcp__claude-flow__swarm_init { topology: "hierarchical", maxAgents: 6 }
  mcp__claude-flow__agent_spawn { type: "python-architect" }
  mcp__claude-flow__agent_spawn { type: "python-coder" }
  mcp__claude-flow__agent_spawn { type: "pytest-expert" }

// Step 2: Parallel Python development execution
[Single Message - Parallel Agent Execution]:
  Task("Python architect", "Design modular Python architecture with proper package structure. Store patterns in memory.", "python-architect")
  Task("Python coder", "Implement modules with type hints and proper error handling. Follow PEP 8.", "python-coder")
  Task("Python tester", "Create comprehensive pytest suite with fixtures and parameterization.", "pytest-expert")
  Task("Python reviewer", "Review code for Python best practices, PEP 8, and type safety.", "python-reviewer")
  Task("Package engineer", "Set up proper Python packaging with pyproject.toml.", "pip-expert")

  // Batch ALL Python todos
  TodoWrite { todos: [
    {content: "Set up virtual environment and requirements", status: "in_progress", activeForm: "Setting up virtual environment"},
    {content: "Configure pyproject.toml with project metadata", status: "pending", activeForm: "Configuring pyproject.toml"},
    {content: "Implement core modules with type hints", status: "pending", activeForm: "Implementing core modules"},
    {content: "Add comprehensive pytest test suite", status: "pending", activeForm: "Adding comprehensive pytest tests"},
    {content: "Configure linting tools (flake8, black, isort)", status: "pending", activeForm: "Configuring linting tools"},
    {content: "Add type checking with mypy", status: "pending", activeForm: "Adding type checking"},
    {content: "Set up documentation with Sphinx", status: "pending", activeForm: "Setting up documentation"},
    {content: "Configure CI/CD pipeline", status: "pending", activeForm: "Configuring CI/CD pipeline"}
  ]}

  // Parallel Python file operations
  Write "pyproject.toml"
  Write "requirements.txt"
  Write "src/__init__.py"
  Write "src/main.py"
  Write "tests/test_main.py"
  Write ".flake8"
  Write "mypy.ini"
```

## Python Agent Coordination Protocol

### Every Python Agent MUST:

**1️⃣ BEFORE Work:**
```bash
npx claude-flow@alpha hooks pre-task --description "[python-task]"
python -m pytest --collect-only  # Verify test discovery
```

**2️⃣ DURING Work:**
```bash
python -m flake8 src/  # Check code style
python -m mypy src/  # Type checking
npx claude-flow@alpha hooks post-edit --file "[file]" --memory-key "python/[agent]/[step]"
```

**3️⃣ AFTER Work:**
```bash
python -m pytest  # Run tests
python -m black src/  # Format code
npx claude-flow@alpha hooks post-task --task-id "[task]"
```

## Python-Specific Configurations

### pyproject.toml Template
```toml
[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

[project]
name = "python-project"
version = "0.1.0"
description = "A Python project with SPARC methodology"
readme = "README.md"
requires-python = ">=3.8"
license = {text = "MIT"}
keywords = ["python", "api", "cli"]
authors = [
  {name = "Your Name", email = "your.email@example.com"},
]
classifiers = [
  "Development Status :: 4 - Beta",
  "Programming Language :: Python",
  "Programming Language :: Python :: 3.8",
  "Programming Language :: Python :: 3.9",
  "Programming Language :: Python :: 3.10",
  "Programming Language :: Python :: 3.11",
  "Programming Language :: Python :: 3.12",
  "Programming Language :: Python :: Implementation :: CPython",
  "Programming Language :: Python :: Implementation :: PyPy",
]
dependencies = [
  "click>=8.0.0",
  "requests>=2.28.0",
  "pydantic>=1.10.0",
]

[project.optional-dependencies]
dev = [
  "pytest>=7.0.0",
  "pytest-cov>=4.0.0",
  "pytest-mock>=3.10.0",
  "black>=22.0.0",
  "flake8>=5.0.0",
  "isort>=5.10.0",
  "mypy>=1.0.0",
  "bandit>=1.7.0",
  "safety>=2.0.0",
]
docs = [
  "sphinx>=5.0.0",
  "sphinx-rtd-theme>=1.0.0",
]
test = [
  "pytest>=7.0.0",
  "pytest-cov>=4.0.0",
  "pytest-xdist>=3.0.0",
  "hypothesis>=6.70.0",
]

[project.urls]
Documentation = "https://github.com/username/python-project#readme"
Issues = "https://github.com/username/python-project/issues"
Source = "https://github.com/username/python-project"

[project.scripts]
my-cli = "python_project.cli:main"

[tool.hatch.version]
path = "src/python_project/__about__.py"

[tool.hatch.envs.default]
dependencies = [
  "coverage[toml]>=6.5",
  "pytest",
]
[tool.hatch.envs.default.scripts]
test = "pytest {args:tests}"
test-cov = "coverage run -m pytest {args:tests}"
cov-report = [
  "- coverage combine",
  "coverage report",
]
cov = [
  "test-cov",
  "cov-report",
]

[tool.coverage.run]
source_pkgs = ["python_project", "tests"]
branch = true
parallel = true
omit = [
  "src/python_project/__about__.py",
]

[tool.coverage.paths]
python_project = ["src/python_project", "*/python-project/src/python_project"]
tests = ["tests", "*/python-project/tests"]

[tool.coverage.report]
exclude_lines = [
  "no cov",
  "if __name__ == .__main__.:",
  "if TYPE_CHECKING:",
]

[tool.black]
target-version = ["py38"]
line-length = 88
skip-string-normalization = true

[tool.isort]
profile = "black"
multi_line_output = 3
include_trailing_comma = true
force_grid_wrap = 0
use_parentheses = true
ensure_newline_before_comments = true
line_length = 88

[tool.mypy]
python_version = "3.8"
warn_return_any = true
warn_unused_configs = true
disallow_untyped_defs = true
disallow_incomplete_defs = true
check_untyped_defs = true
disallow_untyped_decorators = true
no_implicit_optional = true
warn_redundant_casts = true
warn_unused_ignores = true
warn_no_return = true
warn_unreachable = true
strict_equality = true

[tool.pylint.messages_control]
disable = [
  "missing-docstring",
  "too-few-public-methods",
]

[tool.bandit]
exclude_dirs = ["tests"]
skips = ["B101", "B601"]

[tool.pytest.ini_options]
minversion = "6.0"
addopts = [
  "--strict-config",
  "--strict-markers",
  "--doctest-modules",
  "--cov=src",
  "--cov-report=term-missing",
  "--cov-fail-under=85",
]
testpaths = ["tests"]
pythonpath = ["src"]
```

### requirements.txt Template
```
# Production dependencies
click>=8.0.0
requests>=2.28.0
pydantic>=1.10.0
```

### requirements-dev.txt Template
```
# Development dependencies
-r requirements.txt

# Testing
pytest>=7.0.0
pytest-cov>=4.0.0
pytest-mock>=3.10.0
pytest-xdist>=3.0.0
hypothesis>=6.70.0

# Code quality
black>=22.0.0
flake8>=5.0.0
isort>=5.10.0
mypy>=1.0.0
pylint>=2.15.0

# Security
bandit>=1.7.0
safety>=2.0.0

# Documentation
sphinx>=5.0.0
sphinx-rtd-theme>=1.0.0

# Development tools
pre-commit>=2.20.0
tox>=4.0.0
```

### .flake8 Configuration
```ini
[flake8]
max-line-length = 88
extend-ignore = E203, W503, E501
exclude =
    .git,
    __pycache__,
    .venv,
    venv,
    .eggs,
    *.egg,
    build,
    dist,
    .pytest_cache
per-file-ignores =
    __init__.py:F401
    tests/*:S101
```

### mypy.ini Configuration
```ini
[mypy]
python_version = 3.8
warn_return_any = True
warn_unused_configs = True
disallow_untyped_defs = True
disallow_incomplete_defs = True
check_untyped_defs = True
disallow_untyped_decorators = True
no_implicit_optional = True
warn_redundant_casts = True
warn_unused_ignores = True
warn_no_return = True
warn_unreachable = True
strict_equality = True

[mypy-tests.*]
disallow_untyped_defs = False
```

## Testing Strategies

### Pytest Configuration and Tests
```python
# tests/conftest.py
import pytest
from typing import Generator
from unittest.mock import Mock

@pytest.fixture
def sample_data() -> dict:
    """Fixture providing sample test data."""
    return {
        "id": "123",
        "name": "Test User",
        "email": "test@example.com"
    }

@pytest.fixture
def mock_database() -> Generator[Mock, None, None]:
    """Fixture providing a mock database."""
    mock_db = Mock()
    yield mock_db
    mock_db.reset_mock()

@pytest.fixture(scope="session")
def test_config() -> dict:
    """Session-scoped fixture for test configuration."""
    return {
        "testing": True,
        "database_url": "sqlite:///:memory:"
    }
```

```python
# tests/test_user_service.py
import pytest
from unittest.mock import Mock, patch
from typing import Dict, Any

from src.user_service import UserService, User
from src.exceptions import ValidationError, NotFoundError


class TestUserService:
    """Test cases for UserService class."""

    @pytest.fixture
    def user_service(self, mock_database: Mock) -> UserService:
        """Create UserService instance for testing."""
        return UserService(database=mock_database)

    def test_create_user_success(
        self,
        user_service: UserService,
        sample_data: Dict[str, Any],
        mock_database: Mock
    ) -> None:
        """Test successful user creation."""
        # Arrange
        mock_database.save.return_value = User(**sample_data)

        # Act
        result = user_service.create_user(sample_data)

        # Assert
        assert isinstance(result, User)
        assert result.name == sample_data["name"]
        assert result.email == sample_data["email"]
        mock_database.save.assert_called_once()

    def test_create_user_invalid_email(self, user_service: UserService) -> None:
        """Test user creation with invalid email."""
        invalid_data = {"name": "Test", "email": "invalid-email"}

        with pytest.raises(ValidationError, match="Invalid email format"):
            user_service.create_user(invalid_data)

    @pytest.mark.parametrize("email", [
        "valid@example.com",
        "user.name+tag@example.co.uk",
        "test123@subdomain.example.org"
    ])
    def test_valid_emails(self, user_service: UserService, email: str) -> None:
        """Test various valid email formats."""
        data = {"name": "Test User", "email": email}
        # Mock the database to avoid actual calls
        with patch.object(user_service.database, 'save') as mock_save:
            mock_save.return_value = User(**data)
            result = user_service.create_user(data)
            assert result.email == email

    @pytest.mark.asyncio
    async def test_async_user_fetch(self, user_service: UserService) -> None:
        """Test async user fetching."""
        user_id = "123"
        expected_user = User(id=user_id, name="Test", email="test@example.com")

        with patch.object(user_service, 'fetch_user_async') as mock_fetch:
            mock_fetch.return_value = expected_user
            result = await user_service.fetch_user_async(user_id)
            assert result == expected_user
```

### Property-Based Testing with Hypothesis
```python
# tests/test_properties.py
from hypothesis import given, strategies as st
from src.utils import normalize_string, calculate_age
from datetime import date

class TestStringNormalization:
    """Property-based tests for string normalization."""

    @given(st.text())
    def test_normalize_idempotent(self, text: str) -> None:
        """Normalizing twice should be the same as normalizing once."""
        normalized_once = normalize_string(text)
        normalized_twice = normalize_string(normalized_once)
        assert normalized_once == normalized_twice

    @given(st.text(min_size=1))
    def test_normalize_non_empty_input_produces_output(self, text: str) -> None:
        """Non-empty input should produce non-empty output."""
        result = normalize_string(text)
        assert len(result) > 0

    @given(st.dates(min_value=date(1900, 1, 1), max_value=date.today()))
    def test_calculate_age_always_positive(self, birth_date: date) -> None:
        """Age calculation should always produce non-negative values."""
        age = calculate_age(birth_date)
        assert age >= 0
```

## Type Hints and Data Classes

### Type Definitions
```python
# src/types.py
from typing import Dict, List, Optional, Union, TypeVar, Generic, Protocol
from dataclasses import dataclass
from enum import Enum
from datetime import datetime

# Type variables
T = TypeVar('T')
K = TypeVar('K')
V = TypeVar('V')

# Enums
class UserRole(Enum):
    """User role enumeration."""
    ADMIN = "admin"
    USER = "user"
    MODERATOR = "moderator"

class Status(Enum):
    """Status enumeration."""
    ACTIVE = "active"
    INACTIVE = "inactive"
    PENDING = "pending"

# Data classes
@dataclass
class User:
    """User data class with type hints."""
    id: str
    name: str
    email: str
    role: UserRole
    created_at: datetime
    updated_at: Optional[datetime] = None
    metadata: Optional[Dict[str, Union[str, int, bool]]] = None

    def __post_init__(self) -> None:
        """Post-initialization validation."""
        if not self.email or "@" not in self.email:
            raise ValueError("Invalid email format")

        if self.metadata is None:
            self.metadata = {}

# Protocols for structural typing
class Serializable(Protocol):
    """Protocol for serializable objects."""

    def to_dict(self) -> Dict[str, Union[str, int, bool]]:
        """Convert object to dictionary."""
        ...

    @classmethod
    def from_dict(cls, data: Dict[str, Union[str, int, bool]]) -> 'Serializable':
        """Create object from dictionary."""
        ...

# Generic classes
class Repository(Generic[T]):
    """Generic repository pattern."""

    def __init__(self, model_class: type[T]) -> None:
        self.model_class = model_class
        self._storage: Dict[str, T] = {}

    def save(self, item: T) -> T:
        """Save item to repository."""
        item_id = getattr(item, 'id')
        self._storage[item_id] = item
        return item

    def find_by_id(self, item_id: str) -> Optional[T]:
        """Find item by ID."""
        return self._storage.get(item_id)

    def find_all(self) -> List[T]:
        """Find all items."""
        return list(self._storage.values())

# Union types
UserInput = Union[Dict[str, str], User]
ApiResponse = Union[Dict[str, str], List[Dict[str, str]]]
```

### Advanced Type Usage
```python
# src/advanced_types.py
from typing import (
    Callable, Awaitable, TypedDict, Literal,
    Final, ClassVar, overload
)
from functools import wraps
from dataclasses import dataclass, field

# TypedDict for structured dictionaries
class UserDict(TypedDict):
    """Typed dictionary for user data."""
    id: str
    name: str
    email: str
    age: int

class UserDictOptional(TypedDict, total=False):
    """Typed dictionary with optional fields."""
    id: str
    name: str
    email: str
    age: int  # This is optional due to total=False

# Literal types
Mode = Literal["development", "testing", "production"]
HttpMethod = Literal["GET", "POST", "PUT", "DELETE"]

# Final and ClassVar
@dataclass
class Config:
    """Configuration with final and class variables."""
    API_VERSION: Final[str] = "v1"
    MAX_CONNECTIONS: ClassVar[int] = 100

    environment: Mode
    debug: bool = field(default=False)

    def __post_init__(self) -> None:
        """Validate configuration."""
        if self.environment == "production" and self.debug:
            raise ValueError("Debug mode not allowed in production")

# Function overloading
@overload
def process_data(data: str) -> str: ...

@overload
def process_data(data: int) -> int: ...

@overload
def process_data(data: List[str]) -> List[str]: ...

def process_data(data: Union[str, int, List[str]]) -> Union[str, int, List[str]]:
    """Process data with type-specific logic."""
    if isinstance(data, str):
        return data.upper()
    elif isinstance(data, int):
        return data * 2
    elif isinstance(data, list):
        return [item.upper() for item in data]
    else:
        raise TypeError(f"Unsupported type: {type(data)}")

# Decorator with types
def validate_types(func: Callable[..., T]) -> Callable[..., T]:
    """Decorator to validate function arguments at runtime."""
    @wraps(func)
    def wrapper(*args, **kwargs) -> T:
        # Runtime type validation logic here
        return func(*args, **kwargs)
    return wrapper
```

## Error Handling and Exceptions

### Custom Exception Classes
```python
# src/exceptions.py
from typing import Dict, Any, Optional

class AppError(Exception):
    """Base application error class."""

    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        context: Optional[Dict[str, Any]] = None
    ) -> None:
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.context = context or {}

class ValidationError(AppError):
    """Raised when data validation fails."""
    pass

class NotFoundError(AppError):
    """Raised when a resource is not found."""
    pass

class DatabaseError(AppError):
    """Raised when database operations fail."""
    pass

class AuthenticationError(AppError):
    """Raised when authentication fails."""
    pass

class AuthorizationError(AppError):
    """Raised when authorization fails."""
    pass

# Exception handling utilities
def handle_api_errors(func: Callable[..., T]) -> Callable[..., T]:
    """Decorator to handle and log API errors."""
    @wraps(func)
    def wrapper(*args, **kwargs) -> T:
        try:
            return func(*args, **kwargs)
        except ValidationError as e:
            logger.warning(f"Validation error: {e.message}", extra=e.context)
            raise
        except NotFoundError as e:
            logger.info(f"Resource not found: {e.message}", extra=e.context)
            raise
        except DatabaseError as e:
            logger.error(f"Database error: {e.message}", extra=e.context)
            raise
        except Exception as e:
            logger.exception(f"Unexpected error in {func.__name__}: {e}")
            raise AppError("Internal server error") from e
    return wrapper
```

## Logging Configuration

### Structured Logging
```python
# src/logging_config.py
import logging
import logging.config
import json
from typing import Dict, Any
from datetime import datetime

class JSONFormatter(logging.Formatter):
    """Custom JSON formatter for structured logging."""

    def format(self, record: logging.LogRecord) -> str:
        """Format log record as JSON."""
        log_data = {
            "timestamp": datetime.utcnow().isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "module": record.module,
            "function": record.funcName,
            "line": record.lineno,
        }

        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)

        # Add any extra fields
        for key, value in record.__dict__.items():
            if key not in log_data and not key.startswith('_'):
                log_data[key] = value

        return json.dumps(log_data)

def setup_logging(level: str = "INFO", use_json: bool = False) -> None:
    """Set up application logging."""
    config: Dict[str, Any] = {
        "version": 1,
        "disable_existing_loggers": False,
        "formatters": {
            "standard": {
                "format": "%(asctime)s [%(levelname)s] %(name)s: %(message)s"
            },
            "json": {
                "()": JSONFormatter
            }
        },
        "handlers": {
            "console": {
                "class": "logging.StreamHandler",
                "level": level,
                "formatter": "json" if use_json else "standard",
                "stream": "ext://sys.stdout"
            },
            "file": {
                "class": "logging.handlers.RotatingFileHandler",
                "level": level,
                "formatter": "json" if use_json else "standard",
                "filename": "app.log",
                "maxBytes": 10485760,  # 10MB
                "backupCount": 5
            }
        },
        "loggers": {
            "": {  # Root logger
                "level": level,
                "handlers": ["console", "file"]
            }
        }
    }

    logging.config.dictConfig(config)

# Usage
logger = logging.getLogger(__name__)
```

## Performance Optimization

### Profiling and Optimization
```python
# src/profiling.py
import cProfile
import functools
import time
from typing import Callable, TypeVar, Any
from memory_profiler import profile

F = TypeVar('F', bound=Callable[..., Any])

def timing_decorator(func: F) -> F:
    """Decorator to measure function execution time."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        start_time = time.perf_counter()
        result = func(*args, **kwargs)
        end_time = time.perf_counter()
        execution_time = end_time - start_time
        logger.info(f"{func.__name__} executed in {execution_time:.4f} seconds")
        return result
    return wrapper

def profile_function(func: F) -> F:
    """Decorator to profile function performance."""
    @functools.wraps(func)
    def wrapper(*args, **kwargs) -> Any:
        profiler = cProfile.Profile()
        profiler.enable()
        result = func(*args, **kwargs)
        profiler.disable()
        profiler.dump_stats(f"{func.__name__}_profile.prof")
        return result
    return wrapper

# Memory optimization techniques
class MemoryOptimizedClass:
    """Example of memory optimization using __slots__."""
    __slots__ = ['id', 'name', 'value']

    def __init__(self, id: str, name: str, value: int) -> None:
        self.id = id
        self.name = name
        self.value = value

# Generator for memory-efficient iteration
def read_large_file(filename: str) -> Generator[str, None, None]:
    """Memory-efficient file reading using generators."""
    with open(filename, 'r', encoding='utf-8') as file:
        for line in file:
            yield line.strip()

# Caching decorator
def lru_cache_with_ttl(maxsize: int = 128, ttl: int = 3600):
    """LRU cache with time-to-live."""
    def decorator(func: F) -> F:
        cache: Dict[str, tuple] = {}

        @functools.wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            key = str(args) + str(sorted(kwargs.items()))
            current_time = time.time()

            if key in cache:
                result, timestamp = cache[key]
                if current_time - timestamp < ttl:
                    return result
                else:
                    del cache[key]

            result = func(*args, **kwargs)

            if len(cache) >= maxsize:
                # Remove oldest entry
                oldest_key = min(cache.keys(), key=lambda k: cache[k][1])
                del cache[oldest_key]

            cache[key] = (result, current_time)
            return result

        return wrapper
    return decorator
```

## Documentation with Sphinx

### Sphinx Configuration (docs/conf.py)
```python
import os
import sys
sys.path.insert(0, os.path.abspath('../src'))

project = 'Python Project'
copyright = '2024, Your Name'
author = 'Your Name'
release = '0.1.0'

extensions = [
    'sphinx.ext.autodoc',
    'sphinx.ext.viewcode',
    'sphinx.ext.napoleon',
    'sphinx.ext.intersphinx',
    'sphinx.ext.coverage',
]

templates_path = ['_templates']
exclude_patterns = ['_build', 'Thumbs.db', '.DS_Store']

html_theme = 'sphinx_rtd_theme'
html_static_path = ['_static']

autodoc_default_options = {
    'members': True,
    'member-order': 'bysource',
    'special-members': '__init__',
    'undoc-members': True,
    'exclude-members': '__weakref__'
}

napoleon_google_docstring = True
napoleon_numpy_docstring = True
napoleon_include_init_with_doc = False
napoleon_include_private_with_doc = False
```

### Docstring Examples
```python
# src/user_service.py
from typing import List, Optional
from .models import User
from .exceptions import NotFoundError, ValidationError

class UserService:
    """
    Service class for managing user operations.

    This class provides methods for creating, updating, and retrieving users
    from the database with proper validation and error handling.

    Args:
        database: Database connection instance
        validator: User data validator instance

    Example:
        >>> service = UserService(database=db, validator=validator)
        >>> user = service.create_user({"name": "John", "email": "john@example.com"})
        >>> print(user.name)
        John
    """

    def __init__(self, database, validator) -> None:
        self.database = database
        self.validator = validator

    def create_user(self, user_data: dict) -> User:
        """
        Create a new user with the provided data.

        Args:
            user_data: Dictionary containing user information with keys:
                - name (str): User's full name
                - email (str): User's email address
                - age (int, optional): User's age

        Returns:
            User: The created user instance with generated ID and timestamps

        Raises:
            ValidationError: If user data is invalid or email format is incorrect
            DatabaseError: If database operation fails

        Example:
            >>> user_data = {"name": "Alice Smith", "email": "alice@example.com"}
            >>> user = service.create_user(user_data)
            >>> assert user.email == "alice@example.com"
        """
        if not self.validator.validate_user_data(user_data):
            raise ValidationError("Invalid user data provided")

        return self.database.save_user(user_data)

    def get_user_by_id(self, user_id: str) -> Optional[User]:
        """
        Retrieve a user by their unique identifier.

        Args:
            user_id: The unique identifier for the user

        Returns:
            The user instance if found, None otherwise

        Raises:
            DatabaseError: If database query fails

        Note:
            This method returns None if the user is not found, rather than
            raising an exception. Use get_user_by_id_strict() if you want
            an exception to be raised for missing users.
        """
        return self.database.find_user_by_id(user_id)
```

## CI/CD Configuration

### GitHub Actions (.github/workflows/python.yml)
```yaml
name: Python CI

on:
  push:
    branches: [ main, develop ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        python-version: ['3.8', '3.9', '3.10', '3.11', '3.12']

    steps:
    - uses: actions/checkout@v4

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install -r requirements-dev.txt
        pip install -e .

    - name: Lint with flake8
      run: |
        flake8 src/ tests/

    - name: Format check with black
      run: |
        black --check src/ tests/

    - name: Import sorting check with isort
      run: |
        isort --check-only src/ tests/

    - name: Type check with mypy
      run: |
        mypy src/

    - name: Security check with bandit
      run: |
        bandit -r src/

    - name: Test with pytest
      run: |
        pytest --cov=src --cov-report=xml --cov-report=term-missing

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4
    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: '3.11'

    - name: Install dependencies
      run: |
        python -m pip install --upgrade pip
        pip install safety bandit

    - name: Security audit with safety
      run: |
        safety check

    - name: Security analysis with bandit
      run: |
        bandit -r src/
```

### Tox Configuration (tox.ini)
```ini
[tox]
envlist = py38,py39,py310,py311,py312,lint,type-check,security
isolated_build = true

[testenv]
deps =
    pytest>=7.0.0
    pytest-cov>=4.0.0
    pytest-mock>=3.10.0
commands = pytest {posargs}

[testenv:lint]
deps =
    flake8>=5.0.0
    black>=22.0.0
    isort>=5.10.0
commands =
    flake8 src/ tests/
    black --check src/ tests/
    isort --check-only src/ tests/

[testenv:type-check]
deps = mypy>=1.0.0
commands = mypy src/

[testenv:security]
deps =
    bandit>=1.7.0
    safety>=2.0.0
commands =
    bandit -r src/
    safety check

[testenv:docs]
deps =
    sphinx>=5.0.0
    sphinx-rtd-theme>=1.0.0
commands = sphinx-build -b html docs docs/_build/html
```

## Support Resources

- **Python Documentation**: https://docs.python.org/3/
- **PEP 8 Style Guide**: https://peps.python.org/pep-0008/
- **Pytest Documentation**: https://docs.pytest.org/
- **Type Hints Guide**: https://docs.python.org/3/library/typing.html
- **Mypy Documentation**: https://mypy.readthedocs.io/
- **Black Formatter**: https://black.readthedocs.io/
- **Sphinx Documentation**: https://www.sphinx-doc.org/

---

Remember: **Claude Flow coordinates, Claude Code creates Python!**