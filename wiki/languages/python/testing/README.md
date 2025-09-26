# Python Testing with Claude-Flow

Comprehensive guide to Python testing strategies, automation, and continuous integration using claude-flow orchestration for robust, reliable applications.

## 🧪 Testing Overview

### Testing Philosophy with Claude-Flow

| Testing Level | Agent Type | Framework | Coverage Goal |
|---------------|------------|-----------|---------------|
| **Unit Tests** | `tester` | pytest | 90%+ |
| **Integration Tests** | `backend-dev` | pytest + TestClient | 80%+ |
| **E2E Tests** | `cicd-engineer` | Selenium/Playwright | 70%+ |
| **Performance Tests** | `performance-optimizer` | locust, pytest-benchmark | Key paths |

## ⚡ Quick Start: Testing Setup

### Automated Testing Environment

```bash
# Initialize testing environment with claude-flow
npx claude-flow@alpha sparc run architect "Comprehensive Python testing framework"

# Spawn testing team
Task("Test Engineer", "Setup pytest framework with fixtures and mocks", "tester")
Task("Quality Engineer", "Configure code coverage and quality gates", "reviewer")
Task("Performance Tester", "Create performance testing suite", "performance-optimizer")
Task("CI/CD Engineer", "Setup automated testing pipeline", "cicd-engineer")
```

### Testing Project Structure

```
project/
├── src/
│   └── app/
│       ├── __init__.py
│       ├── main.py
│       ├── models/
│       ├── services/
│       └── utils/
├── tests/
│   ├── __init__.py
│   ├── conftest.py           # Shared fixtures
│   ├── unit/
│   │   ├── test_models.py
│   │   ├── test_services.py
│   │   └── test_utils.py
│   ├── integration/
│   │   ├── test_api.py
│   │   └── test_database.py
│   ├── e2e/
│   │   └── test_workflows.py
│   ├── performance/
│   │   └── test_load.py
│   └── fixtures/
│       └── sample_data.py
├── pytest.ini
├── tox.ini
└── .coveragerc
```

## 🔬 Unit Testing with Pytest

### Core Testing Framework

```python
# tests/conftest.py - Shared test configuration
import pytest
import tempfile
import os
from unittest.mock import Mock, patch
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient

from app.main import app
from app.core.database import get_db, Base
from app.models.user import User
from app.core.config import settings

# Test database setup
@pytest.fixture(scope="session")
def test_engine():
    """Create test database engine."""
    # Use in-memory SQLite for testing
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False}
    )
    Base.metadata.create_all(bind=engine)
    yield engine
    Base.metadata.drop_all(bind=engine)

@pytest.fixture
def test_db_session(test_engine):
    """Create test database session."""
    TestingSessionLocal = sessionmaker(
        autocommit=False,
        autoflush=False,
        bind=test_engine
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()

@pytest.fixture
def test_client(test_db_session):
    """Create test client with database override."""
    def override_get_db():
        try:
            yield test_db_session
        finally:
            test_db_session.close()

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as client:
        yield client
    app.dependency_overrides.clear()

@pytest.fixture
def sample_user_data():
    """Sample user data for testing."""
    return {
        "email": "test@example.com",
        "password": "testpassword123",
        "full_name": "Test User",
        "is_active": True
    }

@pytest.fixture
def test_user(test_db_session, sample_user_data):
    """Create test user in database."""
    from app.services.user_service import UserService
    from app.schemas.user import UserCreate

    user_service = UserService(test_db_session)
    user_create = UserCreate(**sample_user_data)
    user = user_service.create(user_create)
    test_db_session.commit()
    test_db_session.refresh(user)
    return user

# Notification helpers for claude-flow integration
def notify_test_progress(message):
    """Notify claude-flow of test progress."""
    try:
        import subprocess
        subprocess.run([
            "npx", "claude-flow@alpha", "hooks", "notify",
            "--message", f"Test: {message}"
        ], check=True, capture_output=True)
    except:
        print(f"Test: {message}")

# Hooks for test lifecycle
@pytest.fixture(autouse=True)
def test_lifecycle():
    """Test lifecycle hooks."""
    notify_test_progress("Test started")
    yield
    notify_test_progress("Test completed")
```

### Model Testing

