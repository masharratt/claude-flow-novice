# TDD Pattern Examples - What "Patterns" Means in Practice

These are actual examples of patterns that get stored in CodeSearch and reused. They're not just code snippets - they're successful approaches with context.

## Example 1: Rust API Handler Pattern

**Stored in CodeSearch after successful generation:**

```json
{
  "type": "tdd_pattern",
  "agent_id": "backend-developer-123",
  "file_type": "rust",
  "feature": "User authentication API endpoint",
  "success": true,
  "confidence": 0.95,
  "pattern": {
    "test_first": true,
    "structure": "Given/When/Then",
    "key_elements": [
      "Write tests for HTTP status codes",
      "Test error cases explicitly",
      "Use mock dependencies",
      "Test with invalid JSON",
      "Include authentication edge cases"
    ]
  }
}
```

**When queried for "rust API handler", the system provides:**

```rust
// Successful Pattern: User Authentication Handler
// Tests that worked well:

#[cfg(test)]
mod tests {
    use super::*;
    use axum_test::TestServer;
    use serde_json::json;

    #[tokio::test]
    async fn test_login_success() {
        // Given
        let app = create_app().await;
        let server = TestServer::new(app).unwrap();
        let payload = json!({
            "email": "test@example.com",
            "password": "password123"
        });

        // When
        let response = server
            .post("/api/auth/login")
            .json(&payload)
            .await;

        // Then
        assert_eq!(response.status_code(), 200);
        let body: serde_json::Value = response.json();
        assert!(body["token"].is_string());
    }

    #[tokio::test]
    async fn test_login_invalid_credentials() {
        // Given
        let app = create_app().await;
        let server = TestServer::new(app).unwrap();
        let payload = json!({
            "email": "test@example.com",
            "password": "wrongpassword"
        });

        // When
        let response = server
            .post("/api/auth/login")
            .json(&payload)
            .await;

        // Then
        assert_eq!(response.status_code(), 401);
    }
}
```

## Example 2: TypeScript React Component Pattern

**Pattern metadata:**
```json
{
  "type": "success_pattern",
  "file_type": "tsx",
  "framework": "React",
  "success_rate": 0.92,
  "common_elements": [
    "TypeScript interfaces for props",
    "useEffect for data fetching",
    "Loading and error states",
    "Responsive design with Tailwind",
    "Jest + Testing Library tests"
  ]
}
```

**Reusable test pattern provided:**
```tsx
// Pattern: Data Fetching Component with Tests
// This approach consistently worked for React components

import React, { useState, useEffect } from 'react';
import { User } from '../types/User';

interface UserProfileProps {
  userId: string;
  onUpdate?: (user: User) => void;
}

export const UserProfile: React.FC<UserProfileProps> = ({ userId, onUpdate }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchUser();
  }, [userId]);

  const fetchUser = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/users/${userId}`);
      if (!response.ok) throw new Error('Failed to fetch user');
      const userData = await response.json();
      setUser(userData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!user) return <div className="no-data">No user found</div>;

  return (
    <div className="user-profile">
      <h2>{user.name}</h2>
      <p>{user.email}</p>
    </div>
  );
};

// Tests that consistently passed:
import { render, screen, waitFor } from '@testing-library/react';
import { UserProfile } from './UserProfile';
import { rest } from 'msw';
import { setupServer } from 'msw/node';

const server = setupServer(
  rest.get('/api/users/1', (req, res, ctx) => {
    return res(ctx.json({ id: '1', name: 'John Doe', email: 'john@example.com' }));
  })
);

describe('UserProfile', () => {
  beforeAll(() => server.listen());
  afterEach(() => server.resetHandlers());
  afterAll(() => server.close());

  it('displays user data when loaded', async () => {
    render(<UserProfile userId="1" />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('john@example.com')).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    render(<UserProfile userId="1" />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('handles API errors gracefully', async () => {
    server.use(
      rest.get('/api/users/1', (req, res, ctx) => {
        return res(ctx.status(500));
      })
    );

    render(<UserProfile userId="1" />);

    await waitFor(() => {
      expect(screen.getByText(/Unknown error/)).toBeInTheDocument();
    });
  });
});
```

## Example 3: Python Service Layer Pattern

**Pattern tracked in CodeSearch:**
```python
# Successful Pattern: Service Layer with Business Logic
# Key elements that made this successful:

class UserService:
    """
    Service layer for user operations.
    Follows business rules, not just CRUD.
    """

    def __init__(self, user_repo: UserRepository, email_service: EmailService):
        self._user_repo = user_repo
        self._email_service = email_service

    async def create_user(self, user_data: CreateUserRequest) -> User:
        """Create user with business validation."""
        # Business rule: Email must be unique
        existing = await self._user_repo.find_by_email(user_data.email)
        if existing:
            raise DuplicateEmailError(user_data.email)

        # Business rule: Password strength
        if not self._is_strong_password(user_data.password):
            raise WeakPasswordError()

        # Create user
        user = await self._user_repo.save(user_data)

        # Send welcome email
        await self._email_service.send_welcome(user)

        return user

    def _is_strong_password(self, password: str) -> bool:
        """Business rule for password strength."""
        return (
            len(password) >= 8 and
            any(c.isupper() for c in password) and
            any(c.islower() for c in password) and
            any(c.isdigit() for c in password)
        )

# Tests that validated business logic:
class TestUserService:
    def test_create_user_success(self):
        # Given
        mock_repo = Mock()
        mock_email = Mock()
        service = UserService(mock_repo, mock_email)
        user_data = CreateUserRequest(
            email="test@example.com",
            password="StrongPass123"
        )

        # When
        result = service.create_user(user_data)

        # Then
        assert result.email == "test@example.com"
        mock_email.send_welcome.assert_called_once_with(result)

    def test_create_user_duplicate_email(self):
        # Given
        mock_repo = Mock()
        mock_repo.find_by_email.return_value = User(email="test@example.com")
        service = UserService(mock_repo, Mock())

        # When/Then
        with pytest.raises(DuplicateEmailError):
            service.create_user(CreateUserRequest(email="test@example.com"))
```

## What Makes These "Patterns"?

1. **Context-Aware**: Not just code, but WHY it worked
   - Agent ID (who succeeded with this)
   - File type and framework context
   - Success rate and confidence
   - Common pitfalls that were avoided

2. **Structured Approach**:
   - Test-first methodology
   - Clear Given/When/Then structure
   - Specific assertion patterns
   - Error handling approaches

3. **Reusable Elements**:
   - Test setup patterns
   - Mocking strategies
   - Data validation approaches
   - Error response formats

4. **Learning Metadata**:
   - What failed initially
   - How it was fixed
   - Performance characteristics
   - Dependencies that mattered

## How Patterns Are Used

When an agent requests similar functionality:

```bash
./query-patterns.sh --file-type rs --pattern "authentication API"
```

The system returns:
1. **Successful test structures** that passed consistently
2. **Implementation approaches** that worked well
3. **Common pitfalls** to avoid
4. **Context files** that helped (types, mocks, etc.)
5. **Agent-specific tips** - what worked for your agent type

This isn't just copying code - it's learning from experience what approaches consistently succeed for each language, framework, and agent type.