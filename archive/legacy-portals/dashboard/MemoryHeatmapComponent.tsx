import React, { useMemo } from 'react';
import { MemoryHotspot } from './types';

interface MemoryHeatmapComponentProps {
  hotspots: MemoryHotspot[];
  totalMemory: number;
}

export const MemoryHeatmapComponent: React.FC<MemoryHeatmapComponentProps> = ({
  hotspots,
  totalMemory
}) => {
  const [selectedHotspot, setSelectedHotspot] = React.useState<MemoryHotspot | null>(null);
  const [viewMode, setViewMode] = React.useState<'grid' | 'chart'>('grid');

  const processedHotspots = useMemo(() => {
    return hotspots
      .sort((a, b) => b.memoryUsage - a.memoryUsage)
      .map((hotspot, index) => ({
        ...hotspot,
        percentage: totalMemory > 0 ? (hotspot.memoryUsage / totalMemory) * 100 : 0,
        rank: index + 1
      }));
  }, [hotspots, totalMemory]);

  const getSeverityColor = (severity: string): string => {
    switch (severity) {
      case 'high': return 'bg-red-500';
      case 'medium': return 'bg-yellow-500';
      case 'low': return 'bg-green-500';
      default: return 'bg-gray-500';
    }
  };

  const getSeverityTextColor = (severity: string): string => {
    switch (severity) {
      case 'high': return 'text-red-700';
      case 'medium': return 'text-yellow-700';
      case 'low': return 'text-green-700';
      default: return 'text-gray-700';
    }
  };

  const formatMemorySize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  };

  const getGridHeatmapColor = (percentage: number): string => {
    if (percentage > 50) return 'bg-red-200';
    if (percentage > 25) return 'bg-orange-200';
    if (percentage > 10) return 'bg-yellow-200';
    if (percentage > 5) return 'bg-green-200';
    return 'bg-blue-200';
  };

  const getGridHeatmapBorder = (severity: string): string => {
    switch (severity) {
      case 'high': return 'border-red-500';
      case 'medium': return 'border-yellow-500';
      case 'low': return 'border-green-500';
      default: return 'border-gray-500';
    }
  };

  if (processedHotspots.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <div className="text-6xl mb-4">🌡️</div>
        <h3 className="text-lg font-semibold">No Memory Hotspots Detected</h3>
        <p className="text-sm mt-2">Memory usage is within normal parameters.</p>
      </div>
    );
  }

  if (viewMode === 'grid') {
    return (
      <div className="space-y-4">
        {/* View Controls */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('grid')}
              className={`px-3 py-1 rounded ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Grid View
            </button>
            <button
              onClick={() => setViewMode('chart')}
              className={`px-3 py-1 rounded ${viewMode === 'chart' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Chart View
            </button>
          </div>
          <div className="text-sm text-gray-600">
            Total Memory: {formatMemorySize(totalMemory)}
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="grid grid-cols-6 gap-2">
          {processedHotspots.map((hotspot) => (
            <div
              key={`${hotspot.type}-${hotspot.name}`}
              onClick={() => setSelectedHotspot(hotspot)}
              className={`relative p-3 rounded-lg border-2 cursor-pointer transition-all hover:scale-105 ${getGridHeatmapColor(hotspot.percentage)} ${getGridHeatmapBorder(hotspot.severity)}`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold">
                  {hotspot.type === 'redis' ? '🔴' : '💾'}
                </span>
                <span className="text-xs font-bold">
                  #{hotspot.rank}
                </span>
              </div>
              <div className="text-xs font-medium truncate">
                {hotspot.name.length > 12 ? hotspot.name.substring(0, 9) + '...' : hotspot.name}
              </div>
              <div className="text-xs font-bold">
                {formatMemorySize(hotspot.memoryUsage)}
              </div>
              <div className="text-xs text-gray-600">
                {hotspot.percentage.toFixed(1)}%
              </div>
              <div className={`absolute top-1 right-1 w-2 h-2 rounded-full ${getSeverityColor(hotspot.severity)}`}></div>
            </div>
          ))}
        </div>

        {/* Selected Hotspot Details */}
        {selectedHotspot && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-semibold text-gray-800">
                {selectedHotspot.type === 'redis' ? '🔴' : '💾'} {selectedHotspot.name}
              </h3>
              <button
                onClick={() => setSelectedHotspot(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 mb-3">
              <div>
                <span className="text-sm font-medium">Memory Usage:</span>
                <div className="text-lg font-bold">
                  {formatMemorySize(selectedHotspot.memoryUsage)}
                  <span className="text-sm font-normal text-gray-600 ml-2">
                    ({selectedHotspot.percentage.toFixed(1)}% of total)
                  </span>
                </div>
              </div>
              <div>
                <span className="text-sm font-medium">Severity:</span>
                <div className={`text-lg font-bold ${getSeverityTextColor(selectedHotspot.severity)}`}>
                  {selectedHotspot.severity.toUpperCase()}
                </div>
              </div>
            </div>

            <div>
              <span className="text-sm font-medium">Recommendations:</span>
              <ul className="mt-2 space-y-1">
                {selectedHotspot.recommendations.map((rec, index) => (
                  <li key={index} className="text-sm text-gray-600 flex items-start">
                    <span className="text-blue-500 mr-2">•</span>
                    {rec}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Heatmap Statistics */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">Heatmap Statistics</h3>
          <div className="grid grid-cols-4 gap-4 text-sm">
            <div>
              <span className="font-medium">Total Hotspots:</span>
              <span className="ml-2 font-semibold">{processedHotspots.length}</span>
            </div>
            <div>
              <span className="font-medium">High Severity:</span>
              <span className="ml-2 font-semibold text-red-600">
                {processedHotspots.filter(h => h.severity === 'high').length}
              </span>
            </div>
            <div>
              <span className="font-medium">Largest Hotspot:</span>
              <span className="ml-2 font-semibold">
                {formatMemorySize(processedHotspots[0]?.memoryUsage || 0)}
              </span>
            </div>
            <div>
              <span className="font-medium">Memory Impact:</span>
              <span className="ml-2 font-semibold">
                {processedHotspots.reduce((sum, h) => sum + h.memoryUsage, 0) / totalMemory > 0.01
                  ? `${((processedHotspots.reduce((sum, h) => sum + h.memoryUsage, 0) / totalMemory) * 100).toFixed(1)}%`
                  : '<1%'}
              </span>
            </div>
          </div>
        </div>

        {/* Color Legend */}
        <div className="mt-4 p-3 bg-gray-50 rounded-lg">
          <h4 className="text-sm font-semibold mb-2">Memory Usage Scale</h4>
          <div className="flex items-center space-x-2 text-xs">
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-blue-200 border border-blue-300 rounded"></div>
              <span>&lt;5%</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-green-200 border border-green-300 rounded"></div>
              <span>5-10%</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-yellow-200 border border-yellow-300 rounded"></div>
              <span>10-25%</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-orange-200 border border-orange-300 rounded"></div>
              <span>25-50%</span>
            </div>
            <div className="flex items-center space-x-1">
              <div className="w-4 h-4 bg-red-200 border border-red-300 rounded"></div>
              <span>&gt;50%</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chart View
  return (
    <div className="space-y-4">
      {/* View Controls */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1 rounded ${viewMode === 'grid' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Grid View
          </button>
          <button
            onClick={() => setViewMode('chart')}
            className={`px-3 py-1 rounded ${viewMode === 'chart' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Chart View
          </button>
        </div>
      </div>

      {/* Bar Chart */}
      <div className="bg-white p-4 border border-gray-200 rounded-lg">
        <h3 className="text-lg font-semibold mb-4">Memory Usage by Hotspot</h3>
        <div className="space-y-2">
          {processedHotspots.slice(0, 10).map((hotspot) => (
            <div key={`${hotspot.type}-${hotspot.name}`} className="flex items-center space-x-3">
              <div className="w-20 text-xs font-medium truncate">
                {hotspot.name.length > 15 ? hotspot.name.substring(0, 12) + '...' : hotspot.name}
              </div>
              <div className="flex-1">
                <div className="flex items-center space-x-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                    <div
                      className={`h-6 rounded-full flex items-center justify-center text-xs font-semibold text-white ${getSeverityColor(hotspot.severity)}`}
                      style={{ width: `${Math.min(hotspot.percentage, 100)}%` }}
                    >
                      {hotspot.percentage > 10 && `${hotspot.percentage.toFixed(1)}%`}
                    </div>
                  </div>
                  <div className="text-xs font-semibold w-16 text-right">
                    {formatMemorySize(hotspot.memoryUsage)}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};