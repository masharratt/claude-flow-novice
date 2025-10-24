import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Chip,
  LinearProgress,
  Box,
  Grid,
  Alert,
  CircularProgress,
  Divider
} from '@mui/material';

interface CFNLoopMetrics {
  taskId: string;
  iteration: number;
  maxIterations: number;
  loop3Confidence: number[];
  loop2Consensus: number;
  productOwnerDecision: 'PROCEED' | 'ITERATE' | 'ABORT' | 'PENDING';
  status: 'running' | 'completed' | 'failed';
  startTime: string;
  lastUpdate: string;
  agents: {
    loop3: string[];
    loop2: string[];
    productOwner: string;
  };
}

interface CFNLoopDashboardProps {
  taskId?: string;
  autoRefresh?: boolean;
  refreshInterval?: number;
}

const CFNLoopDashboard: React.FC<CFNLoopDashboardProps> = ({
  taskId,
  autoRefresh = true,
  refreshInterval = 2000,
}) => {
  const [metrics, setMetrics] = useState<CFNLoopMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const endpoint = taskId
          ? `/api/cfn-metrics/${taskId}`
          : '/api/cfn-metrics/latest';

        const response = await fetch(endpoint);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        setMetrics(data);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();

    if (autoRefresh) {
      const interval = setInterval(fetchMetrics, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [taskId, autoRefresh, refreshInterval]);

  const getStatusChipColor = (status: string): 'success' | 'default' | 'error' | 'secondary' => {
    switch (status) {
      case 'completed':
        return 'success';
      case 'running':
        return 'default';
      case 'failed':
        return 'error';
      default:
        return 'secondary';
    }
  };

  const getDecisionChipColor = (decision: string): 'success' | 'warning' | 'error' | 'default' => {
    switch (decision) {
      case 'PROCEED':
        return 'success';
      case 'ITERATE':
        return 'warning';
      case 'ABORT':
        return 'error';
      default:
        return 'default';
    }
  };

  const calculateAverageConfidence = (confidenceScores: number[]) => {
    if (!confidenceScores || confidenceScores.length === 0) return 0;
    const sum = confidenceScores.reduce((a, b) => a + b, 0);
    return (sum / confidenceScores.length) * 100;
  };

  if (loading && !metrics) {
    return (
      <Card sx={{ width: '100%' }}>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            CFN Loop Dashboard
          </Typography>
          <Box display="flex" alignItems="center" justifyContent="center" py={4}>
            <CircularProgress size={32} />
            <Typography variant="body2" color="text.secondary" sx={{ ml: 2 }}>
              Loading metrics...
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ width: '100%', borderColor: 'error.main' }}>
        <CardContent>
          <Typography variant="h5" component="h2" color="error" gutterBottom>
            CFN Loop Dashboard
          </Typography>
          <Alert severity="error">
            <Typography variant="subtitle2">Error loading metrics</Typography>
            <Typography variant="body2" sx={{ mt: 1 }}>
              {error}
            </Typography>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!metrics) {
    return (
      <Card sx={{ width: '100%' }}>
        <CardContent>
          <Typography variant="h5" component="h2" gutterBottom>
            CFN Loop Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            No active CFN Loop tasks found
          </Typography>
        </CardContent>
      </Card>
    );
  }

  const avgLoop3Confidence = calculateAverageConfidence(metrics.loop3Confidence);
  const progressPercentage = (metrics.iteration / metrics.maxIterations) * 100;

  return (
    <Box sx={{ mb: 2 }}>
      <Card sx={{ width: '100%' }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h5" component="h2">
              CFN Loop Dashboard
            </Typography>
            <Chip
              label={metrics.status.toUpperCase()}
              color={getStatusChipColor(metrics.status)}
              size="small"
            />
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Task ID: {metrics.taskId}
          </Typography>

          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Iteration Progress */}
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" fontWeight="medium">
                  Iteration Progress
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {metrics.iteration} / {metrics.maxIterations}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={progressPercentage}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            {/* Loop 3: Implementation Confidence */}
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" fontWeight="medium">
                  Loop 3: Implementation Confidence
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {avgLoop3Confidence.toFixed(1)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={avgLoop3Confidence}
                sx={{ height: 8, borderRadius: 1 }}
              />
              <Box display="flex" flexWrap="wrap" gap={1} mt={1}>
                {metrics.loop3Confidence.map((score, idx) => (
                  <Chip
                    key={idx}
                    label={`${metrics.agents.loop3[idx]}: ${(score * 100).toFixed(0)}%`}
                    size="small"
                    color="default"
                  />
                ))}
              </Box>
            </Box>

            {/* Loop 2: Validation Consensus */}
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
                <Typography variant="body2" fontWeight="medium">
                  Loop 2: Validation Consensus
                </Typography>
                <Typography variant="body2" fontWeight="bold">
                  {(metrics.loop2Consensus * 100).toFixed(1)}%
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={metrics.loop2Consensus * 100}
                sx={{ height: 8, borderRadius: 1 }}
              />
            </Box>

            {/* Product Owner Decision */}
            <Box>
              <Box display="flex" alignItems="center" justifyContent="space-between">
                <Typography variant="body2" fontWeight="medium">
                  Product Owner Decision
                </Typography>
                <Chip
                  label={metrics.productOwnerDecision}
                  color={getDecisionChipColor(metrics.productOwnerDecision)}
                  size="small"
                />
              </Box>
            </Box>

            <Divider />

            {/* Timestamps */}
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Started
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {new Date(metrics.startTime).toLocaleTimeString()}
                </Typography>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="caption" color="text.secondary">
                  Last Update
                </Typography>
                <Typography variant="body2" fontWeight="medium">
                  {new Date(metrics.lastUpdate).toLocaleTimeString()}
                </Typography>
              </Grid>
            </Grid>

            <Divider />

            {/* Agents */}
            <Box>
              <Typography variant="body2" fontWeight="medium" mb={2}>
                Active Agents
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Loop 3 (Implementers)
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {metrics.agents.loop3.map((agent, idx) => (
                      <Chip
                        key={idx}
                        label={agent}
                        variant="outlined"
                        size="small"
                      />
                    ))}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Loop 2 (Validators)
                  </Typography>
                  <Box display="flex" flexWrap="wrap" gap={0.5}>
                    {metrics.agents.loop2.map((agent, idx) => (
                      <Chip
                        key={idx}
                        label={agent}
                        variant="outlined"
                        size="small"
                      />
                    ))}
                  </Box>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
                    Product Owner
                  </Typography>
                  <Chip
                    label={metrics.agents.productOwner}
                    variant="outlined"
                    size="small"
                  />
                </Box>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default CFNLoopDashboard;
