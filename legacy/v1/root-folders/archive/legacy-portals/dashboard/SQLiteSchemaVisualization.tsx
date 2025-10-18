import React, { useState, useMemo } from 'react';
import { SQLiteTable, TableConnection } from './types';

interface SQLiteSchemaVisualizationProps {
  tables: SQLiteTable[];
  connections: TableConnection[];
  selectedTable: string | null;
  onTableSelect: (tableName: string) => void;
}

export const SQLiteSchemaVisualization: React.FC<SQLiteSchemaVisualizationProps> = ({
  tables,
  connections,
  selectedTable,
  onTableSelect
}) => {
  const [viewMode, setViewMode] = useState<'list' | 'graph'>('list');
  const [searchTerm, setSearchTerm] = useState('');

  const filteredTables = useMemo(() => {
    if (!searchTerm) return tables;
    return tables.filter(table =>
      table.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      table.columns.some(col => col.toLowerCase().includes(searchTerm.toLowerCase()))
    );
  }, [tables, searchTerm]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`;
    return `${Math.round(bytes / (1024 * 1024))}MB`;
  };

  const getRelationshipColor = (relationship: string): string => {
    const colors: Record<string, string> = {
      'one-to-one': 'bg-blue-200 text-blue-800',
      'one-to-many': 'bg-green-200 text-green-800',
      'many-to-many': 'bg-purple-200 text-purple-800'
    };
    return colors[relationship] || 'bg-gray-200 text-gray-800';
  };

  const getTableSizeColor = (size: number): string => {
    if (size > 5000) return 'text-red-600 font-semibold';
    if (size > 2000) return 'text-yellow-600';
    return 'text-green-600';
  };

  const selectedTableDetails = useMemo(() => {
    if (!selectedTable) return null;
    return tables.find(table => table.name === selectedTable);
  }, [selectedTable, tables]);

  const connectedTables = useMemo(() => {
    if (!selectedTable) return [];

    return connections
      .filter(conn => conn.from === selectedTable || conn.to === selectedTable)
      .map(conn => ({
        tableName: conn.from === selectedTable ? conn.to : conn.from,
        relationship: conn.relationship,
        joinKey: conn.joinKey
      }));
  }, [selectedTable, connections]);

  if (viewMode === 'list') {
    return (
      <div className="space-y-4">
        {/* View Controls */}
        <div className="flex justify-between items-center">
          <div className="flex space-x-2">
            <button
              onClick={() => setViewMode('list')}
              className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              List View
            </button>
            <button
              onClick={() => setViewMode('graph')}
              className={`px-3 py-1 rounded ${viewMode === 'graph' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
            >
              Graph View
            </button>
          </div>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search tables..."
            className="px-3 py-1 border border-gray-300 rounded-md text-sm"
          />
        </div>

        {/* Tables List */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filteredTables.map((table) => (
            <div
              key={table.name}
              onClick={() => onTableSelect(table.name)}
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedTable === table.name
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-800">{table.name}</h3>
                  <div className="flex space-x-4 mt-1 text-sm text-gray-600">
                    <span>{table.rowCount.toLocaleString()} rows</span>
                    <span className={getTableSizeColor(table.size)}>
                      {formatSize(table.size)}
                    </span>
                    <span>{table.columns.length} columns</span>
                  </div>
                </div>
                <div className="flex flex-col space-y-1">
                  {table.indexes && table.indexes.length > 0 && (
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                      {table.indexes.length} indexes
                    </span>
                  )}
                  {table.foreignKeys && table.foreignKeys.length > 0 && (
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                      {table.foreignKeys.length} FKs
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Selected Table Details */}
        {selectedTableDetails && (
          <div className="mt-4 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold text-gray-800 mb-3">
              Table Details: {selectedTableDetails.name}
            </h3>

            {/* Connections */}
            {connectedTables.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-gray-700 mb-2">Connected Tables</h4>
                <div className="space-y-2">
                  {connectedTables.map((conn, index) => (
                    <div key={index} className="flex items-center space-x-2">
                      <span className="font-mono text-sm">{conn.tableName}</span>
                      <span className={`text-xs px-2 py-1 rounded ${getRelationshipColor(conn.relationship)}`}>
                        {conn.relationship}
                      </span>
                      {conn.joinKey && (
                        <span className="text-xs text-gray-500">via {conn.joinKey}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Columns */}
            <div>
              <h4 className="font-medium text-gray-700 mb-2">Columns ({selectedTableDetails.columns.length})</h4>
              <div className="grid grid-cols-2 gap-2">
                {selectedTableDetails.columns.map((column) => (
                  <div key={column} className="text-sm font-mono bg-white px-2 py-1 rounded border">
                    {column}
                  </div>
                ))}
              </div>
            </div>

            {/* Indexes */}
            {selectedTableDetails.indexes && selectedTableDetails.indexes.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-700 mb-2">Indexes</h4>
                <div className="space-y-1">
                  {selectedTableDetails.indexes.map((index) => (
                    <div key={index} className="text-sm font-mono text-gray-600">
                      📎 {index}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Foreign Keys */}
            {selectedTableDetails.foreignKeys && selectedTableDetails.foreignKeys.length > 0 && (
              <div className="mt-4">
                <h4 className="font-medium text-gray-700 mb-2">Foreign Keys</h4>
                <div className="space-y-1">
                  {selectedTableDetails.foreignKeys.map((fk) => (
                    <div key={fk} className="text-sm font-mono text-gray-600">
                      🔗 {fk}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Schema Statistics */}
        <div className="mt-4 p-4 bg-blue-50 rounded-lg">
          <h3 className="font-semibold text-gray-800 mb-2">Schema Statistics</h3>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium">Total Tables:</span>
              <span className="ml-2 font-semibold">{tables.length}</span>
            </div>
            <div>
              <span className="font-medium">Total Size:</span>
              <span className="ml-2 font-semibold">
                {formatSize(tables.reduce((sum, table) => sum + table.size, 0))}
              </span>
            </div>
            <div>
              <span className="font-medium">Total Rows:</span>
              <span className="ml-2 font-semibold">
                {tables.reduce((sum, table) => sum + table.rowCount, 0).toLocaleString()}
              </span>
            </div>
            <div>
              <span className="font-medium">Connections:</span>
              <span className="ml-2 font-semibold">{connections.length}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Graph View (simplified SVG representation)
  return (
    <div className="space-y-4">
      {/* View Controls */}
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded ${viewMode === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            List View
          </button>
          <button
            onClick={() => setViewMode('graph')}
            className={`px-3 py-1 rounded ${viewMode === 'graph' ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            Graph View
          </button>
        </div>
      </div>

      {/* Simple Graph Visualization */}
      <div className="border border-gray-200 rounded-lg p-4 bg-gray-50">
        <svg width="100%" height="400" className="border border-gray-300 bg-white rounded">
          {/* Draw connections */}
          {connections.map((conn, index) => {
            const fromTable = tables.find(t => t.name === conn.from);
            const toTable = tables.find(t => t.name === conn.to);
            if (!fromTable || !toTable) return null;

            const fromX = (tables.indexOf(fromTable) % 4) * 150 + 75;
            const fromY = Math.floor(tables.indexOf(fromTable) / 4) * 100 + 50;
            const toX = (tables.indexOf(toTable) % 4) * 150 + 75;
            const toY = Math.floor(tables.indexOf(toTable) / 4) * 100 + 50;

            return (
              <line
                key={index}
                x1={fromX}
                y1={fromY}
                x2={toX}
                y2={toY}
                stroke={conn.relationship === 'one-to-one' ? '#3B82F6' :
                       conn.relationship === 'one-to-many' ? '#10B981' : '#8B5CF6'}
                strokeWidth="2"
                markerEnd="url(#arrowhead)"
              />
            );
          })}

          {/* Arrow marker definition */}
          <defs>
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="7"
              refX="9"
              refY="3.5"
              orient="auto"
            >
              <polygon
                points="0 0, 10 3.5, 0 7"
                fill="#666"
              />
            </marker>
          </defs>

          {/* Draw table nodes */}
          {tables.map((table, index) => {
            const x = (index % 4) * 150 + 75;
            const y = Math.floor(index / 4) * 100 + 50;
            const isSelected = table.name === selectedTable;
            const isLarge = table.size > 2000;

            return (
              <g key={table.name} onClick={() => onTableSelect(table.name)} className="cursor-pointer">
                <rect
                  x={x - 60}
                  y={y - 25}
                  width="120"
                  height="50"
                  rx="5"
                  fill={isSelected ? '#DBEAFE' : isLarge ? '#FEE2E2' : '#F3F4F6'}
                  stroke={isSelected ? '#3B82F6' : isLarge ? '#EF4444' : '#9CA3AF'}
                  strokeWidth="2"
                />
                <text
                  x={x}
                  y={y - 5}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="bold"
                  fill="#374151"
                >
                  {table.name.length > 15 ? table.name.substring(0, 12) + '...' : table.name}
                </text>
                <text
                  x={x}
                  y={y + 10}
                  textAnchor="middle"
                  fontSize="8"
                  fill="#6B7280"
                >
                  {table.rowCount} rows
                </text>
                <text
                  x={x}
                  y={y + 20}
                  textAnchor="middle"
                  fontSize="8"
                  fill={isLarge ? '#EF4444' : '#10B981'}
                >
                  {formatSize(table.size)}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-gray-100 border border-gray-400 rounded"></div>
            <span>Normal Table</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-4 bg-red-100 border border-red-400 rounded"></div>
            <span>Large Table (&gt;2KB)</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-1 bg-blue-500"></div>
            <span>One-to-One</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-1 bg-green-500"></div>
            <span>One-to-Many</span>
          </div>
          <div className="flex items-center space-x-2">
            <div className="w-4 h-1 bg-purple-500"></div>
            <span>Many-to-Many</span>
          </div>
        </div>
      </div>
    </div>
  );
};