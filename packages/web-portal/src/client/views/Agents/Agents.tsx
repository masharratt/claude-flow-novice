/**
 * Agents View
 * Comprehensive agent management view with list/grid display, search, filters, and actions
 */

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  Box,
  Grid,
  Paper,
  Typography,
  TextField,
  InputAdornment,
  IconButton,
  Button,
  Card,
  CardContent,
  CardActions,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Checkbox,
  FormGroup,
  FormControlLabel,
  ToggleButtonGroup,
  ToggleButton,
  Tooltip,
  Alert,
  Pagination,
  LinearProgress,
  Divider,
  OutlinedInput,
  SelectChangeEvent,
} from '@mui/material';
import {
  Search as SearchIcon,
  Add as AddIcon,
  ViewList as ViewListIcon,
  ViewModule as ViewModuleIcon,
  Delete as DeleteIcon,
  Refresh as RefreshIcon,
  FilterList as FilterListIcon,
  People as PeopleIcon,
  Computer as ComputerIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  Pause as PauseIcon,
  PlayArrow as PlayArrowIcon,
} from '@mui/icons-material';
import { useAgentStore, agentSelectors } from '../../../shared/stores/agentStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';
import { useWebSocketEvent } from '../../../shared/hooks/useWebSocketEvent';
import type { Agent } from '../../../shared/stores/agentStore';

// Agent capabilities for spawn modal
const AGENT_CAPABILITIES = [
  'coding',
  'testing',
  'security',
  'review',
  'architecture',
  'documentation',
  'devops',
  'database',
];

const AGENT_TYPES = [
  'coder',
  'reviewer',
  'tester',
  'security-specialist',
  'architect',
  'coordinator',
  'researcher',
  'devops-engineer',
  'hybrid-worker',
];

const ITEMS_PER_PAGE = 20;

interface AgentFilters {
  status: Agent['status'] | 'all';
  type: string | 'all';
  capabilities: string[];
  showHybridWorkers: boolean;
}

interface HybridWorker {
  workerId: string;
  subtask: string;
  provider: 'zai' | 'anthropic';
  confidence: number;
  cost: number;
  duration: number;
  filesModified: string[];
}

interface SpawnAgentForm {
  name: string;
  type: string;
  capabilities: string[];
}

/**
 * Agents Component
 */
