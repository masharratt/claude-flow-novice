import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import type { D3ZoomEvent, ZoomBehavior } from 'd3';

export interface NetworkNode {
  id: string;
  name: string;
  type: 'coordinator' | 'coder' | 'tester' | 'reviewer' | 'security-specialist' | 'architect' | 'backend-dev' | 'frontend-dev' | 'devops-engineer';
  status: 'active' | 'idle' | 'busy' | 'error';
  performance: {
    successRate: number;
    avgResponseTime: number;
    tasksCompleted: number;
    confidence: number;
    throughput: number;
  };
  position?: { x: number; y: number };
  group?: string;
  metadata?: Record<string, any>;
}

export interface NetworkLink {
  source: string;
  target: string;
  type: 'communication' | 'dependency' | 'collaboration' | 'hierarchy' | 'data-flow';
  strength: number; // 0-1
  frequency: number; // messages per minute
  latency: number; // ms
  protocol?: string;
  status: 'active' | 'idle' | 'error';
  metadata?: Record<string, any>;
}

export interface NetworkCluster {
  id: string;
  name: string;
  type: 'team' | 'project' | 'workflow' | 'system';
  nodes: string[];
  color: string;
  performance: {
    avgSuccessRate: number;
    avgResponseTime: number;
    totalTasks: number;
  };
}

export interface AgentNetworkTopologyProps {
  nodes: NetworkNode[];
  links: NetworkLink[];
  clusters?: NetworkCluster[];
  width?: number;
  height?: number;
  realTimeUpdates?: boolean;
  updateInterval?: number;
  theme?: 'light' | 'dark';
  showLabels?: boolean;
  showMetrics?: boolean;
  layoutType?: 'force' | 'hierarchical' | 'circular' | 'clustered';
  animationSpeed?: number;
  clusteringEnabled?: boolean;
  metricsMode?: 'performance' | 'traffic' | 'health' | 'none';
}