```python
# tests/unit/test_models.py - Model unit tests
import pytest
from datetime import datetime
from sqlalchemy.exc import IntegrityError

from app.models.user import User
from app.models.product import Product, Category

class TestUserModel:
    """Test User model functionality."""

    def test_user_creation(self, test_db_session):
        """Test user creation with valid data."""
        user = User(
            email="test@example.com",
            username="testuser",
            full_name="Test User"
        )
        user.set_password("password123")

        test_db_session.add(user)
        test_db_session.commit()

        assert user.id is not None
        assert user.email == "test@example.com"
        assert user.check_password("password123")
        assert not user.check_password("wrongpassword")

    def test_user_email_uniqueness(self, test_db_session):
        """Test email uniqueness constraint."""
        user1 = User(email="duplicate@example.com", username="user1")
        user2 = User(email="duplicate@example.com", username="user2")

        test_db_session.add(user1)
        test_db_session.commit()

        test_db_session.add(user2)
        with pytest.raises(IntegrityError):
            test_db_session.commit()

    def test_user_password_hashing(self, test_db_session):
        """Test password hashing functionality."""
        user = User(email="hash@example.com", username="hashuser")
        password = "securepassword123"
        user.set_password(password)

        # Password should be hashed, not stored in plain text
        assert user.password_hash != password
        assert user.check_password(password)
        assert not user.check_password("wrongpassword")

    def test_user_representation(self, test_db_session):
        """Test user string representation."""
        user = User(email="repr@example.com", username="repruser")
        test_db_session.add(user)
        test_db_session.commit()

        assert str(user) == "repr@example.com"

class TestProductModel:
    """Test Product model functionality."""

    @pytest.fixture
    def sample_category(self, test_db_session):
        """Create sample category for testing."""
        category = Category(
            name="Test Category",
            slug="test-category",
            description="Test category description"
        )
        test_db_session.add(category)
        test_db_session.commit()
        test_db_session.refresh(category)
        return category

    @pytest.fixture
    def sample_user(self, test_db_session):
        """Create sample user for testing."""
        user = User(email="product@example.com", username="productuser")
        test_db_session.add(user)
        test_db_session.commit()
        test_db_session.refresh(user)
        return user

    def test_product_creation(self, test_db_session, sample_category, sample_user):
        """Test product creation with relationships."""
        product = Product(
            name="Test Product",
            slug="test-product",
            description="Test product description",
            price=99.99,
            category=sample_category,
            created_by=sample_user,
            stock_quantity=10
        )

        test_db_session.add(product)
        test_db_session.commit()

        assert product.id is not None
        assert product.name == "Test Product"
        assert product.price == 99.99
        assert product.category_id == sample_category.id
        assert product.created_by_id == sample_user.id

    def test_product_category_relationship(self, test_db_session, sample_category, sample_user):
        """Test product-category relationship."""
        product = Product(
            name="Related Product",
            slug="related-product",
            description="Product with category relationship",
            price=149.99,
            category=sample_category,
            created_by=sample_user
        )

        test_db_session.add(product)
        test_db_session.commit()
        test_db_session.refresh(product)

        # Test forward relationship
        assert product.category.name == "Test Category"

        # Test reverse relationship
        assert product in sample_category.products

    def test_product_slug_uniqueness(self, test_db_session, sample_category, sample_user):
        """Test product slug uniqueness."""
        product1 = Product(
            name="Product 1",
            slug="duplicate-slug",
            description="First product",
            price=99.99,
            category=sample_category,
            created_by=sample_user
        )

        product2 = Product(
            name="Product 2",
            slug="duplicate-slug",
            description="Second product",
            price=149.99,
            category=sample_category,
            created_by=sample_user
        )

        test_db_session.add(product1)
        test_db_session.commit()

        test_db_session.add(product2)
        with pytest.raises(IntegrityError):
            test_db_session.commit()
```

### Service Layer Testing

