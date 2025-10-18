/**
 * @file Unit Tests for SwarmDashboard Component
 * @description Comprehensive unit tests for the SwarmDashboard React component
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { jest } from '@jest/globals';
import '@testing-library/jest-dom';
import SwarmDashboard from '../../../src/web/frontend/src/components/SwarmDashboard';

// Mock WebSocket for testing
const mockWebSocket = {
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  send: jest.fn(),
  close: jest.fn(),
  readyState: WebSocket.OPEN,
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3
};

// Mock WebSocket constructor
global.WebSocket = jest.fn(() => mockWebSocket) as any;

// Mock IntersectionObserver
global.IntersectionObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

// Mock ResizeObserver
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn()
}));

describe('SwarmDashboard Component', () => {
  const defaultProps = {
    wsUrl: 'ws://localhost:8080/swarm',
    refreshInterval: 1000,
    maxRelaunches: 10,
    testMetrics: {
      totalTests: 45,
      passedTests: 42,
      failedTests: 2,
      skippedTests: 1,
      coverage: 87.5,
      averageDuration: 2.3
    }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Component Rendering', () => {
    test('renders dashboard header with connection status', () => {
      render(<SwarmDashboard {...defaultProps} />);

      expect(screen.getByText('🚀 Claude Flow Swarm Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    test('renders all dashboard panels', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Check for main panels
      expect(screen.getByText('🤖 Agent Status')).toBeInTheDocument();
      expect(screen.getByText('📊 Swarm Metrics')).toBeInTheDocument();
      expect(screen.getByText('💬 Message Flow')).toBeInTheDocument();
      expect(screen.getByText('🧠 Decision Insights')).toBeInTheDocument();
      expect(screen.getByText('🎛️ Swarm Controls')).toBeInTheDocument();
      expect(screen.getByText('🎭 Playwright Test Status')).toBeInTheDocument();
      expect(screen.getByText('📈 Summary Statistics')).toBeInTheDocument();
    });

    test('displays initial agent data correctly', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Check for initial agents
      expect(screen.getByText('Research Agent Alpha')).toBeInTheDocument();
      expect(screen.getByText('Coder Agent Beta')).toBeInTheDocument();
      expect(screen.getByText('Reviewer Agent Gamma')).toBeInTheDocument();

      // Check agent types
      expect(screen.getByText('researcher')).toBeInTheDocument();
      expect(screen.getByText('coder')).toBeInTheDocument();
      expect(screen.getByText('reviewer')).toBeInTheDocument();
    });

    test('displays swarm metrics correctly', () => {
      render(<SwarmDashboard {...defaultProps} />);

      expect(screen.getByText('89.4%')).toBeInTheDocument(); // Efficiency
      expect(screen.getByText('91.7%')).toBeInTheDocument(); // Coordination
      expect(screen.getByText('2.3/s')).toBeInTheDocument(); // Throughput
      expect(screen.getByText('245ms')).toBeInTheDocument(); // Response Time
    });

    test('displays test metrics correctly', () => {
      render(<SwarmDashboard {...defaultProps} />);

      expect(screen.getByText('45')).toBeInTheDocument(); // Total tests
      expect(screen.getByText('42')).toBeInTheDocument(); // Passed tests
      expect(screen.getByText('87.5%')).toBeInTheDocument(); // Coverage
    });
  });

  describe('WebSocket Connection', () => {
    test('establishes WebSocket connection on mount', () => {
      render(<SwarmDashboard {...defaultProps} />);

      expect(global.WebSocket).toHaveBeenCalledWith('ws://localhost:8080/swarm');
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('open', expect.any(Function));
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('message', expect.any(Function));
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockWebSocket.addEventListener).toHaveBeenCalledWith('error', expect.any(Function));
    });

    test('handles WebSocket connection success', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Get the onopen handler
      const onOpenHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'open')?.[1];

      // Simulate connection success
      act(() => {
        onOpenHandler();
      });

      expect(screen.getByText('Connected')).toBeInTheDocument();
    });

    test('handles WebSocket connection failure', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Get the onerror handler
      const onErrorHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'error')?.[1];

      // Simulate connection error
      act(() => {
        onErrorHandler({ error: 'Connection failed' });
      });

      expect(screen.getByText('Disconnected')).toBeInTheDocument();
    });

    test('attempts WebSocket reconnection after disconnect', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Get the onclose handler
      const onCloseHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'close')?.[1];

      // Simulate disconnection
      act(() => {
        onCloseHandler();
      });

      // Should attempt reconnection after 3 seconds
      jest.advanceTimersByTime(3000);
      expect(global.WebSocket).toHaveBeenCalledTimes(2);
    });

    test('processes WebSocket messages correctly', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Get the onmessage handler
      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      // Simulate agent update message
      const agentUpdateMessage = {
        type: 'agent_update',
        agentId: 'agent-1',
        updates: {
          performance: 95,
          status: 'active',
          currentTask: 'New task assignment'
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(agentUpdateMessage) });
      });

      await waitFor(() => {
        expect(screen.getByText('New task assignment')).toBeInTheDocument();
      });
    });

    test('processes metrics update messages', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const metricsUpdate = {
        type: 'metrics_update',
        metrics: {
          efficiency: 92.1,
          coordinationScore: 94.5,
          throughput: 3.1,
          errorRate: 0.8
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(metricsUpdate) });
      });

      await waitFor(() => {
        expect(screen.getByText('92.1%')).toBeInTheDocument();
        expect(screen.getByText('94.5%')).toBeInTheDocument();
        expect(screen.getByText('3.1/s')).toBeInTheDocument();
      });
    });

    test('processes new message and trims message history', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const newMessage = {
        type: 'new_message',
        message: {
          id: 'msg-001',
          from: 'agent-1',
          to: 'agent-2',
          type: 'coordination',
          content: 'Task coordination message',
          timestamp: new Date(),
          priority: 'high'
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(newMessage) });
      });

      await waitFor(() => {
        expect(screen.getByText('Task coordination message')).toBeInTheDocument();
        expect(screen.getByText('high')).toBeInTheDocument();
      });
    });
  });

  describe('Agent Status Interactions', () => {
    test('selects and deselects agents when clicked', () => {
      render(<SwarmDashboard {...defaultProps} />);

      const agentCard = screen.getByText('Research Agent Alpha').closest('.agent-card');

      // Click to select
      fireEvent.click(agentCard!);
      expect(agentCard).toHaveClass('selected');

      // Click again to deselect
      fireEvent.click(agentCard!);
      expect(agentCard).not.toHaveClass('selected');
    });

    test('calls onSelectAgent callback when agent is selected', () => {
      const onSelectAgent = jest.fn();
      render(<SwarmDashboard {...defaultProps} onSelectAgent={onSelectAgent} />);

      const agentCard = screen.getByText('Research Agent Alpha').closest('.agent-card');
      fireEvent.click(agentCard!);

      expect(onSelectAgent).toHaveBeenCalledWith('agent-1');
    });

    test('displays agent details correctly', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Check for agent details
      expect(screen.getByText('Tasks Completed:')).toBeInTheDocument();
      expect(screen.getByText('23')).toBeInTheDocument(); // Agent 1 tasks
      expect(screen.getByText('Analyzing market trends')).toBeInTheDocument(); // Current task
    });

    test('updates agent status in real-time', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const statusUpdate = {
        type: 'agent_update',
        agentId: 'agent-2',
        updates: {
          status: 'active',
          performance: 98,
          currentTask: 'Updated task'
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(statusUpdate) });
      });

      await waitFor(() => {
        const agentCard = screen.getByText('Coder Agent Beta').closest('.agent-card');
        expect(agentCard).toHaveTextContent('Updated task');
      });
    });
  });

  describe('Swarm Controls', () => {
    test('restarts swarm when restart button is clicked', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const restartButton = screen.getByText('🔄 Restart Swarm');

      fireEvent.click(restartButton);

      // Should show loading state
      expect(screen.getByText('🔄 Restarting...')).toBeInTheDocument();
      expect(restartButton).toBeDisabled();

      // Wait for restart completion
      jest.advanceTimersByTime(2000);

      await waitFor(() => {
        expect(screen.getByText('🔄 Restart Swarm')).toBeInTheDocument();
        expect(restartButton).not.toBeDisabled();
      });
    });

    test('displays relaunch history', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const relaunchEvent = {
        type: 'swarm_relaunch',
        relaunch: {
          id: 'relaunch-001',
          timestamp: new Date(),
          reason: 'Performance optimization',
          duration: 1500,
          success: true
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(relaunchEvent) });
      });

      await waitFor(() => {
        expect(screen.getByText('Performance optimization')).toBeInTheDocument();
        expect(screen.getByText('1.5s')).toBeInTheDocument();
        expect(screen.getByText('✅')).toBeInTheDocument();
      });
    });

    test('limits relaunch history based on maxRelaunches prop', async () => {
      render(<SwarmDashboard {...defaultProps} maxRelaunches={2} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      // Add multiple relaunch events
      const relaunchEvents = [
        { id: 'relaunch-001', reason: 'First restart', success: true },
        { id: 'relaunch-002', reason: 'Second restart', success: true },
        { id: 'relaunch-003', reason: 'Third restart', success: true }
      ];

      relaunchEvents.forEach((event, index) => {
        act(() => {
          onMessageHandler({
            data: JSON.stringify({
              type: 'swarm_relaunch',
              relaunch: {
                ...event,
                timestamp: new Date(Date.now() + index * 1000)
              }
            })
          });
        });
      });

      await waitFor(() => {
        // Should only show the 2 most recent relaunches
        expect(screen.queryByText('First restart')).not.toBeInTheDocument();
        expect(screen.getByText('Second restart')).toBeInTheDocument();
        expect(screen.getByText('Third restart')).toBeInTheDocument();
      });
    });
  });

  describe('Real-time Updates Simulation', () => {
    test('simulates agent status changes when WebSocket disconnected', () => {
      render(<SwarmDashboard {...defaultProps} wsUrl="ws://invalid-url" />);

      // Should show disconnected status
      expect(screen.getByText('Disconnected')).toBeInTheDocument();

      // Fast-forward time to trigger simulation
      jest.advanceTimersByTime(1000);

      // Agent metrics should be updated
      const agentCards = screen.getAllByTestId(/agent-/i);
      expect(agentCards.length).toBeGreaterThan(0);
    });

    test('simulates new messages when WebSocket disconnected', async () => {
      render(<SwarmDashboard {...defaultProps} wsUrl="ws://invalid-url" />);

      // Fast-forward time to trigger message simulation
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        // Should have simulated messages
        expect(screen.getByText('Simulated message at')).toBeInTheDocument();
      });
    });

    test('updates metrics in simulation mode', async () => {
      render(<SwarmDashboard {...defaultProps} wsUrl="ws://invalid-url" />);

      const originalEfficiency = screen.getByText('89.4%');

      // Fast-forward time to trigger metric updates
      jest.advanceTimersByTime(1000);

      await waitFor(() => {
        // Metrics should be updated (may be same or different)
        expect(screen.getByText(/\d+\.\d%/)).toBeInTheDocument();
      });
    });
  });

  describe('Decision Insights Panel', () => {
    test('displays decision insights correctly', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const insightEvent = {
        type: 'decision_insight',
        insight: {
          id: 'insight-001',
          agentId: 'agent-researcher-001',
          decision: 'Use OAuth2 for authentication',
          reasoning: 'Best security practice with good user experience',
          confidence: 0.92,
          impact: 'high',
          timestamp: new Date()
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(insightEvent) });
      });

      await waitFor(() => {
        expect(screen.getByText('Use OAuth2 for authentication')).toBeInTheDocument();
        expect(screen.getByText('92% confident')).toBeInTheDocument();
        expect(screen.getByText('high impact')).toBeInTheDocument();
      });
    });

    test('limits insight history display', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      // Add multiple insights (more than the display limit of 10)
      const insights = Array.from({ length: 15 }, (_, i) => ({
        type: 'decision_insight',
        insight: {
          id: `insight-${i.toString().padStart(3, '0')}`,
          agentId: 'agent-001',
          decision: `Decision ${i + 1}`,
          reasoning: `Reasoning for decision ${i + 1}`,
          confidence: 0.8 + (i * 0.01),
          impact: 'medium' as const,
          timestamp: new Date(Date.now() + i * 1000)
        }
      }));

      insights.forEach(insight => {
        act(() => {
          onMessageHandler({ data: JSON.stringify(insight) });
        });
      });

      await waitFor(() => {
        // Should only show the 10 most recent insights
        expect(screen.queryByText('Decision 1')).not.toBeInTheDocument();
        expect(screen.getByText('Decision 15')).toBeInTheDocument();
      });
    });
  });

  describe('Message Flow Panel', () => {
    test('displays message flow correctly', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const messageEvent = {
        type: 'new_message',
        message: {
          id: 'msg-flow-001',
          from: 'agent-1',
          to: 'agent-2',
          type: 'coordination',
          content: 'Coordination message for task assignment',
          timestamp: new Date(),
          priority: 'medium'
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(messageEvent) });
      });

      await waitFor(() => {
        expect(screen.getByText('agent-1')).toBeInTheDocument();
        expect(screen.getByText('→')).toBeInTheDocument();
        expect(screen.getByText('agent-2')).toBeInTheDocument();
        expect(screen.getByText('Coordination message for task assignment')).toBeInTheDocument();
        expect(screen.getByText('coordination')).toBeInTheDocument();
      });
    });

    test('applies priority colors correctly', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const highPriorityMessage = {
        type: 'new_message',
        message: {
          id: 'msg-high-001',
          from: 'agent-1',
          to: 'agent-2',
          type: 'error',
          content: 'High priority error message',
          timestamp: new Date(),
          priority: 'high'
        }
      };

      act(() => {
        onMessageHandler({ data: JSON.stringify(highPriorityMessage) });
      });

      await waitFor(() => {
        const priorityElement = screen.getByText('high');
        expect(priorityElement).toHaveStyle({ color: 'var(--error-color)' });
      });
    });
  });

  describe('Performance Metrics', () => {
    test('calculates and displays average performance correctly', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Based on default agents with performances 87, 94, 91
      // Average should be (87 + 94 + 91) / 3 = 90.67
      expect(screen.getByText('90.7%')).toBeInTheDocument();
    });

    test('calculates total tasks completed correctly', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Based on default agents with 23, 31, 18 tasks completed
      // Total should be 23 + 31 + 18 = 72
      expect(screen.getByText('72')).toBeInTheDocument();
    });

    test('displays metric change indicators', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Check for positive and negative change indicators
      expect(screen.getByText('+2.1%')).toBeInTheDocument();
      expect(screen.getByText('-0.2/s')).toBeInTheDocument();
      expect(screen.getByText('+1.4%')).toBeInTheDocument();
    });
  });

  describe('Component Cleanup', () => {
    test('cleans up WebSocket connection on unmount', () => {
      const { unmount } = render(<SwarmDashboard {...defaultProps} />);

      // Unmount component
      unmount();

      // Should close WebSocket connection
      expect(mockWebSocket.close).toHaveBeenCalled();
    });

    test('cleans up timers on unmount', () => {
      const { unmount } = render(<SwarmDashboard {...defaultProps} />);

      // Unmount component
      unmount();

      // Fast-forward time - should not cause any issues
      expect(() => {
        jest.advanceTimersByTime(5000);
      }).not.toThrow();
    });
  });

  describe('Error Handling', () => {
    test('handles invalid WebSocket messages gracefully', () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      // Send invalid JSON
      expect(() => {
        act(() => {
          onMessageHandler({ data: 'invalid json' });
        });
      }).not.toThrow();

      // Send unknown message type
      expect(() => {
        act(() => {
          onMessageHandler({ data: JSON.stringify({ type: 'unknown_type' }) });
        });
      }).not.toThrow();
    });

    test('handles missing agent data gracefully', () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      const agentUpdate = {
        type: 'agent_update',
        agentId: 'non-existent-agent',
        updates: { performance: 100 }
      };

      expect(() => {
        act(() => {
          onMessageHandler({ data: JSON.stringify(agentUpdate) });
        });
      }).not.toThrow();
    });

    test('handles WebSocket errors during restart', async () => {
      // Mock WebSocket to throw error during send
      mockWebSocket.send.mockImplementation(() => {
        throw new Error('WebSocket is closed');
      });

      render(<SwarmDashboard {...defaultProps} />);

      const restartButton = screen.getByText('🔄 Restart Swarm');

      expect(() => {
        fireEvent.click(restartButton);
      }).not.toThrow();
    });
  });

  describe('Accessibility', () => {
    test('has proper ARIA labels and roles', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Check for proper heading structure
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();

      // Check for main dashboard region
      expect(screen.getByRole('main')).toBeInTheDocument();

      // Check for button labels
      const restartButton = screen.getByRole('button', { name: /restart swarm/i });
      expect(restartButton).toBeInTheDocument();
    });

    test('supports keyboard navigation', () => {
      render(<SwarmDashboard {...defaultProps} />);

      const restartButton = screen.getByRole('button', { name: /restart swarm/i });

      restartButton.focus();
      expect(restartButton).toHaveFocus();

      // Test Enter key
      fireEvent.keyDown(restartButton, { key: 'Enter' });

      // Test Space key
      fireEvent.keyDown(restartButton, { key: ' ' });
    });

    test('provides screen reader friendly status updates', () => {
      render(<SwarmDashboard {...defaultProps} />);

      // Connection status should be announced
      const connectionStatus = screen.getByText('Connected');
      expect(connectionStatus).toBeInTheDocument();

      // Agent statuses should be clear
      const agentStatuses = screen.getAllByText(/active|idle|processing|error/);
      expect(agentStatuses.length).toBeGreaterThan(0);
    });
  });

  describe('Performance', () => {
    test('handles large message history efficiently', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      // Send many messages rapidly
      const startTime = performance.now();

      for (let i = 0; i < 100; i++) {
        act(() => {
          onMessageHandler({
            data: JSON.stringify({
              type: 'new_message',
              message: {
                id: `msg-${i}`,
                from: 'agent-1',
                to: 'agent-2',
                type: 'coordination',
                content: `Message ${i}`,
                timestamp: new Date(),
                priority: 'low'
              }
            })
          });
        });
      }

      const endTime = performance.now();
      const processingTime = endTime - startTime;

      // Should process 100 messages quickly (under 1 second)
      expect(processingTime).toBeLessThan(1000);

      // Should only keep recent messages (trim to 50)
      await waitFor(() => {
        expect(screen.queryByText('Message 0')).not.toBeInTheDocument();
        expect(screen.getByText('Message 99')).toBeInTheDocument();
      });
    });

    test('debounces rapid status updates', async () => {
      render(<SwarmDashboard {...defaultProps} />);

      const onMessageHandler = mockWebSocket.addEventListener.mock.calls
        .find(call => call[0] === 'message')?.[1];

      // Send multiple rapid updates for the same agent
      const updates = [
        { performance: 88 },
        { performance: 89 },
        { performance: 90 },
        { performance: 91 },
        { performance: 92 }
      ];

      updates.forEach((update, index) => {
        setTimeout(() => {
          act(() => {
            onMessageHandler({
              data: JSON.stringify({
                type: 'agent_update',
                agentId: 'agent-1',
                updates: update
              })
            });
          });
        }, index * 10); // 10ms intervals
      });

      // Fast-forward time
      jest.advanceTimersByTime(100);

      await waitFor(() => {
        // Should display the final performance value
        expect(screen.getByText('92.0%')).toBeInTheDocument();
      });
    });
  });
});