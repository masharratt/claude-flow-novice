import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Checkbox,
  FormControlLabel,
  Grid,
  Chip,
  LinearProgress,
  Alert,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow
} from '@mui/material';
import { io, Socket } from 'socket.io-client';

interface Worker {
  id: string;
  subtask: string;
  provider: string;
  confidence: number;
  tokens: number;
  cost: number;
  duration: string;
  status: string;
  isHybrid: boolean;
  metadata: any;
  createdAt?: string;
}

interface AgentsViewProps {}

const AgentsView: React.FC<AgentsViewProps> = () => {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [showHybridWorkers, setShowHybridWorkers] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    // Initialize socket connection
    const newSocket = io('http://localhost:3000');
    setSocket(newSocket);

    // Join agents view room
    newSocket.emit('join-agents-view');

    // Listen for agent updates
    newSocket.on('agent-update', (workerData: Worker) => {
      setWorkers(prev => {
        const existingIndex = prev.findIndex(w => w.id === workerData.id);
        if (existingIndex >= 0) {
          const updated = [...prev];
          updated[existingIndex] = workerData;
          return updated;
        } else {
          return [...prev, workerData];
        }
      });
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  useEffect(() => {
    fetchWorkers();
  }, [showHybridWorkers]);

  const fetchWorkers = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch(`/api/coordinator/workers?showHybrid=${showHybridWorkers}`);
      const result = await response.json();
      
      if (result.success) {
        setWorkers(result.data);
      } else {
        setError('Failed to fetch workers');
      }
    } catch (err) {
      setError('Network error while fetching workers');
      console.error('Error fetching workers:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'success';
    if (confidence >= 0.6) return 'warning';
    return 'error';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'primary';
      case 'completed': return 'success';
      case 'failed': return 'error';
      default: return 'default';
    }
  };

  const filteredWorkers = showHybridWorkers 
    ? workers.filter(w => w.isHybrid)
    : workers.filter(w => !w.isHybrid);

  if (loading) {
    return (
      <Box p={3}>
        <Typography variant="h4" gutterBottom>
          Agents View
        </Typography>
        <LinearProgress />
        <Typography variant="body2" sx={{ mt: 2 }}>
          Loading agents...
        </Typography>
      </Box>
    );
  }

  return (
    <Box p={3}>
      <Typography variant="h4" gutterBottom>
        Agents View
      </Typography>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Filters */}
      <Paper sx={{ p: 2, mb: 3 }}>
        <FormControlLabel
          control={
            <Checkbox
              checked={showHybridWorkers}
              onChange={(e) => setShowHybridWorkers(e.target.checked)}
              data-testid="show-hybrid-workers"
            />
          }
          label="Show Hybrid Workers"
        />
      </Paper>

      {/* Workers Grid */}
      <Grid container spacing={3}>
        {filteredWorkers.map((worker) => (
          <Grid item xs={12} md={6} lg={4} key={worker.id}>
            <Card 
              data-testid="worker-card"
              data-hybrid={worker.isHybrid}
              sx={{ height: '100%' }}
            >
              <CardContent>
                <Typography variant="h6" gutterBottom>
                  {worker.id}
                </Typography>
                
                <Box sx={{ mb: 2 }}>
                  <Chip 
                    label={worker.status}
                    color={getStatusColor(worker.status)}
                    size="small"
                    sx={{ mr: 1 }}
                  />
                  {worker.isHybrid && (
                    <Chip 
                      label="Hybrid"
                      color="secondary"
                      size="small"
                    />
                  )}
                </Box>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Subtask:</strong> 
                  <span data-testid="subtask" data-field="subtask">
                    {worker.subtask}
                  </span>
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Provider:</strong> 
                  <span data-testid="provider" data-field="provider">
                    {worker.provider}
                  </span>
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Confidence:</strong>{' '}
                  <span data-testid="confidence" data-field="confidence">
                    {worker.confidence.toFixed(2)}
                  </span>
                  <Chip 
                    label={`${(worker.confidence * 100).toFixed(0)}%`}
                    color={getConfidenceColor(worker.confidence)}
                    size="small"
                    sx={{ ml: 1 }}
                  />
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Tokens:</strong>{' '}
                  <span data-testid="tokens" data-field="tokens">
                    {worker.tokens.toLocaleString()}
                  </span>
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Cost:</strong>{' '}
                  <span data-testid="cost" data-field="cost">
                    ${worker.cost.toFixed(2)}
                  </span>
                </Typography>

                <Typography variant="body2" color="text.secondary" gutterBottom>
                  <strong>Duration:</strong>{' '}
                  <span data-testid="duration" data-field="duration">
                    {worker.duration}
                  </span>
                </Typography>

                {worker.metadata && Object.keys(worker.metadata).length > 0 && (
                  <Box sx={{ mt: 2 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Metadata:
                    </Typography>
                    {Object.entries(worker.metadata).map(([key, value]) => (
                      <Typography key={key} variant="caption" display="block">
                        {key}: {JSON.stringify(value)}
                      </Typography>
                    ))}
                  </Box>
                )}
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Workers Table */}
      {filteredWorkers.length > 0 && (
        <Paper sx={{ mt: 4 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Subtask</TableCell>
                  <TableCell>Provider</TableCell>
                  <TableCell>Confidence</TableCell>
                  <TableCell>Tokens</TableCell>
                  <TableCell>Cost</TableCell>
                  <TableCell>Duration</TableCell>
                  <TableCell>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredWorkers.map((worker) => (
                  <TableRow key={worker.id} data-testid="agent-row">
                    <TableCell>{worker.id}</TableCell>
                    <TableCell>{worker.subtask}</TableCell>
                    <TableCell>{worker.provider}</TableCell>
                    <TableCell>{worker.confidence.toFixed(2)}</TableCell>
                    <TableCell>{worker.tokens.toLocaleString()}</TableCell>
                    <TableCell>${worker.cost.toFixed(2)}</TableCell>
                    <TableCell>{worker.duration}</TableCell>
                    <TableCell>
                      <Chip 
                        label={worker.status}
                        color={getStatusColor(worker.status)}
                        size="small"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}

      {filteredWorkers.length === 0 && !loading && (
        <Alert severity="info">
          No workers found. {showHybridWorkers ? 'Try adjusting the filters.' : 'Enable hybrid workers to see more results.'}
        </Alert>
      )}
    </Box>
  );
};

export default AgentsView;