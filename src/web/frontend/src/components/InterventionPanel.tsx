import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Send,
  Pause,
  Play,
  RotateCcw,
  Target,
  AlertTriangle,
  MessageSquare,
  Clock,
  CheckCircle,
  XCircle,
  Settings,
  Eye,
  RefreshCw
} from 'lucide-react';

// Types
interface Agent {
  id: string;
  name: string;
  type: string;
  status: 'active' | 'idle' | 'busy' | 'paused' | 'error';
}

interface Intervention {
  id: string;
  timestamp: Date;
  type: InterventionType;
  targetAgent?: string;
  message: string;
  status: 'pending' | 'sent' | 'acknowledged' | 'failed';
  response?: string;
}

type InterventionType =
  | 'redirect'
  | 'pause'
  | 'resume'
  | 'relaunch'
  | 'guidance'
  | 'stop'
  | 'priority'
  | 'resource_adjust'
  | 'swarm_relaunch';

interface InterventionTemplate {
  id: string;
  name: string;
  type: InterventionType;
  message: string;
  requiresConfirmation: boolean;
  icon: React.ComponentType;
}

interface InterventionPanelProps {
  agents: Agent[];
  onSendIntervention: (intervention: Omit<Intervention, 'id' | 'timestamp' | 'status'>) => Promise<void>;
  interventionHistory: Intervention[];
  swarmRelaunchCount: number;
  maxSwarmRelaunches: number;
  isConnected: boolean;
}

