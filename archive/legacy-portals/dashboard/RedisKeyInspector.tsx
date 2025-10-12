import React, { useState, useEffect } from 'react';
import { RedisKeyInfo, RedisClient } from './types';

interface RedisKeyInspectorProps {
  keys: RedisKeyInfo[];
  selectedKey: string | null;
  onKeySelect: (key: string) => void;
  redisClient: RedisClient | null;
}

export const RedisKeyInspector: React.FC<RedisKeyInspectorProps> = ({
  keys,
  selectedKey,
  onKeySelect,
  redisClient
}) => {
  const [searchPattern, setSearchPattern] = useState('*');
  const [keyDetails, setKeyDetails] = useState<RedisKeyInfo | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (selectedKey && redisClient) {
      loadKeyDetails(selectedKey);
    }
  }, [selectedKey, redisClient]);

  const loadKeyDetails = async (keyName: string) => {
    setIsLoading(true);
    try {
      // Find key in current keys list
      const key = keys.find(k => k.key === keyName);
      if (key) {
        setKeyDetails(key);
      }
    } catch (error) {
      console.error('Error loading key details:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!redisClient) return;

    setIsLoading(true);
    try {
      const matchingKeys = await redisClient.getKeys(searchPattern);
      // In a real implementation, we'd update the parent component with new keys
      console.log('Found keys:', matchingKeys);
    } catch (error) {
      console.error('Error searching keys:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatMemorySize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  };

  const formatTTL = (ttl: number): string => {
    if (ttl === -1) return 'No expiry';
    if (ttl === -2) return 'Not found';
    return `${ttl}s`;
  };

  const getTypeColor = (type: string): string => {
    const colors: Record<string, string> = {
      string: 'bg-blue-100 text-blue-800',
      list: 'bg-green-100 text-green-800',
      hash: 'bg-yellow-100 text-yellow-800',
      set: 'bg-purple-100 text-purple-800',
      zset: 'bg-pink-100 text-pink-800',
      stream: 'bg-indigo-100 text-indigo-800'
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  const getSeverityColor = (memory: number): string => {
    if (memory > 10240) return 'text-red-600 font-semibold';
    if (memory > 5120) return 'text-yellow-600';
    return 'text-green-600';
  };

  return (
    <div className="space-y-4">
      {/* Search Controls */}
      <div className="flex space-x-2">
        <input
          type="text"
          value={searchPattern}
          onChange={(e) => setSearchPattern(e.target.value)}
          placeholder="Search pattern (e.g., swarm:*)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          onClick={handleSearch}
          disabled={isLoading || !redisClient}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Search...' : 'Search'}
        </button>
      </div>

      {/* Redis Connection Status */}
      <div className="flex items-center space-x-2">
        <div className={`w-2 h-2 rounded-full ${redisClient ? 'bg-green-500' : 'bg-red-500'}`}></div>
        <span className="text-sm text-gray-600">
          {redisClient ? 'Connected to Redis' : 'Redis not connected'}
        </span>
      </div>

      {/* Keys List */}
      <div className="border border-gray-200 rounded-md max-h-96 overflow-y-auto">
        {keys.length === 0 ? (
          <div className="p-4 text-center text-gray-500">
            No keys found
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Key</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Size</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">TTL</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {keys.map((key) => (
                <tr
                  key={key.key}
                  onClick={() => onKeySelect(key.key)}
                  className={`cursor-pointer hover:bg-gray-50 ${selectedKey === key.key ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-3 py-2 text-sm font-mono text-gray-900 truncate max-w-xs">
                    {key.key}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(key.type)}`}>
                      {key.type}
                    </span>
                  </td>
                  <td className={`px-3 py-2 text-sm ${getSeverityColor(key.memory)}`}>
                    {formatMemorySize(key.memory)}
                  </td>
                  <td className="px-3 py-2 text-sm text-gray-600">
                    {formatTTL(key.ttl)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Key Details */}
      {keyDetails && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md">
          <h3 className="font-semibold text-gray-800 mb-2">Key Details: {keyDetails.key}</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Type:</span>
              <span className={`ml-2 inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getTypeColor(keyDetails.type)}`}>
                {keyDetails.type}
              </span>
            </div>
            <div>
              <span className="font-medium">Memory Usage:</span>
              <span className={`ml-2 ${getSeverityColor(keyDetails.memory)}`}>
                {formatMemorySize(keyDetails.memory)}
              </span>
            </div>
            <div>
              <span className="font-medium">Size:</span>
              <span className="ml-2">{keyDetails.size} elements</span>
            </div>
            <div>
              <span className="font-medium">TTL:</span>
              <span className="ml-2">{formatTTL(keyDetails.ttl)}</span>
            </div>
            {keyDetails.lastAccessed && (
              <div className="col-span-2">
                <span className="font-medium">Last Accessed:</span>
                <span className="ml-2">{keyDetails.lastAccessed.toLocaleString()}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Key Statistics */}
      <div className="mt-4 p-4 bg-blue-50 rounded-md">
        <h3 className="font-semibold text-gray-800 mb-2">Statistics</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <span className="font-medium">Total Keys:</span>
            <span className="ml-2 font-semibold">{keys.length}</span>
          </div>
          <div>
            <span className="font-medium">Total Memory:</span>
            <span className="ml-2 font-semibold">
              {formatMemorySize(keys.reduce((sum, key) => sum + key.memory, 0))}
            </span>
          </div>
          <div>
            <span className="font-medium">Hotspots:</span>
            <span className="ml-2 font-semibold text-red-600">
              {keys.filter(key => key.memory > 5120).length}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};