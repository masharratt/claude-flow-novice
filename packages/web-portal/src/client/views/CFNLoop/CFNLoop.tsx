/**
 * CFN Loop View - Visual representation of CFN Loop phases, metrics, and progress
 * Features: Phase timeline, current loop status, metrics cards, progress bars, WebSocket updates
 */

import React, { useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  LinearProgress,
  IconButton,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Loop as LoopIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
} from '@mui/icons-material';
import { useCFNLoopStore } from '../../../shared/stores/cfnLoopStore';

export const CFNLoop: React.FC = () => {
  const phases = useCFNLoopStore((state) => state.phases);
  const currentLoopNumber = useCFNLoopStore((state) => state.currentLoopNumber);
  const currentPhaseName = useCFNLoopStore((state) => state.currentPhaseName);
  const validators = useCFNLoopStore((state) => state.validators);
  const metrics = useCFNLoopStore((state) => state.metrics);
  const loop3Progress = useCFNLoopStore((state) => state.loop3Progress);
  const loop2Progress = useCFNLoopStore((state) => state.loop2Progress);
  const loading = useCFNLoopStore((state) => state.loading);
  const setLoading = useCFNLoopStore((state) => state.setLoading);

  // Refresh handler
  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
    }, 500);
  };

  // Progress status text
  const loop3Status = useMemo(() => {
    if (loop3Progress >= metrics.gateThreshold) {
      return 'Above gate threshold';
    } else {
      return 'Below gate threshold';
    }
  }, [loop3Progress, metrics.gateThreshold]);

  const loop2Status = useMemo(() => {
    if (loop2Progress >= metrics.consensusThreshold) {
      return 'Above consensus threshold';
    } else {
      return 'Below consensus threshold';
    }
  }, [loop2Progress, metrics.consensusThreshold]);

  return (
    <Box sx={{ p: 3 }}>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <LoopIcon fontSize="large" />
          <Typography variant="h4" component="h1">
            CFN Loop Visualization
          </Typography>
        </Box>
        <IconButton onClick={handleRefresh} aria-label="refresh cfn loop" size="large">
          <RefreshIcon />
        </IconButton>
      </Box>

      {/* Phase Timeline */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom>
          Phase Timeline
        </Typography>
        <Box sx={{ display: 'flex', gap: 2, overflowX: 'auto', pb: 2 }}>
          {phases.map((phase) => (
            <Card
              key={phase.id}
              data-testid={`phase-${phase.number}`}
              sx={{ minWidth: 250, flex: '0 0 auto' }}
            >
              <CardContent>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6">Phase {phase.number}</Typography>
                  {phase.completed ? (
                    <CheckCircleIcon color="success" />
                  ) : (
                    <RadioButtonUncheckedIcon color="disabled" />
                  )}
                </Box>
                <Typography variant="subtitle1" gutterBottom>
                  {phase.name}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {phase.sprints.map((sprint) => (
                    <Chip
                      key={sprint.id}
                      label={sprint.name}
                      size="small"
                      color={sprint.completed ? 'success' : 'default'}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Current Loop Status */}
      <Card sx={{ mb: 4 }} data-testid="current-loop-status">
        <CardContent>
          <Typography variant="h5" gutterBottom>
            Loop {currentLoopNumber} - {currentPhaseName}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
            <Chip
              label={`Confidence: ${(loop3Progress * 100).toFixed(0)}%`}
              color={loop3Progress >= metrics.gateThreshold ? 'success' : 'warning'}
            />
            <Chip label={`Validators: ${validators}/4`} />
          </Box>
        </CardContent>
      </Card>

      {/* Metrics Cards */}
      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-gate-threshold">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Gate Threshold
              </Typography>
              <Typography variant="h3" component="h3">
                {(metrics.gateThreshold * 100).toFixed(0)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-consensus-threshold">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Consensus Threshold
              </Typography>
              <Typography variant="h3" component="h3">
                {(metrics.consensusThreshold * 100).toFixed(0)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-avg-loop3">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Loop 3 Confidence
              </Typography>
              <Typography variant="h3" component="h3">
                {(loop3Progress * 100).toFixed(0)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card data-testid="metric-avg-loop2">
            <CardContent>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Loop 2 Consensus
              </Typography>
              <Typography variant="h3" component="h3">
                {(loop2Progress * 100).toFixed(0)}%
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Progress Bars */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom>
          Loop 3 Progress (Implementation)
        </Typography>
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <LinearProgress
              variant="determinate"
              value={loop3Progress * 100}
              data-testid="loop3-progress-bar"
              sx={{
                height: 10,
                borderRadius: 5,
                mb: 1,
                '& .MuiLinearProgress-bar': {
                  backgroundColor: loop3Progress >= metrics.gateThreshold ? '#4caf50' : '#ff9800',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">
                Target: {(metrics.gateThreshold * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Current: {(loop3Progress * 100).toFixed(0)}%
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{
                mt: 1,
                color: loop3Progress >= metrics.gateThreshold ? 'success.main' : 'warning.main',
              }}
            >
              {loop3Status}
            </Typography>
          </CardContent>
        </Card>

        <Typography variant="h5" gutterBottom>
          Loop 2 Progress (Validation)
        </Typography>
        <Card>
          <CardContent>
            <LinearProgress
              variant="determinate"
              value={loop2Progress * 100}
              data-testid="loop2-progress-bar"
              sx={{
                height: 10,
                borderRadius: 5,
                mb: 1,
                '& .MuiLinearProgress-bar': {
                  backgroundColor:
                    loop2Progress >= metrics.consensusThreshold ? '#4caf50' : '#ff9800',
                },
              }}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
              <Typography variant="caption" color="text.secondary">
                Target: {(metrics.consensusThreshold * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Current: {(loop2Progress * 100).toFixed(0)}%
              </Typography>
            </Box>
            <Typography
              variant="body2"
              sx={{
                mt: 1,
                color:
                  loop2Progress >= metrics.consensusThreshold ? 'success.main' : 'warning.main',
              }}
            >
              {loop2Status}
            </Typography>
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
};