```python
# tests/unit/test_services.py - Service layer tests
import pytest
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime, timedelta

from app.services.user_service import UserService
from app.services.email_service import EmailService
from app.services.auth_service import AuthService
from app.schemas.user import UserCreate, UserUpdate
from app.core.exceptions import UserNotFoundError, InvalidCredentialsError

class TestUserService:
    """Test UserService functionality."""

    @pytest.fixture
    def user_service(self, test_db_session):
        """Create UserService instance."""
        return UserService(test_db_session)

    def test_create_user_success(self, user_service, sample_user_data):
        """Test successful user creation."""
        user_create = UserCreate(**sample_user_data)
        user = user_service.create(user_create)

        assert user.email == sample_user_data["email"]
        assert user.full_name == sample_user_data["full_name"]
        assert user.check_password(sample_user_data["password"])
        assert user.is_active

    def test_create_user_duplicate_email(self, user_service, sample_user_data):
        """Test user creation with duplicate email."""
        user_create = UserCreate(**sample_user_data)

        # Create first user
        user_service.create(user_create)

        # Attempt to create second user with same email
        with pytest.raises(ValueError, match="Email already registered"):
            user_service.create(user_create)

    def test_get_user_by_id(self, user_service, test_user):
        """Test retrieving user by ID."""
        retrieved_user = user_service.get(test_user.id)

        assert retrieved_user.id == test_user.id
        assert retrieved_user.email == test_user.email

    def test_get_user_not_found(self, user_service):
        """Test retrieving non-existent user."""
        with pytest.raises(UserNotFoundError):
            user_service.get(99999)

    def test_update_user(self, user_service, test_user):
        """Test user update functionality."""
        update_data = UserUpdate(
            full_name="Updated Name",
            bio="Updated bio"
        )

        updated_user = user_service.update(test_user, update_data)

        assert updated_user.full_name == "Updated Name"
        assert updated_user.bio == "Updated bio"
        assert updated_user.email == test_user.email  # Unchanged

    def test_delete_user(self, user_service, test_user):
        """Test user deletion."""
        user_id = test_user.id
        user_service.delete(test_user)

        with pytest.raises(UserNotFoundError):
            user_service.get(user_id)

    @patch('app.services.user_service.send_welcome_email')
    def test_create_user_sends_email(self, mock_send_email, user_service, sample_user_data):
        """Test that user creation sends welcome email."""
        user_create = UserCreate(**sample_user_data)
        user = user_service.create(user_create)

        mock_send_email.assert_called_once_with(user.email, user.full_name)

class TestEmailService:
    """Test EmailService functionality."""

    @pytest.fixture
    def email_service(self):
        """Create EmailService instance."""
        return EmailService()

    @patch('smtplib.SMTP')
    def test_send_email_success(self, mock_smtp, email_service):
        """Test successful email sending."""
        mock_server = Mock()
        mock_smtp.return_value.__enter__.return_value = mock_server

        result = email_service.send_email(
            to_email="test@example.com",
            subject="Test Subject",
            body="Test body"
        )

        assert result is True
        mock_server.starttls.assert_called_once()
        mock_server.login.assert_called_once()
        mock_server.send_message.assert_called_once()

    @patch('smtplib.SMTP')
    def test_send_email_failure(self, mock_smtp, email_service):
        """Test email sending failure."""
        mock_smtp.side_effect = Exception("SMTP Error")

        result = email_service.send_email(
            to_email="test@example.com",
            subject="Test Subject",
            body="Test body"
        )

        assert result is False

    def test_email_template_rendering(self, email_service):
        """Test email template rendering."""
        template_vars = {
            "user_name": "John Doe",
            "activation_link": "https://example.com/activate"
        }

        rendered = email_service.render_template("welcome.html", template_vars)

        assert "John Doe" in rendered
        assert "https://example.com/activate" in rendered

class TestAuthService:
    """Test AuthService functionality."""

    @pytest.fixture
    def auth_service(self, test_db_session):
        """Create AuthService instance."""
        return AuthService(test_db_session)

    def test_authenticate_success(self, auth_service, test_user):
        """Test successful authentication."""
        # Set known password for test user
        test_user.set_password("testpassword")

        authenticated_user = auth_service.authenticate(
            test_user.email,
            "testpassword"
        )

        assert authenticated_user.id == test_user.id

    def test_authenticate_invalid_email(self, auth_service):
        """Test authentication with invalid email."""
        with pytest.raises(InvalidCredentialsError):
            auth_service.authenticate("nonexistent@example.com", "password")

    def test_authenticate_invalid_password(self, auth_service, test_user):
        """Test authentication with invalid password."""
        test_user.set_password("correctpassword")

        with pytest.raises(InvalidCredentialsError):
            auth_service.authenticate(test_user.email, "wrongpassword")

    @patch('app.core.security.create_access_token')
    def test_create_access_token(self, mock_create_token, auth_service, test_user):
        """Test access token creation."""
        mock_create_token.return_value = "mock_token"

        token = auth_service.create_access_token(test_user)

        assert token == "mock_token"
        mock_create_token.assert_called_once_with(
            data={"sub": test_user.email}
        )

    def test_refresh_token_valid(self, auth_service, test_user):
        """Test token refresh with valid token."""
        # Create initial token
        access_token = auth_service.create_access_token(test_user)

        # Refresh token
        new_token = auth_service.refresh_token(access_token)

        assert new_token is not None
        assert new_token != access_token

    def test_refresh_token_invalid(self, auth_service):
        """Test token refresh with invalid token."""
        with pytest.raises(InvalidCredentialsError):
            auth_service.refresh_token("invalid_token")
```

## 🔗 Integration Testing

### API Integration Tests