export const Agents: React.FC = () => {
  // View state
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showFilters, setShowFilters] = useState(true);

  // Filters
  const [filters, setFilters] = useState<AgentFilters>({
    status: 'all',
    type: 'all',
    capabilities: [],
    showHybridWorkers: false,
  });

  // Hybrid workers state
  const [hybridWorkers, setHybridWorkers] = useState<HybridWorker[]>([]);

  // Modals
  const [spawnModalOpen, setSpawnModalOpen] = useState(false);
  const [terminateModalOpen, setTerminateModalOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(null);
  const [terminateReason, setTerminateReason] = useState('');

  // Spawn form
  const [spawnForm, setSpawnForm] = useState<SpawnAgentForm>({
    name: '',
    type: 'coder',
    capabilities: [],
  });

  // Store
  const { agents, loading, error, addAgent, removeAgent, setLoading, setError } = useAgentStore();
  const { isConnected } = useWebSocket();

  // WebSocket subscriptions for real-time updates
  useWebSocketEvent('agent:update', (data: any) => {
    console.log('[Agents] Agent update received:', data);
    // The store will be updated via the agentStore actions
  });

  useWebSocketEvent('agent:spawned', (data: any) => {
    console.log('[Agents] Agent spawned:', data);
  });

  useWebSocketEvent('agent:terminated', (data: any) => {
    console.log('[Agents] Agent terminated:', data);
  });

  // Fetch hybrid workers when filter is enabled
  useEffect(() => {
    if (filters.showHybridWorkers && isConnected) {
      fetch('/api/agents/hybrid')
        .then(res => res.json())
        .then(data => setHybridWorkers(data.workers || []))
        .catch(err => console.error('[Agents] Failed to fetch hybrid workers:', err));
    }
  }, [filters.showHybridWorkers, isConnected]);

  // Fuzzy search function
  const fuzzyMatch = useCallback((text: string, search: string): boolean => {
    const searchLower = search.toLowerCase();
    const textLower = text.toLowerCase();
    return textLower.includes(searchLower);
  }, []);

  // Filter and search agents
  const filteredAgents = useMemo(() => {
    let result = agents;

    // Apply status filter
    if (filters.status !== 'all') {
      result = result.filter((agent) => agent.status === filters.status);
    }

    // Apply type filter
    if (filters.type !== 'all') {
      result = result.filter((agent) => agent.type === filters.type);
    }

    // Apply capabilities filter (any match)
    if (filters.capabilities.length > 0) {
      // Note: Agent type doesn't have capabilities field yet, so we skip this for now
      // In a real implementation, you'd filter by capabilities
    }

    // Apply search
    if (searchTerm) {
      result = result.filter(
        (agent) =>
          fuzzyMatch(agent.name, searchTerm) ||
          fuzzyMatch(agent.id, searchTerm) ||
          fuzzyMatch(agent.type, searchTerm)
      );
    }

    return result;
  }, [agents, filters, searchTerm, fuzzyMatch]);

  // Pagination
  const totalPages = Math.ceil(filteredAgents.length / ITEMS_PER_PAGE);
  const paginatedAgents = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    return filteredAgents.slice(start, end);
  }, [filteredAgents, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters, searchTerm]);

  // Handlers
  const handleSearchChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  }, []);

  const handleViewModeChange = useCallback(
    (_event: React.MouseEvent<HTMLElement>, newMode: 'list' | 'grid' | null) => {
      if (newMode !== null) {
        setViewMode(newMode);
      }
    },
    []
  );

  const handleFilterChange = useCallback(
    (filterType: keyof AgentFilters, value: any) => {
      setFilters((prev) => ({
        ...prev,
        [filterType]: value,
      }));
    },
    []
  );

  const handleCapabilitiesChange = useCallback((event: SelectChangeEvent<string[]>) => {
    const value = event.target.value;
    setFilters((prev) => ({
      ...prev,
      capabilities: typeof value === 'string' ? value.split(',') : value,
    }));
  }, []);

  const handlePageChange = useCallback((_event: React.ChangeEvent<unknown>, page: number) => {
    setCurrentPage(page);
  }, []);

  const handleRefresh = useCallback(async () => {
    setLoading(true);
    // In a real implementation, fetch agents from API
    setTimeout(() => {
      setLoading(false);
    }, 500);
  }, [setLoading]);

  const handleSpawnModalOpen = useCallback(() => {
    setSpawnForm({
      name: '',
      type: 'coder',
      capabilities: [],
    });
    setSpawnModalOpen(true);
  }, []);

  const handleSpawnModalClose = useCallback(() => {
    setSpawnModalOpen(false);
  }, []);

  const handleSpawnFormChange = useCallback((field: keyof SpawnAgentForm, value: any) => {
    setSpawnForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  }, []);

  const handleSpawnFormCapabilitiesChange = useCallback((capability: string) => {
    setSpawnForm((prev) => ({
      ...prev,
      capabilities: prev.capabilities.includes(capability)
        ? prev.capabilities.filter((c) => c !== capability)
        : [...prev.capabilities, capability],
    }));
  }, []);

  const handleSpawnAgent = useCallback(async () => {
    if (!spawnForm.name) {
      setError('Agent name is required');
      return;
    }

    // Create new agent
    const newAgent: Agent = {
      id: `agent-${Date.now()}`,
      name: spawnForm.name,
      type: spawnForm.type,
      status: 'idle',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      metrics: {
        tasksCompleted: 0,
        confidence: 0,
        errorRate: 0,
      },
    };

    addAgent(newAgent);
    setSpawnModalOpen(false);
  }, [spawnForm, addAgent, setError]);

  const handleTerminateModalOpen = useCallback((agent: Agent) => {
    setSelectedAgent(agent);
    setTerminateReason('');
    setTerminateModalOpen(true);
  }, []);

  const handleTerminateModalClose = useCallback(() => {
    setTerminateModalOpen(false);
    setSelectedAgent(null);
    setTerminateReason('');
  }, []);

  const handleTerminateAgent = useCallback(async () => {
    if (!selectedAgent) return;

    // In a real implementation, call API to terminate agent
    removeAgent(selectedAgent.id);
    setTerminateModalOpen(false);
    setSelectedAgent(null);
  }, [selectedAgent, removeAgent]);

  // Get status icon
  const getStatusIcon = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return <PlayArrowIcon fontSize="small" color="success" />;
      case 'idle':
        return <PauseIcon fontSize="small" color="action" />;
      case 'completed':
        return <CheckCircleIcon fontSize="small" color="success" />;
      case 'failed':
        return <ErrorIcon fontSize="small" color="error" />;
      default:
        return <PauseIcon fontSize="small" color="action" />;
    }
  };

  // Get status color
  const getStatusColor = (status: Agent['status']) => {
    switch (status) {
      case 'active':
        return 'success';
      case 'idle':
        return 'default';
      case 'completed':
        return 'primary';
      case 'failed':
        return 'error';
      default:
        return 'default';
    }
  };

  // Render agent card
  const renderAgentCard = (agent: Agent) => (
    <Card key={agent.id} elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
          <Typography variant="h6" component="div" noWrap sx={{ flexGrow: 1, mr: 1 }}>
            {agent.name}
          </Typography>
          {getStatusIcon(agent.status)}
        </Box>

        <Chip
          label={agent.status}
          color={getStatusColor(agent.status) as any}
          size="small"
          sx={{ mb: 1 }}
        />

        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Type: {agent.type}
        </Typography>

        <Typography variant="caption" color="text.secondary" display="block">
          ID: {agent.id}
        </Typography>

        {agent.metrics && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="caption" display="block">
              Tasks: {agent.metrics.tasksCompleted}
            </Typography>
            <Typography variant="caption" display="block">
              Confidence: {(agent.metrics.confidence * 100).toFixed(0)}%
            </Typography>
          </Box>
        )}
      </CardContent>

      <CardActions>
        <Button size="small" color="primary">
          View
        </Button>
        <Button size="small" color="error" onClick={() => handleTerminateModalOpen(agent)}>
          Terminate
        </Button>
      </CardActions>
    </Card>
  );

  // Render hybrid worker card
  const renderHybridWorkerCard = (worker: HybridWorker) => {
    const savingsPercent = ((1 - worker.cost / (worker.duration * 0.015)) * 100).toFixed(0);
    const confidenceColor = worker.confidence >= 0.75 ? '#4caf50' : '#ff9800';

    return (
      <Card key={worker.workerId} elevation={2} sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <CardContent sx={{ flexGrow: 1 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Typography variant="h6" component="div" noWrap sx={{ flexGrow: 1, mr: 1 }}>
              {worker.workerId}
            </Typography>
            <Chip
              label={`${(worker.confidence * 100).toFixed(0)}%`}
              size="small"
              sx={{ backgroundColor: confidenceColor, color: 'white' }}
            />
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
            {worker.subtask}
          </Typography>

          <Chip
            label={worker.provider}
            color={worker.provider === 'zai' ? 'primary' : 'secondary'}
            size="small"
            sx={{ mb: 1, mr: 1 }}
          />

          <Chip
            label={`$${worker.cost.toFixed(2)}`}
            size="small"
            color="success"
            sx={{ mb: 1, mr: 1 }}
          />

          <Chip
            label={`${savingsPercent}% saved`}
            size="small"
            color="info"
            sx={{ mb: 1 }}
          />

          <Typography variant="caption" display="block" sx={{ mt: 1 }}>
            Duration: {worker.duration}s
          </Typography>

          <Typography variant="caption" display="block">
            Files: {worker.filesModified.length}
          </Typography>
        </CardContent>
      </Card>
    );
  };

  // Render agent list item
  const renderAgentListItem = (agent: Agent) => (
    <Paper key={agent.id} elevation={1} sx={{ p: 2, mb: 1 }}>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={4} md={3}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {getStatusIcon(agent.status)}
            <Box>
              <Typography variant="body1" fontWeight={600}>
                {agent.name}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {agent.id}
              </Typography>
            </Box>
          </Box>
        </Grid>

        <Grid item xs={6} sm={2} md={2}>
          <Chip label={agent.status} color={getStatusColor(agent.status) as any} size="small" />
        </Grid>

        <Grid item xs={6} sm={2} md={2}>
          <Typography variant="body2" color="text.secondary">
            {agent.type}
          </Typography>
        </Grid>

        <Grid item xs={6} sm={2} md={3}>
          {agent.metrics && (
            <Box>
              <Typography variant="caption" display="block">
                Tasks: {agent.metrics.tasksCompleted} | Confidence: {(agent.metrics.confidence * 100).toFixed(0)}%
              </Typography>
            </Box>
          )}
        </Grid>

        <Grid item xs={6} sm={2} md={2} sx={{ textAlign: 'right' }}>
          <Button size="small" color="primary" sx={{ mr: 1 }}>
            View
          </Button>
          <Button size="small" color="error" onClick={() => handleTerminateModalOpen(agent)}>
            Terminate
          </Button>
        </Grid>
      </Grid>
    </Paper>
  );

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <PeopleIcon sx={{ fontSize: 32 }} color="primary" />
          <Typography variant="h4" component="h1" fontWeight={700}>
            Agents
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
          <Tooltip title="Refresh agent list">
            <IconButton onClick={handleRefresh} disabled={loading} aria-label="Refresh agents">
              <RefreshIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title="Toggle filters">
            <IconButton onClick={() => setShowFilters(!showFilters)} color={showFilters ? 'primary' : 'default'} aria-label="Toggle filters">
              <FilterListIcon />
            </IconButton>
          </Tooltip>

          <ToggleButtonGroup value={viewMode} exclusive onChange={handleViewModeChange} size="small" aria-label="View mode">
            <ToggleButton value="list" aria-label="List view">
              <ViewListIcon />
            </ToggleButton>
            <ToggleButton value="grid" aria-label="Grid view">
              <ViewModuleIcon />
            </ToggleButton>
          </ToggleButtonGroup>

          <Button variant="contained" startIcon={<AddIcon />} onClick={handleSpawnModalOpen} aria-label="Spawn new agent">
            Spawn Agent
          </Button>
        </Box>
      </Box>

      {/* Connection Status */}
      {!isConnected && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          WebSocket disconnected. Real-time updates are unavailable.
        </Alert>
      )}

      {/* Error Display */}
      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Loading Progress */}
      {loading && <LinearProgress sx={{ mb: 2 }} />}

      <Grid container spacing={3}>
        {/* Filters Sidebar */}
        {showFilters && (
          <Grid item xs={12} md={3}>
            <Paper elevation={2} sx={{ p: 2 }}>
              <Typography variant="h6" gutterBottom>
                Filters
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {/* Search */}
              <TextField
                fullWidth
                size="small"
                placeholder="Search agents..."
                value={searchTerm}
                onChange={handleSearchChange}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon />
                    </InputAdornment>
                  ),
                }}
                sx={{ mb: 2 }}
                aria-label="Search agents"
              />

              {/* Status Filter */}
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="status-filter-label">Status</InputLabel>
                <Select
                  labelId="status-filter-label"
                  value={filters.status}
                  label="Status"
                  onChange={(e) => handleFilterChange('status', e.target.value)}
                  aria-label="Filter by status"
                >
                  <MenuItem value="all">All</MenuItem>
                  <MenuItem value="active">Active</MenuItem>
                  <MenuItem value="idle">Idle</MenuItem>
                  <MenuItem value="paused">Paused</MenuItem>
                  <MenuItem value="completed">Completed</MenuItem>
                  <MenuItem value="failed">Failed</MenuItem>
                </Select>
              </FormControl>

              {/* Type Filter */}
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="type-filter-label">Type</InputLabel>
                <Select
                  labelId="type-filter-label"
                  value={filters.type}
                  label="Type"
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  aria-label="Filter by type"
                >
                  <MenuItem value="all">All</MenuItem>
                  {AGENT_TYPES.map((type) => (
                    <MenuItem key={type} value={type}>
                      {type}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Capabilities Filter */}
              <FormControl fullWidth size="small" sx={{ mb: 2 }}>
                <InputLabel id="capabilities-filter-label">Capabilities</InputLabel>
                <Select
                  labelId="capabilities-filter-label"
                  multiple
                  value={filters.capabilities}
                  onChange={handleCapabilitiesChange}
                  input={<OutlinedInput label="Capabilities" />}
                  renderValue={(selected) => selected.join(', ')}
                  aria-label="Filter by capabilities"
                >
                  {AGENT_CAPABILITIES.map((capability) => (
                    <MenuItem key={capability} value={capability}>
                      <Checkbox checked={filters.capabilities.includes(capability)} />
                      {capability}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Hybrid Workers Toggle */}
              <FormControlLabel
                control={
                  <Checkbox
                    checked={filters.showHybridWorkers}
                    onChange={(e) => handleFilterChange('showHybridWorkers', e.target.checked)}
                  />
                }
                label="Show Hybrid Workers"
                sx={{ mb: 2 }}
              />

              <Button
                fullWidth
                variant="outlined"
                onClick={() =>
                  setFilters({
                    status: 'all',
                    type: 'all',
                    capabilities: [],
                    showHybridWorkers: false,
                  })
                }
              >
                Clear Filters
              </Button>
            </Paper>
          </Grid>
        )}

        {/* Agent List/Grid */}
        <Grid item xs={12} md={showFilters ? 9 : 12}>
          {/* Stats */}
          <Box sx={{ mb: 2, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Chip icon={<PeopleIcon />} label={`Total: ${filteredAgents.length}`} color="primary" />
            <Chip
              icon={<PlayArrowIcon />}
              label={`Active: ${filteredAgents.filter((a) => a.status === 'active').length}`}
              color="success"
            />
            <Chip
              icon={<CheckCircleIcon />}
              label={`Completed: ${filteredAgents.filter((a) => a.status === 'completed').length}`}
              color="primary"
            />
            <Chip
              icon={<ErrorIcon />}
              label={`Failed: ${filteredAgents.filter((a) => a.status === 'failed').length}`}
              color="error"
            />
          </Box>

          {/* Agent Display */}
          {filters.showHybridWorkers ? (
            hybridWorkers.length === 0 ? (
              <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
                <Typography variant="body1" color="text.secondary">
                  No hybrid workers found. Hybrid workers will appear here when spawned via CLI.
                </Typography>
              </Paper>
            ) : (
              <Grid container spacing={2}>
                {hybridWorkers.map((worker) => (
                  <Grid item xs={12} sm={6} md={4} key={worker.workerId}>
                    {renderHybridWorkerCard(worker)}
                  </Grid>
                ))}
              </Grid>
            )
          ) : paginatedAgents.length === 0 ? (
            <Paper elevation={2} sx={{ p: 4, textAlign: 'center' }}>
              <Typography variant="body1" color="text.secondary">
                No agents found. Try adjusting your filters or spawn a new agent.
              </Typography>
            </Paper>
          ) : viewMode === 'grid' ? (
            <Grid container spacing={2}>
              {paginatedAgents.map((agent) => (
                <Grid item xs={12} sm={6} md={4} key={agent.id}>
                  {renderAgentCard(agent)}
                </Grid>
              ))}
            </Grid>
          ) : (
            <Box>{paginatedAgents.map((agent) => renderAgentListItem(agent))}</Box>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'center' }}>
              <Pagination
                count={totalPages}
                page={currentPage}
                onChange={handlePageChange}
                color="primary"
                showFirstButton
                showLastButton
                aria-label="Agent pagination"
              />
            </Box>
          )}
        </Grid>
      </Grid>

      {/* Spawn Agent Modal */}
      <Dialog open={spawnModalOpen} onClose={handleSpawnModalClose} maxWidth="sm" fullWidth>
        <DialogTitle>Spawn New Agent</DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2 }}>
            <TextField
              fullWidth
              label="Agent Name"
              value={spawnForm.name}
              onChange={(e) => handleSpawnFormChange('name', e.target.value)}
              sx={{ mb: 2 }}
              required
              aria-label="Agent name"
            />

            <FormControl fullWidth sx={{ mb: 2 }}>
              <InputLabel id="spawn-type-label">Agent Type</InputLabel>
              <Select
                labelId="spawn-type-label"
                value={spawnForm.type}
                label="Agent Type"
                onChange={(e) => handleSpawnFormChange('type', e.target.value)}
                aria-label="Agent type"
              >
                {AGENT_TYPES.map((type) => (
                  <MenuItem key={type} value={type}>
                    {type}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Typography variant="subtitle2" gutterBottom>
              Capabilities
            </Typography>
            <FormGroup>
              {AGENT_CAPABILITIES.map((capability) => (
                <FormControlLabel
                  key={capability}
                  control={
                    <Checkbox
                      checked={spawnForm.capabilities.includes(capability)}
                      onChange={() => handleSpawnFormCapabilitiesChange(capability)}
                    />
                  }
                  label={capability}
                />
              ))}
            </FormGroup>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleSpawnModalClose}>Cancel</Button>
          <Button onClick={handleSpawnAgent} variant="contained" disabled={!spawnForm.name}>
            Spawn
          </Button>
        </DialogActions>
      </Dialog>

      {/* Terminate Agent Modal */}
      <Dialog open={terminateModalOpen} onClose={handleTerminateModalClose} maxWidth="sm" fullWidth>
        <DialogTitle>Terminate Agent</DialogTitle>
        <DialogContent>
          {selectedAgent && (
            <Box sx={{ pt: 2 }}>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Are you sure you want to terminate this agent? This action cannot be undone.
              </Alert>

              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Agent:</strong> {selectedAgent.name}
              </Typography>
              <Typography variant="body2" sx={{ mb: 1 }}>
                <strong>Type:</strong> {selectedAgent.type}
              </Typography>
              <Typography variant="body2" sx={{ mb: 2 }}>
                <strong>Status:</strong> {selectedAgent.status}
              </Typography>

              <TextField
                fullWidth
                multiline
                rows={3}
                label="Termination Reason (optional)"
                value={terminateReason}
                onChange={(e) => setTerminateReason(e.target.value)}
                aria-label="Termination reason"
              />
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleTerminateModalClose}>Cancel</Button>
          <Button onClick={handleTerminateAgent} color="error" variant="contained">
            Terminate
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Agents;
