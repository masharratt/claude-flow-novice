import React, { useState, useEffect } from 'react';
import SwarmVisualizationDashboard from '@/components/SwarmVisualizationDashboard';
import SwarmNetworkTopology from '@/components/SwarmNetworkTopology';
import SwarmPerformanceMetrics from '@/components/SwarmPerformanceMetrics';
import { useSwarmRealtimeData } from '@/hooks/useSwarmRealtimeData';
import { Agent, Task, SwarmMetrics } from '@/types/swarm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Activity,
  Network,
  BarChart3,
  Settings,
  RefreshCw,
  Wifi,
  WifiOff,
  AlertCircle,
  Download,
  Maximize2,
  Monitor
} from 'lucide-react';

interface SwarmVisualizationPageProps {
  swarmId?: string;
  className?: string;
}

const SwarmVisualizationPage: React.FC<SwarmVisualizationPageProps> = ({
  swarmId = 'phase-6-swarm-visualization',
  className
}) => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [historicalData, setHistoricalData] = useState<any[]>([]);

  // Real-time data hook
  const {
    agents,
    tasks,
    metrics,
    isConnected,
    lastUpdate,
    connectionError,
    reconnect,
    reconnectAttempts
  } = useSwarmRealtimeData({
    swarmId,
    websocketUrl: process.env.NEXT_PUBLIC_WEBSOCKET_URL || 'ws://localhost:8080',
    enableReconnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10
  });

  // Store historical data for performance metrics
  useEffect(() => {
    if (agents.length > 0 || tasks.length > 0) {
      const dataPoint = {
        timestamp: Date.now(),
        agents: {
          total: agents.length,
          active: agents.filter(a => a.status === 'active').length,
          processing: agents.filter(a => a.status === 'processing').length,
          idle: agents.filter(a => a.status === 'idle').length,
          error: agents.filter(a => a.status === 'error').length
        },
        tasks: {
          total: tasks.length,
          completed: tasks.filter(t => t.status === 'completed').length,
          inProgress: tasks.filter(t => t.status === 'in-progress').length,
          pending: tasks.filter(t => t.status === 'pending').length,
          failed: tasks.filter(t => t.status === 'failed').length
        },
        performance: {
          processingTime: agents.reduce((sum, a) => sum + a.processingTime, 0),
          networkLatency: metrics.networkLatency,
          throughput: tasks.filter(t => t.status === 'completed').length / 60, // tasks per minute
          successRate: tasks.length > 0 ? tasks.filter(t => t.status === 'completed').length / tasks.length : 0,
          averageConfidence: agents.reduce((sum, a) => sum + a.confidence, 0) / agents.length
        },
        resources: {
          memoryUsage: agents.reduce((sum, a) => sum + a.memoryUsage, 0) / agents.length,
          cpuUsage: Math.random() * 100, // Mock CPU usage
          networkUsage: Math.random() * 100, // Mock network usage
          diskUsage: Math.random() * 100 // Mock disk usage
        },
        quality: {
          codeQuality: 85 + Math.random() * 15,
          testCoverage: 70 + Math.random() * 30,
          securityScore: 90 + Math.random() * 10,
          performanceScore: 80 + Math.random() * 20
        }
      };

      setHistoricalData(prev => {
        const updated = [...prev, dataPoint];
        // Keep only last 100 data points
        return updated.slice(-100);
      });
    }
  }, [agents, tasks, metrics]);

  // Export data
  const exportData = () => {
    const exportData = {
      swarmId,
      timestamp: new Date().toISOString(),
      agents,
      tasks,
      metrics,
      historicalData,
      connectionStatus: {
        isConnected,
        lastUpdate,
        reconnectAttempts
      }
    };

    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `swarm-visualization-${swarmId}-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
    setIsFullscreen(!isFullscreen);
  };

  return (
    <div className={`min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 ${className}`}>
      {/* Header */}
      <div className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <h1 className="text-2xl font-bold flex items-center gap-2">
                <Network className="w-6 h-6 text-blue-600" />
                Swarm Visualization
              </h1>
              <Badge variant="outline" className="text-sm">
                Swarm ID: {swarmId}
              </Badge>
              <Badge variant={isConnected ? "default" : "destructive"} className="text-sm">
                {isConnected ? (
                  <>
                    <Wifi className="w-3 h-3 mr-1" />
                    Connected
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 mr-1" />
                    Disconnected
                  </>
                )}
              </Badge>
            </div>

            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Agents: {agents.length} | Tasks: {tasks.length}
              </div>

              {!isConnected && connectionError && (
                <div className="flex items-center space-x-2 text-red-600">
                  <AlertCircle className="w-4 h-4" />
                  <span className="text-sm">{connectionError}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={reconnect}
                  >
                    <RefreshCw className="w-3 h-3 mr-1" />
                    Reconnect ({reconnectAttempts})
                  </Button>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                onClick={exportData}
              >
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={toggleFullscreen}
              >
                <Maximize2 className="w-4 h-4 mr-2" />
                {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
              </Button>

              {lastUpdate && (
                <div className="text-xs text-gray-500">
                  Last update: {lastUpdate.toLocaleTimeString()}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-6">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <Monitor className="w-4 h-4" />
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="topology" className="flex items-center gap-2">
              <Network className="w-4 h-4" />
              Network Topology
            </TabsTrigger>
            <TabsTrigger value="performance" className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Performance Metrics
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Detailed View
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard">
            <SwarmVisualizationDashboard
              swarmId={swarmId}
              className="w-full"
            />
          </TabsContent>

          {/* Network Topology Tab */}
          <TabsContent value="topology">
            <SwarmNetworkTopology
              agents={agents.map(agent => ({
                ...agent,
                position: agent.position || { x: Math.random() * 800, y: Math.random() * 600 },
                connections: []
              }))}
              tasks={tasks.map(task => ({
                ...task,
                position: { x: Math.random() * 800, y: Math.random() * 600 }
              }))}
              onAgentClick={setSelectedAgent}
              onTaskClick={setSelectedTask}
              width={1200}
              height={600}
              realtime={isConnected}
              className="w-full"
            />
          </TabsContent>

          {/* Performance Metrics Tab */}
          <TabsContent value="performance">
            <SwarmPerformanceMetrics
              metrics={historicalData}
              historicalData={historicalData}
              timeRange="5m"
              refreshInterval={1000}
              className="w-full"
            />
          </TabsContent>

          {/* Detailed View Tab */}
          <TabsContent value="details" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Selected Agent Details */}
              {selectedAgent && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Agent Details: {selectedAgent.name}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-500">Role</div>
                        <div>{selectedAgent.role}</div>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-500">Status</div>
                        <Badge variant={
                          selectedAgent.status === 'active' ? 'default' :
                          selectedAgent.status === 'processing' ? 'secondary' :
                          selectedAgent.status === 'error' ? 'destructive' : 'outline'
                        }>
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
                        <div className="text-sm font-medium text-gray-500 mb-2">Current Task</div>
                        <div className="p-3 bg-blue-50 rounded-lg text-sm">
                          {selectedAgent.currentTask}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* Selected Task Details */}
              {selectedTask && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Task Details: {selectedTask.title}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-sm font-medium text-gray-500">Status</div>
                        <Badge variant={
                          selectedTask.status === 'completed' ? 'default' :
                          selectedTask.status === 'in-progress' ? 'secondary' :
                          selectedTask.status === 'failed' ? 'destructive' : 'outline'
                        }>
                          {selectedTask.status}
                        </Badge>
                      </div>
                      <div>
                        <div className="text-sm font-medium text-gray-500">Progress</div>
                        <div>{selectedTask.progress}%</div>
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
                        <div className="space-y-2">
                          {selectedTask.assignedTo.map(agentId => {
                            const agent = agents.find(a => a.id === agentId);
                            return agent ? (
                              <div key={agentId} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                                <span className="text-sm">{agent.name}</span>
                                <Badge variant="outline" className="text-xs">
                                  {agent.role}
                                </Badge>
                              </div>
                            ) : null;
                          })}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* System Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5" />
                    System Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <div className="text-sm font-medium text-gray-500">Connection Status</div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                        <span className="text-sm">{isConnected ? 'Connected' : 'Disconnected'}</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Reconnect Attempts</div>
                      <div className="text-sm">{reconnectAttempts}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">Data Points</div>
                      <div className="text-sm">{historicalData.length}</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-500">System Health</div>
                      <div className="text-sm">{metrics.systemHealth}%</div>
                    </div>
                  </div>

                  {connectionError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="flex items-center gap-2 text-red-700">
                        <AlertCircle className="w-4 h-4" />
                        <span className="text-sm font-medium">Connection Error</span>
                      </div>
                      <div className="text-sm text-red-600 mt-1">{connectionError}</div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Quick Actions */}
              <Card>
                <CardHeader>
                  <CardTitle>Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={reconnect}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Force Reconnect
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={exportData}
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Export All Data
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      setSelectedAgent(null);
                      setSelectedTask(null);
                    }}
                  >
                    <Activity className="w-4 h-4 mr-2" />
                    Clear Selection
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default SwarmVisualizationPage;