```python
# tests/integration/test_api.py - API integration tests
import pytest
from fastapi import status
import json

class TestUserAPI:
    """Test User API endpoints."""

    def test_register_user_success(self, test_client):
        """Test successful user registration."""
        user_data = {
            "email": "newuser@example.com",
            "password": "securepassword123",
            "full_name": "New User"
        }

        response = test_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["email"] == user_data["email"]
        assert data["full_name"] == user_data["full_name"]
        assert "id" in data
        assert "password" not in data  # Password should not be returned

    def test_register_user_duplicate_email(self, test_client, test_user):
        """Test user registration with duplicate email."""
        user_data = {
            "email": test_user.email,
            "password": "password123",
            "full_name": "Duplicate User"
        }

        response = test_client.post("/auth/register", json=user_data)

        assert response.status_code == status.HTTP_400_BAD_REQUEST
        assert "already registered" in response.json()["detail"]

    def test_login_success(self, test_client, test_user):
        """Test successful user login."""
        # Set password for test user
        test_user.set_password("testpassword")

        login_data = {
            "username": test_user.email,
            "password": "testpassword"
        }

        response = test_client.post("/auth/login", data=login_data)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"

    def test_login_invalid_credentials(self, test_client, test_user):
        """Test login with invalid credentials."""
        login_data = {
            "username": test_user.email,
            "password": "wrongpassword"
        }

        response = test_client.post("/auth/login", data=login_data)

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

    def test_get_current_user(self, test_client, test_user):
        """Test getting current user information."""
        # Login and get token
        test_user.set_password("testpassword")
        login_data = {
            "username": test_user.email,
            "password": "testpassword"
        }
        login_response = test_client.post("/auth/login", data=login_data)
        token = login_response.json()["access_token"]

        # Get user info
        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.get("/users/me", headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["email"] == test_user.email

    def test_update_user_profile(self, test_client, test_user):
        """Test updating user profile."""
        # Login and get token
        test_user.set_password("testpassword")
        login_data = {
            "username": test_user.email,
            "password": "testpassword"
        }
        login_response = test_client.post("/auth/login", data=login_data)
        token = login_response.json()["access_token"]

        # Update profile
        update_data = {
            "full_name": "Updated Name",
            "bio": "Updated bio"
        }
        headers = {"Authorization": f"Bearer {token}"}
        response = test_client.put(f"/users/{test_user.id}", json=update_data, headers=headers)

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["full_name"] == "Updated Name"
        assert data["bio"] == "Updated bio"

    def test_unauthorized_access(self, test_client):
        """Test accessing protected endpoint without authentication."""
        response = test_client.get("/users/me")

        assert response.status_code == status.HTTP_401_UNAUTHORIZED

class TestProductAPI:
    """Test Product API endpoints."""

    @pytest.fixture
    def authenticated_headers(self, test_client, test_user):
        """Get authentication headers."""
        test_user.set_password("testpassword")
        login_data = {
            "username": test_user.email,
            "password": "testpassword"
        }
        login_response = test_client.post("/auth/login", data=login_data)
        token = login_response.json()["access_token"]
        return {"Authorization": f"Bearer {token}"}

    @pytest.fixture
    def sample_category(self, test_db_session):
        """Create sample category."""
        from app.models.product import Category
        category = Category(
            name="Test Category",
            slug="test-category",
            description="Test category"
        )
        test_db_session.add(category)
        test_db_session.commit()
        test_db_session.refresh(category)
        return category

    def test_create_product(self, test_client, authenticated_headers, sample_category):
        """Test product creation."""
        product_data = {
            "name": "Test Product",
            "slug": "test-product",
            "description": "Test product description",
            "price": 99.99,
            "category_id": sample_category.id,
            "stock_quantity": 10
        }

        response = test_client.post("/products/", json=product_data, headers=authenticated_headers)

        assert response.status_code == status.HTTP_201_CREATED
        data = response.json()
        assert data["name"] == product_data["name"]
        assert data["price"] == product_data["price"]

    def test_list_products(self, test_client):
        """Test product listing (public endpoint)."""
        response = test_client.get("/products/")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert "results" in data
        assert isinstance(data["results"], list)

    def test_get_product_detail(self, test_client, sample_category, test_user, test_db_session):
        """Test getting product details."""
        from app.models.product import Product

        # Create test product
        product = Product(
            name="Detail Product",
            slug="detail-product",
            description="Product for detail test",
            price=149.99,
            category=sample_category,
            created_by=test_user,
            stock_quantity=5
        )
        test_db_session.add(product)
        test_db_session.commit()
        test_db_session.refresh(product)

        response = test_client.get(f"/products/{product.id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        assert data["name"] == "Detail Product"
        assert data["slug"] == "detail-product"

    def test_filter_products_by_category(self, test_client, sample_category):
        """Test filtering products by category."""
        response = test_client.get(f"/products/?category_id={sample_category.id}")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # All returned products should belong to the specified category
        for product in data["results"]:
            assert product["category"]["id"] == sample_category.id

    def test_search_products(self, test_client):
        """Test product search functionality."""
        response = test_client.get("/products/?search=test")

        assert response.status_code == status.HTTP_200_OK
        data = response.json()
        # Results should contain search term (case-insensitive)
        for product in data["results"]:
            assert "test" in product["name"].lower() or "test" in product["description"].lower()
```

### Database Integration Tests

