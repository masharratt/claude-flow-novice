/**
 * MetricCard Component Tests
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect } from 'vitest';
import { MetricCard } from '../components/MetricCard';
import { People as PeopleIcon } from '@mui/icons-material';

describe('MetricCard Component', () => {
  describe('Rendering', () => {
    it('should render with required props', () => {
      render(<MetricCard title="Test Metric" value={42} />);

      expect(screen.getByText('Test Metric')).toBeInTheDocument();
      expect(screen.getByText('42')).toBeInTheDocument();
    });

    it('should render with icon', () => {
      const { container } = render(
        <MetricCard title="Active Users" value={100} icon={<PeopleIcon data-testid="people-icon" />} />
      );

      expect(screen.getByTestId('people-icon')).toBeInTheDocument();
    });

    it('should render positive trend', () => {
      render(<MetricCard title="Growth" value={150} trend={15} trendLabel="vs last week" />);

      expect(screen.getByText('15%')).toBeInTheDocument();
      expect(screen.getByText('vs last week')).toBeInTheDocument();
    });

    it('should render negative trend', () => {
      render(<MetricCard title="Errors" value={5} trend={-30} />);

      expect(screen.getByText('30%')).toBeInTheDocument();
    });

    it('should render zero trend', () => {
      render(<MetricCard title="Stable" value={100} trend={0} />);

      expect(screen.getByText('0%')).toBeInTheDocument();
    });

    it('should render string value', () => {
      render(<MetricCard title="Status" value="Healthy" />);

      expect(screen.getByText('Healthy')).toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should show skeleton when loading', () => {
      const { container } = render(<MetricCard title="Loading Metric" value={0} loading={true} />);

      const skeletons = container.querySelectorAll('.MuiSkeleton-root');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should not show value when loading', () => {
      render(<MetricCard title="Test" value={42} loading={true} />);

      expect(screen.queryByText('42')).not.toBeInTheDocument();
    });
  });

  describe('Color Variants', () => {
    it('should apply primary color', () => {
      const { container } = render(<MetricCard title="Primary" value={10} color="primary" />);

      expect(container.querySelector('[class*="primary"]')).toBeInTheDocument();
    });

    it('should apply success color', () => {
      const { container } = render(<MetricCard title="Success" value={10} color="success" />);

      expect(container.querySelector('[class*="success"]')).toBeInTheDocument();
    });

    it('should apply warning color', () => {
      const { container } = render(<MetricCard title="Warning" value={10} color="warning" />);

      expect(container.querySelector('[class*="warning"]')).toBeInTheDocument();
    });

    it('should apply error color', () => {
      const { container } = render(<MetricCard title="Error" value={10} color="error" />);

      expect(container.querySelector('[class*="error"]')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have accessible text content', () => {
      render(<MetricCard title="Accessible Metric" value={100} trend={5} trendLabel="increase" />);

      expect(screen.getByText('Accessible Metric')).toBeInTheDocument();
      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.getByText('5%')).toBeInTheDocument();
      expect(screen.getByText('increase')).toBeInTheDocument();
    });
  });

  describe('Responsive Design', () => {
    it('should render Card component with proper structure', () => {
      const { container } = render(<MetricCard title="Test" value={100} />);

      const card = container.querySelector('.MuiCard-root');
      expect(card).toBeInTheDocument();
    });

    it('should have hover effects', () => {
      const { container } = render(<MetricCard title="Hover Test" value={50} />);

      const card = container.querySelector('.MuiCard-root');
      expect(card).toHaveStyle({ transition: expect.stringContaining('transform') });
    });
  });

  describe('Edge Cases', () => {
    it('should handle very large numbers', () => {
      render(<MetricCard title="Large Number" value={1000000} />);

      expect(screen.getByText('1000000')).toBeInTheDocument();
    });

    it('should handle decimal values', () => {
      render(<MetricCard title="Decimal" value={99.95} />);

      expect(screen.getByText('99.95')).toBeInTheDocument();
    });

    it('should handle empty string value', () => {
      render(<MetricCard title="Empty" value="" />);

      expect(screen.getByText('Empty')).toBeInTheDocument();
    });

    it('should handle undefined trend gracefully', () => {
      render(<MetricCard title="No Trend" value={100} trend={undefined} />);

      expect(screen.getByText('100')).toBeInTheDocument();
      expect(screen.queryByText('%')).not.toBeInTheDocument();
    });
  });
});