export const AgentNetworkTopology: React.FC<AgentNetworkTopologyProps> = ({
  nodes,
  links,
  clusters = [],
  width = 1000,
  height = 600,
  realTimeUpdates = true,
  updateInterval = 5000,
  theme = 'light',
  showLabels = true,
  showMetrics = true,
  layoutType = 'force',
  animationSpeed = 750,
  clusteringEnabled = true,
  metricsMode = 'performance',
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const [selectedNode, setSelectedNode] = useState<NetworkNode | null>(null);
  const [selectedLink, setSelectedLink] = useState<NetworkLink | null>(null);
  const [hoveredNode, setHoveredNode] = useState<NetworkNode | null>(null);
  const [simulation, setSimulation] = useState<d3.Simulation<NetworkNode, NetworkLink> | null>(null);
  const [zoomTransform, setZoomTransform] = useState<d3.ZoomTransform | null>(null);

  const themeColors = {
    light: {
      background: '#ffffff',
      text: '#1f2937',
      border: '#e5e7eb',
      grid: '#f3f4f6',
      nodeTypes: {
        coordinator: '#6366f1',
        coder: '#10b981',
        tester: '#f59e0b',
        reviewer: '#8b5cf6',
        'security-specialist': '#ef4444',
        architect: '#3b82f6',
        'backend-dev': '#06b6d4',
        'frontend-dev': '#ec4899',
        'devops-engineer': '#84cc16',
      },
      status: {
        active: '#10b981',
        idle: '#6b7280',
        busy: '#f59e0b',
        error: '#ef4444',
      },
      linkTypes: {
        communication: '#3b82f6',
        dependency: '#8b5cf6',
        collaboration: '#10b981',
        hierarchy: '#ef4444',
        'data-flow': '#06b6d4',
      },
      clusterColors: ['#fef3c7', '#dbeafe', '#dcfce7', '#fce7f3', '#e0e7ff', '#fed7aa'],
    },
    dark: {
      background: '#1f2937',
      text: '#f9fafb',
      border: '#374151',
      grid: '#4b5563',
      nodeTypes: {
        coordinator: '#818cf8',
        coder: '#34d399',
        tester: '#fbbf24',
        reviewer: '#a78bfa',
        'security-specialist': '#f87171',
        architect: '#60a5fa',
        'backend-dev': '#22d3ee',
        'frontend-dev': '#f472b6',
        'devops-engineer': '#bef264',
      },
      status: {
        active: '#34d399',
        idle: '#9ca3af',
        busy: '#fbbf24',
        error: '#f87171',
      },
      linkTypes: {
        communication: '#60a5fa',
        dependency: '#a78bfa',
        collaboration: '#34d399',
        hierarchy: '#f87171',
        'data-flow': '#22d3ee',
      },
      clusterColors: ['#78350f', '#1e3a8a', '#14532d', '#831843', '#312e81', '#9a3412'],
    },
  };

  const colors = themeColors[theme];

  const getNodeColor = useCallback((node: NetworkNode) => {
    if (metricsMode === 'health') {
      return colors.status[node.status];
    }
    if (metricsMode === 'performance') {
      const performance = node.performance.successRate;
      if (performance >= 0.9) return colors.status.active;
      if (performance >= 0.7) return colors.status.busy;
      return colors.status.error;
    }
    return colors.nodeTypes[node.type];
  }, [colors, metricsMode]);

  const getLinkColor = useCallback((link: NetworkLink) => {
    if (metricsMode === 'traffic') {
      const traffic = link.frequency;
      if (traffic > 10) return colors.linkTypes.communication;
      if (traffic > 5) return colors.linkTypes.collaboration;
      return colors.linkTypes.dependency;
    }
    return colors.linkTypes[link.type];
  }, [colors, metricsMode]);

  const initializeSimulation = useCallback(() => {
    if (!svgRef.current) return null;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Create container group for zoom/pan
    const container = svg.append('g').attr('class', 'container');

    // Setup zoom behavior
    const zoom = d3
      .zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event: D3ZoomEvent<SVGSVGElement, unknown>) => {
        container.attr('transform', event.transform);
        setZoomTransform(event.transform);
      });

    svg.call(zoom);

    // Add background
    svg.insert('rect', ':first-child')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', colors.background)
      .attr('stroke', colors.border)
      .attr('stroke-width', 1);

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
      .attr('stroke', colors.grid)
      .attr('stroke-width', 0.5);

    svg.insert('rect', ':nth-child(2)')
      .attr('width', width)
      .attr('height', height)
      .attr('fill', 'url(#grid)')
      .attr('opacity', 0.5);

    // Create force simulation
    const sim = d3
      .forceSimulation<NetworkNode>()
      .force('link', d3.forceLink<NetworkNode, NetworkLink>().id((d) => d.id).distance(100))
      .force('charge', d3.forceManyBody().strength(-300))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    if (clusteringEnabled && clusters.length > 0) {
      // Add clustering forces
      sim.force('cluster', d3.forceCluster().centers((d) => {
        const cluster = clusters.find(c => c.nodes.includes(d.id));
        if (cluster) {
          return {
            x: Math.random() * width,
            y: Math.random() * height,
          };
        }
        return { x: width / 2, y: height / 2 };
      }).strength(0.5));
    }

    return { simulation: sim, container, zoom };
  }, [width, height, colors, clusteringEnabled, clusters]);

  const updateNetwork = useCallback((sim: d3.Simulation<NetworkNode, NetworkLink>, container: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    // Update nodes
    const nodeSelection = container
      .selectAll<SVGGElement, NetworkNode>('.node')
      .data(nodes, (d) => d.id);

    nodeSelection.exit().remove();

    const nodeEnter = nodeSelection
      .enter()
      .append('g')
      .attr('class', 'node')
      .attr('cursor', 'pointer')
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedNode(d);
      })
      .on('mouseenter', (event, d) => {
        setHoveredNode(d);
      })
      .on('mouseleave', () => {
        setHoveredNode(null);
      })
      .call(d3.drag<SVGGElement, NetworkNode>()
        .on('start', function(event, d) {
          if (!event.active) sim.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', function(event, d) {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', function(event, d) {
          if (!event.active) sim.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        }) as any);

    // Add node circles
    nodeEnter
      .append('circle')
      .attr('r', 20)
      .attr('fill', (d) => getNodeColor(d))
      .attr('stroke', (d) => colors.status[d.status])
      .attr('stroke-width', 3)
      .attr('opacity', 0.8);

    // Add performance rings (if metrics are shown)
    if (showMetrics && metricsMode !== 'none') {
      nodeEnter
        .append('circle')
        .attr('class', 'performance-ring')
        .attr('r', 0)
        .attr('fill', 'none')
        .attr('stroke', (d) => getNodeColor(d))
        .attr('stroke-width', 2)
        .attr('stroke-opacity', 0.5)
        .transition()
        .duration(animationSpeed)
        .attr('r', (d) => 20 + d.performance.throughput / 10);
    }

    // Add node icons
    nodeEnter
      .append('text')
      .attr('class', 'node-icon')
      .attr('text-anchor', 'middle')
      .attr('dy', '.35em')
      .attr('font-family', 'Arial, sans-serif')
      .attr('font-size', '12px')
      .attr('fill', 'white')
      .attr('font-weight', 'bold')
      .text((d) => d.type.charAt(0).toUpperCase());

    // Add labels
    if (showLabels) {
      nodeEnter
        .append('text')
        .attr('class', 'node-label')
        .attr('text-anchor', 'middle')
        .attr('dy', '2.5em')
        .attr('font-family', 'Arial, sans-serif')
        .attr('font-size', '10px')
        .attr('fill', colors.text)
        .text((d) => d.name.length > 10 ? d.name.substring(0, 10) + '...' : d.name);
    }

    const nodeUpdate = nodeEnter.merge(nodeSelection);

    // Update links
    const linkSelection = container
      .selectAll<SVGLineElement, NetworkLink>('.link')
      .data(links, (d) => `${d.source}-${d.target}`);

    linkSelection.exit().remove();

    const linkEnter = linkSelection
      .enter()
      .insert('line', '.node')
      .attr('class', 'link')
      .attr('stroke', (d) => getLinkColor(d))
      .attr('stroke-width', (d) => Math.max(1, d.strength * 5))
      .attr('stroke-opacity', 0.6)
      .on('click', (event, d) => {
        event.stopPropagation();
        setSelectedLink(d);
      })
      .on('mouseenter', function() {
        d3.select(this).attr('stroke-opacity', 1);
      })
      .on('mouseleave', function() {
        d3.select(this).attr('stroke-opacity', 0.6);
      });

    const linkUpdate = linkEnter.merge(linkSelection);

    // Add animated pulse for active links
    if (metricsMode === 'traffic') {
      linkUpdate
        .filter(d => d.status === 'active' && d.frequency > 0)
        .append('animate')
        .attr('attributeName', 'stroke-opacity')
        .attr('values', '0.6;1;0.6')
        .attr('dur', `${Math.max(1000, 10000 / d.frequency)}ms`)
        .attr('repeatCount', 'indefinite');
    }

    // Update simulation
    sim.nodes(nodes);
    sim.force<d3.ForceLink<NetworkNode, NetworkLink>>('link')?.links(links);
    sim.alpha(0.3).restart();

    sim.on('tick', () => {
      linkUpdate
        .attr('x1', (d) => (d.source as NetworkNode).x || 0)
        .attr('y1', (d) => (d.source as NetworkNode).y || 0)
        .attr('x2', (d) => (d.target as NetworkNode).x || 0)
        .attr('y2', (d) => (d.target as NetworkNode).y || 0);

      nodeUpdate.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Highlight selected node
    nodeUpdate.select('circle').attr('stroke-width', (d) =>
      selectedNode?.id === d.id ? 5 : 3,
    );

    // Add hover effects
    nodeUpdate
      .on('mouseenter', function() {
        d3.select(this).select('circle').attr('stroke-width', 5).attr('opacity', 1);
      })
      .on('mouseleave', function() {
        d3.select(this).select('circle')
          .attr('stroke-width', (d) => selectedNode?.id === d.id ? 5 : 3)
          .attr('opacity', 0.8);
      });

    return { nodeUpdate, linkUpdate };
  }, [nodes, links, selectedNode, showLabels, showMetrics, metricsMode, getNodeColor, getLinkColor, colors, animationSpeed]);

  // Initialize and update network
  useEffect(() => {
    const simResult = initializeSimulation();
    if (!simResult) return;

    const { simulation: sim, container } = simResult;
    setSimulation(sim);

    const cleanup = updateNetwork(sim, container);

    return () => {
      sim.stop();
    };
  }, [initializeSimulation, updateNetwork]);

  // Handle real-time updates
  useEffect(() => {
    if (!realTimeUpdates || !simulation) return;

    const interval = setInterval(() => {
      // Simulate real-time data updates
      const updateNodeData = (node: NetworkNode): NetworkNode => {
        const updated = { ...node };
        updated.performance.successRate = Math.max(0, Math.min(1, updated.performance.successRate + (Math.random() - 0.5) * 0.1));
        updated.performance.confidence = Math.max(0, Math.min(1, updated.performance.confidence + (Math.random() - 0.5) * 0.1));
        updated.status = ['active', 'idle', 'busy', 'error'][Math.floor(Math.random() * 4)] as NetworkNode['status'];
        return updated;
      };

      const updateLinkData = (link: NetworkLink): NetworkLink => {
        const updated = { ...link };
        updated.frequency = Math.max(0, updated.frequency + (Math.random() - 0.5) * 2);
        updated.latency = Math.max(0, updated.latency + (Math.random() - 0.5) * 50);
        return updated;
      };

      // Update simulation with new data
      simulation.nodes(nodes.map(updateNodeData));
      simulation.force<d3.ForceLink<NetworkNode, NetworkLink>>('link')?.links(links.map(updateLinkData));
      simulation.alpha(0.1).restart();
    }, updateInterval);

    return () => clearInterval(interval);
  }, [realTimeUpdates, updateInterval, simulation, nodes, links]);

  const handleExportNetwork = useCallback(() => {
    if (!svgRef.current) return;

    const svgData = new XMLSerializer().serializeToString(svgRef.current);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    img.onload = () => {
      canvas.width = width;
      canvas.height = height;
      ctx?.drawImage(img, 0, 0);

      const link = document.createElement('a');
      link.download = `agent-network-topology-${Date.now()}.png`;
      link.href = canvas.toDataURL();
      link.click();
    };

    img.src = 'data:image/svg+xml;base64,' + btoa(svgData);
  }, [width, height]);

  const handleResetView = useCallback(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    svg.transition()
      .duration(750)
      .call(
        d3.zoom<SVGSVGElement, unknown>().transform,
        d3.zoomIdentity
      );
  }, []);

  return (
    <div className="agent-network-topology" style={{ width, height, background: colors.background, position: 'relative' }}>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ border: `1px solid ${colors.border}`, borderRadius: '8px' }}
      />

      {/* Controls */}
      <div
        className="network-controls"
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          display: 'flex',
          gap: '10px',
          flexWrap: 'wrap',
        }}
      >
        <select
          value={metricsMode}
          onChange={(e) => {
            // This would normally update the parent component
            console.log('Metrics mode changed to:', e.target.value);
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
          <option value="none">No Metrics</option>
          <option value="performance">Performance</option>
          <option value="traffic">Traffic</option>
          <option value="health">Health</option>
        </select>

        <button
          onClick={handleExportNetwork}
          style={{
            padding: '4px 8px',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            background: colors.nodeTypes.coordinator,
            color: '#ffffff',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Export
        </button>

        <button
          onClick={handleResetView}
          style={{
            padding: '4px 8px',
            border: `1px solid ${colors.border}`,
            borderRadius: '4px',
            background: colors.nodeTypes.coder,
            color: '#ffffff',
            fontSize: '12px',
            cursor: 'pointer',
          }}
        >
          Reset View
        </button>
      </div>

      {/* Legend */}
      <div
        className="network-legend"
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          background: theme === 'dark' ? '#374151' : '#f9fafb',
          border: `1px solid ${colors.border}`,
          borderRadius: '4px',
          padding: '8px',
          fontSize: '12px',
        }}
      >
        <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>Node Types</div>
        {Object.entries(colors.nodeTypes).slice(0, 5).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            <div
              style={{
                width: '12px',
                height: '12px',
                backgroundColor: color,
                marginRight: '4px',
                borderRadius: '50%',
              }}
            />
            <span style={{ color: colors.text }}>{type}</span>
          </div>
        ))}

        <div style={{ fontWeight: 'bold', marginTop: '8px', marginBottom: '4px' }}>Link Types</div>
        {Object.entries(colors.linkTypes).slice(0, 3).map(([type, color]) => (
          <div key={type} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            <div
              style={{
                width: '12px',
                height: '2px',
                backgroundColor: color,
                marginRight: '4px',
              }}
            />
            <span style={{ color: colors.text }}>{type}</span>
          </div>
        ))}
      </div>

      {/* Node details panel */}
      {selectedNode && (
        <div
          className="node-details"
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            background: theme === 'dark' ? '#374151' : '#f9fafb',
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '12px',
            minWidth: '250px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: colors.text }}>{selectedNode.name}</h3>
            <button
              onClick={() => setSelectedNode(null)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.text,
                fontSize: '16px',
                cursor: 'pointer',
                padding: '0',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Type:</strong> {selectedNode.type}
          </div>
          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Status:</strong>{' '}
            <span style={{ color: colors.status[selectedNode.status] }}>
              {selectedNode.status}
            </span>
          </div>

          {showMetrics && (
            <>
              <div style={{ marginBottom: '4px', fontSize: '12px' }}>
                <strong>Success Rate:</strong> {(selectedNode.performance.successRate * 100).toFixed(1)}%
              </div>
              <div style={{ marginBottom: '4px', fontSize: '12px' }}>
                <strong>Confidence:</strong> {(selectedNode.performance.confidence * 100).toFixed(1)}%
              </div>
              <div style={{ marginBottom: '4px', fontSize: '12px' }}>
                <strong>Response Time:</strong> {selectedNode.performance.avgResponseTime}ms
              </div>
              <div style={{ marginBottom: '4px', fontSize: '12px' }}>
                <strong>Tasks Completed:</strong> {selectedNode.performance.tasksCompleted}
              </div>
              <div style={{ marginBottom: '4px', fontSize: '12px' }}>
                <strong>Throughput:</strong> {selectedNode.performance.throughput.toFixed(2)}
              </div>
            </>
          )}
        </div>
      )}

      {/* Link details panel */}
      {selectedLink && (
        <div
          className="link-details"
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            background: theme === 'dark' ? '#374151' : '#f9fafb',
            border: `1px solid ${colors.border}`,
            borderRadius: '8px',
            padding: '12px',
            minWidth: '200px',
            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h3 style={{ margin: 0, color: colors.text }}>Connection</h3>
            <button
              onClick={() => setSelectedLink(null)}
              style={{
                background: 'none',
                border: 'none',
                color: colors.text,
                fontSize: '16px',
                cursor: 'pointer',
                padding: '0',
              }}
            >
              ×
            </button>
          </div>

          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Type:</strong> {selectedLink.type}
          </div>
          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Status:</strong> {selectedLink.status}
          </div>
          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Strength:</strong> {(selectedLink.strength * 100).toFixed(1)}%
          </div>
          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Frequency:</strong> {selectedLink.frequency.toFixed(2)}/min
          </div>
          <div style={{ marginBottom: '4px', fontSize: '12px' }}>
            <strong>Latency:</strong> {selectedLink.latency}ms
          </div>
          {selectedLink.protocol && (
            <div style={{ marginBottom: '4px', fontSize: '12px' }}>
              <strong>Protocol:</strong> {selectedLink.protocol}
            </div>
          )}
        </div>
      )}

      {/* Network stats */}
      <div
        className="network-stats"
        style={{
          position: 'absolute',
          top: '60px',
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
          Nodes: <strong>{nodes.length}</strong>
        </div>
        <div style={{ color: colors.text }}>
          Links: <strong>{links.length}</strong>
        </div>
        <div style={{ color: colors.text }}>
          Clusters: <strong>{clusters.length}</strong>
        </div>
      </div>
    </div>
  );
};

// D3 force cluster implementation
function d3ForceCluster() {
  let nodes: any[] = [];
  let centers: ((d: any) => { x: number; y: number }) | undefined;
  let strength = 0.1;

  function force(alpha: number) {
    if (!centers) return;

    for (let i = 0; i < nodes.length; i++) {
      const node = nodes[i];
      const center = centers(node);
      if (center) {
        node.x += (center.x - node.x) * strength * alpha;
        node.y += (center.y - node.y) * strength * alpha;
      }
    }
  }

  force.initialize = function(_nodes: any[]) {
    nodes = _nodes;
  };

  force.centers = function(_centers: ((d: any) => { x: number; y: number }) | undefined) {
    if (!arguments.length) return centers;
    centers = _centers;
    return force;
  };

  force.strength = function(_strength: number) {
    if (!arguments.length) return strength;
    strength = _strength;
    return force;
  };

  return force;
}