/**
 * CFNLoopDashboard Component Tests
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CFNLoopDashboard } from './CFNLoopDashboard';
import type { CFNLoopState } from './CFNLoopDashboard.types';

const theme = createTheme();

const mockLoopState: CFNLoopState = {
  swarmId: 'swarm-123',
  objective: 'Build authentication system',
  currentPhase: {
    phaseId: 'phase-auth',
    phaseName: 'Authentication',
    currentLoop: 3,
    loopStatus: 'in-progress',
    progress: 65,
    confidence: {
      value: 0.82,
      threshold: 0.75,
      status: 'pass',
      timestamp: '2025-10-11T10:00:00Z',
    },
  },
  loops: [
    {
      loopType: 0,
      loopName: 'Epic/Sprint',
      status: 'completed',
      startTime: '2025-10-11T09:00:00Z',
      endTime: '2025-10-11T09:05:00Z',
      duration: 300000,
      confidence: {
        value: 0.95,
        threshold: 0.75,
        status: 'pass',
        timestamp: '2025-10-11T09:05:00Z',
      },
    },
    {
      loopType: 1,
      loopName: 'Phase Execution',
      status: 'completed',
      startTime: '2025-10-11T09:05:00Z',
      endTime: '2025-10-11T09:15:00Z',
      duration: 600000,
    },
    {
      loopType: 2,
      loopName: 'Validation',
      status: 'completed',
      startTime: '2025-10-11T09:15:00Z',
      endTime: '2025-10-11T09:25:00Z',
      duration: 600000,
      consensus: {
        validatorCount: 3,
        consensusScore: 0.92,
        threshold: 0.9,
        status: 'pass',
        validators: [
          {
            agentId: 'reviewer-1',
            score: 0.93,
            recommendations: ['Add more tests'],
          },
          {
            agentId: 'security-1',
            score: 0.91,
            recommendations: ['Add rate limiting', 'Improve validation'],
          },
          {
            agentId: 'qa-1',
            score: 0.92,
            recommendations: [],
          },
        ],
      },
      retryCount: 1,
      maxRetries: 10,
    },
    {
      loopType: 3,
      loopName: 'Implementation',
      status: 'in-progress',
      startTime: '2025-10-11T09:25:00Z',
      confidence: {
        value: 0.82,
        threshold: 0.75,
        status: 'pass',
        timestamp: '2025-10-11T10:00:00Z',
      },
      retryCount: 2,
      maxRetries: 10,
    },
    {
      loopType: 4,
      loopName: 'Product Owner',
      status: 'pending',
    },
  ],
  recentActivity: [
    {
      agentId: 'coder-1',
      agentName: 'Coder Agent 1',
      agentType: 'coder',
      action: 'Implemented authentication middleware',
      timestamp: '2025-10-11T10:00:00Z',
      confidence: 0.85,
      status: 'success',
    },
    {
      agentId: 'security-1',
      agentName: 'Security Agent 1',
      agentType: 'security',
      action: 'Validated security controls',
      timestamp: '2025-10-11T09:58:00Z',
      confidence: 0.91,
      status: 'success',
    },
    {
      agentId: 'tester-1',
      agentName: 'Tester Agent 1',
      agentType: 'tester',
      action: 'Running integration tests',
      timestamp: '2025-10-11T09:55:00Z',
      status: 'in-progress',
    },
  ],
  productOwnerDecision: {
    decision: 'PROCEED',
    reasoning:
      'Implementation meets quality standards. Minor issues deferred to backlog.',
    timestamp: '2025-10-11T10:00:00Z',
    confidence: 0.88,
    nextSteps: [
      'Complete remaining test coverage',
      'Deploy to staging environment',
      'Schedule security audit',
    ],
    backlogItems: ['Add rate limiting', 'Improve error messages'],
  },
  overallConfidence: 0.88,
};

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('CFNLoopDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('renders dashboard with loop state', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(
        screen.getByText('Build authentication system')
      ).toBeInTheDocument();
      expect(screen.getByText(/Swarm ID: swarm-123/)).toBeInTheDocument();
    });

    it('displays overall confidence score', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('88%')).toBeInTheDocument();
      expect(screen.getByText('Overall Confidence')).toBeInTheDocument();
    });

    it('displays phase progress', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText(/Authentication - Loop 3/)).toBeInTheDocument();
    });

    it('renders all loop steps in stepper', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('Loop 0: Epic/Sprint')).toBeInTheDocument();
      expect(screen.getByText('Loop 1: Phase Execution')).toBeInTheDocument();
      expect(screen.getByText('Loop 2: Validation')).toBeInTheDocument();
      expect(screen.getByText('Loop 3: Implementation')).toBeInTheDocument();
      expect(screen.getByText('Loop 4: Product Owner')).toBeInTheDocument();
    });
  });

  describe('Loop Metrics', () => {
    it('displays completed loop status', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      const completedChips = screen.getAllByText('completed');
      expect(completedChips.length).toBeGreaterThan(0);
    });

    it('displays confidence scores for loops', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('95%')).toBeInTheDocument();
      expect(screen.getByText('82%')).toBeInTheDocument();
    });

    it('displays retry count metrics', () => {
      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} showDetailedMetrics />
      );

      expect(screen.getByText('2/10')).toBeInTheDocument();
      expect(screen.getByText('Retry Count')).toBeInTheDocument();
    });
  });

  describe('Consensus Metrics', () => {
    it('displays consensus section when detailed metrics enabled', () => {
      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} showDetailedMetrics />
      );

      expect(screen.getByText('Consensus Metrics')).toBeInTheDocument();
    });

    it('displays validator scores', () => {
      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} showDetailedMetrics />
      );

      expect(screen.getByText('reviewer-1')).toBeInTheDocument();
      expect(screen.getByText('security-1')).toBeInTheDocument();
      expect(screen.getByText('93%')).toBeInTheDocument();
      expect(screen.getByText('91%')).toBeInTheDocument();
    });

    it('displays validator recommendations count', () => {
      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} showDetailedMetrics />
      );

      expect(screen.getByText('1 recommendations')).toBeInTheDocument();
      expect(screen.getByText('2 recommendations')).toBeInTheDocument();
    });
  });

  describe('Product Owner Decision', () => {
    it('displays product owner decision section', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('Product Owner Decision')).toBeInTheDocument();
      expect(screen.getByText('PROCEED')).toBeInTheDocument();
    });

    it('displays decision reasoning', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(
        screen.getByText(/Implementation meets quality standards/)
      ).toBeInTheDocument();
    });

    it('displays next steps', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(
        screen.getByText('Complete remaining test coverage')
      ).toBeInTheDocument();
      expect(
        screen.getByText('Deploy to staging environment')
      ).toBeInTheDocument();
      expect(screen.getByText('Schedule security audit')).toBeInTheDocument();
    });

    it('displays decision confidence', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('Decision Confidence')).toBeInTheDocument();
    });
  });

  describe('Agent Activity Timeline', () => {
    it('displays recent agent activities', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('Recent Agent Activity')).toBeInTheDocument();
      expect(
        screen.getByText(/Coder Agent 1: Implemented authentication middleware/)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/Security Agent 1: Validated security controls/)
      ).toBeInTheDocument();
    });

    it('limits activities to maxActivities prop', () => {
      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} maxActivities={2} />
      );

      const activities = screen.getAllByRole('button');
      // Timeline items are clickable
      expect(activities.length).toBeLessThanOrEqual(3);
    });

    it('displays agent confidence scores', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('calls onAgentSelect when activity is clicked', () => {
      const onAgentSelect = vi.fn();
      renderWithTheme(
        <CFNLoopDashboard
          loopState={mockLoopState}
          onAgentSelect={onAgentSelect}
        />
      );

      const activityItems = screen.getAllByText(/Coder Agent 1/);
      fireEvent.click(activityItems[0]);

      expect(onAgentSelect).toHaveBeenCalledWith('coder-1');
    });
  });

  describe('Interactions', () => {
    it('calls onRefresh when refresh button is clicked', () => {
      const onRefresh = vi.fn();
      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} onRefresh={onRefresh} />
      );

      const refreshButton = screen.getByRole('button', { name: /refresh/i });
      fireEvent.click(refreshButton);

      expect(onRefresh).toHaveBeenCalledTimes(1);
    });

    it('auto-refreshes at specified interval', async () => {
      const onRefresh = vi.fn();
      vi.useFakeTimers();

      renderWithTheme(
        <CFNLoopDashboard
          loopState={mockLoopState}
          onRefresh={onRefresh}
          refreshInterval={5000}
        />
      );

      expect(onRefresh).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalledTimes(1);
      });

      vi.advanceTimersByTime(5000);
      await waitFor(() => {
        expect(onRefresh).toHaveBeenCalledTimes(2);
      });

      vi.useRealTimers();
    });

    it('does not auto-refresh when interval not provided', () => {
      const onRefresh = vi.fn();
      vi.useFakeTimers();

      renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} onRefresh={onRefresh} />
      );

      vi.advanceTimersByTime(10000);
      expect(onRefresh).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('Overall Metrics', () => {
    it('calculates and displays completed loops', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('3/5')).toBeInTheDocument();
      expect(screen.getByText('Loops Completed')).toBeInTheDocument();
    });

    it('displays agent activity count', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('Agent Activities')).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('supports custom test ID', () => {
      renderWithTheme(
        <CFNLoopDashboard
          loopState={mockLoopState}
          data-testid="custom-dashboard"
        />
      );

      expect(screen.getByTestId('custom-dashboard')).toBeInTheDocument();
    });

    it('supports custom className', () => {
      const { container } = renderWithTheme(
        <CFNLoopDashboard loopState={mockLoopState} className="custom-class" />
      );

      expect(container.querySelector('.custom-class')).toBeInTheDocument();
    });

    it('provides accessible labels for metrics', () => {
      renderWithTheme(<CFNLoopDashboard loopState={mockLoopState} />);

      expect(screen.getByText('Overall Confidence')).toBeInTheDocument();
      expect(screen.getByText('Loops Completed')).toBeInTheDocument();
      expect(screen.getByText('Avg Loop Confidence')).toBeInTheDocument();
      expect(screen.getByText('Agent Activities')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles empty activity list', () => {
      const emptyState: CFNLoopState = {
        ...mockLoopState,
        recentActivity: [],
      };

      renderWithTheme(<CFNLoopDashboard loopState={emptyState} />);

      expect(screen.getByText('Recent Agent Activity')).toBeInTheDocument();
    });

    it('handles missing product owner decision', () => {
      const noDecisionState: CFNLoopState = {
        ...mockLoopState,
        productOwnerDecision: undefined,
      };

      renderWithTheme(<CFNLoopDashboard loopState={noDecisionState} />);

      expect(
        screen.queryByText('Product Owner Decision')
      ).not.toBeInTheDocument();
    });

    it('handles loops without confidence scores', () => {
      const noConfidenceState: CFNLoopState = {
        ...mockLoopState,
        loops: mockLoopState.loops.map((loop) => ({
          ...loop,
          confidence: undefined,
        })),
      };

      renderWithTheme(<CFNLoopDashboard loopState={noConfidenceState} />);

      expect(screen.getByText('Avg Loop Confidence')).toBeInTheDocument();
    });
  });
});
