import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { FixedSizeList as List } from 'react-window';
import Fuse from 'fuse.js';
import './MessageViewer.css';

// Type definitions
export interface AgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  type: 'info' | 'warning' | 'error' | 'success' | 'debug';
  priority: 'low' | 'medium' | 'high' | 'critical';
  content: string;
  timestamp: Date;
  threadId?: string;
  parentId?: string;
  metadata: {
    confidence: number;
    alternatives?: string[];
    reasoning?: string[];
    executionTime?: number;
    tokens?: number;
    model?: string;
  };
  tags?: string[];
  isCollapsed?: boolean;
}

export interface MessageThread {
  id: string;
  messages: AgentMessage[];
  depth: number;
  isExpanded: boolean;
}

export interface FilterOptions {
  agents: string[];
  types: string[];
  priorities: string[];
  keywords: string;
  dateRange: {
    start: Date | null;
    end: Date | null;
  };
  showMetadata: boolean;
  showReasoning: boolean;
}

interface MessageViewerProps {
  websocketUrl: string;
  theme?: 'light' | 'dark';
  className?: string;
  onMessageSelect?: (message: AgentMessage) => void;
  onExport?: (messages: AgentMessage[]) => void;
  maxMessages?: number;
  enableVirtualScrolling?: boolean;
}

