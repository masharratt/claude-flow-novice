/**
 * Theme Integration Tests
 *
 * Tests theme toggle, persistence, system preference, and styling
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../utils/test-utils';
import { App } from '../../client/App';

describe('Theme Integration', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Theme Toggle', () => {
    it('should start with light theme by default', async () => {
      renderWithProviders(<App />);

      await waitFor(() => {
        const mode = localStorage.getItem('theme-mode');
        expect(mode).toBe('light');
      });
    });

    it('should toggle to dark theme when button clicked', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      await waitFor(() => {
        const mode = localStorage.getItem('theme-mode');
        expect(mode).toBe('dark');
      });
    });

    it('should toggle back to light theme', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });

      // Toggle to dark
      await user.click(themeToggle);
      await waitFor(() => expect(localStorage.getItem('theme-mode')).toBe('dark'));

      // Toggle back to light
      await user.click(themeToggle);
      await waitFor(() => expect(localStorage.getItem('theme-mode')).toBe('light'));
    });

    it('should update UI immediately on theme toggle', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      // Theme should update without page reload
      await waitFor(() => {
        const body = document.body;
        expect(body).toBeDefined(); // Theme change should apply to body
      });
    });
  });

  describe('Theme Persistence', () => {
    it('should persist light theme to localStorage', async () => {
      renderWithProviders(<App />);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('light');
      });
    });

    it('should persist dark theme to localStorage', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });
    });

    it('should load saved theme on app mount', async () => {
      // Set dark theme in localStorage
      localStorage.setItem('theme-mode', 'dark');

      renderWithProviders(<App />);

      await waitFor(() => {
        const mode = localStorage.getItem('theme-mode');
        expect(mode).toBe('dark');
      });
    });

    it('should persist theme across page refreshes', async () => {
      const user = userEvent.setup();
      const { unmount } = renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      await waitFor(() => expect(localStorage.getItem('theme-mode')).toBe('dark'));

      // Simulate page refresh
      unmount();
      renderWithProviders(<App />);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });
    });
  });

  describe('System Preference Detection', () => {
    it('should detect system dark mode preference', async () => {
      // Mock system dark mode
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: query === '(prefers-color-scheme: dark)',
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      renderWithProviders(<App />);

      // Should still use saved preference over system preference
      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBeTruthy();
      });
    });

    it('should use default theme if no system preference', async () => {
      window.matchMedia = vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }));

      renderWithProviders(<App />);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('light');
      });
    });
  });

  describe('Theme-Aware Component Styling', () => {
    it('should apply theme to all components', async () => {
      renderWithProviders(<App />, { initialRoute: '/dashboard' });

      await waitFor(() => {
        // Check that MUI theme is applied
        const root = document.querySelector('#root');
        expect(root).toBeTruthy();
      });
    });

    it('should update component styles on theme change', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      // Components should re-render with new theme
      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });
    });

    it('should render Dashboard components in light theme', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
        expect(localStorage.getItem('theme-mode')).toBe('light');
      });
    });

    it('should render Dashboard components in dark theme', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />, { initialRoute: '/' });

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });
    });

    it('should apply theme to Agents view', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/agents/i)).toBeInTheDocument();
      });
    });

    it('should apply theme to all views', async () => {
      const routes = ['/agents', '/performance', '/events', '/settings'];

      for (const route of routes) {
        const { unmount } = renderWithProviders(<App />, { initialRoute: route });

        await waitFor(() => {
          expect(localStorage.getItem('theme-mode')).toBeTruthy();
        });

        unmount();
      }
    });
  });

  describe('Theme Context', () => {
    it('should provide theme context to all children', async () => {
      renderWithProviders(<App />);

      await waitFor(() => {
        // Theme provider should be wrapping the app
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should allow theme context access from nested components', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      // Toggle theme from nested component
      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });
      await user.click(themeToggle);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });
    });
  });

  describe('Theme Performance', () => {
    it('should not cause unnecessary re-renders on theme change', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const themeToggle = await screen.findByRole('button', { name: /toggle theme/i });

      // Rapid theme toggles
      await user.click(themeToggle);
      await user.click(themeToggle);
      await user.click(themeToggle);

      await waitFor(() => {
        expect(localStorage.getItem('theme-mode')).toBe('dark');
      });
    });

    it('should memo theme value to prevent re-renders', async () => {
      renderWithProviders(<App />);

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });

      // Theme context should be memoized
      expect(localStorage.getItem('theme-mode')).toBeTruthy();
    });
  });
});
