import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './FilterControls.css';

// Type definitions for advanced filtering
export interface MessageFilter {
  id: string;
  name: string;
  description: string;
  rules: FilterRule[];
  active: boolean;
  createdAt: Date;
  lastUsed?: Date;
  usageCount: number;
}

export interface FilterRule {
  field: 'agentId' | 'agentName' | 'messageType' | 'priority' | 'content' | 'timestamp' | 'confidence' | 'tags' | 'threadId';
  operator: 'equals' | 'contains' | 'starts_with' | 'ends_with' | 'regex' | 'greater_than' | 'less_than' | 'between' | 'in' | 'not_in';
  value: any;
  caseSensitive?: boolean;
}

export interface QuickFilter {
  id: string;
  name: string;
  icon: string;
  description: string;
  rules: FilterRule[];
  color?: string;
}

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
    reasoning?: string[];
    alternatives?: string[];
    executionTime?: number;
    tokens?: number;
    model?: string;
  };
  tags?: string[];
}

interface FilterControlsProps {
  filters: any;
  onUpdateFilters: (filters: any) => void;
  messages: AgentMessage[];
  websocketUrl?: string;
  theme?: 'light' | 'dark';
  className?: string;
  enableAdvancedFilters?: boolean;
  enableSavedFilters?: boolean;
  onExportFilters?: (filters: MessageFilter[]) => void;
  onImportFilters?: (filters: MessageFilter[]) => void;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  onUpdateFilters,
  messages,
  websocketUrl,
  theme = 'light',
  className = '',
  enableAdvancedFilters = true,
  enableSavedFilters = true,
  onExportFilters,
  onImportFilters
}) => {
  // State management
  const [activeFilters, setActiveFilters] = useState<MessageFilter[]>([]);
  const [savedFilters, setSavedFilters] = useState<MessageFilter[]>([]);
  const [quickFilters, setQuickFilters] = useState<QuickFilter[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [filterBuilder, setFilterBuilder] = useState<{
    name: string;
    description: string;
    rules: FilterRule[];
  } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRange, setDateRange] = useState<{
    start: string;
    end: string;
  }>({ start: '', end: '' });
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [confidenceRange, setConfidenceRange] = useState<[number, number]>([0, 100]);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeReasoning, setIncludeReasoning] = useState(false);

  // Extract unique values for filter options
  const filterOptions = useMemo(() => {
    const agents = [...new Set(messages.map(m => ({ id: m.agentId, name: m.agentName })))]
      .reduce((acc, curr) => {
        if (!acc.find(a => a.id === curr.id)) acc.push(curr);
        return acc;
      }, [] as Array<{ id: string; name: string }>);
    
    const types = [...new Set(messages.map(m => m.type))];
    const priorities = [...new Set(messages.map(m => m.priority))];
    const tags = [...new Set(messages.flatMap(m => m.tags || []))];
    
    return { agents, types, priorities, tags };
  }, [messages]);

  // Initialize quick filters
  useEffect(() => {
    const defaultQuickFilters: QuickFilter[] = [
      {
        id: 'high-priority',
        name: 'High Priority',
        icon: '🔥',
        description: 'Show only high and critical priority messages',
        rules: [{ field: 'priority', operator: 'in', value: ['high', 'critical'] }],
        color: '#EF4444'
      },
      {
        id: 'errors-warnings',
        name: 'Issues',
        icon: '⚠️',
        description: 'Show errors and warnings',
        rules: [{ field: 'messageType', operator: 'in', value: ['error', 'warning'] }],
        color: '#F59E0B'
      },
      {
        id: 'low-confidence',
        name: 'Low Confidence',
        icon: '❓',
        description: 'Messages with confidence below 60%',
        rules: [{ field: 'confidence', operator: 'less_than', value: 0.6 }],
        color: '#8B5CF6'
      },
      {
        id: 'recent',
        name: 'Recent',
        icon: '⏰',
        description: 'Messages from the last hour',
        rules: [{ field: 'timestamp', operator: 'greater_than', value: Date.now() - 3600000 }],
        color: '#10B981'
      },
      {
        id: 'researcher-only',
        name: 'Researcher',
        icon: '🔍',
        description: 'Messages from researcher agents only',
        rules: [{ field: 'agentName', operator: 'contains', value: 'researcher' }],
        color: '#3B82F6'
      },
      {
        id: 'coder-only',
        name: 'Coder',
        icon: '💻',
        description: 'Messages from coder agents only',
        rules: [{ field: 'agentName', operator: 'contains', value: 'coder' }],
        color: '#06B6D4'
      }
    ];
    
    setQuickFilters(defaultQuickFilters);
  }, []);

  // Load saved filters from localStorage
  useEffect(() => {
    if (enableSavedFilters) {
      const saved = localStorage.getItem('claude-flow-saved-filters');
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          setSavedFilters(parsed.map((f: any) => ({
            ...f,
            createdAt: new Date(f.createdAt),
            lastUsed: f.lastUsed ? new Date(f.lastUsed) : undefined
          })));
        } catch (error) {
          console.error('Failed to load saved filters:', error);
        }
      }
    }
  }, [enableSavedFilters]);

  // Save filters to localStorage
  const saveFiltersToStorage = useCallback((filters: MessageFilter[]) => {
    if (enableSavedFilters) {
      localStorage.setItem('claude-flow-saved-filters', JSON.stringify(filters));
    }
  }, [enableSavedFilters]);

  // Apply filter rules to messages
  const applyFilterRules = useCallback((messages: AgentMessage[], rules: FilterRule[]): AgentMessage[] => {
    return messages.filter(message => {
      return rules.every(rule => {
        const fieldValue = getFieldValue(message, rule.field);
        return evaluateRule(fieldValue, rule);
      });
    });
  }, []);

  // Get field value from message
  const getFieldValue = (message: AgentMessage, field: FilterRule['field']): any => {
    switch (field) {
      case 'agentId': return message.agentId;
      case 'agentName': return message.agentName;
      case 'messageType': return message.type;
      case 'priority': return message.priority;
      case 'content': return message.content;
      case 'timestamp': return message.timestamp.getTime();
      case 'confidence': return message.metadata.confidence;
      case 'tags': return message.tags || [];
      case 'threadId': return message.threadId;
      default: return null;
    }
  };

  // Evaluate filter rule
  const evaluateRule = (fieldValue: any, rule: FilterRule): boolean => {
    const { operator, value, caseSensitive = false } = rule;
    
    switch (operator) {
      case 'equals':
        return fieldValue === value;
      
      case 'contains':
        if (typeof fieldValue === 'string') {
          const searchValue = caseSensitive ? value : value.toLowerCase();
          const targetValue = caseSensitive ? fieldValue : fieldValue.toLowerCase();
          return targetValue.includes(searchValue);
        }
        if (Array.isArray(fieldValue)) {
          return fieldValue.includes(value);
        }
        return false;
      
      case 'starts_with':
        if (typeof fieldValue === 'string') {
          const searchValue = caseSensitive ? value : value.toLowerCase();
          const targetValue = caseSensitive ? fieldValue : fieldValue.toLowerCase();
          return targetValue.startsWith(searchValue);
        }
        return false;
      
      case 'ends_with':
        if (typeof fieldValue === 'string') {
          const searchValue = caseSensitive ? value : value.toLowerCase();
          const targetValue = caseSensitive ? fieldValue : fieldValue.toLowerCase();
          return targetValue.endsWith(searchValue);
        }
        return false;
      
      case 'regex':
        if (typeof fieldValue === 'string') {
          try {
            const regex = new RegExp(value, caseSensitive ? 'g' : 'gi');
            return regex.test(fieldValue);
          } catch {
            return false;
          }
        }
        return false;
      
      case 'greater_than':
        return typeof fieldValue === 'number' && fieldValue > value;
      
      case 'less_than':
        return typeof fieldValue === 'number' && fieldValue < value;
      
      case 'between':
        return typeof fieldValue === 'number' && 
               fieldValue >= value[0] && fieldValue <= value[1];
      
      case 'in':
        return Array.isArray(value) && value.includes(fieldValue);
      
      case 'not_in':
        return Array.isArray(value) && !value.includes(fieldValue);
      
      default:
        return true;
    }
  };

  // Apply quick filter
  const applyQuickFilter = useCallback((quickFilter: QuickFilter) => {
    const newActiveFilter: MessageFilter = {
      id: `quick-${quickFilter.id}-${Date.now()}`,
      name: quickFilter.name,
      description: quickFilter.description,
      rules: quickFilter.rules,
      active: true,
      createdAt: new Date(),
      usageCount: 1
    };
    
    setActiveFilters(prev => [...prev, newActiveFilter]);
    updateFilters([...activeFilters, newActiveFilter]);
  }, [activeFilters]);

  // Apply saved filter
  const applySavedFilter = useCallback((savedFilter: MessageFilter) => {
    const updatedFilter = {
      ...savedFilter,
      lastUsed: new Date(),
      usageCount: savedFilter.usageCount + 1
    };
    
    setSavedFilters(prev => 
      prev.map(f => f.id === updatedFilter.id ? updatedFilter : f)
    );
    
    setActiveFilters(prev => {
      const exists = prev.find(f => f.id === updatedFilter.id);
      return exists ? prev : [...prev, updatedFilter];
    });
    
    updateFilters([...activeFilters.filter(f => f.id !== updatedFilter.id), updatedFilter]);
  }, [activeFilters]);

  // Remove active filter
  const removeActiveFilter = useCallback((filterId: string) => {
    const newActiveFilters = activeFilters.filter(f => f.id !== filterId);
    setActiveFilters(newActiveFilters);
    updateFilters(newActiveFilters);
  }, [activeFilters]);

  // Update filters callback
  const updateFilters = useCallback((filters: MessageFilter[]) => {
    const combinedRules = filters.flatMap(f => f.rules);
    const basicFilters = {
      searchTerm,
      dateRange,
      selectedAgents,
      selectedTypes,
      selectedPriorities,
      confidenceRange,
      includeMetadata,
      includeReasoning
    };
    
    onUpdateFilters({
      advanced: combinedRules,
      basic: basicFilters,
      activeFilters: filters
    });
  }, [searchTerm, dateRange, selectedAgents, selectedTypes, selectedPriorities, 
      confidenceRange, includeMetadata, includeReasoning, onUpdateFilters]);

  // Save current filter setup
  const saveCurrentFilter = useCallback(() => {
    if (!filterBuilder) return;
    
    const newFilter: MessageFilter = {
      id: `saved-${Date.now()}`,
      name: filterBuilder.name,
      description: filterBuilder.description,
      rules: filterBuilder.rules,
      active: false,
      createdAt: new Date(),
      usageCount: 0
    };
    
    const newSavedFilters = [...savedFilters, newFilter];
    setSavedFilters(newSavedFilters);
    saveFiltersToStorage(newSavedFilters);
    setFilterBuilder(null);
  }, [filterBuilder, savedFilters, saveFiltersToStorage]);

  // Clear all filters
  const clearAllFilters = useCallback(() => {
    setActiveFilters([]);
    setSearchTerm('');
    setDateRange({ start: '', end: '' });
    setSelectedAgents([]);
    setSelectedTypes([]);
    setSelectedPriorities([]);
    setConfidenceRange([0, 100]);
    onUpdateFilters({});
  }, [onUpdateFilters]);

  return (
    <div className={`filter-controls ${theme} ${className}`}>
      {/* Header */}
      <div className="filter-header">
        <h3>Filters</h3>
        <div className="header-actions">
          <button 
            className="clear-btn"
            onClick={clearAllFilters}
            disabled={activeFilters.length === 0 && !searchTerm && selectedAgents.length === 0}
          >
            Clear All
          </button>
          
          {enableAdvancedFilters && (
            <button 
              className="advanced-toggle"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              {showAdvanced ? '▲' : '▼'} Advanced
            </button>
          )}
        </div>
      </div>

      {/* Quick Search */}
      <div className="quick-search">
        <input
          type="text"
          placeholder="Search messages..."
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            updateFilters(activeFilters);
          }}
          className="search-input"
        />
      </div>

      {/* Quick Filters */}
      <div className="quick-filters">
        <div className="section-title">Quick Filters</div>
        <div className="quick-filters-grid">
          {quickFilters.map(filter => (
            <button
              key={filter.id}
              className="quick-filter-btn"
              onClick={() => applyQuickFilter(filter)}
              style={{ borderLeft: `3px solid ${filter.color}` }}
              title={filter.description}
            >
              <span className="filter-icon">{filter.icon}</span>
              <span className="filter-name">{filter.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Basic Filters */}
      <div className="basic-filters">
        <div className="section-title">Basic Filters</div>
        
        {/* Agent Selection */}
        <div className="filter-group">
          <label>Agents:</label>
          <div className="checkbox-group">
            {filterOptions.agents.map(agent => (
              <label key={agent.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedAgents.includes(agent.id)}
                  onChange={(e) => {
                    const newSelected = e.target.checked 
                      ? [...selectedAgents, agent.id]
                      : selectedAgents.filter(id => id !== agent.id);
                    setSelectedAgents(newSelected);
                    updateFilters(activeFilters);
                  }}
                />
                <span className="checkbox-text">{agent.name}</span>
              </label>
            ))}
          </div>
        </div>
        
        {/* Message Types */}
        <div className="filter-group">
          <label>Types:</label>
          <div className="checkbox-group">
            {filterOptions.types.map(type => (
              <label key={type} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedTypes.includes(type)}
                  onChange={(e) => {
                    const newSelected = e.target.checked 
                      ? [...selectedTypes, type]
                      : selectedTypes.filter(t => t !== type);
                    setSelectedTypes(newSelected);
                    updateFilters(activeFilters);
                  }}
                />
                <span className="checkbox-text">{type}</span>
              </label>
            ))}
          </div>
        </div>
        
        {/* Priorities */}
        <div className="filter-group">
          <label>Priority:</label>
          <div className="checkbox-group">
            {filterOptions.priorities.map(priority => (
              <label key={priority} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedPriorities.includes(priority)}
                  onChange={(e) => {
                    const newSelected = e.target.checked 
                      ? [...selectedPriorities, priority]
                      : selectedPriorities.filter(p => p !== priority);
                    setSelectedPriorities(newSelected);
                    updateFilters(activeFilters);
                  }}
                />
                <span className="checkbox-text">{priority}</span>
              </label>
            ))}
          </div>
        </div>
        
        {/* Date Range */}
        <div className="filter-group">
          <label>Date Range:</label>
          <div className="date-inputs">
            <input
              type="datetime-local"
              value={dateRange.start}
              onChange={(e) => {
                setDateRange(prev => ({ ...prev, start: e.target.value }));
                updateFilters(activeFilters);
              }}
            />
            <span className="date-separator">to</span>
            <input
              type="datetime-local"
              value={dateRange.end}
              onChange={(e) => {
                setDateRange(prev => ({ ...prev, end: e.target.value }));
                updateFilters(activeFilters);
              }}
            />
          </div>
        </div>
        
        {/* Confidence Range */}
        <div className="filter-group">
          <label>Confidence: {confidenceRange[0]}% - {confidenceRange[1]}%</label>
          <div className="range-inputs">
            <input
              type="range"
              min="0"
              max="100"
              value={confidenceRange[0]}
              onChange={(e) => {
                const newRange: [number, number] = [Number(e.target.value), confidenceRange[1]];
                setConfidenceRange(newRange);
                updateFilters(activeFilters);
              }}
            />
            <input
              type="range"
              min="0"
              max="100"
              value={confidenceRange[1]}
              onChange={(e) => {
                const newRange: [number, number] = [confidenceRange[0], Number(e.target.value)];
                setConfidenceRange(newRange);
                updateFilters(activeFilters);
              }}
            />
          </div>
        </div>
      </div>

      {/* Advanced Filters */}
      {showAdvanced && enableAdvancedFilters && (
        <div className="advanced-filters">
          <div className="section-title">Advanced Filters</div>
          
          {/* Active Filters */}
          {activeFilters.length > 0 && (
            <div className="active-filters">
              <div className="subsection-title">Active Filters:</div>
              {activeFilters.map(filter => (
                <div key={filter.id} className="active-filter">
                  <span className="filter-name">{filter.name}</span>
                  <span className="filter-description">{filter.description}</span>
                  <button 
                    className="remove-filter"
                    onClick={() => removeActiveFilter(filter.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Saved Filters */}
          {enableSavedFilters && savedFilters.length > 0 && (
            <div className="saved-filters">
              <div className="subsection-title">Saved Filters:</div>
              {savedFilters.map(filter => (
                <div key={filter.id} className="saved-filter">
                  <div className="filter-info">
                    <span className="filter-name">{filter.name}</span>
                    <span className="filter-usage">Used {filter.usageCount} times</span>
                  </div>
                  <button 
                    className="apply-filter"
                    onClick={() => applySavedFilter(filter)}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Filter Builder Button */}
          <button 
            className="filter-builder-btn"
            onClick={() => setFilterBuilder({
              name: '',
              description: '',
              rules: []
            })}
          >
            + Create Custom Filter
          </button>
        </div>
      )}

      {/* Display Options */}
      <div className="display-options">
        <div className="section-title">Display Options</div>
        
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeMetadata}
            onChange={(e) => {
              setIncludeMetadata(e.target.checked);
              updateFilters(activeFilters);
            }}
          />
          <span className="checkbox-text">Show Metadata</span>
        </label>
        
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={includeReasoning}
            onChange={(e) => {
              setIncludeReasoning(e.target.checked);
              updateFilters(activeFilters);
            }}
          />
          <span className="checkbox-text">Show Reasoning</span>
        </label>
      </div>

      {/* Filter Builder Modal */}
      {filterBuilder && (
        <div className="filter-builder-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Create Custom Filter</h3>
              <button 
                className="close-btn"
                onClick={() => setFilterBuilder(null)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Filter Name:</label>
                <input
                  type="text"
                  value={filterBuilder.name}
                  onChange={(e) => setFilterBuilder(prev => 
                    prev ? { ...prev, name: e.target.value } : null
                  )}
                  placeholder="Enter filter name..."
                />
              </div>
              
              <div className="form-group">
                <label>Description:</label>
                <textarea
                  value={filterBuilder.description}
                  onChange={(e) => setFilterBuilder(prev => 
                    prev ? { ...prev, description: e.target.value } : null
                  )}
                  placeholder="Describe what this filter does..."
                  rows={2}
                />
              </div>
              
              {/* Rule builder would go here */}
              <div className="rules-section">
                <div className="subsection-title">Filter Rules</div>
                <div className="rules-note">
                  Advanced rule builder coming soon. Use quick filters for now.
                </div>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-primary"
                onClick={saveCurrentFilter}
                disabled={!filterBuilder.name.trim()}
              >
                Save Filter
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setFilterBuilder(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterControls;