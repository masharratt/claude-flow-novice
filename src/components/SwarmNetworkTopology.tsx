import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  Maximize2,
  Settings,
  Download,
  Play,
  Pause
} from 'lucide-react';

interface AgentNode {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'processing' | 'error';
  confidence: number;
  currentTask?: string;
  processingTime: number;
  memoryUsage: number;
  lastUpdate: Date;
  position: { x: number; y: number };
  velocity?: { x: number; y: number };
  connections: string[];
}

interface TaskNode {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo: string[];
  progress: number;
  position: { x: number; y: number };
}

interface Connection {
  source: string;
  target: string;
  strength: number;
  type: 'collaboration' | 'dependency' | 'assignment';
  animated?: boolean;
}

interface SwarmNetworkTopologyProps {
  agents: AgentNode[];
  tasks: TaskNode[];
  onAgentClick?: (agent: AgentNode) => void;
  onTaskClick?: (task: TaskNode) => void;
  width?: number;
  height?: number;
  className?: string;
  realtime?: boolean;
}

const SwarmNetworkTopology: React.FC<SwarmNetworkTopologyProps> = ({
  agents,
  tasks,
  onAgentClick,
  onTaskClick,
  width = 800,
  height = 600,
  className,
  realtime = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [showConnections, setShowConnections] = useState(true);
  const [layoutMode, setLayoutMode] = useState<'force' | 'hierarchical' | 'circular'>('force');

  // Generate connections based on task assignments and agent collaborations
  const connections = useMemo(() => {
    const conns: Connection[] = [];

    // Task assignment connections
    tasks.forEach(task => {
      task.assignedTo.forEach(agentId => {
        conns.push({
          source: task.id,
          target: agentId,
          strength: 0.8,
          type: 'assignment',
          animated: task.status === 'in-progress'
        });
      });
    });

    // Agent collaboration connections (agents working on related tasks)
    agents.forEach(agent1 => {
      agents.forEach(agent2 => {
        if (agent1.id < agent2.id) {
          const hasCommonTask = tasks.some(task =>
            task.assignedTo.includes(agent1.id) && task.assignedTo.includes(agent2.id)
          );
          if (hasCommonTask) {
            conns.push({
              source: agent1.id,
              target: agent2.id,
              strength: 0.6,
              type: 'collaboration',
              animated: agent1.status === 'processing' || agent2.status === 'processing'
            });
          }
        }
      });
    });

    return conns;
  }, [agents, tasks]);

  // Force simulation for layout
  const applyForceLayout = useCallback(() => {
    const updatedAgents = [...agents];
    const centerX = width / 2;
    const centerY = height / 2;

    // Apply different layout strategies
    switch (layoutMode) {
      case 'force':
        // Force-directed layout
        for (let i = 0; i < updatedAgents.length; i++) {
          const agent = updatedAgents[i];
          let fx = 0, fy = 0;

          // Repulsion between agents
          for (let j = 0; j < updatedAgents.length; j++) {
            if (i !== j) {
              const other = updatedAgents[j];
              const dx = agent.position.x - other.position.x;
              const dy = agent.position.y - other.position.y;
              const distance = Math.sqrt(dx * dx + dy * dy) || 1;
              const force = 1000 / (distance * distance);
              fx += (dx / distance) * force;
              fy += (dy / distance) * force;
            }
          }

          // Attraction to center
          const dx = centerX - agent.position.x;
          const dy = centerY - agent.position.y;
          fx += dx * 0.01;
          fy += dy * 0.01;

          // Apply forces
          if (!agent.velocity) {
            agent.velocity = { x: 0, y: 0 };
          }
          agent.velocity.x = (agent.velocity.x + fx) * 0.8;
          agent.velocity.y = (agent.velocity.y + fy) * 0.8;

          // Update position
          agent.position.x += agent.velocity.x;
          agent.position.y += agent.velocity.y;

          // Keep within bounds
          agent.position.x = Math.max(50, Math.min(width - 50, agent.position.x));
          agent.position.y = Math.max(50, Math.min(height - 50, agent.position.y));
        }
        break;

      case 'hierarchical':
        // Hierarchical layout based on roles
        const roleHierarchy = {
          'architect': 0,
          'backend-dev': 1,
          'frontend-dev': 1,
          'ui-designer': 2,
          'perf-analyzer': 2,
          'tester': 3,
          'reviewer': 3
        };

        updatedAgents.forEach((agent, index) => {
          const level = roleHierarchy[agent.role as keyof typeof roleHierarchy] || 2;
          const levelCount = updatedAgents.filter(a =>
            roleHierarchy[a.role as keyof typeof roleHierarchy] === level
          ).length;
          const levelIndex = updatedAgents.slice(0, index + 1).filter(a =>
            roleHierarchy[a.role as keyof typeof roleHierarchy] === level
          ).length - 1;

          agent.position.x = (width / (levelCount + 1)) * (levelIndex + 1);
          agent.position.y = 100 + level * 120;
        });
        break;

      case 'circular':
        // Circular layout
        updatedAgents.forEach((agent, index) => {
          const angle = (index / updatedAgents.length) * 2 * Math.PI;
          const radius = Math.min(width, height) * 0.3;
          agent.position.x = centerX + Math.cos(angle) * radius;
          agent.position.y = centerY + Math.sin(angle) * radius;
        });
        break;
    }

    return updatedAgents;
  }, [agents, width, height, layoutMode]);

  // Update positions with animation
  useEffect(() => {
    if (isAnimating && layoutMode === 'force') {
      const interval = setInterval(() => {
        applyForceLayout();
      }, 50);

      return () => clearInterval(interval);
    }
  }, [isAnimating, layoutMode, applyForceLayout]);

  // Draw the network
  const drawNetwork = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Apply transformations
    ctx.save();
    ctx.translate(offset.x, offset.y);
    ctx.scale(scale, scale);

    // Draw connections
    if (showConnections) {
      connections.forEach(conn => {
        const sourceNode = agents.find(a => a.id === conn.source) || tasks.find(t => t.id === conn.source);
        const targetNode = agents.find(a => a.id === conn.target) || tasks.find(t => t.id === conn.target);

        if (sourceNode && targetNode) {
          ctx.beginPath();
          ctx.moveTo(sourceNode.position.x, sourceNode.position.y);
          ctx.lineTo(targetNode.position.x, targetNode.position.y);

          // Connection styling based on type
          switch (conn.type) {
            case 'assignment':
              ctx.strokeStyle = `rgba(59, 130, 246, ${conn.strength})`; // Blue
              ctx.setLineDash([5, 5]);
              break;
            case 'collaboration':
              ctx.strokeStyle = `rgba(34, 197, 94, ${conn.strength})`; // Green
              ctx.setLineDash([]);
              break;
            case 'dependency':
              ctx.strokeStyle = `rgba(168, 85, 247, ${conn.strength})`; // Purple
              ctx.setLineDash([2, 2]);
              break;
          }

          ctx.lineWidth = conn.animated ? 2 : 1;
          ctx.stroke();

          // Animated effect
          if (conn.animated && realtime) {
            const dashOffset = (Date.now() / 10) % 10;
            ctx.setLineDash([5, 5]);
            ctx.lineDashOffset = -dashOffset;
            ctx.stroke();
          }

          ctx.setLineDash([]);
        }
      });
    }

    // Draw task nodes
    tasks.forEach(task => {
      const { x, y } = task.position;
      const isSelected = selectedNode === task.id;
      const isHovered = hoveredNode === task.id;

      // Task node circle
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 25 : 20, 0, 2 * Math.PI);

      // Color based on status
      switch (task.status) {
        case 'completed':
          ctx.fillStyle = '#10b981'; // Green
          break;
        case 'in-progress':
          ctx.fillStyle = '#3b82f6'; // Blue
          break;
        case 'pending':
          ctx.fillStyle = '#f59e0b'; // Yellow
          break;
        case 'failed':
          ctx.fillStyle = '#ef4444'; // Red
          break;
      }

      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#1f2937' : (isHovered ? '#6b7280' : '#e5e7eb');
      ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
      ctx.stroke();

      // Progress ring
      if (task.status === 'in-progress' && task.progress < 100) {
        ctx.beginPath();
        ctx.arc(x, y, 15, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * task.progress / 100));
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      if (showLabels) {
        ctx.fillStyle = '#1f2937';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(task.title.substring(0, 15) + (task.title.length > 15 ? '...' : ''), x, y + 35);
      }
    });

    // Draw agent nodes
    agents.forEach(agent => {
      const { x, y } = agent.position;
      const isSelected = selectedNode === agent.id;
      const isHovered = hoveredNode === agent.id;

      // Agent node circle
      ctx.beginPath();
      ctx.arc(x, y, isSelected ? 30 : 25, 0, 2 * Math.PI);

      // Color based on status
      switch (agent.status) {
        case 'active':
          ctx.fillStyle = '#10b981'; // Green
          break;
        case 'processing':
          ctx.fillStyle = '#3b82f6'; // Blue
          break;
        case 'idle':
          ctx.fillStyle = '#6b7280'; // Gray
          break;
        case 'error':
          ctx.fillStyle = '#ef4444'; // Red
          break;
      }

      ctx.fill();

      // Border
      ctx.strokeStyle = isSelected ? '#1f2937' : (isHovered ? '#6b7280' : '#e5e7eb');
      ctx.lineWidth = isSelected ? 3 : (isHovered ? 2 : 1);
      ctx.stroke();

      // Confidence indicator
      if (agent.confidence > 0) {
        ctx.beginPath();
        ctx.arc(x, y, 20, -Math.PI / 2, -Math.PI / 2 + (2 * Math.PI * agent.confidence));
        ctx.strokeStyle = '#fbbf24'; // Yellow
        ctx.lineWidth = 3;
        ctx.stroke();
      }

      // Activity indicator
      if (agent.status === 'processing' && realtime) {
        const pulseRadius = 30 + Math.sin(Date.now() / 200) * 5;
        ctx.beginPath();
        ctx.arc(x, y, pulseRadius, 0, 2 * Math.PI);
        ctx.strokeStyle = 'rgba(59, 130, 246, 0.3)';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Label
      if (showLabels) {
        ctx.fillStyle = '#1f2937';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(agent.name, x, y + 40);
        ctx.font = '10px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(agent.role, x, y + 52);
      }
    });

    ctx.restore();
  }, [agents, tasks, connections, scale, offset, selectedNode, hoveredNode, showLabels, showConnections, realtime]);

  // Animation loop
  useEffect(() => {
    let animationId: number;

    const animate = () => {
      drawNetwork();
      animationId = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationId) {
        cancelAnimationFrame(animationId);
      }
    };
  }, [drawNetwork]);

  // Mouse event handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = (e.clientX - rect.left - offset.x) / scale;
    const y = (e.clientY - rect.top - offset.y) / scale;

    // Check if clicking on a node
    const clickedAgent = agents.find(agent => {
      const dx = x - agent.position.x;
      const dy = y - agent.position.y;
      return Math.sqrt(dx * dx + dy * dy) < 25;
    });

    const clickedTask = tasks.find(task => {
      const dx = x - task.position.x;
      const dy = y - task.position.y;
      return Math.sqrt(dx * dx + dy * dy) < 20;
    });

    if (clickedAgent) {
      setSelectedNode(clickedAgent.id);
      onAgentClick?.(clickedAgent);
    } else if (clickedTask) {
      setSelectedNode(clickedTask.id);
      onTaskClick?.(clickedTask);
    } else {
      setIsDragging(true);
      setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      setSelectedNode(null);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    if (isDragging) {
      setOffset({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    } else {
      const x = (e.clientX - rect.left - offset.x) / scale;
      const y = (e.clientY - rect.top - offset.y) / scale;

      // Check if hovering over a node
      const hoveredAgent = agents.find(agent => {
        const dx = x - agent.position.x;
        const dy = y - agent.position.y;
        return Math.sqrt(dx * dx + dy * dy) < 25;
      });

      const hoveredTask = tasks.find(task => {
        const dx = x - task.position.x;
        const dy = y - task.position.y;
        return Math.sqrt(dx * dx + dy * dy) < 20;
      });

      setHoveredNode(hoveredAgent?.id || hoveredTask?.id || null);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setScale(prevScale => Math.max(0.1, Math.min(5, prevScale * delta)));
  };

  const resetView = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setSelectedNode(null);
  };

  const exportImage = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = 'swarm-network-topology.png';
    link.href = canvas.toDataURL();
    link.click();
  };

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <div className="w-3 h-3 bg-blue-500 rounded-full animate-pulse" />
            Live Swarm Network Topology
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="outline">
              {agents.length} agents, {tasks.length} tasks
            </Badge>
            {realtime && (
              <Badge variant="outline" className="text-green-600">
                Real-time
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(prev => Math.min(5, prev * 1.2))}
              >
                <ZoomIn className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setScale(prev => Math.max(0.1, prev / 1.2))}
              >
                <ZoomOut className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={resetView}
              >
                <RefreshCw className="w-4 h-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowLabels(!showLabels)}
              >
                Labels
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowConnections(!showConnections)}
              >
                Connections
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={layoutMode}
                onChange={(e) => setLayoutMode(e.target.value as any)}
                className="px-3 py-1 border rounded text-sm"
              >
                <option value="force">Force Layout</option>
                <option value="hierarchical">Hierarchical</option>
                <option value="circular">Circular</option>
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsAnimating(!isAnimating)}
              >
                {isAnimating ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={exportImage}
              >
                <Download className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={resetView}
              >
                <Maximize2 className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Canvas */}
          <div className="relative border rounded-lg overflow-hidden bg-gradient-to-br from-slate-50 to-slate-100">
            <canvas
              ref={canvasRef}
              width={width}
              height={height}
              className="cursor-move"
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onWheel={handleWheel}
            />

            {/* Scale indicator */}
            <div className="absolute bottom-4 right-4 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs">
              Scale: {(scale * 100).toFixed(0)}%
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-green-500 rounded-full" />
              <span>Active</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-blue-500 rounded-full" />
              <span>Processing</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-gray-500 rounded-full" />
              <span>Idle</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-red-500 rounded-full" />
              <span>Error</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0 border-t-2 border-blue-400 border-dashed" />
              <span>Assignment</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-0 border-t-2 border-green-400" />
              <span>Collaboration</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default SwarmNetworkTopology;