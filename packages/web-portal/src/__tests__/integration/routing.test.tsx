/**
 * Routing Integration Tests
 *
 * Tests all 9 routes, navigation, 404 handling, and browser navigation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../utils/test-utils';
import { App } from '../../client/App';

describe('Routing Integration', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/');
  });

  describe('Route Rendering', () => {
    it('should render Dashboard on root path', async () => {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(screen.getByText(/dashboard/i)).toBeInTheDocument();
      });
    });

    it('should render Agents view on /agents', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByText(/agents/i)).toBeInTheDocument();
      });
    });

    it('should render Hierarchy view on /hierarchy', async () => {
      renderWithProviders(<App />, { initialRoute: '/hierarchy' });

      await waitFor(() => {
        expect(screen.getByText(/hierarchy/i)).toBeInTheDocument();
      });
    });

    it('should render Performance view on /performance', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });
    });

    it('should render Events view on /events', async () => {
      renderWithProviders(<App />, { initialRoute: '/events' });

      await waitFor(() => {
        expect(screen.getByText(/events/i)).toBeInTheDocument();
      });
    });

    it('should render Fleet view on /fleet', async () => {
      renderWithProviders(<App />, { initialRoute: '/fleet' });

      await waitFor(() => {
        expect(screen.getByText(/fleet/i)).toBeInTheDocument();
      });
    });

    it('should render CFN Loop view on /cfn-loop', async () => {
      renderWithProviders(<App />, { initialRoute: '/cfn-loop' });

      await waitFor(() => {
        expect(screen.getByText(/cfn loop/i)).toBeInTheDocument();
      });
    });

    it('should render Intervention view on /intervention', async () => {
      renderWithProviders(<App />, { initialRoute: '/intervention' });

      await waitFor(() => {
        expect(screen.getByText(/intervention/i)).toBeInTheDocument();
      });
    });

    it('should render Settings view on /settings', async () => {
      renderWithProviders(<App />, { initialRoute: '/settings' });

      await waitFor(() => {
        expect(screen.getByText(/settings/i)).toBeInTheDocument();
      });
    });
  });

  describe('Navigation Between Routes', () => {
    it('should navigate from Dashboard to Agents', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const agentsLink = await screen.findByRole('link', { name: /agents/i });
      await user.click(agentsLink);

      await waitFor(() => {
        expect(window.location.pathname).toBe('/agents');
        expect(screen.getByText(/agents/i)).toBeInTheDocument();
      });
    });

    it('should navigate through multiple routes', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      // Dashboard -> Agents
      const agentsLink = await screen.findByRole('link', { name: /agents/i });
      await user.click(agentsLink);
      await waitFor(() => expect(window.location.pathname).toBe('/agents'));

      // Agents -> Performance
      const perfLink = await screen.findByRole('link', { name: /performance/i });
      await user.click(perfLink);
      await waitFor(() => expect(window.location.pathname).toBe('/performance'));

      // Performance -> Events
      const eventsLink = await screen.findByRole('link', { name: /events/i });
      await user.click(eventsLink);
      await waitFor(() => expect(window.location.pathname).toBe('/events'));
    });

    it('should maintain sidebar navigation state', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      const agentsLink = await screen.findByRole('link', { name: /agents/i });
      await user.click(agentsLink);

      // Sidebar should still be visible
      await waitFor(() => {
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });
    });
  });

  describe('404 Handling', () => {
    it('should redirect to Dashboard for invalid routes', async () => {
      renderWithProviders(<App />, { initialRoute: '/invalid-route' });

      await waitFor(() => {
        expect(window.location.pathname).toBe('/');
      });
    });

    it('should redirect to Dashboard for nested invalid routes', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents/invalid/nested' });

      await waitFor(() => {
        expect(window.location.pathname).toBe('/');
      });
    });
  });

  describe('Browser Navigation', () => {
    it('should handle browser back button', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      // Navigate to Agents
      const agentsLink = await screen.findByRole('link', { name: /agents/i });
      await user.click(agentsLink);
      await waitFor(() => expect(window.location.pathname).toBe('/agents'));

      // Go back
      window.history.back();
      await waitFor(() => {
        expect(window.location.pathname).toBe('/');
      });
    });

    it('should handle browser forward button', async () => {
      const user = userEvent.setup();
      renderWithProviders(<App />);

      // Navigate forward
      const agentsLink = await screen.findByRole('link', { name: /agents/i });
      await user.click(agentsLink);
      await waitFor(() => expect(window.location.pathname).toBe('/agents'));

      // Go back
      window.history.back();
      await waitFor(() => expect(window.location.pathname).toBe('/'));

      // Go forward
      window.history.forward();
      await waitFor(() => expect(window.location.pathname).toBe('/agents'));
    });

    it('should handle direct URL navigation', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(window.location.pathname).toBe('/performance');
        expect(screen.getByText(/performance/i)).toBeInTheDocument();
      });
    });
  });

  describe('Deep Linking', () => {
    it('should support deep linking to specific routes', async () => {
      const routes = [
        '/agents',
        '/hierarchy',
        '/performance',
        '/events',
        '/fleet',
        '/cfn-loop',
        '/intervention',
        '/settings',
      ];

      for (const route of routes) {
        const { unmount } = renderWithProviders(<App />, { initialRoute: route });

        await waitFor(() => {
          expect(window.location.pathname).toBe(route);
        });

        unmount();
      }
    });

    it('should preserve query parameters in routes', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents?filter=active' });

      await waitFor(() => {
        expect(window.location.pathname).toBe('/agents');
        expect(window.location.search).toBe('?filter=active');
      });
    });

    it('should preserve hash fragments in routes', async () => {
      renderWithProviders(<App />, { initialRoute: '/settings#notifications' });

      await waitFor(() => {
        expect(window.location.pathname).toBe('/settings');
        expect(window.location.hash).toBe('#notifications');
      });
    });
  });

  describe('Route Layout', () => {
    it('should render AppLayout for all routes', async () => {
      const routes = ['/', '/agents', '/performance', '/events'];

      for (const route of routes) {
        const { unmount } = renderWithProviders(<App />, { initialRoute: route });

        await waitFor(() => {
          expect(screen.getByRole('navigation')).toBeInTheDocument();
        });

        unmount();
      }
    });

    it('should render Header for all routes', async () => {
      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(screen.getByRole('banner')).toBeInTheDocument();
      });
    });

    it('should render Sidebar for all routes', async () => {
      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(screen.getByRole('navigation')).toBeInTheDocument();
      });
    });
  });
});
