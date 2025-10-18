import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { D3ZoomEvent, ZoomBehavior } from 'd3';

export interface AgentNode {
  id: string;
  name: string;
  type: 'coordinator' | 'coder' | 'tester' | 'reviewer' | 'security-specialist' | 'architect' | 'backend-dev' | 'frontend-dev' | 'devops-engineer';
  status: 'active' | 'idle' | 'busy' | 'error';
  confidence?: number;
  taskCount?: number;
  metrics?: {
    successRate: number;
    avgResponseTime: number;
    tasksCompleted: number;
  };
  children?: AgentNode[];
  parentId?: string;
  position?: { x: number; y: number };
}

export interface AgentHierarchyTreeProps {
  data: AgentNode;
  width?: number;
  height?: number;
  onNodeClick?: (node: AgentNode) => void;
  onNodeHover?: (node: AgentNode | null) => void;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  theme?: 'light' | 'dark';
  showMetrics?: boolean;
  animationsEnabled?: boolean;
}

export const AgentHierarchyTree: React.FC<AgentHierarchyTreeProps> = ({
  data,
  width = 800,
  height = 600,
  onNodeClick,
  onNodeHover,
  realTimeUpdates = true,
  updateInterval = 5000,
  theme = 'light',
  showMetrics = true,
  animationsEnabled = true,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<AgentNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<AgentNode | null>(null);
  const simulationRef = useRef<d3.Simulation<AgentNode, undefined>>();
  const zoomRef = useRef<ZoomBehavior<SVGSVGElement, unknown>>();

  // Color schemes for different agent types and statuses
  const typeColors = {
    coordinator: '#6366f1',
    coder: '#10b981',
    tester: '#f59e0b',
    reviewer: '#8b5cf6',
    'security-specialist': '#ef4444',
    architect: '#3b82f6',
    'backend-dev': '#06b6d4',
    'frontend-dev': '#ec4899',
    'devops-engineer': '#84cc16',
  };

  const statusColors = {
    active: '#10b981',
    idle: '#6b7280',
    busy: '#f59e0b',
    error: '#ef4444',
  };

  const themeColors = {
    light: {
      background: '#ffffff',
      text: '#1f2937',
      border: '#e5e7eb',
      grid: '#f3f4f6',
    },
    dark: {
      background: '#1f2937',
      text: '#f9fafb',
      border: '#374151',
      grid: '#4b5563',
    },
  };

  const initializeVisualization = useCallback(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create container group for zoom/pan
    const container = svg.append('g').attr('class', 'container');

    // Setup zoom behavior
    zoomRef.current = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        container.attr('transform', event.transform);
      });

    svg.call(zoomRef.current);

    // Create force simulation
    simulationRef.current = d3
      .forceSimulation<AgentNode>()
      .force('link', d3.forceLink<AgentNode, AgentNode>().id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Add grid pattern
    const gridPattern = svg
      .append('defs')
      .append('pattern')
      .attr('id', 'grid')
      .attr('width', 20)
      .attr('height', 20)
      .attr('patternUnits', 'userSpaceOnUse');

    gridPattern
      .append('path')
      .attr('d', 'M 20 0 L 0 0 0 20')
      .attr('fill', 'none')
      .attr('stroke', themeColors[theme].grid)
      .attr('stroke-width', 0.5);

    // Add background with grid
    svg.insert('rect', ':first-child')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', themeColors[theme].background)
      .attr('stroke', themeColors[theme].border)
      .attr('stroke-width', 1);

    svg.insert('rect', ':nth-child(2)')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#grid)')
      .attr('opacity', 0.5);

    // Add gradient definitions for nodes
    const gradients = svg.append('defs').attr('class', 'gradients');

    Object.entries(typeColors).forEach(([type, color]) => {
      const gradient = gradients
        .append('linearGradient')
        .attr('id', `gradient-${type}`)
        .attr('x1', '0%')
        .attr('y1', '0%')
        .attr('x2', '100%')
        .attr('y2', '100%');

      gradient.append('stop').attr('offset', '0%').attr('stop-color', color).attr('stop-opacity', 0.8);
      gradient.append('stop').attr('offset', '100%').attr('stop-color', color).attr('stop-opacity', 1);
    });

    // Add shadow filter
    const filter = svg
      .append('defs')
      .append('filter')
      .attr('id', 'shadow')
      .attr('height', '130%');

    filter
      .append('feGaussianBlur')
      .attr('in', 'SourceAlpha')
      .attr('stdDeviation', 3);

    filter
      .append('feOffset')
      .attr('dx', 2)
      .attr('dy', 2)
      .attr('result', 'offsetblur');

    filter.append('feComponentTransfer').append('feFuncA').attr('type', 'linear').attr('slope', 0.3);

    filter.append('feMerge').append('feMergeNode');
    filter.append('feMerge').append('feMergeNode').attr('in', 'SourceGraphic');
  }, [width, height, theme, themeColors]);

  const updateVisualization = useCallback(
    (rootData: AgentNode) => {
      if (!svgRef.current || !simulationRef.current) return;

      const svg = d3.select(svgRef.current);
      const container = svg.select('.container');

      // Prepare hierarchical data
      const root = d3.hierarchy(rootData);
      const links = root.links();
      const nodes = root.descendants();

      // Create link elements
      const linkSelection = container
        .selectAll<SVGLineElement, d3.HierarchyLink<AgentNode>>('.link')
        .data(links, (d) => `${d.source.data.id}-${d.target.data.id}`);

      linkSelection.exit().remove();

      const linkEnter = linkSelection
        .enter()
        .append('line')
        .attr('class', 'link')
        .attr('stroke', themeColors[theme].border)
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.6);

      const linkUpdate = linkEnter.merge(linkSelection);

      // Create node groups
      const nodeSelection = container
        .selectAll<SVGGElement, d3.HierarchyNode<AgentNode>>('.node')
        .data(nodes, (d) => d.data.id);

      nodeSelection.exit().remove();

      const nodeEnter = nodeSelection
        .enter()
        .append('g')
        .attr('class', 'node')
        .attr('cursor', 'pointer')
        .on('click', (event, d) => {
          event.stopPropagation();
          setSelectedNode(d.data);
          onNodeClick?.(d.data);
        })
        .on('mouseenter', (event, d) => {
          setHoveredNode(d.data);
          onNodeHover?.(d.data);
        })
        .on('mouseleave', () => {
          setHoveredNode(null);
          onNodeHover?.(null);
        });

      // Add node circles
      nodeEnter
        .append('circle')
        .attr('r', 20)
        .attr('fill', (d) => `url(#gradient-${d.data.type})`)
        .attr('stroke', (d) => statusColors[d.data.status])
        .attr('stroke-width', 3)
        .attr('filter', 'url(#shadow)');

      // Add node icons/symbols
      nodeEnter
        .append('text')
        .attr('class', 'node-icon')
        .attr('text-anchor', 'middle')
        .attr('dy', '.35em')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '12px')
        .attr('fill', 'white')
        .attr('font-weight', 'bold')
        .text((d) => d.data.type.charAt(0).toUpperCase());

      // Add node labels
      nodeEnter
        .append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '2.5em')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '12px')
        .attr('fill', themeColors[theme].text)
        .text((d) => d.data.name);

      // Add confidence indicator
      if (showMetrics) {
        nodeEnter
          .append('circle')
          .attr('class', 'confidence-indicator')
          .attr('r', 5)
          .attr('cx', 15)
          .attr('cy', -15)
          .attr('fill', (d) => {
            const confidence = d.data.confidence || 0;
            if (confidence >= 0.9) return '#10b981';
            if (confidence >= 0.75) return '#f59e0b';
            return '#ef4444';
          })
          .attr('stroke', 'white')
          .attr('stroke-width', 1);
      }

      const nodeUpdate = nodeEnter.merge(nodeSelection);

      // Update positions with animation
      if (animationsEnabled) {
        nodeUpdate.transition().duration(750).attr('transform', (d) => `translate(${d.x},${d.y})`);
        linkUpdate
          .transition()
          .duration(750)
          .attr('x1', (d) => d.source.x || 0)
          .attr('y1', (d) => d.source.y || 0)
          .attr('x2', (d) => d.target.x || 0)
          .attr('y2', (d) => d.target.y || 0);
      } else {
        nodeUpdate.attr('transform', (d) => `translate(${d.x},${d.y})`);
        linkUpdate
          .attr('x1', (d) => d.source.x || 0)
          .attr('y1', (d) => d.source.y || 0)
          .attr('x2', (d) => d.target.x || 0)
          .attr('y2', (d) => d.target.y || 0);
      }

      // Update simulation
      simulationRef.current.nodes(nodes.map((d) => d.data));
      simulationRef.current.force<d3.ForceLink<AgentNode, AgentNode>>('link')?.links(links);
      simulationRef.current.alpha(0.3).restart();

      simulationRef.current.on('tick', () => {
        nodeUpdate.attr('transform', (d) => `translate(${d.x},${d.y})`);
        linkUpdate
          .attr('x1', (d) => d.source.x || 0)
          .attr('y1', (d) => d.source.y || 0)
          .attr('x2', (d) => d.target.x || 0)
          .attr('y2', (d) => d.target.y || 0);
      });

      // Highlight selected node
      nodeUpdate.select('circle').attr('stroke-width', (d) =>
        selectedNode?.id === d.data.id ? 5 : 3,
      );

      // Add hover effect
      nodeUpdate
        .on('mouseenter', function() {
          d3.select(this).select('circle').attr('stroke-width', 5);
        })
        .on('mouseleave', function() {
          d3.select(this).select('circle').attr('stroke-width', (d) =>
            selectedNode?.id === d.data.id ? 5 : 3,
          );
        });
    },
    [selectedNode, onNodeClick, onNodeHover, showMetrics, animationsEnabled, theme, themeColors],
  );

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates) return;

    const interval = setInterval(() => {
      // Simulate real-time data updates
      const updateNodeData = (node: AgentNode): AgentNode => {
        const updated = { ...node };
        if (Math.random() > 0.7) {
          updated.confidence = Math.max(0, Math.min(1, (updated.confidence || 0.8) + (Math.random() - 0.5) * 0.2));
          updated.status = ['active', 'idle', 'busy', 'error'][Math.floor(Math.random() * 4)] as AgentNode['status'];
        }
        if (updated.children) {
          updated.children = updated.children.map(updateNodeData);
        }
        return updated;
      };

      const updatedData = updateNodeData(data);
      updateVisualization(updatedData);
    }, updateInterval);

    return () => clearInterval(interval);
  }, [realTimeUpdates, updateInterval, data, updateVisualization]);

  // Initialize and update visualization
  useEffect(() => {
    initializeVisualization();
    updateVisualization(data);
  }, [data, initializeVisualization, updateVisualization]);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      const container = svgRef.current?.parentElement;
      if (container) {
        const newWidth = container.clientWidth;
        const newHeight = container.clientHeight;
        if (newWidth !== width || newHeight !== height) {
          initializeVisualization();
          updateVisualization(data);
        }
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [width, height, data, initializeVisualization, updateVisualization]);

  return (
    <div className="agent-hierarchy-tree" style={{ width, height, position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ border: `1px solid ${themeColors[theme].border}`, borderRadius: '8px' }}
      />

      {/* Legend */}
      <div
        className="legend"
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          background: themeColors[theme].background,
          border: `1px solid ${themeColors[theme].border}`,
          borderRadius: '4px',
          padding: '8px',
          fontSize: '12px',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Agent Types</div>
        {Object.entries(typeColors).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: color,
                marginRight: '4px',
                borderRadius: '2px',
              }}
            />
            <span style={{ color: themeColors[theme].text }}>{type}</span>
          </div>
        ))}

        <div style={{ fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' }}>Status</div>
        {Object.entries(statusColors).map(([status, color]) => (
          <div key={status} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: color,
                marginRight: '4px',
                borderRadius: '2px',
              }}
            />
            <span style={{ color: themeColors[theme].text }}>{status}</span>
          </div>
        ))}
      </div>

      {/* Node details panel */}
      {selectedNode && (
        <div
          className="node-details"
          style={{
            position: 'absolute',
            top: '10px',
            right: '10px',
            background: themeColors[theme].background,
            border: `1px solid ${themeColors[theme].border}`,
            borderRadius: '4px',
            padding: '12px',
            fontSize: '12px',
            minWidth: '200px',
          }}
        >
          <div style={{ fontWeight: 'bold', marginBottom: '8px' }}>{selectedNode.name}</div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Type:</strong> {selectedNode.type}
          </div>
          <div style={{ marginBottom: '4px' }}>
            <strong>Status:</strong>{' '}
            <span style={{ color: statusColors[selectedNode.status] }}>{selectedNode.status}</span>
          </div>
          {selectedNode.confidence && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Confidence:</strong> {(selectedNode.confidence * 100).toFixed(1)}%
            </div>
          )}
          {selectedNode.taskCount && (
            <div style={{ marginBottom: '4px' }}>
              <strong>Tasks:</strong> {selectedNode.taskCount}
            </div>
          )}
          {selectedNode.metrics && (
            <>
              <div style={{ marginBottom: '4px' }}>
                <strong>Success Rate:</strong> {(selectedNode.metrics.successRate * 100).toFixed(1)}%
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Avg Response:</strong> {selectedNode.metrics.avgResponseTime}ms
              </div>
              <div style={{ marginBottom: '4px' }}>
                <strong>Completed:</strong> {selectedNode.metrics.tasksCompleted}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};