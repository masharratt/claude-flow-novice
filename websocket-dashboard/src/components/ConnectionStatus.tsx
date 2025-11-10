import React from 'react';

interface ConnectionStatusProps {
  isConnected: boolean;
  error: string | null;
  onRefresh: () => void;
}

export const ConnectionStatus: React.FC<ConnectionStatusProps> = ({
  isConnected,
  error,
  onRefresh
}) => {
  const getStatusColor = () => {
    if (error) return 'text-red-600';
    if (isConnected) return 'text-green-600';
    return 'text-yellow-600';
  };

  const getStatusText = () => {
    if (error) return 'Connection Error';
    if (isConnected) return 'Connected';
    return 'Connecting...';
  };

  const getStatusIcon = () => {
    if (error) return '❌';
    if (isConnected) return '🟢';
    return '🔄';
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <span className="text-2xl">{getStatusIcon()}</span>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">WebSocket Connection</h3>
            <div className={`text-sm font-medium ${getStatusColor()}`}>
              {getStatusText()}
            </div>
            <div className="text-xs text-gray-500">
              Server: ws://localhost:3456
            </div>
            {error && (
              <div className="text-xs text-red-600 mt-1 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm font-medium"
        >
          Refresh
        </button>
      </div>
    </div>
  );
};