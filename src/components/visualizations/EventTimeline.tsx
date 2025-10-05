import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';

export interface TimelineEvent {
  id: string;
  timestamp: number;
  type: 'agent-spawn' | 'task-start' | 'task-complete' | 'error' | 'warning' | 'milestone' | 'checkpoint';
  title: string;
  description: string;
  agentId?: string;
  agentName?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  category: 'system' | 'agent' | 'task' | 'performance' | 'security';
  metadata?: Record<string, any>;
  duration?: number;
  parentEventId?: string;
  childEventIds?: string[];
}

export interface EventTimelineProps {
  events: TimelineEvent[];
  width?: number;
  height?: number;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  theme?: 'light' | 'dark';
  showCategories?: boolean;
  showAgents?: boolean;
  timeRange?: '1h' | '6h' | '24h' | '7d' | 'all';
  groupingMode?: 'none' | 'category' | 'agent' | 'severity';
  animationSpeed?: number;
  maxEvents?: number;
}

export const EventTimeline: React.FC<EventTimelineProps> = ({
  events,
  width = 1200,
  height = 400,
  realTimeUpdates = true,
  updateInterval = 5000,
  theme = 'light',
  showCategories = true,
  showAgents = true,
  timeRange = '24h',
  groupingMode = 'category',
  animationSpeed = 750,
  maxEvents = 100,
}) => {
  const timelineRef = useRef<SVGSVGElement>(null);
  const [selectedEvent, setSelectedEvent] = useState<TimelineEvent | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<TimelineEvent | null>(null);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [zoomLevel, setZoomLevel] = useState(1);
  const [timeOffset, setTimeOffset] = useState(0);

  const themeColors = {
    light: {
      background: '#ffffff',
      text: '#1f2937',
      border: '#e5e7eb',
      grid: '#f3f4f6',
      axis: '#9ca3af',
      highlight: '#3b82f6',
      eventTypes: {
        'agent-spawn': '#10b981',
        'task-start': '#3b82f6',
        'task-complete': '#8b5cf6',
        'error': '#ef4444',
        'warning': '#f59e0b',
        'milestone': '#06b6d4',
        'checkpoint': '#84cc16',
      },
      severity: {
        low: '#10b981',
        medium: '#f59e0b',
        high: '#ef4444',
        critical: '#7c2d12',
      },
      categories: {
        system: '#3b82f6',
        agent: '#10b981',
        task: '#8b5cf6',
        performance: '#f59e0b',
        security: '#ef4444',
      },
    },
    dark: {
      background: '#1f2937',
      text: '#f9fafb',
      border: '#374151',
      grid: '#4b5563',
      axis: '#9ca3af',
      highlight: '#60a5fa',
      eventTypes: {
        'agent-spawn': '#34d399',
        'task-start': '#60a5fa',
        'task-complete': '#a78bfa',
        'error': '#f87171',
        'warning': '#fbbf24',
        'milestone': '#22d3ee',
        'checkpoint': '#bef264',
      },
      severity: {
        low: '#34d399',
        medium: '#fbbf24',
        high: '#f87171',
        critical: '#991b1b',
      },
      categories: {
        system: '#60a5fa',
        agent: '#34d399',
        task: '#a78bfa',
        performance: '#fbbf24',
        security: '#f87171',
      },
    },
  };

  const colors = themeColors[theme];

  // Filter events based on time range
  const getFilteredEvents = useCallback(() => {
    if (timeRange === 'all') return events.slice(-maxEvents);

    const now = Date.now();
    const ranges = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
    };

    const cutoff = now - ranges[timeRange];
    return events
      .filter(event => event.timestamp >= cutoff)
      .slice(-maxEvents)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [events, timeRange, maxEvents]);

  // Group events based on grouping mode
  const getGroupedEvents = useCallback((filteredEvents: TimelineEvent[]) => {
    if (groupingMode === 'none') return { 'All Events': filteredEvents };

    const groups: Record<string, TimelineEvent[]> = {};

    filteredEvents.forEach(event => {
      let groupKey = '';

      switch (groupingMode) {
        case 'category':
          groupKey = event.category;
          break;
        case 'agent':
          groupKey = event.agentName || 'Unknown Agent';
          break;
        case 'severity':
          groupKey = event.severity;
          break;
        default:
          groupKey = 'Default';
      }

      if (!groups[groupKey]) {
        groups[groupKey] = [];
      }
      groups[groupKey].push(event);
    });

    return groups;
  }, [groupingMode]);

  const initializeTimeline = useCallback(() => {
    if (!timelineRef.current) return;

    const svg = d3.select(timelineRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 50, right: 50, bottom: 80, left: showAgents ? 150 : 80 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const filteredEvents = getFilteredEvents();
    const groupedEvents = getGroupedEvents(filteredEvents);

    if (filteredEvents.length === 0) {
      svg.append('text')
        .attr('x', width / 2)
        .attr('y', height / 2)
        .attr('text-anchor', 'middle')
        .style('font-size', '16px')
        .style('fill', colors.text)
        .text('No events to display');
      return;
    }

    const minTime = Math.min(...filteredEvents.map(e => e.timestamp));
    const maxTime = Math.max(...filteredEvents.map(e => e.timestamp));
    const timeRange = maxTime - minTime;

    // Create time scale
    const xScale = d3.scaleLinear()
      .domain([minTime - timeRange * 0.1, maxTime + timeRange * 0.1])
      .range([0, innerWidth]);

    // Create group scale
    const groups = Object.keys(groupedEvents);
    const yScale = d3.scaleBand()
      .domain(groups)
      .range([0, innerHeight])
      .padding(0.1);

    // Create container
    const container = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Add grid lines
    const gridGroup = container.append('g').attr('class', 'grid');

    // Vertical grid lines (time)
    const timeTicks = xScale.ticks(Math.min(10, filteredEvents.length));
    timeTicks.forEach(tick => {
      gridGroup.append('line')
        .attr('x1', xScale(tick))
        .attr('y1', 0)
        .attr('x2', xScale(tick))
        .attr('y2', innerHeight)
        .attr('stroke', colors.grid)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2');
    });

    // Horizontal grid lines (groups)
    groups.forEach(group => {
      const y = yScale(group)!;
      gridGroup.append('line')
        .attr('x1', 0)
        .attr('y1', y + yScale.bandwidth() / 2)
        .attr('x2', innerWidth)
        .attr('y2', y + yScale.bandwidth() / 2)
        .attr('stroke', colors.grid)
        .attr('stroke-width', 1)
        .attr('stroke-dasharray', '2,2');
    });

    // Create event groups
    const eventGroups = container.selectAll('.event-group')
      .data(groups)
      .enter()
      .append('g')
      .attr('class', 'event-group')
      .attr('transform', group => `translate(0,${yScale(group)! + yScale.bandwidth() / 2})`);

    // Add events for each group
    eventGroups.each(function(group) {
      const groupEvents = groupedEvents[group];
      const groupContainer = d3.select(this);

      const events = groupContainer.selectAll('.event')
        .data(groupEvents)
        .enter()
        .append('g')
        .attr('class', 'event')
        .attr('transform', d => `translate(${xScale(d.timestamp)},0)`);

      // Event circle
      events.append('circle')
        .attr('r', 0)
        .style('fill', d => colors.eventTypes[d.type])
        .style('stroke', d => colors.severity[d.severity])
        .style('stroke-width', 2)
        .style('cursor', 'pointer')
        .on('mouseenter', function(event, d) {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 8);

          setHoveredEvent(d);

          // Show tooltip
          const tooltip = d3.select('body').append('div')
            .attr('class', 'timeline-tooltip')
            .style('position', 'absolute')
            .style('background', theme === 'dark' ? '#374151' : '#ffffff')
            .style('border', `1px solid ${colors.border}`)
            .style('border-radius', '4px')
            .style('padding', '8px')
            .style('font-size', '12px')
            .style('color', colors.text)
            .style('pointer-events', 'none')
            .style('z-index', '1000')
            .style('box-shadow', '0 2px 4px rgba(0,0,0,0.1)');

          const time = new Date(d.timestamp).toLocaleString();
          tooltip.html(`
            <strong>${d.title}</strong><br/>
            <small>${time}</small><br/>
            Type: ${d.type}<br/>
            Category: ${d.category}<br/>
            Severity: ${d.severity}<br/>
            ${d.agentName ? `Agent: ${d.agentName}<br/>` : ''}
            ${d.description ? `<em>${d.description}</em><br/>` : ''}
            ${d.duration ? `Duration: ${d.duration}ms` : ''}
          `);

          const [mouseX, mouseY] = d3.pointer(event, document.body);
          tooltip
            .style('left', `${mouseX + 10}px`)
            .style('top', `${mouseY - 10}px`);
        })
        .on('mousemove', function(event) {
          const tooltip = d3.select('.timeline-tooltip');
          if (!tooltip.empty()) {
            const [mouseX, mouseY] = d3.pointer(event, document.body);
            tooltip
              .style('left', `${mouseX + 10}px`)
              .style('top', `${mouseY - 10}px`);
          }
        })
        .on('mouseleave', function() {
          d3.select(this)
            .transition()
            .duration(200)
            .attr('r', 5);

          setHoveredEvent(null);
          d3.select('.timeline-tooltip').remove();
        })
        .on('click', function(event, d) {
          event.stopPropagation();
          setSelectedEvent(d);
        });

      // Animate event appearance
      if (animationSpeed > 0) {
        events.transition()
          .duration(animationSpeed)
          .delay((d, i) => i * 50)
          .attr('r', 5);
      } else {
        events.attr('r', 5);
      }

      // Event duration bar (if available)
      events.filter(d => d.duration)
        .append('line')
        .attr('x1', 0)
        .attr('y1', 0)
        .attr('x2', 0)
        .attr('y2', 0)
        .style('stroke', d => colors.eventTypes[d.type])
        .style('stroke-width', 2)
        .style('opacity', 0.6)
        .transition()
        .duration(animationSpeed)
        .delay((d, i) => i * 50)
        .attr('x2', d => xScale(d.timestamp + d.duration) - xScale(d.timestamp));
    });

    // Add axes
    const xAxis = d3.axisBottom(xScale)
      .tickFormat(d => {
        const date = new Date(d as number);
        if (timeRange === '1h' || timeRange === '6h') {
          return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        } else {
          return date.toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit' });
        }
      });

    container.append('g')
      .attr('class', 'x-axis')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(xAxis)
      .style('color', colors.axis);

    const yAxis = d3.axisLeft(yScale);
    container.append('g')
      .attr('class', 'y-axis')
      .call(yAxis)
      .style('color', colors.axis);

    // Add current time indicator
    const currentTimeIndicator = container.append('line')
      .attr('class', 'current-time-indicator')
      .attr('x1', xScale(currentTime))
      .attr('y1', 0)
      .attr('x2', xScale(currentTime))
      .attr('y2', innerHeight)
      .attr('stroke', colors.highlight)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5')
      .style('opacity', 0.7);

    // Add current time label
    container.append('text')
      .attr('class', 'current-time-label')
      .attr('x', xScale(currentTime))
      .attr('y', -10)
      .attr('text-anchor', 'middle')
      .style('font-size', '12px')
      .style('fill', colors.highlight)
      .text('NOW');

    // Update current time indicator
    const updateCurrentTime = () => {
      const now = Date.now();
      currentTimeIndicator
        .transition()
        .duration(1000)
        .attr('x1', xScale(now))
        .attr('x2', xScale(now));

      container.select('.current-time-label')
        .transition()
        .duration(1000)
        .attr('x', xScale(now));
    };

    const interval = setInterval(updateCurrentTime, 1000);

    // Add title
    svg.append('text')
      .attr('x', width / 2)
      .attr('y', 30)
      .attr('text-anchor', 'middle')
      .style('font-size', '20px')
      .style('font-weight', 'bold')
      .style('fill', colors.text)
      .text('Event Timeline');

    // Add legend
    if (showCategories) {
      const legendGroup = svg.append('g')
        .attr('transform', `translate(${width - 200},${60})`);

      const eventTypes = Object.keys(colors.eventTypes);
      eventTypes.forEach((type, index) => {
        const legendItem = legendGroup.append('g')
          .attr('transform', `translate(0,${index * 20})`);

        legendItem.append('circle')
          .attr('r', 5)
          .style('fill', colors.eventTypes[type as keyof typeof colors.eventTypes]);

        legendItem.append('text')
          .attr('x', 15)
          .attr('y', 4)
          .style('font-size', '12px')
          .style('fill', colors.text)
          .text(type);
      });
    }

    return () => clearInterval(interval);
  }, [width, height, colors, getFilteredEvents, getGroupedEvents, showCategories, showAgents, currentTime, theme, animationSpeed]);

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => clearInterval(interval);
  }, [realTimeUpdates]);

  // Initialize timeline
  useEffect(() => {
    const cleanup = initializeTimeline();
    return cleanup;
  }, [initializeTimeline]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      initializeTimeline();
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [initializeTimeline]);

  return (
    <div className="event-timeline" style={{ width, height, background: colors.background, position: 'relative' }}>
      <svg
        ref={timelineRef}
        width={width}
        height={height}
        style={{ border: `1px solid ${colors.border}`, borderRadius: '8px' }}
      />

      {/* Controls */}
      <div
        className="timeline-controls"
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          gap: '10px',
        }}
      >
        <select
          value={timeRange}
          onChange={(e) => {
            // This would normally update the parent component
            console.log('Time range changed to:', e.target.value);
          }}
          style={{
            padding: '4px 8px',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            background: colors.background,
            color: colors.text,
            fontSize: '12px',
          }}
        >
          <option value="1h">Last Hour</option>
          <option value="6h">Last 6 Hours</option>
          <option value="24h">Last 24 Hours</option>
          <option value="7d">Last 7 Days</option>
          <option value="all">All Time</option>
        </select>

        <select
          value={groupingMode}
          onChange={(e) => {
            // This would normally update the parent component
            console.log('Grouping mode changed to:', e.target.value);
          }}
          style={{
            padding: '4px 8px',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            background: colors.background,
            color: colors.text,
            fontSize: '12px',
          }}
        >
          <option value="none">No Grouping</option>
          <option value="category">By Category</option>
          <option value="agent">By Agent</option>
          <option value="severity">By Severity</option>
        </select>
      </div>

      {/* Event details panel */}
      {selectedEvent && (
        <div
          className="event-details"
          style={{
            position: 'absolute',
            top: '60px',
            right: '10px',
            background: theme === 'dark' ? '#374151' : '#f9fafb',
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '16px',
            minWidth: '300px',
            maxHeight: '400px',
            overflowY: 'auto',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h3 style={{ margin: 0, color: colors.text }}>{selectedEvent.title}</h3>
            <button
              onClick={() => setSelectedEvent(null)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.text,
                fontSize: '18px',
                cursor: 'pointer',
                padding: '0',
                width: '24px',
                height: '24px',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <strong>Type:</strong>{' '}
            <span style={{ color: colors.eventTypes[selectedEvent.type] }}>
              {selectedEvent.type}
            </span>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <strong>Category:</strong>{' '}
            <span style={{ color: colors.categories[selectedEvent.category] }}>
              {selectedEvent.category}
            </span>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <strong>Severity:</strong>{' '}
            <span style={{ color: colors.severity[selectedEvent.severity] }}>
              {selectedEvent.severity}
            </span>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <strong>Time:</strong> {new Date(selectedEvent.timestamp).toLocaleString()}
          </div>

          {selectedEvent.agentName && (
            <div style={{ marginBottom: '8px' }}>
              <strong>Agent:</strong> {selectedEvent.agentName}
            </div>
          )}

          {selectedEvent.description && (
            <div style={{ marginBottom: '8px' }}>
              <strong>Description:</strong> {selectedEvent.description}
            </div>
          )}

          {selectedEvent.duration && (
            <div style={{ marginBottom: '8px' }}>
              <strong>Duration:</strong> {selectedEvent.duration}ms
            </div>
          )}

          {selectedEvent.metadata && Object.keys(selectedEvent.metadata).length > 0 && (
            <div style={{ marginBottom: '8px' }}>
              <strong>Metadata:</strong>
              <pre style={{ fontSize: '12px', margin: '4px 0', whiteSpace: 'pre-wrap' }}>
                {JSON.stringify(selectedEvent.metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Stats summary */}
      <div
        className="timeline-stats"
        style={{
          position: 'absolute',
          bottom: '10px',
          left: '10px',
          display: 'flex',
          gap: '20px',
          padding: '8px 12px',
          background: theme === 'dark' ? '#374151' : '#f9fafb',
          border: `1px solid ${colors.border}`,
          borderRadius: '4px',
          fontSize: '12px',
        }}
      >
        <div style={{ color: colors.text }}>
          Total Events: <strong>{getFilteredEvents().length}</strong>
        </div>
        <div style={{ color: colors.text }}>
          Time Range: <strong>{timeRange}</strong>
        </div>
        <div style={{ color: colors.text }}>
          Grouping: <strong>{groupingMode}</strong>
        </div>
      </div>
    </div>
  );
};