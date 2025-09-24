### Python Development Patterns

**Code Style & Standards:**
- Follow PEP 8 style guidelines
- Use type hints for all function signatures
- Prefer f-strings over string concatenation
- Use dataclasses/Pydantic models for data structures
- Implement proper exception handling with specific types

**Virtual Environment Setup:**
```bash
# Create virtual environment
python -m venv venv
source venv/bin/activate  # Linux/Mac
# or
venv\Scripts\activate     # Windows

# Install dependencies
pip install -r requirements.txt
```

**Concurrent Agent Execution:**
```python
# ✅ CORRECT: Python development with concurrent agents
[Single Message]:
  Task("Backend Developer", "Build FastAPI/Django REST API with async support", "backend-dev")
  Task("Data Engineer", "Design database models with SQLAlchemy/Django ORM", "code-analyzer")
  Task("Test Engineer", "Write pytest tests with fixtures and mocking", "tester")
  Task("DevOps Engineer", "Configure Docker and deployment scripts", "system-architect")
  Task("Code Reviewer", "Review code quality and PEP 8 compliance", "reviewer")

  # Batch Python file operations
  Write("src/main.py")
  Write("src/models.py")
  Write("src/services.py")
  Write("tests/test_api.py")
  Write("requirements.txt")

  # Python-specific todos
  TodoWrite({ todos: [
    {content: "Setup virtual environment and dependencies", status: "in_progress", activeForm: "Setting up virtual environment and dependencies"},
    {content: "Implement data models with type hints", status: "pending", activeForm: "Implementing data models with type hints"},
    {content: "Add input validation and error handling", status: "pending", activeForm: "Adding input validation and error handling"},
    {content: "Write comprehensive test suite", status: "pending", activeForm: "Writing comprehensive test suite"},
    {content: "Configure logging and monitoring", status: "pending", activeForm: "Configuring logging and monitoring"}
  ]})
```

**Project Structure:**
```
src/
  models/           # Data models and schemas
    __init__.py
    user.py
    product.py
  services/         # Business logic
    __init__.py
    user_service.py
    auth_service.py
  api/             # API routes/views
    __init__.py
    routes.py
    dependencies.py
  utils/           # Helper functions
    __init__.py
    validators.py
    decorators.py
  config/          # Configuration
    __init__.py
    settings.py
tests/
  unit/
  integration/
  fixtures/
```

**Type Hints & Data Models:**
```python
from typing import List, Optional, Dict, Any, Union
from dataclasses import dataclass
from pydantic import BaseModel, validator
from datetime import datetime

# Using Pydantic for data validation
class UserCreateSchema(BaseModel):
    name: str
    email: str
    age: Optional[int] = None

    @validator('email')
    def validate_email(cls, v: str) -> str:
        if '@' not in v:
            raise ValueError('Invalid email format')
        return v.lower()

# Using dataclasses for internal models
@dataclass
class User:
    id: str
    name: str
    email: str
    created_at: datetime
    age: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'name': self.name,
            'email': self.email,
            'created_at': self.created_at.isoformat(),
            'age': self.age
        }
```

**Async/Await Patterns:**
```python
import asyncio
import aiohttp
from typing import List, Dict

class AsyncApiService:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        self.session = aiohttp.ClientSession()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self.session:
            await self.session.close()

    async def fetch_user(self, user_id: str) -> Dict[str, Any]:
        async with self.session.get(f"{self.base_url}/users/{user_id}") as response:
            return await response.json()

    async def fetch_multiple_users(self, user_ids: List[str]) -> List[Dict[str, Any]]:
        tasks = [self.fetch_user(user_id) for user_id in user_ids]
        return await asyncio.gather(*tasks)

# Usage
async def main():
    async with AsyncApiService("https://api.example.com") as service:
        users = await service.fetch_multiple_users(["1", "2", "3"])
        print(users)
```

**Testing with pytest:**
```python
import pytest
from unittest.mock import AsyncMock, patch
from src.services.user_service import UserService
from src.models.user import User

@pytest.fixture
def sample_user():
    return User(
        id="123",
        name="Test User",
        email="test@example.com",
        created_at=datetime.now()
    )

@pytest.fixture
async def user_service():
    service = UserService()
    yield service
    await service.cleanup()

class TestUserService:
    async def test_create_user_success(self, user_service, sample_user):
        with patch.object(user_service, 'save_user') as mock_save:
            mock_save.return_value = sample_user

            result = await user_service.create_user({
                'name': 'Test User',
                'email': 'test@example.com'
            })

            assert result.name == "Test User"
            assert result.email == "test@example.com"
            mock_save.assert_called_once()

    async def test_get_user_not_found(self, user_service):
        with patch.object(user_service, 'find_user') as mock_find:
            mock_find.return_value = None

            with pytest.raises(UserNotFoundError):
                await user_service.get_user("nonexistent")

    @pytest.mark.parametrize("invalid_email", [
        "not-an-email",
        "@example.com",
        "test@",
        ""
    ])
    async def test_create_user_invalid_email(self, user_service, invalid_email):
        with pytest.raises(ValidationError):
            await user_service.create_user({
                'name': 'Test User',
                'email': invalid_email
            })
```

**Error Handling & Logging:**
```python
import logging
from typing import Optional
from enum import Enum

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('app.log'),
        logging.StreamHandler()
    ]
)

logger = logging.getLogger(__name__)

# Custom exception hierarchy
class APIError(Exception):
    """Base API exception"""
    def __init__(self, message: str, status_code: int = 500):
        self.message = message
        self.status_code = status_code
        super().__init__(self.message)

class ValidationError(APIError):
    def __init__(self, message: str):
        super().__init__(message, 400)

class NotFoundError(APIError):
    def __init__(self, resource: str, identifier: str):
        message = f"{resource} with id '{identifier}' not found"
        super().__init__(message, 404)

# Error handling decorator
def handle_exceptions(func):
    async def wrapper(*args, **kwargs):
        try:
            return await func(*args, **kwargs)
        except ValidationError:
            logger.warning(f"Validation error in {func.__name__}")
            raise
        except Exception as e:
            logger.error(f"Unexpected error in {func.__name__}: {str(e)}")
            raise APIError("Internal server error")
    return wrapper
```

**Configuration Management:**
```python
import os
from typing import Optional
from pydantic import BaseSettings

class Settings(BaseSettings):
    app_name: str = "My API"
    debug: bool = False
    database_url: str
    secret_key: str
    redis_url: Optional[str] = None

    # API configuration
    api_version: str = "v1"
    max_connections: int = 100
    timeout: int = 30

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

# Global settings instance
settings = Settings()

# Usage in other modules
from config.settings import settings

if settings.debug:
    print("Debug mode enabled")
```

**Database Integration (SQLAlchemy example):**
```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy import Column, String, DateTime, Integer

Base = declarative_base()

class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, unique=True, nullable=False)
    created_at = Column(DateTime, nullable=False)

# Database setup
engine = create_async_engine(settings.database_url)
async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

# Repository pattern
class UserRepository:
    def __init__(self, session: AsyncSession):
        self.session = session

    async def create(self, user_data: dict) -> User:
        user = User(**user_data)
        self.session.add(user)
        await self.session.commit()
        return user

    async def get_by_id(self, user_id: str) -> Optional[User]:
        return await self.session.get(User, user_id)

    async def get_by_email(self, email: str) -> Optional[User]:
        result = await self.session.execute(
            select(User).where(User.email == email)
        )
        return result.scalar_one_or_none()
```