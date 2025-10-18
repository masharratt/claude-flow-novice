### React Development Patterns

**Component Architecture:**
- Use functional components with hooks
- Implement proper component composition
- Follow single responsibility principle
- Use TypeScript for better type safety
- Implement proper error boundaries

**Concurrent Agent Execution:**
```jsx
// ✅ CORRECT: React development with specialized agents
[Single Message]:
  Task("React Developer", "Build reusable components with hooks and context", "coder")
  Task("State Manager", "Implement Redux Toolkit/Zustand state management", "system-architect")
  Task("UI Designer", "Create responsive layouts with CSS-in-JS/Tailwind", "coder")
  Task("Test Engineer", "Write React Testing Library tests with coverage", "tester")
  Task("Performance Engineer", "Optimize renders and bundle size", "perf-analyzer")

  // Batch React file operations
  Write("src/components/App.jsx")
  Write("src/hooks/useApi.js")
  Write("src/context/AppContext.jsx")
  Write("src/styles/globals.css")
  Write("tests/components/App.test.jsx")

  // React-specific todos
  TodoWrite({ todos: [
    {content: "Setup component library structure", status: "in_progress", activeForm: "Setting up component library structure"},
    {content: "Implement custom hooks for data fetching", status: "pending", activeForm: "Implementing custom hooks for data fetching"},
    {content: "Add error boundaries and loading states", status: "pending", activeForm: "Adding error boundaries and loading states"},
    {content: "Configure routing with React Router", status: "pending", activeForm: "Configuring routing with React Router"},
    {content: "Optimize performance with memoization", status: "pending", activeForm: "Optimizing performance with memoization"}
  ]})
```

**Project Structure:**
```
src/
  components/
    common/           # Reusable UI components
      Button.jsx
      Modal.jsx
      Input.jsx
    layout/           # Layout components
      Header.jsx
      Sidebar.jsx
      Footer.jsx
    pages/            # Page-level components
      HomePage.jsx
      UserProfile.jsx
  hooks/              # Custom hooks
    useApi.js
    useLocalStorage.js
    useAuth.js
  context/            # React context providers
    AuthContext.jsx
    ThemeContext.jsx
  services/           # API services
    api.js
    auth.js
  utils/              # Helper functions
    validators.js
    formatters.js
  styles/             # Global styles
    globals.css
    variables.css
```

**Component Patterns:**
```jsx
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import PropTypes from 'prop-types';

// Functional component with hooks
const UserProfile = ({ userId, onUpdate }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Memoized expensive calculations
  const userStats = useMemo(() => {
    if (!user) return null;
    return {
      totalPosts: user.posts?.length || 0,
      joinedDate: new Date(user.createdAt).toLocaleDateString()
    };
  }, [user]);

  // Memoized callbacks to prevent unnecessary re-renders
  const handleUpdateUser = useCallback(async (updates) => {
    try {
      const updatedUser = await updateUser(userId, updates);
      setUser(updatedUser);
      onUpdate?.(updatedUser);
    } catch (err) {
      setError(err.message);
    }
  }, [userId, onUpdate]);

  useEffect(() => {
    let cancelled = false;

    const fetchUser = async () => {
      try {
        setLoading(true);
        const userData = await getUserById(userId);
        if (!cancelled) {
          setUser(userData);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err.message);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    fetchUser();

    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (loading) return <LoadingSpinner />;
  if (error) return <ErrorMessage message={error} />;
  if (!user) return <NotFound />;

  return (
    <div className="user-profile">
      <ProfileHeader user={user} stats={userStats} />
      <ProfileContent user={user} onUpdate={handleUpdateUser} />
    </div>
  );
};

UserProfile.propTypes = {
  userId: PropTypes.string.isRequired,
  onUpdate: PropTypes.func
};

export default React.memo(UserProfile);
```

**Custom Hooks Pattern:**
```jsx
import { useState, useEffect, useCallback } from 'react';

// Generic API hook
export const useApi = (url, options = {}) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [url, options]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const refetch = useCallback(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch };
};

// Local storage hook
export const useLocalStorage = (key, initialValue) => {
  const [storedValue, setStoredValue] = useState(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  const setValue = useCallback((value) => {
    try {
      const valueToStore = value instanceof Function ? value(storedValue) : value;
      setStoredValue(valueToStore);
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue]);

  return [storedValue, setValue];
};
```

