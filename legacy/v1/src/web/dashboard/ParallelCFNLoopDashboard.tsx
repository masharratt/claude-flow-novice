/**
 * Parallel CFN Loop Monitoring Dashboard
 * Sprint 5 - Phase 5.2: Monitoring Dashboard
 *
 * Real-time visualization of parallel sprint execution with WebSocket updates,
 * test slot queue monitoring, memory tracking, and conflict resolution status.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

// Types
interface SprintStatus {
  sprintId: string;
  status: 'queued' | 'in-progress' | 'completed' | 'failed';
  wave: number;
  startTime?: number;
  endTime?: number;
  confidence?: number;
  estimatedAgents: number;
  actualAgents: number;
  memoryUsageMb: number;
  testSlot?: number;
}

interface WaveStatus {
  wave: number;
  totalSprints: number;
  completedSprints: number;
  failedSprints: number;
  inProgressSprints: number;
  estimatedMemoryMb: number;
  actualMemoryMb: number;
}

interface TestSlotStatus {
  slotId: number;
  occupied: boolean;
  sprintId?: string;
  startTime?: number;
}

interface ConflictResolution {
  conflictId: string;
  type: 'test-slot' | 'file-lock' | 'dependency' | 'memory';
  sprints: string[];
  status: 'detected' | 'resolving' | 'resolved';
  resolution?: string;
  timestamp: number;
}

interface DashboardData {
  sprints: SprintStatus[];
  waves: WaveStatus[];
  testSlots: TestSlotStatus[];
  conflicts: ConflictResolution[];
  totalMemoryMb: number;
  availableMemoryMb: number;
  queueDepth: number;
}

// Status Badge Component
const StatusBadge: React.FC<{ status: SprintStatus['status'] }> = ({ status }) => {
  const colors = {
    queued: 'bg-gray-500',
    'in-progress': 'bg-blue-500',
    completed: 'bg-green-500',
    failed: 'bg-red-500'
  };

  return (
    <span className={`px-2 py-1 text-xs font-semibold text-white rounded ${colors[status]}`}>
      {status.toUpperCase()}
    </span>
  );
};

// Confidence Bar Component
const ConfidenceBar: React.FC<{ confidence?: number }> = ({ confidence }) => {
  if (confidence === undefined) return <span className="text-gray-400">N/A</span>;

  const percentage = confidence * 100;
  const color = percentage >= 90 ? 'bg-green-500' : percentage >= 75 ? 'bg-yellow-500' : 'bg-red-500';

  return (
    <div className="w-full bg-gray-200 rounded-full h-4">
      <div
        className={`${color} h-4 rounded-full flex items-center justify-center text-xs text-white font-bold`}
        style={{ width: `${percentage}%` }}
      >
        {percentage.toFixed(0)}%
      </div>
    </div>
  );
};

// Memory Usage Gauge
const MemoryGauge: React.FC<{ used: number; total: number }> = ({ used, total }) => {
  const percentage = (used / total) * 100;
  const color = percentage >= 90 ? 'bg-red-500' : percentage >= 70 ? 'bg-yellow-500' : 'bg-green-500';

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span>Memory Usage</span>
        <span className="font-bold">{used.toFixed(0)} / {total.toFixed(0)} MB</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-4">
        <div
          className={`${color} h-4 rounded-full transition-all duration-300`}
          style={{ width: `${percentage}%` }}
        />
      </div>
      <div className="text-xs text-gray-500">
        {percentage >= 90 && '⚠️ High memory usage'}
        {percentage >= 70 && percentage < 90 && '⚡ Moderate usage'}
        {percentage < 70 && '✅ Healthy'}
      </div>
    </div>
  );
};

// Test Slot Grid
const TestSlotGrid: React.FC<{ slots: TestSlotStatus[] }> = ({ slots }) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {slots.map((slot) => (
        <div
          key={slot.slotId}
          className={`p-4 rounded-lg border-2 ${
            slot.occupied ? 'border-blue-500 bg-blue-50' : 'border-gray-300 bg-gray-50'
          }`}
        >
          <div className="text-sm font-bold mb-2">Slot {slot.slotId}</div>
          {slot.occupied ? (
            <>
              <div className="text-xs text-blue-700 font-semibold mb-1">OCCUPIED</div>
              <div className="text-xs text-gray-600 truncate">{slot.sprintId}</div>
              <div className="text-xs text-gray-500 mt-1">
                {slot.startTime && `${Math.floor((Date.now() - slot.startTime) / 1000)}s`}
              </div>
            </>
          ) : (
            <div className="text-xs text-gray-500">Available</div>
          )}
        </div>
      ))}
    </div>
  );
};

// Wave Progress Component
const WaveProgress: React.FC<{ wave: WaveStatus }> = ({ wave }) => {
  const progress = (wave.completedSprints / wave.totalSprints) * 100;

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold">Wave {wave.wave}</h3>
        <span className="text-sm text-gray-600">
          {wave.completedSprints} / {wave.totalSprints} completed
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>In Progress: {wave.inProgressSprints}</span>
        <span>Failed: {wave.failedSprints}</span>
        <span>Memory: {wave.actualMemoryMb} MB</span>
      </div>
    </div>
  );
};

// Conflict Resolution Panel
const ConflictPanel: React.FC<{ conflicts: ConflictResolution[] }> = ({ conflicts }) => {
  const activeConflicts = conflicts.filter(c => c.status !== 'resolved');

  return (
    <div className="bg-white p-4 rounded-lg shadow">
      <h3 className="font-bold mb-4">
        Conflict Resolution
        {activeConflicts.length > 0 && (
          <span className="ml-2 text-red-500">({activeConflicts.length} active)</span>
        )}
      </h3>
      {conflicts.length === 0 ? (
        <div className="text-gray-500 text-sm">No conflicts detected</div>
      ) : (
        <div className="space-y-2">
          {conflicts.slice(0, 5).map((conflict) => (
            <div
              key={conflict.conflictId}
              className={`p-3 rounded border ${
                conflict.status === 'resolved'
                  ? 'border-green-200 bg-green-50'
                  : 'border-red-200 bg-red-50'
              }`}
            >
              <div className="flex justify-between items-start mb-1">
                <span className="text-sm font-semibold capitalize">{conflict.type}</span>
                <StatusBadge status={conflict.status === 'resolved' ? 'completed' : 'in-progress'} />
              </div>
              <div className="text-xs text-gray-600 mb-1">
                Sprints: {conflict.sprints.join(', ')}
              </div>
              {conflict.resolution && (
                <div className="text-xs text-gray-700 mt-2">
                  Resolution: {conflict.resolution}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Main Dashboard Component
export const ParallelCFNLoopDashboard: React.FC = () => {
  const [data, setData] = useState<DashboardData>({
    sprints: [],
    waves: [],
    testSlots: [],
    conflicts: [],
    totalMemoryMb: 8192,
    availableMemoryMb: 8192,
    queueDepth: 0
  });
  const [socket, setSocket] = useState<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Initialize WebSocket connection
  useEffect(() => {
    const newSocket = io('http://localhost:3001', {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });

    newSocket.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
    });

    newSocket.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    // Listen for dashboard updates
    newSocket.on('dashboard:update', (update: Partial<DashboardData>) => {
      setData(prev => ({ ...prev, ...update }));
      setLastUpdate(new Date());
    });

    // Listen for sprint updates
    newSocket.on('sprint:update', (sprint: SprintStatus) => {
      setData(prev => ({
        ...prev,
        sprints: prev.sprints.map(s =>
          s.sprintId === sprint.sprintId ? sprint : s
        )
      }));
      setLastUpdate(new Date());
    });

    // Listen for conflict updates
    newSocket.on('conflict:update', (conflict: ConflictResolution) => {
      setData(prev => ({
        ...prev,
        conflicts: [conflict, ...prev.conflicts.filter(c => c.conflictId !== conflict.conflictId)]
      }));
      setLastUpdate(new Date());
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Request initial data
  useEffect(() => {
    if (socket && connected) {
      socket.emit('dashboard:request-update');
    }
  }, [socket, connected]);

  const activeSprints = data.sprints.filter(s => s.status === 'in-progress');
  const completedSprints = data.sprints.filter(s => s.status === 'completed');
  const failedSprints = data.sprints.filter(s => s.status === 'failed');

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold text-gray-800">Parallel CFN Loop Monitor</h1>
            <div className="flex items-center space-x-4">
              <div
                className={`px-3 py-1 rounded text-sm font-semibold ${
                  connected ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
                }`}
              >
                {connected ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
              <div className="text-sm text-gray-600">
                Last update: {lastUpdate.toLocaleTimeString()}
              </div>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Active Sprints</div>
            <div className="text-3xl font-bold text-blue-600">{activeSprints.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Completed</div>
            <div className="text-3xl font-bold text-green-600">{completedSprints.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Failed</div>
            <div className="text-3xl font-bold text-red-600">{failedSprints.length}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="text-sm text-gray-600 mb-1">Queue Depth</div>
            <div className="text-3xl font-bold text-purple-600">{data.queueDepth}</div>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <MemoryGauge
            used={data.totalMemoryMb - data.availableMemoryMb}
            total={data.totalMemoryMb}
          />
        </div>

        {/* Test Slots */}
        <div className="bg-white p-6 rounded-lg shadow mb-6">
          <h2 className="text-xl font-bold mb-4">Test Slot Status</h2>
          <TestSlotGrid slots={data.testSlots} />
        </div>

        {/* Waves Progress */}
        <div className="mb-6">
          <h2 className="text-xl font-bold mb-4">Wave Progress</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data.waves.map((wave) => (
              <WaveProgress key={wave.wave} wave={wave} />
            ))}
          </div>
        </div>

        {/* Conflict Resolution */}
        <ConflictPanel conflicts={data.conflicts} />

        {/* Sprint Details Table */}
        <div className="bg-white p-6 rounded-lg shadow mt-6">
          <h2 className="text-xl font-bold mb-4">Sprint Details</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left p-2">Sprint ID</th>
                  <th className="text-left p-2">Wave</th>
                  <th className="text-left p-2">Status</th>
                  <th className="text-left p-2">Agents</th>
                  <th className="text-left p-2">Memory (MB)</th>
                  <th className="text-left p-2">Confidence</th>
                  <th className="text-left p-2">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.sprints.map((sprint) => (
                  <tr key={sprint.sprintId} className="border-b hover:bg-gray-50">
                    <td className="p-2 font-mono text-xs">{sprint.sprintId}</td>
                    <td className="p-2">{sprint.wave}</td>
                    <td className="p-2">
                      <StatusBadge status={sprint.status} />
                    </td>
                    <td className="p-2">
                      {sprint.actualAgents} / {sprint.estimatedAgents}
                    </td>
                    <td className="p-2">{sprint.memoryUsageMb.toFixed(0)}</td>
                    <td className="p-2">
                      <div className="w-24">
                        <ConfidenceBar confidence={sprint.confidence} />
                      </div>
                    </td>
                    <td className="p-2">
                      {sprint.startTime &&
                        sprint.endTime &&
                        `${((sprint.endTime - sprint.startTime) / 1000).toFixed(1)}s`}
                      {sprint.startTime &&
                        !sprint.endTime &&
                        `${Math.floor((Date.now() - sprint.startTime) / 1000)}s`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ParallelCFNLoopDashboard;