```python
# tests/integration/test_database.py - Database integration tests
import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.core.database import engine, SessionLocal
from app.models.user import User
from app.models.product import Product, Category

class TestDatabaseOperations:
    """Test database operations and constraints."""

    def test_database_connection(self):
        """Test database connection."""
        with engine.connect() as connection:
            result = connection.execute(text("SELECT 1"))
            assert result.fetchone()[0] == 1

    def test_create_tables(self, test_db_session):
        """Test that all tables are created correctly."""
        # Check if tables exist
        tables = ['users', 'categories', 'products']
        for table in tables:
            result = test_db_session.execute(
                text(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}';")
            )
            assert result.fetchone() is not None

    def test_foreign_key_constraints(self, test_db_session):
        """Test foreign key constraints."""
        # Create user and category
        user = User(email="fk@example.com", username="fkuser")
        category = Category(name="FK Category", slug="fk-category")

        test_db_session.add(user)
        test_db_session.add(category)
        test_db_session.commit()

        # Create product with valid foreign keys
        product = Product(
            name="FK Product",
            slug="fk-product",
            description="Product with foreign keys",
            price=99.99,
            category_id=category.id,
            created_by_id=user.id
        )

        test_db_session.add(product)
        test_db_session.commit()

        assert product.category_id == category.id
        assert product.created_by_id == user.id

    def test_cascade_operations(self, test_db_session):
        """Test cascade delete operations."""
        # Create category with products
        category = Category(name="Cascade Category", slug="cascade-category")
        user = User(email="cascade@example.com", username="cascadeuser")

        test_db_session.add(category)
        test_db_session.add(user)
        test_db_session.commit()

        # Create products in category
        for i in range(3):
            product = Product(
                name=f"Product {i}",
                slug=f"product-{i}",
                description=f"Product {i} description",
                price=99.99 + i,
                category_id=category.id,
                created_by_id=user.id
            )
            test_db_session.add(product)

        test_db_session.commit()

        # Verify products exist
        product_count = test_db_session.query(Product).filter(
            Product.category_id == category.id
        ).count()
        assert product_count == 3

        # Delete category (should handle cascading)
        test_db_session.delete(category)
        test_db_session.commit()

        # Verify cascade behavior based on your model configuration
        remaining_products = test_db_session.query(Product).filter(
            Product.category_id == category.id
        ).count()
        # This depends on your CASCADE configuration
        # assert remaining_products == 0  # If CASCADE DELETE
        # assert remaining_products == 3  # If RESTRICT

    def test_unique_constraints(self, test_db_session):
        """Test unique constraints."""
        # Test user email uniqueness
        user1 = User(email="unique@example.com", username="user1")
        user2 = User(email="unique@example.com", username="user2")

        test_db_session.add(user1)
        test_db_session.commit()

        test_db_session.add(user2)
        with pytest.raises(IntegrityError):
            test_db_session.commit()

        test_db_session.rollback()

        # Test product slug uniqueness
        category = Category(name="Unique Category", slug="unique-category")
        test_db_session.add(category)
        test_db_session.commit()

        product1 = Product(
            name="Product 1",
            slug="unique-slug",
            description="First product",
            price=99.99,
            category_id=category.id,
            created_by_id=user1.id
        )

        product2 = Product(
            name="Product 2",
            slug="unique-slug",
            description="Second product",
            price=149.99,
            category_id=category.id,
            created_by_id=user1.id
        )

        test_db_session.add(product1)
        test_db_session.commit()

        test_db_session.add(product2)
        with pytest.raises(IntegrityError):
            test_db_session.commit()

    def test_transaction_rollback(self, test_db_session):
        """Test transaction rollback functionality."""
        initial_user_count = test_db_session.query(User).count()

        try:
            # Start transaction
            user1 = User(email="rollback1@example.com", username="rollback1")
            user2 = User(email="rollback2@example.com", username="rollback2")

            test_db_session.add(user1)
            test_db_session.add(user2)

            # Force an error (duplicate email)
            user3 = User(email="rollback1@example.com", username="rollback3")
            test_db_session.add(user3)

            test_db_session.commit()
        except IntegrityError:
            test_db_session.rollback()

        # Verify no users were added due to rollback
        final_user_count = test_db_session.query(User).count()
        assert final_user_count == initial_user_count

    def test_query_performance(self, test_db_session):
        """Test query performance with indexes."""
        import time

        # Create test data
        category = Category(name="Performance Category", slug="perf-category")
        user = User(email="perf@example.com", username="perfuser")

        test_db_session.add(category)
        test_db_session.add(user)
        test_db_session.commit()

        # Create multiple products
        products = []
        for i in range(100):
            product = Product(
                name=f"Performance Product {i}",
                slug=f"perf-product-{i}",
                description=f"Product {i} for performance testing",
                price=99.99 + i,
                category_id=category.id,
                created_by_id=user.id
            )
            products.append(product)

        test_db_session.add_all(products)
        test_db_session.commit()

        # Test query performance
        start_time = time.time()

        # Query that should use index (email)
        user_query = test_db_session.query(User).filter(
            User.email == "perf@example.com"
        ).first()

        # Query that should use index (slug)
        product_query = test_db_session.query(Product).filter(
            Product.slug == "perf-product-50"
        ).first()

        end_time = time.time()
        query_time = end_time - start_time

        assert user_query is not None
        assert product_query is not None
        # Query should be fast (less than 100ms for small dataset)
        assert query_time < 0.1
```

## 🚀 Performance Testing

### Load Testing with Locust

