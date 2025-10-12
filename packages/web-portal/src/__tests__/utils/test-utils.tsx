import React, { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import { ThemeProvider } from '../../client/theme/ThemeProvider';

/**
 * Custom render function that wraps components with all necessary providers
 */
export interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  initialRoute?: string;
  queryClient?: QueryClient;
}

export function renderWithProviders(
  ui: ReactElement,
  {
    initialRoute = '/',
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
        mutations: {
          retry: false,
        },
      },
    }),
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  // Set initial route
  if (initialRoute !== '/') {
    window.history.pushState({}, 'Test page', initialRoute);
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultMode="light">
          <BrowserRouter>{children}</BrowserRouter>
        </ThemeProvider>
      </QueryClientProvider>
    );
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
    queryClient,
  };
}

/**
 * Wait for loader to disappear
 */
export async function waitForLoadingToFinish() {
  const { waitForElementToBeRemoved } = await import('@testing-library/react');
  await waitForElementToBeRemoved(
    () => document.querySelector('[data-testid="loading-spinner"]'),
    { timeout: 3000 }
  ).catch(() => {
    // Ignore if loader never appeared
  });
}

/**
 * Create a mock QueryClient for testing
 */
export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
    logger: {
      log: console.log,
      warn: console.warn,
      error: () => {}, // Suppress errors in tests
    },
  });
}

/**
 * Mock window.location methods
 */
export function mockLocation() {
  delete (window as any).location;
  window.location = {
    ...window.location,
    href: 'http://localhost:3001/',
    pathname: '/',
    search: '',
    hash: '',
    assign: vi.fn(),
    reload: vi.fn(),
    replace: vi.fn(),
  } as any;
}

/**
 * Restore window.location
 */
export function restoreLocation() {
  window.location = originalLocation;
}

const originalLocation = window.location;

/**
 * Wait for async updates
 */
export const waitFor = async (callback: () => void, options?: { timeout?: number }) => {
  const { waitFor: rtlWaitFor } = await import('@testing-library/react');
  return rtlWaitFor(callback, { timeout: options?.timeout || 3000 });
};

/**
 * Simulate user interaction delay
 */
export const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
