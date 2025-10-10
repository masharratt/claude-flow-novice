import React, { useState, useMemo, useCallback } from 'react';
import { RedisKeyInfo, SQLiteTable, MemoryPattern } from './types';

interface MemoryPatternAnalysisProps {
  redisKeys: RedisKeyInfo[];
  sqliteTables: SQLiteTable[];
  onPatternDetected: (pattern: MemoryPattern) => void;
}

export const MemoryPatternAnalysis: React.FC<MemoryPatternAnalysisProps> = ({
  redisKeys,
  sqliteTables,
  onPatternDetected
}) => {
  const [selectedPattern, setSelectedPattern] = useState<MemoryPattern | null>(null);
  const [analysisMode, setAnalysisMode] = useState<'automatic' | 'manual'>('automatic');
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const detectedPatterns = useMemo(() => {
    const patterns: MemoryPattern[] = [];

    // Pattern 1: Large Redis Keys
    const largeRedisKeys = redisKeys.filter(key => key.memory > 5000);
    if (largeRedisKeys.length > 0) {
      patterns.push({
        id: 'large-redis-keys',
        type: 'Memory Bloat',
        frequency: largeRedisKeys.length,
        impact: largeRedisKeys.reduce((sum, key) => sum + key.memory, 0),
        description: 'Multiple Redis keys consuming significant memory',
        recommendations: [
          'Consider implementing data compression',
          'Review key expiration policies',
          'Split large keys into smaller chunks'
        ],
        affectedKeys: largeRedisKeys.map(key => key.key),
        affectedTables: []
      });
    }

    // Pattern 2: No TTL Keys
    const noTTLKeys = redisKeys.filter(key => key.ttl === -1 && key.type !== 'hash');
    if (noTTLKeys.length > 5) {
      patterns.push({
        id: 'no-ttl-keys',
        type: 'Memory Leak Risk',
        frequency: noTTLKeys.length,
        impact: noTTLKeys.length * 1000, // Estimated impact
        description: 'Multiple Redis keys without TTL settings',
        recommendations: [
          'Set appropriate TTL values for temporary data',
          'Implement automatic cleanup processes',
          'Review data retention policies'
        ],
        affectedKeys: noTTLKeys.map(key => key.key),
        affectedTables: []
      });
    }

    // Pattern 3: Large SQLite Tables
    const largeTables = sqliteTables.filter(table => table.size > 2000);
    if (largeTables.length > 0) {
      patterns.push({
        id: 'large-sqlite-tables',
        type: 'Table Bloat',
        frequency: largeTables.length,
        impact: largeTables.reduce((sum, table) => sum + table.size, 0),
        description: 'SQLite tables consuming excessive storage',
        recommendations: [
          'Implement data archiving strategies',
          'Add indexes for better query performance',
          'Consider table partitioning'
        ],
        affectedKeys: [],
        affectedTables: largeTables.map(table => table.name)
      });
    }

    // Pattern 4: High Row Count Tables
    const highRowCountTables = sqliteTables.filter(table => table.rowCount > 1000);
    if (highRowCountTables.length > 0) {
      patterns.push({
        id: 'high-row-count',
        type: 'Performance Impact',
        frequency: highRowCountTables.length,
        impact: highRowCountTables.reduce((sum, table) => sum + table.rowCount, 0) * 100,
        description: 'Tables with high row counts affecting performance',
        recommendations: [
          'Implement pagination for data access',
          'Add appropriate indexes',
          'Consider data archiving or cleanup'
        ],
        affectedKeys: [],
        affectedTables: highRowCountTables.map(table => table.name)
      });
    }

    // Pattern 5: Redis Key Type Distribution
    const keyTypeDistribution = redisKeys.reduce((acc, key) => {
      acc[key.type] = (acc[key.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const dominantType = Object.entries(keyTypeDistribution)
      .sort(([,a], [,b]) => b - a)[0];

    if (dominantType && dominantType[1] > redisKeys.length * 0.6) {
      patterns.push({
        id: 'dominant-key-type',
        type: 'Usage Pattern',
        frequency: dominantType[1],
        impact: dominantType[1] * 500,
        description: `Dominant use of ${dominantType[0]} key type`,
        recommendations: [
          `Optimize ${dominantType[0]} operations`,
          'Consider data structure alternatives',
          'Monitor performance impact'
        ],
        affectedKeys: redisKeys.filter(key => key.type === dominantType[0]).map(key => key.key),
        affectedTables: []
      });
    }

    // Pattern 6: Memory Fragmentation (Simulated)
    const totalMemory = redisKeys.reduce((sum, key) => sum + key.memory, 0);
    const avgKeySize = totalMemory / redisKeys.length;
    const variance = redisKeys.reduce((sum, key) => sum + Math.pow(key.memory - avgKeySize, 2), 0) / redisKeys.length;

    if (variance > avgKeySize * avgKeySize) {
      patterns.push({
        id: 'memory-fragmentation',
        type: 'Fragmentation',
        frequency: redisKeys.length,
        impact: Math.round(variance * 0.1),
        description: 'High variance in key sizes indicating potential memory fragmentation',
        recommendations: [
          'Implement consistent key sizing strategies',
          'Consider memory defragmentation',
          'Review data allocation patterns'
        ],
        affectedKeys: redisKeys.map(key => key.key),
        affectedTables: []
      });
    }

    return patterns.sort((a, b) => b.impact - a.impact);
  }, [redisKeys, sqliteTables]);

  const runAnalysis = useCallback(async () => {
    setIsAnalyzing(true);

    // Simulate analysis process
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Notify about detected patterns
    detectedPatterns.forEach(pattern => {
      onPatternDetected(pattern);
    });

    setIsAnalyzing(false);
  }, [detectedPatterns, onPatternDetected]);

  const getPatternSeverityColor = (impact: number): string => {
    if (impact > 10000) return 'text-red-600 bg-red-50 border-red-200';
    if (impact > 5000) return 'text-orange-600 bg-orange-50 border-orange-200';
    if (impact > 1000) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-green-600 bg-green-50 border-green-200';
  };

  const getPatternTypeIcon = (type: string): string => {
    switch (type) {
      case 'Memory Bloat': return '🫃';
      case 'Memory Leak Risk': return '💧';
      case 'Table Bloat': return '📊';
      case 'Performance Impact': return '⚡';
      case 'Usage Pattern': return '📈';
      case 'Fragmentation': return '🧩';
      default: return '🔍';
    }
  };

  const formatImpact = (impact: number): string => {
    if (impact < 1024) return `${impact}B`;
    if (impact < 1024 * 1024) return `${Math.round(impact / 1024)}KB`;
    return `${Math.round(impact / (1024 * 1024))}MB`;
  };

  return (
    <div className="space-y-4">
      {/* Analysis Controls */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => setAnalysisMode('automatic')}
            className={`px-3 py-1 rounded ${analysisMode === 'automatic' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Automatic Analysis
          </button>
          <button
            onClick={() => setAnalysisMode('manual')}
            className={`px-3 py-1 rounded ${analysisMode === 'manual' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Manual Analysis
          </button>
        </div>
        <button
          onClick={runAnalysis}
          disabled={isAnalyzing}
          className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center space-x-2"
        >
          {isAnalyzing ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
              <span>Analyzing...</span>
            </>
          ) : (
            <>
              <span>🔍</span>
              <span>Run Analysis</span>
            </>
          )}
        </button>
      </div>

      {/* Pattern Summary */}
      <div className="grid grid-cols-4 gap-4">
        <div className="text-center p-3 bg-blue-50 rounded-lg">
          <div className="text-2xl font-bold text-blue-600">{detectedPatterns.length}</div>
          <div className="text-sm text-gray-600">Patterns Found</div>
        </div>
        <div className="text-center p-3 bg-red-50 rounded-lg">
          <div className="text-2xl font-bold text-red-600">
            {detectedPatterns.filter(p => p.impact > 5000).length}
          </div>
          <div className="text-sm text-gray-600">High Impact</div>
        </div>
        <div className="text-center p-3 bg-yellow-50 rounded-lg">
          <div className="text-2xl font-bold text-yellow-600">
            {detectedPatterns.reduce((sum, p) => sum + p.frequency, 0)}
          </div>
          <div className="text-sm text-gray-600">Total Occurrences</div>
        </div>
        <div className="text-center p-3 bg-green-50 rounded-lg">
          <div className="text-2xl font-bold text-green-600">
            {formatImpact(detectedPatterns.reduce((sum, p) => sum + p.impact, 0))}
          </div>
          <div className="text-sm text-gray-600">Total Impact</div>
        </div>
      </div>

      {/* Detected Patterns */}
      <div className="space-y-3">
        {detectedPatterns.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <div className="text-4xl mb-2">✨</div>
            <p>No memory patterns detected. System appears healthy!</p>
          </div>
        ) : (
          detectedPatterns.map((pattern) => (
            <div
              key={pattern.id}
              onClick={() => setSelectedPattern(
                selectedPattern?.id === pattern.id ? null : pattern
              )}
              className={`p-4 border rounded-lg cursor-pointer transition-all ${
                selectedPattern?.id === pattern.id
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex items-start space-x-3">
                  <span className="text-2xl">{getPatternTypeIcon(pattern.type)}</span>
                  <div className="flex-1">
                    <h3 className="font-semibold text-gray-800">{pattern.type}</h3>
                    <p className="text-sm text-gray-600 mt-1">{pattern.description}</p>
                  </div>
                </div>
                <div className="text-right">
                  <div className={`px-3 py-1 rounded-full text-sm font-semibold ${getPatternSeverityColor(pattern.impact)}`}>
                    {formatImpact(pattern.impact)}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {pattern.frequency} occurrence{pattern.frequency !== 1 ? 's' : ''}
                  </div>
                </div>
              </div>

              {selectedPattern?.id === pattern.id && (
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Affected Redis Keys</h4>
                      {pattern.affectedKeys.length > 0 ? (
                        <div className="space-y-1 max-h-32 overflow-y-auto">
                          {pattern.affectedKeys.slice(0, 10).map((key, index) => (
                            <div key={index} className="text-xs font-mono bg-gray-100 px-2 py-1 rounded">
                              {key}
                            </div>
                          ))}
                          {pattern.affectedKeys.length > 10 && (
                            <div className="text-xs text-gray-500 italic">
                              ... and {pattern.affectedKeys.length - 10} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">None</div>
                      )}
                    </div>

                    <div>
                      <h4 className="font-medium text-gray-700 mb-2">Affected SQLite Tables</h4>
                      {pattern.affectedTables.length > 0 ? (
                        <div className="space-y-1">
                          {pattern.affectedTables.map((table, index) => (
                            <div key={index} className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                              📊 {table}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-sm text-gray-500">None</div>
                      )}
                    </div>
                  </div>

                  <div className="mt-4">
                    <h4 className="font-medium text-gray-700 mb-2">Recommendations</h4>
                    <ul className="space-y-1">
                      {pattern.recommendations.map((rec, index) => (
                        <li key={index} className="text-sm text-gray-600 flex items-start">
                          <span className="text-blue-500 mr-2">•</span>
                          {rec}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* Analysis Settings */}
      {analysisMode === 'manual' && (
        <div className="mt-4 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">Manual Analysis Settings</h3>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Memory Threshold (KB)</label>
              <input
                type="number"
                defaultValue={5000}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Row Count Threshold</label>
              <input
                type="number"
                defaultValue={1000}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Analysis Depth</label>
              <select className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm">
                <option>Basic</option>
                <option>Standard</option>
                <option>Comprehensive</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};