```python
# tests/performance/test_load.py - Load testing
from locust import HttpUser, task, between
import random
import json

class WebsiteUser(HttpUser):
    """Simulated user for load testing."""
    wait_time = between(1, 3)

    def on_start(self):
        """Setup for user session."""
        self.register_and_login()

    def register_and_login(self):
        """Register and login user."""
        # Register user
        user_data = {
            "email": f"loadtest{random.randint(1, 10000)}@example.com",
            "password": "loadtest123",
            "full_name": "Load Test User"
        }

        register_response = self.client.post("/auth/register", json=user_data)

        if register_response.status_code == 201:
            # Login
            login_data = {
                "username": user_data["email"],
                "password": user_data["password"]
            }

            login_response = self.client.post("/auth/login", data=login_data)

            if login_response.status_code == 200:
                token = login_response.json()["access_token"]
                self.client.headers.update({"Authorization": f"Bearer {token}"})

    @task(3)
    def browse_products(self):
        """Browse products (most common action)."""
        self.client.get("/products/")

    @task(2)
    def view_product_detail(self):
        """View product details."""
        # Get random product ID (assuming products exist)
        product_id = random.randint(1, 100)
        self.client.get(f"/products/{product_id}")

    @task(1)
    def search_products(self):
        """Search for products."""
        search_terms = ["test", "product", "item", "gadget"]
        term = random.choice(search_terms)
        self.client.get(f"/products/?search={term}")

    @task(1)
    def view_profile(self):
        """View user profile."""
        self.client.get("/users/me")

    @task(1)
    def update_profile(self):
        """Update user profile."""
        update_data = {
            "bio": f"Updated bio {random.randint(1, 1000)}"
        }
        # Note: This assumes we have the user ID
        self.client.put("/users/1", json=update_data)

class APIUser(HttpUser):
    """API-focused load testing."""
    wait_time = between(0.5, 2)

    def on_start(self):
        """API setup."""
        # Get API token
        login_data = {
            "username": "api@example.com",
            "password": "apipassword"
        }
        response = self.client.post("/auth/login", data=login_data)
        if response.status_code == 200:
            token = response.json()["access_token"]
            self.client.headers.update({"Authorization": f"Bearer {token}"})

    @task(5)
    def api_get_products(self):
        """API: Get products."""
        self.client.get("/api/products/")

    @task(3)
    def api_get_categories(self):
        """API: Get categories."""
        self.client.get("/api/categories/")

    @task(2)
    def api_create_product(self):
        """API: Create product."""
        product_data = {
            "name": f"API Product {random.randint(1, 10000)}",
            "slug": f"api-product-{random.randint(1, 10000)}",
            "description": "Product created via API load test",
            "price": round(random.uniform(10, 1000), 2),
            "category_id": random.randint(1, 10),
            "stock_quantity": random.randint(1, 100)
        }

        self.client.post("/api/products/", json=product_data)

    @task(1)
    def api_health_check(self):
        """API: Health check."""
        self.client.get("/health")

# Performance testing configuration
class PerformanceTestConfig:
    """Configuration for performance tests."""

    @staticmethod
    def run_load_test():
        """Run load test using Locust programmatically."""
        import subprocess
        import time

        # Start load test
        process = subprocess.Popen([
            "locust",
            "-f", "tests/performance/test_load.py",
            "--host", "http://localhost:8000",
            "--users", "50",
            "--spawn-rate", "5",
            "--run-time", "60s",
            "--headless",
            "--csv", "reports/load_test"
        ])

        # Wait for completion
        process.wait()

        # Notify claude-flow
        try:
            subprocess.run([
                "npx", "claude-flow@alpha", "hooks", "notify",
                "--message", "Load testing completed"
            ], check=True)
        except:
            print("Load testing completed")

    @staticmethod
    def run_stress_test():
        """Run stress test with higher load."""
        import subprocess

        process = subprocess.Popen([
            "locust",
            "-f", "tests/performance/test_load.py",
            "--host", "http://localhost:8000",
            "--users", "200",
            "--spawn-rate", "10",
            "--run-time", "300s",
            "--headless",
            "--csv", "reports/stress_test"
        ])

        process.wait()
```

### Benchmark Testing with pytest-benchmark

```python
# tests/performance/test_benchmarks.py - Micro-benchmarks
import pytest
from pytest_benchmark import benchmark
import pandas as pd
import numpy as np

from app.services.user_service import UserService
from app.services.product_service import ProductService
from app.utils.data_processor import DataProcessor

class TestServiceBenchmarks:
    """Benchmark service layer performance."""

    def test_user_creation_benchmark(self, benchmark, test_db_session):
        """Benchmark user creation performance."""
        user_service = UserService(test_db_session)

        def create_user():
            from app.schemas.user import UserCreate
            import uuid

            user_data = UserCreate(
                email=f"bench{uuid.uuid4()}@example.com",
                password="benchpassword",
                full_name="Benchmark User"
            )
            return user_service.create(user_data)

        result = benchmark(create_user)
        assert result.id is not None

    def test_product_search_benchmark(self, benchmark, test_db_session):
        """Benchmark product search performance."""
        product_service = ProductService(test_db_session)

        # Create test data
        self._create_test_products(test_db_session, count=1000)

        def search_products():
            return product_service.search("test", limit=10)

        results = benchmark(search_products)
        assert len(results) <= 10

    def test_data_processing_benchmark(self, benchmark):
        """Benchmark data processing utilities."""
        # Create test dataset
        data = pd.DataFrame({
            'id': range(10000),
            'value': np.random.randn(10000),
            'category': np.random.choice(['A', 'B', 'C'], 10000)
        })

        processor = DataProcessor()

        def process_data():
            return processor.aggregate_by_category(data)

        result = benchmark(process_data)
        assert len(result) == 3  # Three categories

    def test_database_query_benchmark(self, benchmark, test_db_session):
        """Benchmark database query performance."""
        # Create test data
        self._create_test_users(test_db_session, count=1000)

        def complex_query():
            from app.models.user import User
            return test_db_session.query(User).filter(
                User.email.contains("bench"),
                User.is_active == True
            ).limit(100).all()

        results = benchmark(complex_query)
        assert len(results) <= 100

    def _create_test_products(self, db_session, count=100):
        """Helper to create test products."""
        from app.models.product import Product, Category
        from app.models.user import User

        # Create category and user
        category = Category(name="Bench Category", slug="bench-category")
        user = User(email="bench@example.com", username="benchuser")

        db_session.add(category)
        db_session.add(user)
        db_session.commit()

        # Create products
        products = []
        for i in range(count):
            product = Product(
                name=f"Test Product {i}",
                slug=f"test-product-{i}",
                description=f"Test product {i} description",
                price=99.99 + i,
                category_id=category.id,
                created_by_id=user.id
            )
            products.append(product)

        db_session.add_all(products)
        db_session.commit()

    def _create_test_users(self, db_session, count=100):
        """Helper to create test users."""
        from app.models.user import User

        users = []
        for i in range(count):
            user = User(
                email=f"bench{i}@example.com",
                username=f"benchuser{i}",
                full_name=f"Bench User {i}"
            )
            users.append(user)

        db_session.add_all(users)
        db_session.commit()
```

## 🔄 Continuous Integration

### GitHub Actions Workflow

