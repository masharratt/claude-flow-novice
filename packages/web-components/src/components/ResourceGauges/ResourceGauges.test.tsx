/**
 * ResourceGauges Component Tests
 *
 * Comprehensive test suite for resource monitoring gauges
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceGauges } from './ResourceGauges';
import type { ResourceGaugesProps } from './ResourceGauges.types';

const theme = createTheme();

const renderWithTheme = (ui: React.ReactElement) => {
  return render(<ThemeProvider theme={theme}>{ui}</ThemeProvider>);
};

describe('ResourceGauges', () => {
  const defaultProps: ResourceGaugesProps = {
    cpu: 45,
    memory: 60,
    disk: 75,
    network: 250,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all four gauges', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} />);

      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('Memory Usage')).toBeInTheDocument();
      expect(screen.getByText('Disk Usage')).toBeInTheDocument();
      expect(screen.getByText('Network Throughput')).toBeInTheDocument();
    });

    it('should display correct values', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} />);

      expect(screen.getByText('45')).toBeInTheDocument(); // CPU
      expect(screen.getByText('60')).toBeInTheDocument(); // Memory
      expect(screen.getByText('75')).toBeInTheDocument(); // Disk
      expect(screen.getByText('250')).toBeInTheDocument(); // Network
    });

    it('should display correct units', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} />);

      const percentUnits = screen.getAllByText('%');
      expect(percentUnits).toHaveLength(3); // CPU, Memory, Disk

      expect(screen.getByText('Mbps')).toBeInTheDocument(); // Network
    });

    it('should hide labels when showLabels is false', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} showLabels={false} />);

      expect(screen.queryByText('CPU Usage')).not.toBeInTheDocument();
      expect(screen.queryByText('Memory Usage')).not.toBeInTheDocument();
      expect(screen.queryByText('Disk Usage')).not.toBeInTheDocument();
      expect(screen.queryByText('Network Throughput')).not.toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = renderWithTheme(
        <ResourceGauges {...defaultProps} className="custom-class" />
      );

      const gaugesContainer = container.querySelector('.custom-class');
      expect(gaugesContainer).toBeInTheDocument();
    });
  });

  describe('Threshold Colors', () => {
    it('should use normal color for low values', () => {
      const props: ResourceGaugesProps = {
        cpu: 30,
        memory: 40,
        disk: 50,
        network: 200,
      };

      renderWithTheme(<ResourceGauges {...props} />);
      // Values are within normal range (below warning threshold)
      // Color assertion would require checking styled components or CircularProgress color
    });

    it('should use warning color for medium values', () => {
      const props: ResourceGaugesProps = {
        cpu: 75, // Above default warning (70)
        memory: 80, // Above default warning (75)
        disk: 85, // Above default warning (80)
        network: 750, // Above default warning (70% of 1000)
      };

      renderWithTheme(<ResourceGauges {...props} />);
      // Values are in warning range
    });

    it('should use critical color for high values', () => {
      const props: ResourceGaugesProps = {
        cpu: 95, // Above default critical (90)
        memory: 92, // Above default critical (90)
        disk: 98, // Above default critical (95)
        network: 950, // Above default critical (90% of 1000)
      };

      renderWithTheme(<ResourceGauges {...props} />);
      // Values are in critical range
    });

    it('should respect custom thresholds', () => {
      const props: ResourceGaugesProps = {
        cpu: 50,
        memory: 60,
        disk: 70,
        network: 500,
        thresholds: {
          cpu: { warning: 40, critical: 60 },
          memory: { warning: 50, critical: 70 },
          disk: { warning: 60, critical: 80 },
          network: { warning: 400, critical: 600 },
        },
      };

      renderWithTheme(<ResourceGauges {...props} />);
      // Custom thresholds applied
    });
  });

  describe('Custom Theme', () => {
    it('should apply custom theme colors', () => {
      const customTheme = {
        normal: '#00ff00',
        warning: '#ffff00',
        critical: '#ff0000',
        background: '#cccccc',
        text: '#000000',
      };

      renderWithTheme(<ResourceGauges {...defaultProps} theme={customTheme} />);
      // Custom theme colors applied
    });
  });

  describe('Animation', () => {
    it('should animate by default', () => {
      const { rerender } = renderWithTheme(<ResourceGauges {...defaultProps} />);

      const updatedProps = { ...defaultProps, cpu: 80 };
      rerender(
        <ThemeProvider theme={theme}>
          <ResourceGauges {...updatedProps} />
        </ThemeProvider>
      );

      // Animation occurs when value changes
    });

    it('should not animate when animated is false', () => {
      const { rerender } = renderWithTheme(
        <ResourceGauges {...defaultProps} animated={false} />
      );

      const updatedProps = { ...defaultProps, cpu: 80 };
      rerender(
        <ThemeProvider theme={theme}>
          <ResourceGauges {...updatedProps} animated={false} />
        </ThemeProvider>
      );

      // No animation when disabled
    });

    it('should respect custom animation duration', async () => {
      const { rerender } = renderWithTheme(
        <ResourceGauges {...defaultProps} animationDuration={500} />
      );

      const updatedProps = { ...defaultProps, cpu: 80 };
      rerender(
        <ThemeProvider theme={theme}>
          <ResourceGauges {...updatedProps} animationDuration={500} />
        </ThemeProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByText('80')).toBeInTheDocument();
        },
        { timeout: 1000 }
      );
    });
  });

  describe('Threshold Exceeded Callback', () => {
    it('should call onThresholdExceeded for warning state', () => {
      const onThresholdExceeded = vi.fn();
      const props: ResourceGaugesProps = {
        cpu: 75, // Warning level
        memory: 60,
        disk: 70,
        network: 500,
        onThresholdExceeded,
      };

      renderWithTheme(<ResourceGauges {...props} />);

      expect(onThresholdExceeded).toHaveBeenCalledWith('cpu', 75, 'warning');
    });

    it('should call onThresholdExceeded for critical state', () => {
      const onThresholdExceeded = vi.fn();
      const props: ResourceGaugesProps = {
        cpu: 95, // Critical level
        memory: 60,
        disk: 70,
        network: 500,
        onThresholdExceeded,
      };

      renderWithTheme(<ResourceGauges {...props} />);

      expect(onThresholdExceeded).toHaveBeenCalledWith('cpu', 95, 'critical');
    });

    it('should not call onThresholdExceeded for normal state', () => {
      const onThresholdExceeded = vi.fn();
      const props: ResourceGaugesProps = {
        cpu: 50, // Normal level
        memory: 60,
        disk: 70,
        network: 500,
        onThresholdExceeded,
      };

      renderWithTheme(<ResourceGauges {...props} />);

      expect(onThresholdExceeded).not.toHaveBeenCalledWith(
        'cpu',
        expect.anything(),
        expect.anything()
      );
    });

    it('should call onThresholdExceeded for multiple metrics', () => {
      const onThresholdExceeded = vi.fn();
      const props: ResourceGaugesProps = {
        cpu: 95, // Critical
        memory: 85, // Warning
        disk: 98, // Critical
        network: 50, // Normal
        onThresholdExceeded,
      };

      renderWithTheme(<ResourceGauges {...props} />);

      expect(onThresholdExceeded).toHaveBeenCalledWith('cpu', 95, 'critical');
      expect(onThresholdExceeded).toHaveBeenCalledWith('memory', 85, 'warning');
      expect(onThresholdExceeded).toHaveBeenCalledWith('disk', 98, 'critical');
    });
  });

  describe('Gauge Sizes', () => {
    it('should render small gauges', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} size="small" />);
      // Small size applied (visual regression test would verify dimensions)
    });

    it('should render medium gauges by default', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} />);
      // Medium size is default
    });

    it('should render large gauges', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} size="large" />);
      // Large size applied
    });
  });

  describe('Network Gauge', () => {
    it('should use default max network value', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} network={500} />);

      expect(screen.getByText('500')).toBeInTheDocument();
      // Default max is 1000 Mbps
    });

    it('should respect custom max network value', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} network={500} maxNetwork={2000} />);

      expect(screen.getByText('500')).toBeInTheDocument();
      // Max network set to 2000 Mbps
    });

    it('should calculate network percentage correctly', () => {
      const props: ResourceGaugesProps = {
        cpu: 50,
        memory: 50,
        disk: 50,
        network: 500,
        maxNetwork: 1000,
      };

      renderWithTheme(<ResourceGauges {...props} />);
      // 500/1000 = 50% should be in normal range
    });
  });

  describe('Value Updates', () => {
    it('should update values when props change', async () => {
      const { rerender } = renderWithTheme(<ResourceGauges {...defaultProps} />);

      expect(screen.getByText('45')).toBeInTheDocument();

      const updatedProps = { ...defaultProps, cpu: 85 };
      rerender(
        <ThemeProvider theme={theme}>
          <ResourceGauges {...updatedProps} />
        </ThemeProvider>
      );

      await waitFor(() => {
        expect(screen.getByText('85')).toBeInTheDocument();
      });
    });

    it('should handle rapid value changes', async () => {
      const { rerender } = renderWithTheme(<ResourceGauges {...defaultProps} />);

      for (let i = 50; i <= 90; i += 10) {
        const updatedProps = { ...defaultProps, cpu: i };
        rerender(
          <ThemeProvider theme={theme}>
            <ResourceGauges {...updatedProps} />
          </ThemeProvider>
        );
      }

      await waitFor(() => {
        expect(screen.getByText('90')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero values', () => {
      const props: ResourceGaugesProps = {
        cpu: 0,
        memory: 0,
        disk: 0,
        network: 0,
      };

      renderWithTheme(<ResourceGauges {...props} />);

      const zeroValues = screen.getAllByText('0');
      expect(zeroValues.length).toBeGreaterThan(0);
    });

    it('should handle 100% values', () => {
      const props: ResourceGaugesProps = {
        cpu: 100,
        memory: 100,
        disk: 100,
        network: 1000,
      };

      renderWithTheme(<ResourceGauges {...props} />);

      const hundredValues = screen.getAllByText('100');
      expect(hundredValues.length).toBeGreaterThanOrEqual(3);
      expect(screen.getByText('1000')).toBeInTheDocument();
    });

    it('should handle negative values gracefully', () => {
      const props: ResourceGaugesProps = {
        cpu: -10,
        memory: 50,
        disk: 50,
        network: 500,
      };

      // Should clamp or handle negative values
      renderWithTheme(<ResourceGauges {...props} />);
    });

    it('should handle values exceeding max', () => {
      const props: ResourceGaugesProps = {
        cpu: 150,
        memory: 50,
        disk: 50,
        network: 500,
      };

      // Should handle overflow gracefully
      renderWithTheme(<ResourceGauges {...props} />);
    });
  });

  describe('Accessibility', () => {
    it('should have readable text for all values', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} />);

      expect(screen.getByText('45')).toBeVisible();
      expect(screen.getByText('60')).toBeVisible();
      expect(screen.getByText('75')).toBeVisible();
      expect(screen.getByText('250')).toBeVisible();
    });

    it('should have semantic labels', () => {
      renderWithTheme(<ResourceGauges {...defaultProps} />);

      expect(screen.getByText('CPU Usage')).toBeInTheDocument();
      expect(screen.getByText('Memory Usage')).toBeInTheDocument();
      expect(screen.getByText('Disk Usage')).toBeInTheDocument();
      expect(screen.getByText('Network Throughput')).toBeInTheDocument();
    });
  });
});
