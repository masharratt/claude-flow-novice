import React from 'react';
import { DashboardLayoutProps } from './types';

export const DashboardLayout: React.FC<DashboardLayoutProps> = ({
  title,
  subtitle,
  lastUpdate,
  isRealtimeEnabled,
  onToggleRealtime,
  loading,
  error,
  children
}) => {
  const formatLastUpdate = (date: Date): string => {
    return date.toLocaleString();
  };

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
              <p className="text-sm text-gray-600 mt-1">{subtitle}</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Real-time Toggle */}
              <div className="flex items-center space-x-2">
                <div className={`w-2 h-2 rounded-full ${isRealtimeEnabled ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                <span className="text-sm text-gray-600">Real-time</span>
                <button
                  onClick={onToggleRealtime}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isRealtimeEnabled ? 'bg-blue-500' : 'bg-gray-300'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isRealtimeEnabled ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Last Update */}
              <div className="text-sm text-gray-500">
                Last updated: {formatLastUpdate(lastUpdate)}
              </div>

              {/* Loading Indicator */}
              {loading && (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-500 border-t-transparent"></div>
                  <span className="text-sm text-gray-600">Loading...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Error Alert */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  {error}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {children}
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center text-sm text-gray-500">
            <div>
              Memory Management Dashboard - Phase 6 Implementation
            </div>
            <div>
              {isRealtimeEnabled ? (
                <span className="flex items-center space-x-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <span>Live Monitoring Active</span>
                </span>
              ) : (
                <span>Manual Mode</span>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};