import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Network,
  Activity,
  CheckCircle,
  Clock,
  AlertCircle,
  Zap,
  Users,
  BarChart3,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  Loader2
} from 'lucide-react';

interface Agent {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'processing' | 'error';
  confidence: number;
  currentTask?: string;
  processingTime: number;
  memoryUsage: number;
  lastUpdate: Date;
  position?: { x: number; y: number };
}

interface Task {
  id: string;
  title: string;
  status: 'pending' | 'in-progress' | 'completed' | 'failed';
  assignedTo?: string[];
  progress: number;
  startTime: Date;
  estimatedDuration: number;
}

interface SwarmMetrics {
  totalAgents: number;
  activeAgents: number;
  completedTasks: number;
  totalTasks: number;
  averageConfidence: number;
  systemHealth: number;
  processingTime: number;
  memoryUsage: number;
  networkLatency: number;
}

interface SwarmVisualizationDashboardProps {
  swarmId?: string;
  className?: string;
}

const SwarmVisualizationDashboard: React.FC<SwarmVisualizationDashboardProps> = ({
  swarmId = 'default',
  className
}) => {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [metrics, setMetrics] = useState<SwarmMetrics>({
    totalAgents: 0,
    activeAgents: 0,
    completedTasks: 0,
    totalTasks: 0,
    averageConfidence: 0,
    systemHealth: 0,
    processingTime: 0,
    memoryUsage: 0,
    networkLatency: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // WebSocket connection for real-time updates
  useEffect(() => {
    let ws: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connectWebSocket = () => {
      try {
        ws = new WebSocket(`ws://localhost:8080/swarm/${swarmId}/visualization`);

        ws.onopen = () => {
          setIsConnected(true);
          console.log('Connected to swarm visualization WebSocket');
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.type) {
              case 'agents-update':
                setAgents(data.agents);
                break;
              case 'tasks-update':
                setTasks(data.tasks);
                break;
              case 'metrics-update':
                setMetrics(data.metrics);
                break;
              case 'agent-status-change':
                setAgents(prev => prev.map(agent =>
                  agent.id === data.agentId
                    ? { ...agent, ...data.updates }
                    : agent
                ));
                break;
              case 'task-status-change':
                setTasks(prev => prev.map(task =>
                  task.id === data.taskId
                    ? { ...task, ...data.updates }
                    : task
                ));
                break;
            }

            setLastUpdate(new Date());
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onclose = () => {
          setIsConnected(false);
          console.log('WebSocket connection closed');

          // Auto-reconnect after 3 seconds
          if (autoRefresh) {
            reconnectTimer = setTimeout(connectWebSocket, 3000);
          }
        };

        ws.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };
      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setIsConnected(false);
      }
    };

    if (autoRefresh) {
      connectWebSocket();
    }

    return () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }
      if (ws) {
        ws.close();
      }
    };
  }, [swarmId, autoRefresh]);

  // Mock data generation for demonstration
  useEffect(() => {
    if (!isConnected && autoRefresh) {
      const generateMockData = () => {
        const mockAgents: Agent[] = [
          {
            id: 'agent-1',
            name: 'UI Designer',
            role: 'ui-designer',
            status: 'active',
            confidence: 0.92,
            currentTask: 'Create swarm visualization components',
            processingTime: 1250,
            memoryUsage: 45,
            lastUpdate: new Date(),
            position: { x: 200, y: 150 }
          },
          {
            id: 'agent-2',
            name: 'Backend Developer',
            role: 'backend-dev',
            status: 'processing',
            confidence: 0.88,
            currentTask: 'Implement WebSocket handlers',
            processingTime: 2100,
            memoryUsage: 67,
            lastUpdate: new Date(),
            position: { x: 400, y: 200 }
          },
          {
            id: 'agent-3',
            name: 'System Architect',
            role: 'architect',
            status: 'active',
            confidence: 0.95,
            currentTask: 'Design data flow architecture',
            processingTime: 800,
            memoryUsage: 32,
            lastUpdate: new Date(),
            position: { x: 300, y: 350 }
          },
          {
            id: 'agent-4',
            name: 'Performance Analyzer',
            role: 'perf-analyzer',
            status: 'idle',
            confidence: 0.00,
            processingTime: 0,
            memoryUsage: 12,
            lastUpdate: new Date(),
            position: { x: 500, y: 100 }
          }
        ];

        const mockTasks: Task[] = [
          {
            id: 'task-1',
            title: 'Create swarm visualization components',
            status: 'in-progress',
            assignedTo: ['agent-1'],
            progress: 65,
            startTime: new Date(Date.now() - 60000),
            estimatedDuration: 120000
          },
          {
            id: 'task-2',
            title: 'Implement WebSocket handlers',
            status: 'in-progress',
            assignedTo: ['agent-2'],
            progress: 40,
            startTime: new Date(Date.now() - 90000),
            estimatedDuration: 150000
          },
          {
            id: 'task-3',
            title: 'Design data flow architecture',
            status: 'completed',
            assignedTo: ['agent-3'],
            progress: 100,
            startTime: new Date(Date.now() - 120000),
            estimatedDuration: 90000
          }
        ];

        const mockMetrics: SwarmMetrics = {
          totalAgents: mockAgents.length,
          activeAgents: mockAgents.filter(a => a.status === 'active' || a.status === 'processing').length,
          completedTasks: mockTasks.filter(t => t.status === 'completed').length,
          totalTasks: mockTasks.length,
          averageConfidence: mockAgents.reduce((sum, a) => sum + a.confidence, 0) / mockAgents.length,
          systemHealth: 94,
          processingTime: mockAgents.reduce((sum, a) => sum + a.processingTime, 0),
          memoryUsage: mockAgents.reduce((sum, a) => sum + a.memoryUsage, 0),
          networkLatency: 23
        };

        setAgents(mockAgents);
        setTasks(mockTasks);
        setMetrics(mockMetrics);
      };

      generateMockData();
      const interval = setInterval(generateMockData, 1000);
      return () => clearInterval(interval);
    }
  }, [isConnected, autoRefresh]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'idle':
        return <Clock className="w-4 h-4 text-gray-400" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'idle':
        return 'bg-gray-100 text-gray-800';
      case 'error':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const TaskStatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'in-progress':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'pending':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className={`space-y-6 p-6 ${className}`}>
      {/* Header with connection status */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Network className="w-8 h-8 text-blue-600" />
            Swarm Visualization Dashboard
          </h1>
          <Badge variant="outline" className="text-sm">
            Swarm ID: {swarmId}
          </Badge>
        </div>

        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4 text-green-500" />
                <span>Connected</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4 text-red-500" />
                <span>Disconnected (Demo Mode)</span>
              </>
            )}
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
          >
            {autoRefresh ? (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Auto-refresh ON
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4 mr-2" />
                Auto-refresh OFF
              </>
            )}
          </Button>

          <div className="text-xs text-gray-500">
            Last update: {lastUpdate.toLocaleTimeString()}
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Agents</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.activeAgents}/{metrics.totalAgents}</div>
            <Progress value={(metrics.activeAgents / metrics.totalAgents) * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completed Tasks</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.completedTasks}/{metrics.totalTasks}</div>
            <Progress value={(metrics.completedTasks / metrics.totalTasks) * 100} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">System Health</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.systemHealth}%</div>
            <Progress value={metrics.systemHealth} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Confidence</CardTitle>
            <BarChart3 className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(metrics.averageConfidence * 100).toFixed(1)}%
            </div>
            <Progress value={metrics.averageConfidence * 100} className="mt-2" />
          </CardContent>
        </Card>
      </div>

      {/* Main content tabs */}
      <Tabs defaultValue="topology" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="topology">Network Topology</TabsTrigger>
          <TabsTrigger value="agents">Agent Details</TabsTrigger>
          <TabsTrigger value="tasks">Task Flow</TabsTrigger>
          <TabsTrigger value="metrics">Performance</TabsTrigger>
        </TabsList>

        {/* Network Topology Tab */}
        <TabsContent value="topology" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Network className="w-5 h-5" />
                Swarm Network Topology
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative w-full h-96 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                {/* Simple SVG-based network visualization */}
                <svg className="w-full h-full">
                  {/* Draw connections between agents */}
                  {agents.map((agent, i) =>
                    agents.slice(i + 1).map(otherAgent => (
                      <line
                        key={`${agent.id}-${otherAgent.id}`}
                        x1={agent.position?.x || 100}
                        y1={agent.position?.y || 100}
                        x2={otherAgent.position?.x || 100}
                        y2={otherAgent.position?.y || 100}
                        stroke="#e2e8f0"
                        strokeWidth="2"
                      />
                    ))
                  )}

                  {/* Draw agent nodes */}
                  {agents.map(agent => (
                    <g key={agent.id} className="cursor-pointer">
                      <circle
                        cx={agent.position?.x || 100}
                        cy={agent.position?.y || 100}
                        r="20"
                        className={
                          agent.status === 'active' ? 'fill-green-500' :
                          agent.status === 'processing' ? 'fill-blue-500' :
                          agent.status === 'error' ? 'fill-red-500' : 'fill-gray-400'
                        }
                        onClick={() => setSelectedAgent(agent)}
                      />
                      <text
                        x={agent.position?.x || 100}
                        y={(agent.position?.y || 100) + 35}
                        textAnchor="middle"
                        className="text-xs fill-gray-700"
                      >
                        {agent.name}
                      </text>
                    </g>
                  ))}
                </svg>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Agent Details Tab */}
        <TabsContent value="agents" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Agents List */}
            <Card>
              <CardHeader>
                <CardTitle>Active Agents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {agents.map(agent => (
                  <div
                    key={agent.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedAgent(agent)}
                  >
                    <div className="flex items-center space-x-3">
                      {getStatusIcon(agent.status)}
                      <div>
                        <div className="font-medium">{agent.name}</div>
                        <div className="text-sm text-gray-500">{agent.role}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">
                        {(agent.confidence * 100).toFixed(1)}%
                      </div>
                      <Badge className={getStatusColor(agent.status)}>
                        {agent.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Selected Agent Details */}
            {selectedAgent && (
              <Card>
                <CardHeader>
                  <CardTitle>Agent Details: {selectedAgent.name}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Role</div>
                      <div>{selectedAgent.role}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Status</div>
                      <Badge className={getStatusColor(selectedAgent.status)}>
                        {selectedAgent.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Confidence</div>
                      <div>{(selectedAgent.confidence * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Processing Time</div>
                      <div>{selectedAgent.processingTime}ms</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Memory Usage</div>
                      <div>{selectedAgent.memoryUsage}%</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Last Update</div>
                      <div>{selectedAgent.lastUpdate.toLocaleTimeString()}</div>
                    </div>
                  </div>

                  {selectedAgent.currentTask && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-1">Current Task</div>
                      <div className="p-2 bg-blue-50 rounded text-sm">
                        {selectedAgent.currentTask}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Task Flow Tab */}
        <TabsContent value="tasks" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Tasks List */}
            <Card>
              <CardHeader>
                <CardTitle>Active Tasks</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {tasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-slate-50 cursor-pointer"
                    onClick={() => setSelectedTask(task)}
                  >
                    <div className="flex items-center space-x-3">
                      <TaskStatusIcon status={task.status} />
                      <div>
                        <div className="font-medium">{task.title}</div>
                        <div className="text-sm text-gray-500">
                          Started: {task.startTime.toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">{task.progress}%</div>
                      <Badge className={
                        task.status === 'completed' ? 'bg-green-100 text-green-800' :
                        task.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                        task.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }>
                        {task.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Selected Task Details */}
            {selectedTask && (
              <Card>
                <CardHeader>
                  <CardTitle>Task Details: {selectedTask.title}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Status</div>
                      <Badge className={
                        selectedTask.status === 'completed' ? 'bg-green-100 text-green-800' :
                        selectedTask.status === 'in-progress' ? 'bg-blue-100 text-blue-800' :
                        selectedTask.status === 'failed' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }>
                        {selectedTask.status}
                      </Badge>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Progress</div>
                      <div className="flex items-center space-x-2">
                        <Progress value={selectedTask.progress} className="flex-1" />
                        <span className="text-sm">{selectedTask.progress}%</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Start Time</div>
                      <div>{selectedTask.startTime.toLocaleTimeString()}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Est. Duration</div>
                      <div>{(selectedTask.estimatedDuration / 1000).toFixed(1)}s</div>
                    </div>
                  </div>

                  {selectedTask.assignedTo && selectedTask.assignedTo.length > 0 && (
                    <div>
                      <div className="text-sm font-medium text-gray-500 mb-2">Assigned Agents</div>
                      <div className="space-y-1">
                        {selectedTask.assignedTo.map(agentId => {
                          const agent = agents.find(a => a.id === agentId);
                          return agent ? (
                            <div key={agentId} className="flex items-center space-x-2 text-sm">
                              {getStatusIcon(agent.status)}
                              <span>{agent.name}</span>
                            </div>
                          ) : null;
                        })}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Performance Metrics Tab */}
        <TabsContent value="metrics" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Processing Performance</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Processing Time</span>
                  <span className="font-medium">{metrics.processingTime}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Network Latency</span>
                  <span className="font-medium">{metrics.networkLatency}ms</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Tasks per Second</span>
                  <span className="font-medium">
                    {metrics.totalTasks > 0 ?
                      (metrics.completedTasks / (Date.now() - tasks[0]?.startTime.getTime() || 1) * 1000).toFixed(2)
                      : '0'}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Resource Usage</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Total Memory Usage</span>
                  <span className="font-medium">{metrics.memoryUsage}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Active Connections</span>
                  <span className="font-medium">{metrics.activeAgents}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">System Load</span>
                  <span className="font-medium">Normal</span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quality Metrics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Success Rate</span>
                  <span className="font-medium">
                    {metrics.totalTasks > 0 ?
                      ((metrics.completedTasks / metrics.totalTasks) * 100).toFixed(1)
                      : '0'}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Avg Confidence</span>
                  <span className="font-medium">
                    {(metrics.averageConfidence * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-gray-600">Error Rate</span>
                  <span className="font-medium">0.0%</span>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SwarmVisualizationDashboard;