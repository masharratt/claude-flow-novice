/**
 * LoadingSpinner Tests
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LoadingSpinner, SkeletonLoader } from '../common/LoadingSpinner';

describe('LoadingSpinner', () => {
  it('should render with default props', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('should render with custom message', () => {
    render(<LoadingSpinner message="Please wait..." />);
    expect(screen.getByText('Please wait...')).toBeInTheDocument();
  });

  it('should render fullscreen mode', () => {
    const { container } = render(<LoadingSpinner fullscreen={true} />);
    const box = container.querySelector('[class*="MuiBox"]');
    expect(box).toBeInTheDocument();
  });

  it('should not render message when message is empty', () => {
    render(<LoadingSpinner message="" />);
    expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
  });
});

describe('SkeletonLoader', () => {
  it('should render single skeleton by default', () => {
    const { container } = render(<SkeletonLoader />);
    const skeletons = container.querySelectorAll('[class*="MuiSkeleton"]');
    expect(skeletons).toHaveLength(1);
  });

  it('should render multiple skeletons when count is specified', () => {
    const { container } = render(<SkeletonLoader count={3} />);
    const skeletons = container.querySelectorAll('[class*="MuiSkeleton"]');
    expect(skeletons).toHaveLength(3);
  });

  it('should render text variant', () => {
    const { container } = render(<SkeletonLoader variant="text" />);
    expect(container.querySelector('[class*="MuiSkeleton"]')).toBeInTheDocument();
  });

  it('should render circular variant', () => {
    const { container } = render(<SkeletonLoader variant="circular" />);
    expect(container.querySelector('[class*="MuiSkeleton"]')).toBeInTheDocument();
  });
});