const InterventionPanel: React.FC<InterventionPanelProps> = ({
  agents,
  onSendIntervention,
  interventionHistory,
  swarmRelaunchCount,
  maxSwarmRelaunches,
  isConnected
}) => {
  // State
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [interventionType, setInterventionType] = useState<InterventionType>('guidance');
  const [message, setMessage] = useState('');
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingIntervention, setPendingIntervention] = useState<any>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Preset templates
  const interventionTemplates: InterventionTemplate[] = useMemo(() => [
    {
      id: 'redirect-task',
      name: 'Redirect Task',
      type: 'redirect',
      message: 'Please redirect your focus to: [specify new task or priority]',
      requiresConfirmation: false,
      icon: Target
    },
    {
      id: 'pause-agent',
      name: 'Pause Agent',
      type: 'pause',
      message: 'Pausing your current operations. Please wait for further instructions.',
      requiresConfirmation: true,
      icon: Pause
    },
    {
      id: 'resume-agent',
      name: 'Resume Agent',
      type: 'resume',
      message: 'Resuming operations. Continue with your assigned tasks.',
      requiresConfirmation: false,
      icon: Play
    },
    {
      id: 'relaunch-agent',
      name: 'Relaunch Agent',
      type: 'relaunch',
      message: 'Relaunching with fresh context. Previous state will be preserved.',
      requiresConfirmation: true,
      icon: RotateCcw
    },
    {
      id: 'priority-change',
      name: 'Change Priority',
      type: 'priority',
      message: 'Priority adjustment: [specify new priority level and reasoning]',
      requiresConfirmation: false,
      icon: AlertTriangle
    },
    {
      id: 'resource-adjust',
      name: 'Adjust Resources',
      type: 'resource_adjust',
      message: 'Resource allocation change: [specify memory, CPU, or tool access changes]',
      requiresConfirmation: true,
      icon: Settings
    },
    {
      id: 'swarm-relaunch',
      name: 'Swarm Relaunch',
      type: 'swarm_relaunch',
      message: 'Initiating full swarm relaunch with preserved context and learning.',
      requiresConfirmation: true,
      icon: RefreshCw
    }
  ], []);

  // Handlers
  const handleTemplateSelect = useCallback((template: InterventionTemplate) => {
    setInterventionType(template.type);
    setMessage(template.message);

    if (template.requiresConfirmation) {
      setPendingIntervention({
        type: template.type,
        targetAgent: selectedAgent === 'all' ? undefined : selectedAgent,
        message: template.message
      });
      setShowConfirmDialog(true);
    }
  }, [selectedAgent]);

  const handleSendIntervention = useCallback(async () => {
    if (!message.trim()) return;

    const intervention = {
      type: interventionType,
      targetAgent: selectedAgent === 'all' ? undefined : selectedAgent,
      message: message.trim()
    };

    // Check if this needs confirmation
    const needsConfirmation = interventionType === 'pause' ||
                             interventionType === 'relaunch' ||
                             interventionType === 'swarm_relaunch' ||
                             interventionType === 'resource_adjust';

    if (needsConfirmation && !pendingIntervention) {
      setPendingIntervention(intervention);
      setShowConfirmDialog(true);
      return;
    }

    try {
      setIsSending(true);
      await onSendIntervention(intervention);
      setMessage('');
      setPendingIntervention(null);
      setShowConfirmDialog(false);
    } catch (error) {
      console.error('Failed to send intervention:', error);
    } finally {
      setIsSending(false);
    }
  }, [message, interventionType, selectedAgent, pendingIntervention, onSendIntervention]);

  const handleConfirmIntervention = useCallback(async () => {
    if (pendingIntervention) {
      try {
        setIsSending(true);
        await onSendIntervention(pendingIntervention);
        setMessage('');
        setPendingIntervention(null);
        setShowConfirmDialog(false);
      } catch (error) {
        console.error('Failed to send intervention:', error);
      } finally {
        setIsSending(false);
      }
    }
  }, [pendingIntervention, onSendIntervention]);

  const getStatusIcon = (status: Intervention['status']) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'sent': return <Send className="w-4 h-4 text-blue-500" />;
      case 'acknowledged': return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'failed': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return null;
    }
  };

  const getInterventionTypeColor = (type: InterventionType) => {
    switch (type) {
      case 'redirect': return 'bg-blue-100 text-blue-800';
      case 'pause': return 'bg-yellow-100 text-yellow-800';
      case 'resume': return 'bg-green-100 text-green-800';
      case 'relaunch': return 'bg-purple-100 text-purple-800';
      case 'swarm_relaunch': return 'bg-red-100 text-red-800';
      case 'guidance': return 'bg-indigo-100 text-indigo-800';
      case 'priority': return 'bg-orange-100 text-orange-800';
      case 'resource_adjust': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const canRelaunchSwarm = swarmRelaunchCount < maxSwarmRelaunches;

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <MessageSquare className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900">Human Intervention Panel</h2>
            <div className={`flex items-center px-2 py-1 rounded-full text-xs font-medium ${
              isConnected ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
            }`}>
              <div className={`w-2 h-2 rounded-full mr-1 ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`} />
              {isConnected ? 'Connected' : 'Disconnected'}
            </div>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center px-3 py-1 text-sm text-gray-600 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            <Eye className="w-4 h-4 mr-1" />
            History
          </button>
        </div>
      </div>

      <div className="p-6">
        {/* Quick Templates */}
        <div className="mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Quick Actions</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {interventionTemplates.map((template) => {
              const Icon = template.icon;
              const isDisabled = template.type === 'swarm_relaunch' && !canRelaunchSwarm;

              return (
                <button
                  key={template.id}
                  onClick={() => !isDisabled && handleTemplateSelect(template)}
                  disabled={isDisabled}
                  className={`flex items-center justify-center px-3 py-2 text-sm font-medium rounded-md border transition-colors ${
                    isDisabled
                      ? 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                      : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 hover:border-gray-400'
                  }`}
                >
                  <Icon className="w-4 h-4 mr-1" />
                  {template.name}
                </button>
              );
            })}
          </div>

          {!canRelaunchSwarm && (
            <div className="mt-2 text-xs text-red-600">
              Swarm relaunch limit reached ({swarmRelaunchCount}/{maxSwarmRelaunches})
            </div>
          )}
        </div>

        {/* Intervention Form */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Agent Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Agent
              </label>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="all">All Agents</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name} ({agent.type}) - {agent.status}
                  </option>
                ))}
              </select>
            </div>

            {/* Intervention Type */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Intervention Type
              </label>
              <select
                value={interventionType}
                onChange={(e) => setInterventionType(e.target.value as InterventionType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              >
                <option value="guidance">Guidance</option>
                <option value="redirect">Redirect</option>
                <option value="pause">Pause</option>
                <option value="resume">Resume</option>
                <option value="relaunch">Relaunch Agent</option>
                <option value="priority">Priority Change</option>
                <option value="resource_adjust">Resource Adjustment</option>
                <option value="stop">Stop</option>
                {canRelaunchSwarm && <option value="swarm_relaunch">Swarm Relaunch</option>}
              </select>
            </div>
          </div>

          {/* Message Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Intervention Message
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Enter your intervention message here. Be specific about what you want the agent(s) to do..."
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <div className="mt-1 text-xs text-gray-500">
              {message.length}/1000 characters
            </div>
          </div>

          {/* Send Button */}
          <div className="flex justify-end">
            <button
              onClick={handleSendIntervention}
              disabled={!message.trim() || isSending || !isConnected}
              className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Send className="w-4 h-4 mr-2" />
              )}
              {isSending ? 'Sending...' : 'Send Intervention'}
            </button>
          </div>
        </div>

        {/* Intervention History */}
        {showHistory && (
          <div className="mt-6 border-t border-gray-200 pt-6">
            <h3 className="text-sm font-medium text-gray-700 mb-4">Recent Interventions</h3>
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {interventionHistory.length === 0 ? (
                <div className="text-sm text-gray-500 text-center py-4">
                  No interventions sent yet
                </div>
              ) : (
                interventionHistory.slice(-10).reverse().map((intervention) => (
                  <div
                    key={intervention.id}
                    className="bg-gray-50 rounded-lg p-3 border border-gray-200"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${getInterventionTypeColor(intervention.type)}`}>
                          {intervention.type}
                        </span>
                        {intervention.targetAgent && (
                          <span className="text-xs text-gray-600">
                            → {agents.find(a => a.id === intervention.targetAgent)?.name || intervention.targetAgent}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-1">
                        {getStatusIcon(intervention.status)}
                        <span className="text-xs text-gray-500">
                          {intervention.timestamp.toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-700">{intervention.message}</p>
                    {intervention.response && (
                      <div className="mt-2 p-2 bg-blue-50 border-l-2 border-blue-200">
                        <p className="text-sm text-blue-800">{intervention.response}</p>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Dialog */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="px-6 py-4 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Confirm Intervention</h3>
            </div>
            <div className="px-6 py-4">
              <div className="flex items-start space-x-3">
                <AlertTriangle className="w-6 h-6 text-yellow-500 flex-shrink-0 mt-1" />
                <div>
                  <p className="text-sm text-gray-700 mb-2">
                    Are you sure you want to send this intervention?
                  </p>
                  <div className="bg-gray-50 rounded p-3">
                    <div className="text-xs text-gray-600 mb-1">
                      Type: <span className="font-medium">{pendingIntervention?.type}</span>
                    </div>
                    <div className="text-xs text-gray-600 mb-2">
                      Target: <span className="font-medium">
                        {pendingIntervention?.targetAgent
                          ? agents.find(a => a.id === pendingIntervention.targetAgent)?.name || pendingIntervention.targetAgent
                          : 'All Agents'
                        }
                      </span>
                    </div>
                    <p className="text-sm text-gray-800">{pendingIntervention?.message}</p>
                  </div>
                  {pendingIntervention?.type === 'swarm_relaunch' && (
                    <div className="mt-2 text-xs text-red-600">
                      This will relaunch the entire swarm. Attempt {swarmRelaunchCount + 1} of {maxSwarmRelaunches}.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowConfirmDialog(false);
                  setPendingIntervention(null);
                }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmIntervention}
                disabled={isSending}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 disabled:opacity-50"
              >
                {isSending ? 'Sending...' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InterventionPanel;