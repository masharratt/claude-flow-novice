import React from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { Dashboard } from './components/Dashboard';
import { EventLog } from './components/EventLog';
import { ConnectionStatus } from './components/ConnectionStatus';

function App() {
  const {
    isConnected,
    swarms,
    events,
    error,
    sendRequestSwarms,
    reconnect
  } = useWebSocket();

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <h1 className="text-xl font-bold text-gray-900">
                🚀 CFN Loop Dashboard
              </h1>
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
                <span className="text-sm text-gray-600">
                  {isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <span className="text-sm text-gray-500">
                {swarms.length} swarms, {events.length} events
              </span>
              <button
                onClick={sendRequestSwarms}
                disabled={!isConnected}
                className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Refresh Swarms
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Connection Status */}
        <div className="mb-6">
          <ConnectionStatus
            isConnected={isConnected}
            error={error}
            onRefresh={reconnect}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Dashboard - 2 columns */}
          <div className="lg:col-span-2">
            <Dashboard
              swarms={swarms}
              isLoading={!isConnected && swarms.length === 0}
            />
          </div>

          {/* Event Log - 1 column */}
          <div className="lg:col-span-1">
            <EventLog events={events} maxEvents={100} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <div>CFN Loop WebSocket Dashboard v1.0</div>
            <div>
              Connected to ws://localhost:3456 | Powered by React & TypeScript
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default App;