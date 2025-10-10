import React, { useState, useMemo } from 'react';
import { OptimizationRecommendation } from './types';

interface OptimizationEngineProps {
  recommendations: string[];
  onApplyRecommendation: (recommendation: string) => void;
}

export const OptimizationEngine: React.FC<OptimizationEngineProps> = ({
  recommendations,
  onApplyRecommendation
}) => {
  const [selectedRecommendation, setSelectedRecommendation] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState({
    category: 'all',
    impact: 'all',
    effort: 'all'
  });

  const optimizationRecommendations = useMemo(() => {
    const baseRecommendations: OptimizationRecommendation[] = [
      {
        id: 'redis-compression-1',
        title: 'Enable Redis Compression',
        description: 'Compress large Redis keys to reduce memory usage by 60-80%',
        impact: 'high',
        effort: 'medium',
        category: 'redis',
        action: async () => {
          console.log('Applying Redis compression...');
          // Simulate applying compression
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      },
      {
        id: 'redis-ttl-optimization',
        title: 'Optimize Redis TTL Settings',
        description: 'Set appropriate TTL values for temporary keys to prevent memory bloat',
        impact: 'medium',
        effort: 'low',
        category: 'redis',
        action: async () => {
          console.log('Optimizing Redis TTL settings...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      },
      {
        id: 'sqlite-index-optimization',
        title: 'Add Missing SQLite Indexes',
        description: 'Create indexes for frequently queried columns to improve performance',
        impact: 'high',
        effort: 'medium',
        category: 'sqlite',
        action: async () => {
          console.log('Adding SQLite indexes...');
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      },
      {
        id: 'sqlite-archive-old-data',
        title: 'Archive Old SQLite Records',
        description: 'Move records older than 30 days to archive tables to reduce main table size',
        impact: 'medium',
        effort: 'high',
        category: 'sqlite',
        action: async () => {
          console.log('Archiving old SQLite data...');
          await new Promise(resolve => setTimeout(resolve, 5000));
        }
      },
      {
        id: 'memory-cleanup',
        title: 'Perform Memory Cleanup',
        description: 'Clean up expired keys and unused memory allocations',
        impact: 'medium',
        effort: 'low',
        category: 'general',
        action: async () => {
          console.log('Performing memory cleanup...');
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      },
      {
        id: 'connection-pool-optimization',
        title: 'Optimize Connection Pools',
        description: 'Adjust database and Redis connection pool sizes for optimal performance',
        impact: 'medium',
        effort: 'low',
        category: 'general',
        action: async () => {
          console.log('Optimizing connection pools...');
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    ];

    // Add custom recommendations from props
    const customRecommendations = recommendations.map((rec, index) => ({
      id: `custom-${index}`,
      title: rec,
      description: `Custom recommendation: ${rec}`,
      impact: 'medium' as const,
      effort: 'low' as const,
      category: 'general' as const,
      action: async () => {
        console.log('Applying custom recommendation:', rec);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }));

    return [...baseRecommendations, ...customRecommendations];
  }, [recommendations]);

  const filteredRecommendations = useMemo(() => {
    return optimizationRecommendations.filter(rec => {
      if (activeFilters.category !== 'all' && rec.category !== activeFilters.category) return false;
      if (activeFilters.impact !== 'all' && rec.impact !== activeFilters.impact) return false;
      if (activeFilters.effort !== 'all' && rec.effort !== activeFilters.effort) return false;
      return true;
    });
  }, [optimizationRecommendations, activeFilters]);

  const getImpactColor = (impact: string): string => {
    switch (impact) {
      case 'high': return 'bg-red-100 text-red-800 border-red-200';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'low': return 'bg-green-100 text-green-800 border-green-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getEffortColor = (effort: string): string => {
    switch (effort) {
      case 'high': return 'bg-purple-100 text-purple-800';
      case 'medium': return 'bg-blue-100 text-blue-800';
      case 'low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'redis': return '🔴';
      case 'sqlite': return '💾';
      case 'general': return '⚙️';
      default: return '📋';
    }
  };

  const [applyingRecommendations, setApplyingRecommendations] = useState<Set<string>>(new Set());

  const handleApplyRecommendation = async (recommendation: OptimizationRecommendation) => {
    setApplyingRecommendations(prev => new Set(prev).add(recommendation.id));

    try {
      await recommendation.action();
      onApplyRecommendation(recommendation.title);

      // Update recommendation status
      recommendation.applied = true;
      recommendation.result = 'Successfully applied';

    } catch (error) {
      recommendation.result = `Error: ${error.message}`;
    } finally {
      setApplyingRecommendations(prev => {
        const newSet = new Set(prev);
        newSet.delete(recommendation.id);
        return newSet;
      });
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select
          value={activeFilters.category}
          onChange={(e) => setActiveFilters(prev => ({ ...prev, category: e.target.value }))}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Categories</option>
          <option value="redis">Redis</option>
          <option value="sqlite">SQLite</option>
          <option value="general">General</option>
        </select>

        <select
          value={activeFilters.impact}
          onChange={(e) => setActiveFilters(prev => ({ ...prev, impact: e.target.value }))}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Impact Levels</option>
          <option value="high">High Impact</option>
          <option value="medium">Medium Impact</option>
          <option value="low">Low Impact</option>
        </select>

        <select
          value={activeFilters.effort}
          onChange={(e) => setActiveFilters(prev => ({ ...prev, effort: e.target.value }))}
          className="px-3 py-1 border border-gray-300 rounded-md text-sm"
        >
          <option value="all">All Effort Levels</option>
          <option value="low">Low Effort</option>
          <option value="medium">Medium Effort</option>
          <option value="high">High Effort</option>
        </select>
      </div>

      {/* Recommendations List */}
      <div className="space-y-3 max-h-96 overflow-y-auto">
        {filteredRecommendations.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">🎯</div>
            <p>No recommendations match current filters</p>
          </div>
        ) : (
          filteredRecommendations.map((recommendation) => (
            <div
              key={recommendation.id}
              className={`p-4 border rounded-lg transition-all ${
                selectedRecommendation === recommendation.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${recommendation.applied ? 'bg-green-50 border-green-300' : ''}`}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-start space-x-2">
                  <span className="text-lg">{getCategoryIcon(recommendation.category)}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{recommendation.title}</h3>
                    <p className="text-sm text-gray-600 mt-1">{recommendation.description}</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedRecommendation(
                    selectedRecommendation === recommendation.id ? null : recommendation.id
                  )}
                  className="text-gray-400 hover:text-gray-600"
                >
                  {selectedRecommendation === recommendation.id ? '▼' : '▶'}
                </button>
              </div>

              <div className="flex items-center space-x-2 mb-3">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full border ${getImpactColor(recommendation.impact)}`}>
                  {recommendation.impact} impact
                </span>
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getEffortColor(recommendation.effort)}`}>
                  {recommendation.effort} effort
                </span>
                <span className="px-2 py-1 text-xs bg-gray-100 text-gray-800 rounded-full">
                  {recommendation.category}
                </span>
              </div>

              {recommendation.applied && (
                <div className="mb-3 p-2 bg-green-100 text-green-800 text-sm rounded">
                  ✅ {recommendation.result}
                </div>
              )}

              {selectedRecommendation === recommendation.id && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <div className="text-sm text-gray-600 mb-3">
                    <strong>Implementation Details:</strong> This optimization will help reduce memory usage and improve overall system performance.
                  </div>
                  <button
                    onClick={() => handleApplyRecommendation(recommendation)}
                    disabled={applyingRecommendations.has(recommendation.id) || recommendation.applied}
                    className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                      recommendation.applied
                        ? 'bg-green-100 text-green-800 cursor-not-allowed'
                        : applyingRecommendations.has(recommendation.id)
                        ? 'bg-gray-100 text-gray-500 cursor-wait'
                        : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                  >
                    {recommendation.applied
                      ? 'Applied'
                      : applyingRecommendations.has(recommendation.id)
                      ? 'Applying...'
                      : 'Apply Recommendation'
                    }
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Optimization Statistics */}
      <div className="mt-4 p-4 bg-blue-50 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">Optimization Statistics</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium">Total Recommendations:</span>
            <span className="ml-2 font-semibold">{optimizationRecommendations.length}</span>
          </div>
          <div>
            <span className="font-medium">High Impact:</span>
            <span className="ml-2 font-semibold text-red-600">
              {optimizationRecommendations.filter(r => r.impact === 'high').length}
            </span>
          </div>
          <div>
            <span className="font-medium">Applied:</span>
            <span className="ml-2 font-semibold text-green-600">
              {optimizationRecommendations.filter(r => r.applied).length}
            </span>
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="mt-4 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-semibold text-gray-800 mb-2">Quick Actions</h3>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const lowEffortHighImpact = optimizationRecommendations.filter(
                r => r.effort === 'low' && r.impact === 'high' && !r.applied
              );
              lowEffortHighImpact.forEach(rec => handleApplyRecommendation(rec));
            }}
            className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600"
          >
            Apply All Low-Effort High-Impact
          </button>
          <button
            onClick={() => {
              const allRecs = optimizationRecommendations.filter(r => !r.applied);
              allRecs.forEach(rec => handleApplyRecommendation(rec));
            }}
            className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
          >
            Apply All Recommendations
          </button>
          <button
            onClick={() => {
              optimizationRecommendations.forEach(r => {
                r.applied = false;
                r.result = undefined;
              });
            }}
            className="px-3 py-1 bg-gray-500 text-white rounded text-sm hover:bg-gray-600"
          >
            Reset Applied Status
          </button>
        </div>
      </div>
    </div>
  );
};