```yaml
# .github/workflows/python-tests.yml
name: Python Testing Pipeline

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
        python-version: [3.9, 3.10, 3.11]

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
    - uses: actions/checkout@v4

    - name: Set up Python ${{ matrix.python-version }}
      uses: actions/setup-python@v4
      with:
        python-version: ${{ matrix.python-version }}

    - name: Install Poetry
      uses: snok/install-poetry@v1
      with:
        version: latest
        virtualenvs-create: true
        virtualenvs-in-project: true

    - name: Load cached venv
      id: cached-poetry-dependencies
      uses: actions/cache@v3
      with:
        path: .venv
        key: venv-${{ runner.os }}-${{ matrix.python-version }}-${{ hashFiles('**/poetry.lock') }}

    - name: Install dependencies
      if: steps.cached-poetry-dependencies.outputs.cache-hit != 'true'
      run: poetry install --no-interaction --no-root

    - name: Install project
      run: poetry install --no-interaction

    - name: Lint with flake8
      run: |
        poetry run flake8 app tests --count --select=E9,F63,F7,F82 --show-source --statistics
        poetry run flake8 app tests --count --exit-zero --max-complexity=10 --max-line-length=88 --statistics

    - name: Type check with mypy
      run: poetry run mypy app

    - name: Test with pytest
      env:
        DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db
        REDIS_URL: redis://localhost:6379
      run: |
        poetry run pytest \
          --cov=app \
          --cov-report=xml \
          --cov-report=term-missing \
          --cov-fail-under=90 \
          --junitxml=reports/junit.xml \
          -v

    - name: Upload coverage to Codecov
      uses: codecov/codecov-action@v3
      with:
        file: ./coverage.xml
        flags: unittests
        name: codecov-umbrella

    - name: Performance Tests
      run: |
        poetry run pytest tests/performance/ -v --benchmark-only

    - name: Load Testing
      run: |
        poetry run uvicorn app.main:app --host 0.0.0.0 --port 8000 &
        sleep 10
        poetry run locust -f tests/performance/test_load.py --host http://localhost:8000 --users 10 --spawn-rate 2 --run-time 30s --headless --csv reports/load_test
        pkill -f uvicorn

    - name: Upload test reports
      uses: actions/upload-artifact@v3
      if: always()
      with:
        name: test-reports-${{ matrix.python-version }}
        path: reports/

  security:
    runs-on: ubuntu-latest
    steps:
    - uses: actions/checkout@v4

    - name: Set up Python
      uses: actions/setup-python@v4
      with:
        python-version: 3.11

    - name: Install Poetry
      uses: snok/install-poetry@v1

    - name: Install dependencies
      run: poetry install

    - name: Security check with bandit
      run: poetry run bandit -r app/

    - name: Dependency vulnerability check
      run: poetry run safety check
```

### Pre-commit Configuration

```yaml
# .pre-commit-config.yaml
repos:
  - repo: https://github.com/pre-commit/pre-commit-hooks
    rev: v4.4.0
    hooks:
      - id: trailing-whitespace
      - id: end-of-file-fixer
      - id: check-yaml
      - id: check-added-large-files
      - id: check-merge-conflict

  - repo: https://github.com/psf/black
    rev: 23.11.0
    hooks:
      - id: black
        language_version: python3.11

  - repo: https://github.com/pycqa/isort
    rev: 5.12.0
    hooks:
      - id: isort
        args: ["--profile", "black"]

  - repo: https://github.com/pycqa/flake8
    rev: 6.1.0
    hooks:
      - id: flake8
        additional_dependencies: [flake8-docstrings, flake8-black]

  - repo: https://github.com/pre-commit/mirrors-mypy
    rev: v1.7.1
    hooks:
      - id: mypy
        additional_dependencies: [types-requests, types-redis]

  - repo: https://github.com/PyCQA/bandit
    rev: 1.7.5
    hooks:
      - id: bandit
        args: ["-c", "pyproject.toml"]

  - repo: local
    hooks:
      - id: claude-flow-test-hook
        name: Claude-Flow Test Integration
        entry: npx claude-flow@alpha hooks pre-commit
        language: system
        pass_filenames: false
        always_run: true
```

## 📊 Testing Metrics and Reporting

### Test Coverage Analysis

