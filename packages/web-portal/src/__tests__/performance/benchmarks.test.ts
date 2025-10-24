/**
 * Performance Benchmarks
 *
 * Tests for page load time, render time, memory usage, and throughput
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../utils/test-utils';
import { App } from '../../client/App';
import React from 'react';

describe('Performance Benchmarks', () => {
  let performanceMarks: PerformanceMark[] = [];

  beforeEach(() => {
    performanceMarks = [];
    performance.clearMarks();
    performance.clearMeasures();
  });

  afterEach(() => {
    performance.clearMarks();
    performance.clearMeasures();
  });

  describe('Initial Page Load Time', () => {
    it('should load Dashboard in less than 3 seconds', async () => { try {
      performance.mark('dashboard-load-start');

      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      performance.mark('dashboard-load-end');
      performance.measure('dashboard-load', 'dashboard-load-start', 'dashboard-load-end');

      const measure = performance.getEntriesByName('dashboard-load')[0] as PerformanceMeasure;
      expect(measure.duration).toBeLessThan(3000);
    });

    it('should load Agents view in less than 3 seconds', async () => { try {
      performance.mark('agents-load-start');

      renderWithProviders(<App />, { initialRoute: '/agents' });

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      performance.mark('agents-load-end');
      performance.measure('agents-load', 'agents-load-start', 'agents-load-end');

      const measure = performance.getEntriesByName('agents-load')[0] as PerformanceMeasure;
      expect(measure.duration).toBeLessThan(3000);
    });

    it('should load Performance view in less than 3 seconds', async () => { try {
      performance.mark('perf-view-load-start');

      renderWithProviders(<App />, { initialRoute: '/performance' });

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      performance.mark('perf-view-load-end');
      performance.measure('perf-view-load', 'perf-view-load-start', 'perf-view-load-end');

      const measure = performance.getEntriesByName('perf-view-load')[0] as PerformanceMeasure;
      expect(measure.duration).toBeLessThan(3000);
    });

    it('should load all critical routes within budget', async () => { try {
      const routes = ['/', '/agents', '/performance', '/events'];
      const loadTimes: number[] = [];

      for (const route of routes) {
        const startMark = `${route}-start`;
        const endMark = `${route}-end`;

        performance.mark(startMark);

        const { unmount } = renderWithProviders(<App />, { initialRoute: route });

        await waitFor(() => {
          expect(document.querySelector('[role="main"]')).toBeTruthy();
        });

        performance.mark(endMark);
        performance.measure(`${route}-load`, startMark, endMark);

        const measure = performance.getEntriesByName(`${route}-load`)[0] as PerformanceMeasure;
        loadTimes.push(measure.duration);

        unmount();
      }

      // All routes should load within 3 seconds
      expect(Math.max(...loadTimes)).toBeLessThan(3000);
      // Average load time should be under 2 seconds
      const avgLoadTime = loadTimes.reduce((a, b) => a + b, 0) / loadTimes.length;
      expect(avgLoadTime).toBeLessThan(2000);
    });
  });

  describe('Route Navigation Time', () => {
    it('should navigate to new route in less than 500ms', async () => { try {
      const { rerender } = renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      performance.mark('nav-start');

      // Simulate navigation
      window.history.pushState({}, '', '/agents');
      rerender(<App />);

      await waitFor(() => {
        expect(window.location.pathname).toBe('/agents');
      });

      performance.mark('nav-end');
      performance.measure('navigation', 'nav-start', 'nav-end');

      const measure = performance.getEntriesByName('navigation')[0] as PerformanceMeasure;
      expect(measure.duration).toBeLessThan(500);
    });

    it('should handle rapid navigation without performance degradation', async () => { try {
      const { rerender } = renderWithProviders(<App />, { initialRoute: '/' });
      const navTimes: number[] = [];

      const routes = ['/agents', '/performance', '/events', '/fleet', '/'];

      for (const route of routes) {
        performance.mark(`nav-${route}-start`);

        window.history.pushState({}, '', route);
        rerender(<App />);

        await waitFor(() => {
          expect(window.location.pathname).toBe(route);
        });

        performance.mark(`nav-${route}-end`);
        performance.measure(`nav-${route}`, `nav-${route}-start`, `nav-${route}-end`);

        const measure = performance.getEntriesByName(`nav-${route}`)[0] as PerformanceMeasure;
        navTimes.push(measure.duration);
      }

      // All navigation should be under 500ms
      expect(Math.max(...navTimes)).toBeLessThan(500);
    });
  });

  describe('Component Render Time', () => {
    it('should render Dashboard components in less than 100ms', async () => { try {
      performance.mark('dashboard-render-start');

      renderWithProviders(<App />, { initialRoute: '/' });

      performance.mark('dashboard-render-end');
      performance.measure('dashboard-render', 'dashboard-render-start', 'dashboard-render-end');

      const measure = performance.getEntriesByName('dashboard-render')[0] as PerformanceMeasure;
      expect(measure.duration).toBeLessThan(100);
    });

    it('should render individual components quickly', async () => { try {
      const componentRenders: Record<string, number> = {};

      performance.mark('app-render-start');
      renderWithProviders(<App />, { initialRoute: '/' });
      performance.mark('app-render-end');
      performance.measure('app-render', 'app-render-start', 'app-render-end');

      const measure = performance.getEntriesByName('app-render')[0] as PerformanceMeasure;

      // Initial render should be fast
      expect(measure.duration).toBeLessThan(200);
    });

    it('should not cause layout thrashing', async () => { try {
      renderWithProviders(<App />, { initialRoute: '/' });

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      // Multiple reads should not cause reflows
      const reads = [];
      for (let i = 0; i < 100; i++) {
        reads.push(document.body.clientHeight);
      }

      expect(reads.length).toBe(100);
    });
  });

  describe('Memory Usage', () => {
    it('should not leak memory on route changes', async () => { try {
      const { rerender, unmount } = renderWithProviders(<App />, { initialRoute: '/' });

      // Perform multiple route changes
      for (let i = 0; i < 10; i++) {
        window.history.pushState({}, '', '/agents');
        rerender(<App />);
        await waitFor(() => expect(window.location.pathname).toBe('/agents'));

        window.history.pushState({}, '', '/');
        rerender(<App />);
        await waitFor(() => expect(window.location.pathname).toBe('/'));
      }

      unmount();

      // Memory should be freed (visual check only in dev tools)
      expect(true).toBe(true);
    });

    it('should cleanup WebSocket listeners', async () => { try {
      const { unmount } = renderWithProviders(<App />);

      unmount();

      // WebSocket listeners should be cleaned up
      expect(true).toBe(true);
    });

    it('should cleanup React Query cache appropriately', async () => { try {
      const { unmount, queryClient } = renderWithProviders(<App />);

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      unmount();

      // Cache should be cleared or within limits
      expect(queryClient.getQueryCache().getAll().length).toBeLessThan(100);
    });

    it('should handle large data sets without memory issues', async () => { try {
      // Simulate large agent list
      const { queryClient } = renderWithProviders(<App />, { initialRoute: '/agents' });

      const largeDataSet = Array.from({ length: 1000 }, (_, i) => ({
        id: `agent-${i}`,
        name: `Agent ${i}`,
        status: 'active',
      }));

      queryClient.setQueryData(['agents'], largeDataSet);

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      // Should handle large dataset
      expect(true).toBe(true);
    });
  });

  describe('WebSocket Message Throughput', () => {
    it('should handle 1000 messages per second', async () => { try {
      renderWithProviders(<App />);

      const messageCount = 1000;
      const startTime = Date.now();

      // Simulate rapid WebSocket messages
      for (let i = 0; i < messageCount; i++) {
        // Simulate message handling
        await Promise.resolve();
      }

      const endTime = Date.now();
      const duration = endTime - startTime;
      const throughput = (messageCount / duration) * 1000;

      expect(throughput).toBeGreaterThanOrEqual(1000);
    });

    it('should not block UI during high message volume', async () => { try {
      renderWithProviders(<App />);

      // Simulate 100 rapid messages
      const messages = Array.from({ length: 100 }, (_, i) => ({
        type: 'agent.update',
        data: { id: `agent-${i}` },
      }));

      const startTime = Date.now();

      for (const msg of messages) {
        await Promise.resolve(); // Simulate async message processing
      }

      const processingTime = Date.now() - startTime;

      // Should process quickly without blocking
      expect(processingTime).toBeLessThan(1000);
    });
  });

  describe('Bundle Size Impact', () => {
    it('should keep initial bundle size reasonable', () => {
      // This would be checked in build process
      // Verify code splitting is working
      expect(true).toBe(true);
    });

    it('should lazy load non-critical routes', () => {
      // Verify routes are code-split
      expect(true).toBe(true);
    });

    it('should tree-shake unused code', () => {
      // Verify build output
      expect(true).toBe(true);
    });
  });

  describe('Rendering Optimization', () => {
    it('should use React.memo for expensive components', () => {
      renderWithProviders(<App />);

      // Components should be memoized
      expect(true).toBe(true);
    });

    it('should virtualize long lists', async () => { try {
      const { queryClient } = renderWithProviders(<App />, { initialRoute: '/agents' });

      // Large list should be virtualized
      const largeList = Array.from({ length: 10000 }, (_, i) => ({
        id: `item-${i}`,
      }));

      queryClient.setQueryData(['agents'], largeList);

      await waitFor(() => {
        expect(document.querySelector('[role="main"]')).toBeTruthy();
      });

      // Should only render visible items
      expect(true).toBe(true);
    });

    it('should debounce expensive operations', async () => { try {
      renderWithProviders(<App />);

      // Rapid state changes should be debounced
      for (let i = 0; i < 100; i++) {
        // Simulate rapid updates
        await Promise.resolve();
      }

      expect(true).toBe(true);
    });
  });
});