const MessageViewer: React.FC<MessageViewerProps> = ({
  websocketUrl,
  theme = 'light',
  className = '',
  onMessageSelect,
  onExport,
  maxMessages = 10000,
  enableVirtualScrolling = true
}) => {
  // State management
  const [messages, setMessages] = useState<AgentMessage[]>([]);
  const [filteredMessages, setFilteredMessages] = useState<AgentMessage[]>([]);
  const [threads, setThreads] = useState<Map<string, MessageThread>>(new Map());
  const [selectedMessage, setSelectedMessage] = useState<AgentMessage | null>(null);
  const [filters, setFilters] = useState<FilterOptions>({
    agents: [],
    types: [],
    priorities: [],
    keywords: '',
    dateRange: { start: null, end: null },
    showMetadata: true,
    showReasoning: false
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [messagesPerPage] = useState(50);

  // Refs
  const wsRef = useRef<WebSocket | null>(null);
  const listRef = useRef<List>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Fuzzy search configuration
  const fuse = useMemo(() => {
    return new Fuse(messages, {
      keys: [
        'content',
        'agentName',
        'metadata.reasoning',
        'tags'
      ],
      threshold: 0.3,
      includeScore: true,
      includeMatches: true
    });
  }, [messages]);

  // WebSocket connection management
  useEffect(() => {
    const connect = () => {
      try {
        wsRef.current = new WebSocket(websocketUrl);

        wsRef.current.onopen = () => {
          setIsConnected(true);
          console.log('WebSocket connected');
        };

        wsRef.current.onmessage = (event) => {
          try {
            const message: AgentMessage = JSON.parse(event.data);
            setMessages(prev => {
              const newMessages = [message, ...prev].slice(0, maxMessages);
              return newMessages;
            });
          } catch (error) {
            console.error('Failed to parse message:', error);
          }
        };

        wsRef.current.onclose = () => {
          setIsConnected(false);
          console.log('WebSocket disconnected');
          // Attempt to reconnect after 3 seconds
          setTimeout(connect, 3000);
        };

        wsRef.current.onerror = (error) => {
          console.error('WebSocket error:', error);
          setIsConnected(false);
        };

      } catch (error) {
        console.error('Failed to connect WebSocket:', error);
        setIsConnected(false);
      }
    };

    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [websocketUrl, maxMessages]);

  // Build thread structure
  const buildThreads = useCallback((messages: AgentMessage[]) => {
    const threadMap = new Map<string, MessageThread>();
    const processedMessages = new Set<string>();

    messages.forEach(message => {
      if (processedMessages.has(message.id)) return;

      const threadId = message.threadId || message.id;

      if (!threadMap.has(threadId)) {
        threadMap.set(threadId, {
          id: threadId,
          messages: [],
          depth: 0,
          isExpanded: true
        });
      }

      const thread = threadMap.get(threadId)!;
      thread.messages.push(message);
      processedMessages.add(message.id);

      // Calculate thread depth based on parent relationships
      if (message.parentId) {
        let depth = 0;
        let currentMessage = message;
        while (currentMessage.parentId && depth < 10) {
          const parentMessage = messages.find(m => m.id === currentMessage.parentId);
          if (!parentMessage) break;
          currentMessage = parentMessage;
          depth++;
        }
        thread.depth = Math.max(thread.depth, depth);
      }
    });

    // Sort messages within each thread by timestamp
    threadMap.forEach(thread => {
      thread.messages.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    });

    setThreads(threadMap);
  }, []);

  // Apply filters and search
  useEffect(() => {
    let filtered = [...messages];

    // Apply agent filter
    if (filters.agents.length > 0) {
      filtered = filtered.filter(msg => filters.agents.includes(msg.agentId));
    }

    // Apply type filter
    if (filters.types.length > 0) {
      filtered = filtered.filter(msg => filters.types.includes(msg.type));
    }

    // Apply priority filter
    if (filters.priorities.length > 0) {
      filtered = filtered.filter(msg => filters.priorities.includes(msg.priority));
    }

    // Apply date range filter
    if (filters.dateRange.start) {
      filtered = filtered.filter(msg => msg.timestamp >= filters.dateRange.start!);
    }
    if (filters.dateRange.end) {
      filtered = filtered.filter(msg => msg.timestamp <= filters.dateRange.end!);
    }

    // Apply keyword filter
    if (filters.keywords.trim()) {
      const keywords = filters.keywords.toLowerCase().split(/\s+/);
      filtered = filtered.filter(msg =>
        keywords.some(keyword =>
          msg.content.toLowerCase().includes(keyword) ||
          msg.agentName.toLowerCase().includes(keyword) ||
          msg.metadata.reasoning?.some(r => r.toLowerCase().includes(keyword))
        )
      );
    }

    // Apply fuzzy search
    if (searchQuery.trim()) {
      const searchResults = fuse.search(searchQuery);
      const searchIds = new Set(searchResults.map(result => result.item.id));
      filtered = filtered.filter(msg => searchIds.has(msg.id));
    }

    setFilteredMessages(filtered);
    buildThreads(filtered);
  }, [messages, filters, searchQuery, fuse, buildThreads]);

  // Get unique agents, types, and priorities for filter options
  const filterOptions = useMemo(() => {
    const agents = [...new Set(messages.map(m => m.agentName))].sort();
    const types = [...new Set(messages.map(m => m.type))].sort();
    const priorities = [...new Set(messages.map(m => m.priority))].sort();
    return { agents, types, priorities };
  }, [messages]);

  // Handle message selection
  const handleMessageSelect = useCallback((message: AgentMessage) => {
    setSelectedMessage(message);
    onMessageSelect?.(message);
  }, [onMessageSelect]);

  // Handle export
  const handleExport = useCallback(() => {
    onExport?.(filteredMessages);
  }, [onExport, filteredMessages]);

  // Toggle thread expansion
  const toggleThread = useCallback((threadId: string) => {
    setThreads(prev => {
      const newThreads = new Map(prev);
      const thread = newThreads.get(threadId);
      if (thread) {
        thread.isExpanded = !thread.isExpanded;
      }
      return newThreads;
    });
  }, []);

  // Get message type icon
  const getTypeIcon = (type: string) => {
    const icons = {
      info: '📝',
      warning: '⚠️',
      error: '❌',
      success: '✅',
      debug: '🐛'
    };
    return icons[type as keyof typeof icons] || '📝';
  };

  // Get priority color
  const getPriorityColor = (priority: string) => {
    const colors = {
      low: '#10B981',
      medium: '#F59E0B',
      high: '#EF4444',
      critical: '#7C2D12'
    };
    return colors[priority as keyof typeof colors] || '#6B7280';
  };

  // Format timestamp
  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleString();
  };

  // Get confidence indicator color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#10B981';
    if (confidence >= 0.6) return '#F59E0B';
    return '#EF4444';
  };

  // Pagination
  const paginatedMessages = useMemo(() => {
    const startIndex = (currentPage - 1) * messagesPerPage;
    return filteredMessages.slice(startIndex, startIndex + messagesPerPage);
  }, [filteredMessages, currentPage, messagesPerPage]);

  const totalPages = Math.ceil(filteredMessages.length / messagesPerPage);

  // Virtual list item renderer
  const MessageItem = ({ index, style }: { index: number; style: React.CSSProperties }) => {
    const message = paginatedMessages[index];
    const isSelected = selectedMessage?.id === message.id;
    const thread = threads.get(message.threadId || message.id);

    return (
      <div style={style}>
        <div
          className={`message-item ${isSelected ? 'selected' : ''} ${theme}`}
          onClick={() => handleMessageSelect(message)}
        >
          <div className="message-header">
            <div className="message-info">
              <span className="message-icon">{getTypeIcon(message.type)}</span>
              <span className="agent-name">{message.agentName}</span>
              <span className="message-type" style={{ color: getPriorityColor(message.priority) }}>
                {message.type.toUpperCase()}
              </span>
              <span className="timestamp">{formatTimestamp(message.timestamp)}</span>
              {thread && thread.messages.length > 1 && (
                <button
                  className="thread-toggle"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleThread(thread.id);
                  }}
                >
                  {thread.isExpanded ? '▼' : '▶'} Thread ({thread.messages.length})
                </button>
              )}
            </div>
            {filters.showMetadata && (
              <div className="message-metadata">
                <div
                  className="confidence-indicator"
                  style={{ backgroundColor: getConfidenceColor(message.metadata.confidence) }}
                  title={`Confidence: ${(message.metadata.confidence * 100).toFixed(1)}%`}
                />
                {message.metadata.executionTime && (
                  <span className="execution-time">
                    {message.metadata.executionTime}ms
                  </span>
                )}
                {message.metadata.tokens && (
                  <span className="token-count">
                    {message.metadata.tokens} tokens
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="message-content">
            {message.content}
          </div>

          {filters.showReasoning && message.metadata.reasoning && (
            <div className="reasoning-section">
              <h4>Reasoning Steps:</h4>
              <ol>
                {message.metadata.reasoning.map((step, idx) => (
                  <li key={idx}>{step}</li>
                ))}
              </ol>
            </div>
          )}

          {message.metadata.alternatives && message.metadata.alternatives.length > 0 && (
            <div className="alternatives-section">
              <details>
                <summary>Alternative approaches ({message.metadata.alternatives.length})</summary>
                <ul>
                  {message.metadata.alternatives.map((alt, idx) => (
                    <li key={idx}>{alt}</li>
                  ))}
                </ul>
              </details>
            </div>
          )}

          {message.tags && message.tags.length > 0 && (
            <div className="tags-section">
              {message.tags.map(tag => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={`message-viewer ${theme} ${className}`} ref={containerRef}>
      {/* Header */}
      <div className="viewer-header">
        <div className="header-left">
          <h2>Agent Messages</h2>
          <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
            {isConnected ? '🟢 Connected' : '🔴 Disconnected'}
          </div>
          <div className="message-count">
            {filteredMessages.length} messages
          </div>
        </div>

        <div className="header-controls">
          <button
            className="filter-toggle"
            onClick={() => setShowFilters(!showFilters)}
          >
            🔍 Filters
          </button>

          <button
            className="export-button"
            onClick={handleExport}
            disabled={filteredMessages.length === 0}
          >
            📤 Export
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div className="search-bar">
        <input
          type="text"
          placeholder="Search messages with fuzzy matching..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="search-input"
        />
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Agents:</label>
            <select
              multiple
              value={filters.agents}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                agents: Array.from(e.target.selectedOptions, opt => opt.value)
              }))}
            >
              {filterOptions.agents.map(agent => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Types:</label>
            <select
              multiple
              value={filters.types}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                types: Array.from(e.target.selectedOptions, opt => opt.value)
              }))}
            >
              {filterOptions.types.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Priorities:</label>
            <select
              multiple
              value={filters.priorities}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                priorities: Array.from(e.target.selectedOptions, opt => opt.value)
              }))}
            >
              {filterOptions.priorities.map(priority => (
                <option key={priority} value={priority}>{priority}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label>Keywords:</label>
            <input
              type="text"
              placeholder="Enter keywords..."
              value={filters.keywords}
              onChange={(e) => setFilters(prev => ({
                ...prev,
                keywords: e.target.value
              }))}
            />
          </div>

          <div className="filter-checkboxes">
            <label>
              <input
                type="checkbox"
                checked={filters.showMetadata}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  showMetadata: e.target.checked
                }))}
              />
              Show Metadata
            </label>

            <label>
              <input
                type="checkbox"
                checked={filters.showReasoning}
                onChange={(e) => setFilters(prev => ({
                  ...prev,
                  showReasoning: e.target.checked
                }))}
              />
              Show Reasoning
            </label>
          </div>

          <button
            className="clear-filters"
            onClick={() => setFilters({
              agents: [],
              types: [],
              priorities: [],
              keywords: '',
              dateRange: { start: null, end: null },
              showMetadata: true,
              showReasoning: false
            })}
          >
            Clear All Filters
          </button>
        </div>
      )}

      {/* Messages List */}
      <div className="messages-container">
        {enableVirtualScrolling && paginatedMessages.length > 0 ? (
          <List
            ref={listRef}
            height={600}
            itemCount={paginatedMessages.length}
            itemSize={150}
            width="100%"
          >
            {MessageItem}
          </List>
        ) : (
          <div className="messages-list">
            {paginatedMessages.map((message, index) => (
              <MessageItem
                key={message.id}
                index={index}
                style={{}}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="pagination">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
          >
            Previous
          </button>

          <span>
            Page {currentPage} of {totalPages}
          </span>

          <button
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage === totalPages}
          >
            Next
          </button>
        </div>
      )}

      {/* Selected Message Details */}
      {selectedMessage && (
        <div className="message-details">
          <h3>Message Details</h3>
          <button
            className="close-details"
            onClick={() => setSelectedMessage(null)}
          >
            ×
          </button>

          <div className="details-content">
            <div className="detail-row">
              <strong>Agent:</strong> {selectedMessage.agentName}
            </div>
            <div className="detail-row">
              <strong>Type:</strong> {selectedMessage.type}
            </div>
            <div className="detail-row">
              <strong>Priority:</strong> {selectedMessage.priority}
            </div>
            <div className="detail-row">
              <strong>Timestamp:</strong> {formatTimestamp(selectedMessage.timestamp)}
            </div>
            <div className="detail-row">
              <strong>Confidence:</strong> {(selectedMessage.metadata.confidence * 100).toFixed(1)}%
            </div>
            {selectedMessage.metadata.model && (
              <div className="detail-row">
                <strong>Model:</strong> {selectedMessage.metadata.model}
              </div>
            )}
            <div className="detail-row">
              <strong>Content:</strong>
              <div className="content-preview">{selectedMessage.content}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessageViewer;