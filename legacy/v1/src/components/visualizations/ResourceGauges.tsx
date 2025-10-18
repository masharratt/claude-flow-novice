import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

export interface ResourceMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  gpu?: number;
  temperature?: number;
  power?: number;
}

export interface AgentResourceData {
  agentId: string;
  agentName: string;
  agentType: string;
  resources: ResourceMetrics;
  efficiency: number;
  lastUpdate: number;
}

export interface HeatmapData {
  timestamp: number;
  agents: Array<{
    id: string;
    name: string;
    resourceType: string;
    value: number;
    status: 'optimal' | 'warning' | 'critical';
  }>;
}

export interface ResourceGaugesProps {
  resourceMetrics: ResourceMetrics;
  agentData: AgentResourceData[];
  heatmapData: HeatmapData[];
  width?: number;
  height?: number;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  theme?: 'light' | 'dark';
  showLabels?: boolean;
  animationsEnabled?: boolean;
  gaugeStyle?: 'arc' | 'linear' | 'radial';
  heatmapResolution?: number;
}

export const ResourceGauges: React.FC<ResourceGaugesProps> = ({
  resourceMetrics,
  agentData,
  heatmapData,
  width = 1000,
  height = 600,
  realTimeUpdates = true,
  updateInterval = 3000,
  theme = 'light',
  showLabels = true,
  animationsEnabled = true,
  gaugeStyle = 'arc',
  heatmapResolution = 10,
}) => {
  const gaugesRef = useRef<SVGSVGElement>(null);
  const heatmapRef = useRef<SVGSVGElement>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentResourceData | null>(null);
  const [hoveredResource, setHoveredResource] = useState<string | null>(null);

  const themeColors = {
    light: {
      background: '#ffffff',
      text: '#1f2937',
      border: '#e5e7eb',
      grid: '#f3f4f6',
      optimal: '#10b981',
      warning: '#f59e0b',
      critical: '#ef4444',
      gradient: {
        start: '#dbeafe',
        end: '#1e40af',
      },
    },
    dark: {
      background: '#1f2937',
      text: '#f9fafb',
      border: '#374151',
      grid: '#4b5563',
      optimal: '#34d399',
      warning: '#fbbf24',
      critical: '#f87171',
      gradient: {
        start: '#1e3a8a',
        end: '#60a5fa',
      },
    },
  };

  const colors = themeColors[theme];

  const getColorForValue = (value: number, max: number = 100): string => {
    const percentage = (value / max) * 100;
    if (percentage < 50) return colors.optimal;
    if (percentage < 80) return colors.warning;
    return colors.critical;
  };

  const createArcGauge = useCallback((
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    value: number,
    label: string,
    maxValue: number = 100,
    radius: number = 60,
    x: number,
    y: number,
  ) => {
    const gaugeGroup = svg.append('g').attr('transform', `translate(${x},${y})`);

    // Background arc
    const backgroundArc = d3.arc()
      .innerRadius(radius - 20)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .endAngle(Math.PI / 2);

    gaugeGroup.append('path')
      .datum({ endAngle: Math.PI / 2 } as any)
      .style('fill', colors.grid)
      .attr('d', backgroundArc as any);

    // Value arc
    const valueArc = d3.arc()
      .innerRadius(radius - 20)
      .outerRadius(radius)
      .startAngle(-Math.PI / 2)
      .cornerRadius(5);

    const valuePath = gaugeGroup.append('path')
      .datum({ endAngle: -Math.PI / 2 } as any)
      .style('fill', getColorForValue(value, maxValue))
      .attr('d', valueArc as any);

    // Animated value update
    if (animationsEnabled) {
      valuePath.transition()
        .duration(750)
        .attrTween('d', function(d: any) {
          const interpolate = d3.interpolate(d.endAngle, -Math.PI / 2 + (value / maxValue) * Math.PI);
          return function(t: number) {
            d.endAngle = interpolate(t);
            return valueArc(d) as any;
          };
        });
    } else {
      valuePath.datum({ endAngle: -Math.PI / 2 + (value / maxValue) * Math.PI } as any)
        .attr('d', valueArc as any);
    }

    // Center text
    gaugeGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '24px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text(`${Math.round(value)}%`);

    // Label
    if (showLabels) {
      gaugeGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', radius + 20)
        .style('font-size', '14px')
        .style('fill', colors.text)
        .text(label);
    }

    // Hover effects
    gaugeGroup
      .on('mouseenter', function() {
        d3.select(this).style('cursor', 'pointer');
        setHoveredResource(label);
      })
      .on('mouseleave', function() {
        setHoveredResource(null);
      });

    return gaugeGroup;
  }, [colors, showLabels, animationsEnabled]);

  const createLinearGauge = useCallback((
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    value: number,
    label: string,
    maxValue: number = 100,
    width: number = 200,
    height: number = 30,
    x: number,
    y: number,
  ) => {
    const gaugeGroup = svg.append('g').attr('transform', `translate(${x},${y})`);

    // Background
    gaugeGroup.append('rect')
      .attr('width', width)
      .attr('height', height)
      .attr('rx', height / 2)
      .style('fill', colors.grid);

    // Value bar
    const valueWidth = (value / maxValue) * width;
    const valueRect = gaugeGroup.append('rect')
      .attr('width', 0)
      .attr('height', height)
      .attr('rx', height / 2)
      .style('fill', getColorForValue(value, maxValue));

    // Animated value update
    if (animationsEnabled) {
      valueRect.transition()
        .duration(750)
        .attr('width', valueWidth);
    } else {
      valueRect.attr('width', valueWidth);
    }

    // Label
    if (showLabels) {
      gaugeGroup.append('text')
        .attr('x', width / 2)
        .attr('y', height + 20)
        .attr('text-anchor', 'middle')
        .style('font-size', '14px')
        .style('fill', colors.text)
        .text(`${label}: ${Math.round(value)}%`);
    }

    return gaugeGroup;
  }, [colors, showLabels, animationsEnabled]);

  const createRadialGauge = useCallback((
    svg: d3.Selection<SVGSVGElement, unknown, null, undefined>,
    value: number,
    label: string,
    maxValue: number = 100,
    radius: number = 50,
    x: number,
    y: number,
  ) => {
    const gaugeGroup = svg.append('g').attr('transform', `translate(${x},${y})`);

    // Create radial gradient
    const gradient = svg.append('defs')
      .append('radialGradient')
      .attr('id', `radial-gradient-${label.replace(/\s+/g, '-')}`);

    gradient.append('stop')
      .attr('offset', '0%')
      .style('stop-color', getColorForValue(value, maxValue))
      .style('stop-opacity', 0.8);

    gradient.append('stop')
      .attr('offset', '100%')
      .style('stop-color', getColorForValue(value, maxValue))
      .style('stop-opacity', 0.3);

    // Background circle
    gaugeGroup.append('circle')
      .attr('r', radius)
      .style('fill', colors.grid)
      .style('stroke', colors.border)
      .style('stroke-width', 2);

    // Value circle
    const valueRadius = radius * (value / maxValue);
    const valueCircle = gaugeGroup.append('circle')
      .attr('r', 0)
      .style('fill', `url(#radial-gradient-${label.replace(/\s+/g, '-')})`);

    // Animated value update
    if (animationsEnabled) {
      valueCircle.transition()
        .duration(750)
        .attr('r', valueRadius);
    } else {
      valueCircle.attr('r', valueRadius);
    }

    // Center text
    gaugeGroup.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '18px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text(`${Math.round(value)}%`);

    // Label
    if (showLabels) {
      gaugeGroup.append('text')
        .attr('text-anchor', 'middle')
        .attr('dy', radius + 20)
        .style('font-size', '14px')
        .style('fill', colors.text)
        .text(label);
    }

    return gaugeGroup;
  }, [colors, showLabels, animationsEnabled]);

  const initializeGauges = useCallback(() => {
    if (!gaugesRef.current) return;

    const svg = d3.select(gaugesRef.current);
    svg.selectAll('*').remove();

    const resources = [
      { key: 'cpu', value: resourceMetrics.cpu, label: 'CPU' },
      { key: 'memory', value: resourceMetrics.memory, label: 'Memory' },
      { key: 'disk', value: resourceMetrics.disk, label: 'Disk' },
      { key: 'network', value: resourceMetrics.network, label: 'Network' },
    ];

    if (resourceMetrics.gpu !== undefined) {
      resources.push({ key: 'gpu', value: resourceMetrics.gpu, label: 'GPU' });
    }
    if (resourceMetrics.temperature !== undefined) {
      resources.push({ key: 'temperature', value: resourceMetrics.temperature, label: 'Temp' });
    }
    if (resourceMetrics.power !== undefined) {
      resources.push({ key: 'power', value: resourceMetrics.power, label: 'Power' });
    }

    // Layout based on gauge style
    if (gaugeStyle === 'arc') {
      const cols = Math.ceil(Math.sqrt(resources.length));
      const cellWidth = width / cols;
      const cellHeight = height / Math.ceil(resources.length / cols);

      resources.forEach((resource, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = col * cellWidth + cellWidth / 2;
        const y = row * cellHeight + cellHeight / 2;

        createArcGauge(svg, resource.value, resource.label, 100, Math.min(cellWidth, cellHeight) * 0.3, x, y);
      });
    } else if (gaugeStyle === 'linear') {
      resources.forEach((resource, index) => {
        const x = 50;
        const y = 50 + index * 80;
        createLinearGauge(svg, resource.value, resource.label, 100, width - 100, 30, x, y);
      });
    } else if (gaugeStyle === 'radial') {
      const cols = Math.ceil(Math.sqrt(resources.length));
      const cellWidth = width / cols;
      const cellHeight = height / Math.ceil(resources.length / cols);

      resources.forEach((resource, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        const x = col * cellWidth + cellWidth / 2;
        const y = row * cellHeight + cellHeight / 2;

        createRadialGauge(svg, resource.value, resource.label, 100, Math.min(cellWidth, cellHeight) * 0.35, x, y);
      });
    }

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '20px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text('System Resources');
  }, [resourceMetrics, gaugeStyle, width, height, createArcGauge, createLinearGauge, createRadialGauge, colors]);

  const initializeHeatmap = useCallback(() => {
    if (!heatmapRef.current || heatmapData.length === 0) return;

    const svg = d3.select(heatmapRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 50, right: 50, bottom: 50, left: 150 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    // Get unique agents and resource types
    const agents = [...new Set(heatmapData.flatMap(d => d.agents.map(a => a.name)))];
    const resourceTypes = ['CPU', 'Memory', 'Disk', 'Network'];

    // Create scales
    const xScale = d3.scaleBand<string>()
      .domain(resourceTypes)
      .range([0, innerWidth])
      .padding(0.1);

    const yScale = d3.scaleBand<string>()
      .domain(agents)
      .range([0, innerHeight])
      .padding(0.1);

    // Color scale
    const colorScale = d3.scaleLinear<string>()
      .domain([0, 50, 80, 100])
      .range([colors.optimal, colors.warning, colors.critical, colors.critical]);

    // Create heatmap container
    const heatmapGroup = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Get latest data for each agent-resource combination
    const latestData = heatmapData[heatmapData.length - 1];
    const dataMatrix: Array<{ agent: string; resource: string; value: number; status: string }> = [];

    agents.forEach(agent => {
      resourceTypes.forEach(resource => {
        const agentData = latestData.agents.find(a => a.name === agent && a.resourceType === resource);
        if (agentData) {
          dataMatrix.push({
            agent,
            resource,
            value: agentData.value,
            status: agentData.status,
          });
        }
      });
    });

    // Create cells
    const cells = heatmapGroup.selectAll('.cell')
      .data(dataMatrix)
      .enter()
      .append('g')
      .attr('class', 'cell');

    cells.append('rect')
      .attr('x', d => xScale(d.resource) || 0)
      .attr('y', d => yScale(d.agent) || 0)
      .attr('width', xScale.bandwidth())
      .attr('height', yScale.bandwidth())
      .style('fill', d => colorScale(d.value))
      .style('stroke', colors.border)
      .style('stroke-width', 1)
      .style('opacity', 0.8)
      .on('mouseenter', function(event, d) {
        d3.select(this)
          .style('opacity', 1)
          .style('stroke-width', 2);

        // Show tooltip
        const tooltip = d3.select('body').append('div')
          .attr('class', 'heatmap-tooltip')
          .style('position', 'absolute')
          .style('background', theme === 'dark' ? '#374151' : '#ffffff')
          .style('border', `1px solid ${colors.border}`)
          .style('border-radius', '4px')
          .style('padding', '8px')
          .style('font-size', '12px')
          .style('color', colors.text)
          .style('pointer-events', 'none')
          .style('z-index', '1000');

        tooltip.html(`
          <strong>${d.agent}</strong><br/>
          Resource: ${d.resource}<br/>
          Usage: ${d.value}%<br/>
          Status: ${d.status}
        `);

        const [mouseX, mouseY] = d3.pointer(event, document.body);
        tooltip
          .style('left', `${mouseX + 10}px`)
          .style('top', `${mouseY - 10}px`);
      })
      .on('mousemove', function(event) {
        const tooltip = d3.select('.heatmap-tooltip');
        if (!tooltip.empty()) {
          const [mouseX, mouseY] = d3.pointer(event, document.body);
          tooltip
            .style('left', `${mouseX + 10}px`)
            .style('top', `${mouseY - 10}px`);
        }
      })
      .on('mouseleave', function() {
        d3.select(this)
          .style('opacity', 0.8)
          .style('stroke-width', 1);

        d3.select('.heatmap-tooltip').remove();
      });

    // Add value labels
    cells.append('text')
      .attr('x', d => (xScale(d.resource) || 0) + xScale.bandwidth() / 2)
      .attr('y', d => (yScale(d.agent) || 0) + yScale.bandwidth() / 2)
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .style('font-size', '12px')
      .style('fill', d => d.value > 50 ? '#ffffff' : colors.text)
      .style('font-weight', 'bold')
      .text(d => `${d.value}%`);

    // Add axes
    const xAxis = d3.axisTop(xScale);
    heatmapGroup.append('g')
      .attr('class', 'x-axis')
      .call(xAxis)
      .style('color', colors.text);

    const yAxis = d3.axisLeft(yScale);
    heatmapGroup.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .style('color', colors.text);

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '20px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text('Resource Usage Heatmap');

    // Add legend
    const legendGroup = svg.append('g')
      .attr('transform', `translate(${width - 150},${100})`);

    const legendScale = d3.scaleLinear<string>()
      .domain([0, 100])
      .range([colors.optimal, colors.critical]);

    const legendGradient = svg.append('defs')
      .append('linearGradient')
      .attr('id', 'heatmap-legend-gradient')
      .attr('x1', '0%')
      .attr('y1', '0%')
      .attr('x2', '0%')
      .attr('y2', '100%');

    legendGradient.append('stop')
      .attr('offset', '0%')
      .style('stop-color', colors.optimal);

    legendGradient.append('stop')
      .attr('offset', '50%')
      .style('stop-color', colors.warning);

    legendGradient.append('stop')
      .attr('offset', '100%')
      .style('stop-color', colors.critical);

    legendGroup.append('rect')
      .attr('width', 20)
      .attr('height', 100)
      .style('fill', 'url(#heatmap-legend-gradient)')
      .style('stroke', colors.border)
      .style('stroke-width', 1);

    legendGroup.append('text')
      .attr('x', 25)
      .attr('y', 0)
      .style('font-size', '12px')
      .style('fill', colors.text)
      .text('100%');

    legendGroup.append('text')
      .attr('x', 25)
      .attr('y', 50)
      .style('font-size', '12px')
      .style('fill', colors.text)
      .text('50%');

    legendGroup.append('text')
      .attr('x', 25)
      .attr('y', 100)
      .style('font-size', '12px')
      .style('fill', colors.text)
      .text('0%');

    legendGroup.append('text')
      .attr('x', 10)
      .attr('y', -10)
      .style('font-size', '14px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text('Usage');
  }, [heatmapData, width, height, colors, theme]);

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      // Simulate real-time data updates
      initializeGauges();
      initializeHeatmap();
    }, updateInterval);

    return () => clearInterval(interval);
  }, [realTimeUpdates, updateInterval, initializeGauges, initializeHeatmap]);

  // Initialize visualizations
  useEffect(() => {
    initializeGauges();
    initializeHeatmap();
  }, [initializeGauges, initializeHeatmap]);

  return (
    <div className="resource-gauges" style={{ width, height, background: colors.background }}>
      {/* Gauges Section */}
      <div style={{ marginBottom: '20px' }}>
        <svg
          ref={gaugesRef}
          width={width}
          height={height / 2}
          style={{ border: `1px solid ${colors.border}`, borderRadius: '8px' }}
        />
      </div>

      {/* Heatmap Section */}
      <div>
        <svg
          ref={heatmapRef}
          width={width}
          height={height / 2}
          style={{ border: `1px solid ${colors.border}`, borderRadius: '8px' }}
        />
      </div>

      {/* Agent Details Panel */}
      {selectedAgent && (
        <div
          className="agent-details"
          style={{
            position: 'absolute',
            top: '20px',
            right: '20px',
            background: theme === 'dark' ? '#374151' : '#f9fafb',
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px',
            minWidth: '250px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <h3 style={{ margin: '0 0 12px 0', color: colors.text }}>{selectedAgent.agentName}</h3>
          <div style={{ marginBottom: '8px' }}>
            <strong>Type:</strong> {selectedAgent.agentType}
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Efficiency:</strong> {(selectedAgent.efficiency * 100).toFixed(1)}%
          </div>
          <div style={{ marginBottom: '8px' }}>
            <strong>Resources:</strong>
          </div>
          <div style={{ paddingLeft: '16px', fontSize: '14px' }}>
            <div>CPU: {selectedAgent.resources.cpu}%</div>
            <div>Memory: {selectedAgent.resources.memory}%</div>
            <div>Disk: {selectedAgent.resources.disk}%</div>
            <div>Network: {selectedAgent.resources.network}%</div>
          </div>
        </div>
      )}

      {/* Hover Info */}
      {hoveredResource && (
        <div
          className="hover-info"
          style={{
            position: 'absolute',
            bottom: '20px',
            left: '20px',
            background: theme === 'dark' ? '#374151' : '#f9fafb',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            padding: '8px 12px',
            fontSize: '14px',
            color: colors.text,
          }}
        >
          Hovering: <strong>{hoveredResource}</strong>
        </div>
      )}
    </div>
  );
};