**Context Pattern:**
```jsx
import React, { createContext, useContext, useReducer, useCallback } from 'react';

// State and actions
const initialState = {
  user: null,
  isAuthenticated: false,
  loading: false,
  error: null
};

const authReducer = (state, action) => {
  switch (action.type) {
    case 'LOGIN_START':
      return { ...state, loading: true, error: null };
    case 'LOGIN_SUCCESS':
      return {
        ...state,
        user: action.payload,
        isAuthenticated: true,
        loading: false,
        error: null
      };
    case 'LOGIN_FAILURE':
      return {
        ...state,
        user: null,
        isAuthenticated: false,
        loading: false,
        error: action.payload
      };
    case 'LOGOUT':
      return initialState;
    default:
      return state;
  }
};

// Context creation
const AuthContext = createContext();

// Provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);

  const login = useCallback(async (credentials) => {
    dispatch({ type: 'LOGIN_START' });
    try {
      const user = await authService.login(credentials);
      dispatch({ type: 'LOGIN_SUCCESS', payload: user });
      return user;
    } catch (error) {
      dispatch({ type: 'LOGIN_FAILURE', payload: error.message });
      throw error;
    }
  }, []);

  const logout = useCallback(() => {
    authService.logout();
    dispatch({ type: 'LOGOUT' });
  }, []);

  const value = {
    ...state,
    login,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook for using auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
```

**Testing with React Testing Library:**
```jsx
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { jest } from '@jest/globals';
import UserProfile from '../UserProfile';
import * as api from '../../services/api';

// Mock the API module
jest.mock('../../services/api');

describe('UserProfile', () => {
  const mockUser = {
    id: '123',
    name: 'John Doe',
    email: 'john@example.com',
    posts: [{ id: 1, title: 'Test Post' }]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('renders user profile after loading', async () => {
    api.getUserById.mockResolvedValue(mockUser);

    render(<UserProfile userId="123" />);

    // Check loading state
    expect(screen.getByTestId('loading-spinner')).toBeInTheDocument();

    // Wait for user data to load
    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    expect(screen.getByText('john@example.com')).toBeInTheDocument();
    expect(screen.getByText('1 Posts')).toBeInTheDocument();
  });

  test('handles update user interaction', async () => {
    const user = userEvent.setup();
    const onUpdate = jest.fn();

    api.getUserById.mockResolvedValue(mockUser);
    api.updateUser.mockResolvedValue({ ...mockUser, name: 'Jane Doe' });

    render(<UserProfile userId="123" onUpdate={onUpdate} />);

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    const editButton = screen.getByRole('button', { name: /edit/i });
    await user.click(editButton);

    const nameInput = screen.getByDisplayValue('John Doe');
    await user.clear(nameInput);
    await user.type(nameInput, 'Jane Doe');

    const saveButton = screen.getByRole('button', { name: /save/i });
    await user.click(saveButton);

    await waitFor(() => {
      expect(onUpdate).toHaveBeenCalledWith({ ...mockUser, name: 'Jane Doe' });
    });
  });

  test('displays error message on API failure', async () => {
    api.getUserById.mockRejectedValue(new Error('Network error'));

    render(<UserProfile userId="123" />);

    await waitFor(() => {
      expect(screen.getByText(/network error/i)).toBeInTheDocument();
    });
  });
});
```

**Performance Optimization:**
```jsx
import React, { memo, lazy, Suspense } from 'react';

// Lazy loading for code splitting
const LazyUserProfile = lazy(() => import('./UserProfile'));
const LazyUserSettings = lazy(() => import('./UserSettings'));

// Memoized component to prevent unnecessary re-renders
const UserCard = memo(({ user, onUpdate }) => {
  return (
    <div className="user-card">
      <h3>{user.name}</h3>
      <p>{user.email}</p>
      <button onClick={() => onUpdate(user.id)}>
        Update
      </button>
    </div>
  );
});

// Main app with lazy loading
const App = () => {
  return (
    <div className="app">
      <Suspense fallback={<div>Loading...</div>}>
        <Routes>
          <Route path="/profile" element={<LazyUserProfile />} />
          <Route path="/settings" element={<LazyUserSettings />} />
        </Routes>
      </Suspense>
    </div>
  );
};
```

**State Management with Zustand:**
```jsx
import { create } from 'zustand';
import { devtools, persist } from 'zustand/middleware';

const useUserStore = create(
  devtools(
    persist(
      (set, get) => ({
        users: [],
        currentUser: null,
        loading: false,

        fetchUsers: async () => {
          set({ loading: true });
          try {
            const users = await api.getUsers();
            set({ users, loading: false });
          } catch (error) {
            set({ loading: false });
            throw error;
          }
        },

        setCurrentUser: (user) => set({ currentUser: user }),

        updateUser: async (userId, updates) => {
          const updatedUser = await api.updateUser(userId, updates);
          set((state) => ({
            users: state.users.map((user) =>
              user.id === userId ? updatedUser : user
            ),
            currentUser: state.currentUser?.id === userId ? updatedUser : state.currentUser
          }));
          return updatedUser;
        }
      }),
      { name: 'user-store' }
    )
  )
);

// Usage in component
const UserList = () => {
  const { users, loading, fetchUsers } = useUserStore();

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  if (loading) return <LoadingSpinner />;

  return (
    <div>
      {users.map((user) => (
        <UserCard key={user.id} user={user} />
      ))}
    </div>
  );
};
```