```python
# scripts/coverage_analysis.py - Coverage reporting
import subprocess
import json
import xml.etree.ElementTree as ET

class CoverageAnalyzer:
    """Analyze test coverage and generate reports."""

    def __init__(self):
        self.coverage_threshold = 90

    def run_coverage_analysis(self):
        """Run comprehensive coverage analysis."""
        # Run tests with coverage
        subprocess.run([
            "poetry", "run", "pytest",
            "--cov=app",
            "--cov-report=xml",
            "--cov-report=html",
            "--cov-report=json",
            "--cov-report=term-missing"
        ], check=True)

        # Analyze results
        coverage_data = self.parse_coverage_results()
        self.generate_coverage_report(coverage_data)

        return coverage_data

    def parse_coverage_results(self):
        """Parse coverage results from multiple formats."""
        # Parse JSON report
        with open('coverage.json', 'r') as f:
            json_data = json.load(f)

        # Parse XML report
        tree = ET.parse('coverage.xml')
        root = tree.getroot()

        coverage_data = {
            'total_coverage': json_data['totals']['percent_covered'],
            'files': {},
            'missing_lines': {}
        }

        for filename, file_data in json_data['files'].items():
            coverage_data['files'][filename] = {
                'coverage': file_data['summary']['percent_covered'],
                'lines_covered': file_data['summary']['covered_lines'],
                'lines_missing': file_data['summary']['missing_lines'],
                'missing_line_numbers': file_data['missing_lines']
            }

        return coverage_data

    def generate_coverage_report(self, coverage_data):
        """Generate human-readable coverage report."""
        report = f"""
# Test Coverage Report

## Overall Coverage: {coverage_data['total_coverage']:.1f}%

## File Coverage Details:

"""

        for filename, file_data in coverage_data['files'].items():
            status = "✅" if file_data['coverage'] >= self.coverage_threshold else "❌"
            report += f"{status} {filename}: {file_data['coverage']:.1f}%\n"

            if file_data['coverage'] < self.coverage_threshold:
                report += f"   Missing lines: {file_data['missing_line_numbers']}\n"

        # Save report
        with open('reports/coverage_report.md', 'w') as f:
            f.write(report)

        # Notify claude-flow
        try:
            subprocess.run([
                "npx", "claude-flow@alpha", "hooks", "notify",
                "--message", f"Coverage analysis completed: {coverage_data['total_coverage']:.1f}%"
            ], check=True)
        except:
            print(f"Coverage analysis completed: {coverage_data['total_coverage']:.1f}%")

        return report

# Test quality metrics
class TestQualityAnalyzer:
    """Analyze test quality and provide recommendations."""

    def analyze_test_quality(self):
        """Analyze test suite quality."""
        metrics = {
            'test_count': self.count_tests(),
            'test_types': self.analyze_test_types(),
            'fixture_usage': self.analyze_fixture_usage(),
            'mock_usage': self.analyze_mock_usage(),
            'assertion_patterns': self.analyze_assertions()
        }

        self.generate_quality_report(metrics)
        return metrics

    def count_tests(self):
        """Count total number of tests."""
        result = subprocess.run([
            "poetry", "run", "pytest", "--collect-only", "-q"
        ], capture_output=True, text=True)

        # Parse output to count tests
        lines = result.stdout.split('\n')
        test_count = 0
        for line in lines:
            if 'test session starts' in line:
                continue
            elif 'tests collected' in line:
                test_count = int(line.split()[0])
                break

        return test_count

    def analyze_test_types(self):
        """Analyze distribution of test types."""
        import os
        from pathlib import Path

        test_types = {
            'unit': 0,
            'integration': 0,
            'e2e': 0,
            'performance': 0
        }

        for test_dir in ['unit', 'integration', 'e2e', 'performance']:
            test_path = Path(f'tests/{test_dir}')
            if test_path.exists():
                for test_file in test_path.glob('test_*.py'):
                    with open(test_file, 'r') as f:
                        content = f.read()
                        test_types[test_dir] += content.count('def test_')

        return test_types

    def analyze_fixture_usage(self):
        """Analyze pytest fixture usage."""
        # This would analyze fixture patterns in conftest.py and test files
        return {
            'total_fixtures': 0,
            'shared_fixtures': 0,
            'parametrized_tests': 0
        }

    def analyze_mock_usage(self):
        """Analyze mock usage patterns."""
        # This would analyze @patch, Mock, and MagicMock usage
        return {
            'patch_usage': 0,
            'mock_objects': 0,
            'proper_isolation': True
        }

    def analyze_assertions(self):
        """Analyze assertion patterns."""
        # This would analyze assertion styles and patterns
        return {
            'total_assertions': 0,
            'assertion_types': {},
            'descriptive_messages': 0
        }

    def generate_quality_report(self, metrics):
        """Generate test quality report."""
        report = f"""
# Test Quality Analysis

## Test Distribution
- Total Tests: {metrics['test_count']}
- Unit Tests: {metrics['test_types']['unit']}
- Integration Tests: {metrics['test_types']['integration']}
- E2E Tests: {metrics['test_types']['e2e']}
- Performance Tests: {metrics['test_types']['performance']}

## Quality Metrics
- Fixture Usage: {metrics['fixture_usage']['total_fixtures']} fixtures
- Mock Usage: {'Good' if metrics['mock_usage']['proper_isolation'] else 'Needs Improvement'}

## Recommendations
"""

        # Add recommendations based on metrics
        if metrics['test_types']['unit'] < metrics['test_count'] * 0.7:
            report += "- ⚠️  Consider adding more unit tests (target: 70% of total tests)\n"

        if metrics['test_types']['integration'] < 5:
            report += "- ⚠️  Consider adding integration tests\n"

        # Save report
        with open('reports/test_quality_report.md', 'w') as f:
            f.write(report)

        return report

if __name__ == "__main__":
    analyzer = CoverageAnalyzer()
    analyzer.run_coverage_analysis()

    quality_analyzer = TestQualityAnalyzer()
    quality_analyzer.analyze_test_quality()
```

## 📚 Next Steps

1. **[Practical Examples](../examples/README.md)** - Complete testing examples
2. **[Web Development](../web-development/README.md)** - Testing web applications
3. **[Data Science Testing](../data-science/README.md)** - ML model testing
4. **[CI/CD Optimization](../examples/cicd.md)** - Advanced CI/CD patterns

---

**Ready to implement comprehensive testing?** Start with [unit testing setup](./unit-testing-guide.md) or explore [integration testing patterns](./integration-testing-guide.md).