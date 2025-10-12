/**
 * Performance Charts - Main Component
 * Unified charting library using Recharts 2.14.1
 * Consolidates 3 duplicate implementations
 */

import React, { useState, useMemo, useCallback } from 'react';
import { Box, Select, MenuItem, Button, ButtonGroup, IconButton } from '@mui/material';
import {
  Download as DownloadIcon,
  Fullscreen as FullscreenIcon,
  FullscreenExit as FullscreenExitIcon,
  Refresh as RefreshIcon,
} from '@mui/icons-material';
import { PerformanceChartsProps, TimeRange, ChartType } from './PerformanceCharts.types';
import {
  ChartContainer,
  ChartHeader,
  ChartTitle,
  ChartControls,
  ChartContent,
  getChartTheme,
} from './PerformanceCharts.styles';
import LineChartComponent from './LineChart';
import BarChartComponent from './BarChart';
import GaugeChartComponent from './GaugeChart';
import RealtimeChartComponent from './RealtimeChart';

export const PerformanceCharts: React.FC<PerformanceChartsProps> = ({
  systemMetrics = [],
  agentData = [],
  theme = 'light',
  timeRange: initialTimeRange = '1h',
  chartType: initialChartType = 'line',
  realTimeUpdates = false,
  updateInterval = 5000,
  width = '100%',
  height = 400,
  showControls = true,
  onTimeRangeChange,
  onChartTypeChange,
  onExport,
  className,
}) => {
  const [timeRange, setTimeRange] = useState<TimeRange>(initialTimeRange);
  const [chartType, setChartType] = useState<ChartType>(initialChartType);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState(new Date());

  const chartTheme = getChartTheme(theme);

  // Filter data based on time range
  const filteredMetrics = useMemo(() => {
    const now = Date.now();
    const ranges: Record<TimeRange, number> = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    };

    const cutoff = now - ranges[timeRange];
    return systemMetrics.filter((m) => m.timestamp >= cutoff);
  }, [systemMetrics, timeRange]);

  // Calculate summary metrics
  const summary = useMemo(() => {
    if (filteredMetrics.length === 0) {
      return {
        avgCpu: 0,
        avgMemory: 0,
        maxCpu: 0,
        maxMemory: 0,
        activeAgents: 0,
      };
    }

    const sum = filteredMetrics.reduce(
      (acc, m) => ({
        cpu: acc.cpu + m.cpu,
        memory: acc.memory + m.memory,
        maxCpu: Math.max(acc.maxCpu, m.cpu),
        maxMemory: Math.max(acc.maxMemory, m.memory),
      }),
      { cpu: 0, memory: 0, maxCpu: 0, maxMemory: 0 }
    );

    return {
      avgCpu: sum.cpu / filteredMetrics.length,
      avgMemory: sum.memory / filteredMetrics.length,
      maxCpu: sum.maxCpu,
      maxMemory: sum.maxMemory,
      activeAgents: filteredMetrics[filteredMetrics.length - 1]?.activeAgents || 0,
    };
  }, [filteredMetrics]);

  const handleTimeRangeChange = (newRange: TimeRange) => {
    setTimeRange(newRange);
    onTimeRangeChange?.(newRange);
  };

  const handleChartTypeChange = (newType: ChartType) => {
    setChartType(newType);
    onChartTypeChange?.(newType);
  };

  const handleToggleFullscreen = () => {
    setIsFullscreen((prev) => !prev);
  };

  const handleRefresh = useCallback(() => {
    setLastUpdated(new Date());
  }, []);

  const handleExport = useCallback(() => {
    const exportData = {
      timeRange,
      chartType,
      metrics: filteredMetrics,
      agents: agentData,
      summary,
      exportedAt: new Date().toISOString(),
    };

    if (onExport) {
      onExport(exportData);
    } else {
      // Default export as JSON
      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `performance-metrics-${Date.now()}.json`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }, [timeRange, chartType, filteredMetrics, agentData, summary, onExport]);

  const renderChart = () => {
    if (realTimeUpdates) {
      return (
        <RealtimeChartComponent
          data={filteredMetrics}
          dataKeys={['cpu', 'memory', 'network']}
          updateInterval={updateInterval}
          maxDataPoints={60}
          autoScroll={true}
          theme={theme}
          height={height}
          width={width}
        />
      );
    }

    switch (chartType) {
      case 'line':
      case 'area':
        return (
          <LineChartComponent
            data={filteredMetrics}
            dataKey={['cpu', 'memory']}
            theme={theme}
            height={height}
            width={width}
            smooth={true}
            area={chartType === 'area'}
          />
        );

      case 'bar':
        if (agentData.length > 0) {
          return (
            <BarChartComponent
              data={agentData}
              dataKeys={['successRate', 'confidence']}
              theme={theme}
              height={height}
              width={width}
            />
          );
        }
        return (
          <Box
            display="flex"
            justifyContent="center"
            alignItems="center"
            height={height}
            color={chartTheme.text}
          >
            No agent data available for bar chart
          </Box>
        );

      default:
        return (
          <LineChartComponent
            data={filteredMetrics}
            dataKey={['cpu', 'memory']}
            theme={theme}
            height={height}
            width={width}
          />
        );
    }
  };

  const renderGauges = () => (
    <Box display="grid" gridTemplateColumns="repeat(auto-fit, minmax(200px, 1fr))" gap={2} mt={2}>
      <GaugeChartComponent
        value={summary.avgCpu}
        label="Average CPU"
        unit="%"
        theme={theme}
        height={200}
      />
      <GaugeChartComponent
        value={summary.avgMemory}
        label="Average Memory"
        unit="%"
        theme={theme}
        height={200}
      />
      <GaugeChartComponent
        value={summary.maxCpu}
        label="Peak CPU"
        unit="%"
        theme={theme}
        height={200}
      />
    </Box>
  );

  return (
    <ChartContainer
      themeMode={theme}
      elevation={2}
      className={className}
      sx={{
        width: isFullscreen ? '100vw' : width,
        height: isFullscreen ? '100vh' : 'auto',
        position: isFullscreen ? 'fixed' : 'relative',
        top: isFullscreen ? 0 : 'auto',
        left: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 1,
        maxWidth: isFullscreen ? '100vw' : '100%',
      }}
    >
      <ChartHeader>
        <ChartTitle>Performance Dashboard</ChartTitle>

        {showControls && (
          <ChartControls>
            {/* Time Range Selector */}
            <Select
              value={timeRange}
              onChange={(e) => handleTimeRangeChange(e.target.value as TimeRange)}
              size="small"
              sx={{ minWidth: 120 }}
            >
              <MenuItem value="1h">Last Hour</MenuItem>
              <MenuItem value="6h">Last 6 Hours</MenuItem>
              <MenuItem value="24h">Last 24 Hours</MenuItem>
              <MenuItem value="7d">Last 7 Days</MenuItem>
              <MenuItem value="30d">Last 30 Days</MenuItem>
            </Select>

            {/* Chart Type Selector */}
            {!realTimeUpdates && (
              <ButtonGroup size="small" variant="outlined">
                <Button
                  variant={chartType === 'line' ? 'contained' : 'outlined'}
                  onClick={() => handleChartTypeChange('line')}
                >
                  Line
                </Button>
                <Button
                  variant={chartType === 'area' ? 'contained' : 'outlined'}
                  onClick={() => handleChartTypeChange('area')}
                >
                  Area
                </Button>
                <Button
                  variant={chartType === 'bar' ? 'contained' : 'outlined'}
                  onClick={() => handleChartTypeChange('bar')}
                >
                  Bar
                </Button>
              </ButtonGroup>
            )}

            {/* Action Buttons */}
            <IconButton size="small" onClick={handleRefresh} title="Refresh">
              <RefreshIcon />
            </IconButton>
            <IconButton size="small" onClick={handleExport} title="Export Data">
              <DownloadIcon />
            </IconButton>
            <IconButton size="small" onClick={handleToggleFullscreen} title="Toggle Fullscreen">
              {isFullscreen ? <FullscreenExitIcon /> : <FullscreenIcon />}
            </IconButton>
          </ChartControls>
        )}
      </ChartHeader>

      <ChartContent>
        {renderChart()}
      </ChartContent>

      {!realTimeUpdates && showControls && (
        <Box mt={2}>
          {renderGauges()}
        </Box>
      )}

      <Box
        mt={2}
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.75rem',
          color: chartTheme.text,
          opacity: 0.7,
        }}
      >
        <span>Last updated: {lastUpdated.toLocaleTimeString()}</span>
        <span>
          {filteredMetrics.length} data points | {summary.activeAgents} active agents
        </span>
      </Box>
    </ChartContainer>
  );
};

export default PerformanceCharts;
