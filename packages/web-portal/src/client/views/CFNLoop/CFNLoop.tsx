/**
 * CFN Loop View - Visual representation of CFN Loop phases, metrics, and progress
 * Features: Phase timeline, current loop status, metrics cards, progress bars, WebSocket updates
 * Enhanced with Tailwind CSS, improved accessibility, and responsive design
 */

import React, { useMemo, useEffect, useState, useCallback } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
  Chip,
  LinearProgress,
  IconButton,
  Alert,
  Button,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  Loop as LoopIcon,
  CheckCircle as CheckCircleIcon,
  RadioButtonUnchecked as RadioButtonUncheckedIcon,
  WifiOff as WifiOffIcon,
  Info as InfoIcon,
} from '@mui/icons-material';
import { useCFNLoopStore } from '../../../shared/stores/cfnLoopStore';
import { useWebSocket } from '../../../shared/hooks/useWebSocket';

// WebSocket event payload interface
interface CFNLoopUpdatePayload {
  loopNumber?: number;
  phaseName?: string;
  loop3Progress?: number;
  loop2Progress?: number;
  phaseId?: string;
  completed?: boolean;
}

interface Loop3Iteration {
  iteration: number;
  maxIterations: number;
  confidence: number;
  testResults: {
    passed: number;
    failed: number;
    total: number;
  };
  artifacts: string[];
  gateResult: 'PASS' | 'FAIL';
}

interface Loop4Decision {
  decision: 'DEFER' | 'PROCEED' | 'ESCALATE';
  reasoning: string;
  backlogItems: string[];
  costSavings: number;
  timestamp: number;
}

// Utility function for confidence-based color coding
const getConfidenceColor = (confidence: number, threshold: number = 0.75): 'success' | 'warning' | 'error' => {
  if (confidence >= threshold) return 'success';
  if (confidence >= threshold * 0.8) return 'warning';
  return 'error';
};

const getConfidenceHexColor = (confidence: number, threshold: number = 0.75): string => {
  if (confidence >= threshold) return '#10b981'; // green-500
  if (confidence >= threshold * 0.8) return '#f59e0b'; // amber-500
  return '#ef4444'; // red-500
};

// Utility function for decision-based color coding
const getDecisionColor = (decision: string): 'success' | 'warning' | 'error' | 'info' => {
  switch (decision) {
    case 'DEFER': return 'success';
    case 'PROCEED': return 'warning';
    case 'ESCALATE': return 'error';
    default: return 'info';
  }
};

export const CFNLoop: React.FC = () => {
  const phases = useCFNLoopStore((state) => state.phases);
  const currentLoopNumber = useCFNLoopStore((state) => state.currentLoopNumber);
  const currentPhaseName = useCFNLoopStore((state) => state.currentPhaseName);
  const validators = useCFNLoopStore((state) => state.validators);
  const metrics = useCFNLoopStore((state) => state.metrics);
  const loop3Progress = useCFNLoopStore((state) => state.loop3Progress);
  const loop2Progress = useCFNLoopStore((state) => state.loop2Progress);
  const setLoading = useCFNLoopStore((state) => state.setLoading);
  const setCurrentLoop = useCFNLoopStore((state) => state.setCurrentLoop);
  const setLoop3Progress = useCFNLoopStore((state) => state.setLoop3Progress);
  const setLoop2Progress = useCFNLoopStore((state) => state.setLoop2Progress);
  const updatePhaseCompletion = useCFNLoopStore((state) => state.updatePhaseCompletion);
  const [error, setError] = useState<Error | null>(null);

  // Loop 3 iterations state
  const [loop3Iterations, setLoop3Iterations] = useState<Loop3Iteration[]>([]);

  // Loop 4 decision state
  const [loop4Decision, setLoop4Decision] = useState<Loop4Decision | null>(null);

  // Real-time update status
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // WebSocket connection
  const { isConnected, subscribe, reconnect } = useWebSocket();

  // Subscribe to real-time CFN loop updates
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe<CFNLoopUpdatePayload>('cfn.loop.update', (data) => {
      try {
        // Update loop state based on incoming data
        if (data.loopNumber && data.phaseName) {
          setCurrentLoop(data.loopNumber, data.phaseName);
        }
        if (data.loop3Progress !== undefined) {
          setLoop3Progress(data.loop3Progress);
        }
        if (data.loop2Progress !== undefined) {
          setLoop2Progress(data.loop2Progress);
        }
        if (data.phaseId && data.completed !== undefined) {
          updatePhaseCompletion(data.phaseId, data.completed);
        }
        setLastUpdate(new Date());
        setError(null);
      } catch (err) {
        const error = err as Error;
        setError(error);
        console.error('[CFNLoop] Failed to process CFN loop update:', error);
      }
    });

    return () => {
      try {
        unsubscribe();
      } catch (err) {
        console.error('[CFNLoop] Error during unsubscribe:', err);
      }
    };
  }, [isConnected, subscribe, setCurrentLoop, setLoop3Progress, setLoop2Progress, updatePhaseCompletion]);

  // Subscribe to Loop 3 iterations with enhanced error handling
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe<Loop3Iteration>('cfn:loop3:iteration', (data) => {
      try {
        setLoop3Iterations(prev => {
          // Avoid duplicates and keep only recent iterations
          const filtered = prev.filter(iter => iter.iteration !== data.iteration);
          return [...filtered, data].slice(-10); // Keep last 10 iterations
        });
        setLastUpdate(new Date());
      } catch (err) {
        console.error('[CFNLoop] Error processing Loop 3 iteration:', err);
      }
    });

    return () => unsubscribe();
  }, [isConnected, subscribe]);

  // Subscribe to Loop 4 decisions with enhanced error handling
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = subscribe<Loop4Decision>('cfn:loop4:decision', (data) => {
      try {
        setLoop4Decision(data);
        setLastUpdate(new Date());
      } catch (err) {
        console.error('[CFNLoop] Error processing Loop 4 decision:', err);
      }
    });

    return () => unsubscribe();
  }, [isConnected, subscribe]);

  // Refresh handler with improved feedback
  const handleRefresh = useCallback(() => {
    try {
      setLoading(true);
      setError(null);
      setTimeout(() => {
        setLoading(false);
        setLastUpdate(new Date());
      }, 500);
    } catch (err) {
      const error = err as Error;
      setError(error);
      setLoading(false);
      console.error('[CFNLoop] Refresh failed:', error);
    }
  }, [setLoading]);

  // Handle manual reconnection with better error handling
  const handleReconnect = useCallback(() => {
    try {
      setError(null);
      reconnect();
    } catch (err) {
      const error = err as Error;
      setError(error);
      console.error('[CFNLoop] Reconnect failed:', error);
    }
  }, [reconnect]);

  // Progress status text with enhanced messaging
  const loop3Status = useMemo(() => {
    if (loop3Progress >= metrics.gateThreshold) {
      return `✅ Above gate threshold (${(metrics.gateThreshold * 100).toFixed(0)}%)`;
    } else {
      const gap = ((metrics.gateThreshold - loop3Progress) * 100).toFixed(0);
      return `⚠️ ${gap}% below gate threshold`;
    }
  }, [loop3Progress, metrics.gateThreshold]);

  const loop2Status = useMemo(() => {
    if (loop2Progress >= metrics.consensusThreshold) {
      return `✅ Above consensus threshold (${(metrics.consensusThreshold * 100).toFixed(0)}%)`;
    } else {
      const gap = ((metrics.consensusThreshold - loop2Progress) * 100).toFixed(0);
      return `⚠️ ${gap}% below consensus threshold`;
    }
  }, [loop2Progress, metrics.consensusThreshold]);

  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: '100%', overflow: 'hidden' }}>
      {/* Header with enhanced responsive design */}
      <Box 
        sx={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center', 
          mb: 3,
          flexDirection: { xs: 'column', sm: 'row' },
          gap: { xs: 2, sm: 0 }
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <LoopIcon 
            fontSize="large" 
            sx={{ 
              color: 'primary.main',
              fontSize: { xs: '2rem', sm: '2.5rem' }
            }} 
          />
          <Typography 
            variant="h4" 
            component="h1"
            sx={{ 
              fontSize: { xs: '1.5rem', sm: '2rem', md: '2.125rem' },
              fontWeight: 600
            }}
          >
            CFN Loop Visualization
          </Typography>
        </Box>
        
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          {/* Connection status with enhanced accessibility */}
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            {!isConnected ? (
              <Chip
                icon={<WifiOffIcon />}
                label="Disconnected"
                color="error"
                size="small"
                data-testid="connection-status"
                aria-label="WebSocket disconnected"
              />
            ) : (
              <Chip
                icon={<CheckCircleIcon />}
                label="Live"
                color="success"
                size="small"
                data-testid="connection-status"
                aria-label="WebSocket connected and live"
              />
            )}
            {lastUpdate && (
              <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
                Last: {lastUpdate.toLocaleTimeString()}
              </Typography>
            )}
          </Box>
          
          <IconButton 
            onClick={handleRefresh} 
            aria-label="refresh cfn loop data"
            size="large"
            sx={{
              '&:hover': {
                backgroundColor: 'action.hover',
              }
            }}
          >
            <RefreshIcon />
          </IconButton>
        </Box>
      </Box>

      {/* Error Display with enhanced accessibility */}
      {error && (
        <Alert 
          severity="error" 
          sx={{ mb: 2 }} 
          onClose={() => setError(null)}
          role="alert"
          aria-live="assertive"
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="body2" fontWeight="medium">
              Error:
            </Typography>
            <Typography variant="body2">
              {error.message}
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Disconnection Warning with Reconnect */}
      {!isConnected && (
        <Alert
          severity="warning"
          sx={{ mb: 2 }}
          action={
            <Button 
              color="inherit" 
              size="small" 
              onClick={handleReconnect}
              aria-label="Reconnect WebSocket"
            >
              Reconnect
            </Button>
          }
          role="alert"
          aria-live="polite"
        >
          <Box>
            <Typography variant="body2" fontWeight="medium" sx={{ mb: 0.5 }}>
              WebSocket Disconnected
            </Typography>
            <Typography variant="body2">
              Real-time CFN Loop updates are unavailable. Click Reconnect to retry.
            </Typography>
          </Box>
        </Alert>
      )}

      {/* Phase Timeline with responsive design */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Phase Timeline
        </Typography>
        <Box 
          sx={{ 
            display: 'flex', 
            gap: 2, 
            overflowX: 'auto', 
            pb: 2,
            '&::-webkit-scrollbar': {
              height: 8,
            },
            '&::-webkit-scrollbar-track': {
              backgroundColor: 'grey.100',
              borderRadius: 4,
            },
            '&::-webkit-scrollbar-thumb': {
              backgroundColor: 'grey.300',
              borderRadius: 4,
            },
          }}
        >
          {phases.map((phase) => (
            <Card
              key={phase.id}
              data-testid={`phase-${phase.number}`}
              sx={{ 
                minWidth: { xs: 200, sm: 250 }, 
                flex: '0 0 auto',
                transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                '&:hover': {
                  transform: 'translateY(-2px)',
                  boxShadow: 4,
                }
              }}
            >
              <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                  <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                    Phase {phase.number}
                  </Typography>
                  {phase.completed ? (
                    <CheckCircleIcon 
                      color="success" 
                      aria-label={`Phase ${phase.number} completed`}
                    />
                  ) : (
                    <RadioButtonUncheckedIcon 
                      color="disabled" 
                      aria-label={`Phase ${phase.number} not completed`}
                    />
                  )}
                </Box>
                <Typography variant="subtitle1" gutterBottom sx={{ fontSize: { xs: '0.875rem', sm: '1rem' } }}>
                  {phase.name}
                </Typography>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {phase.sprints.map((sprint) => (
                    <Chip
                      key={sprint.id}
                      label={sprint.name}
                      size="small"
                      color={sprint.completed ? 'success' : 'default'}
                      sx={{ fontSize: { xs: '0.7rem', sm: '0.75rem' } }}
                    />
                  ))}
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      </Box>

      {/* Current Loop Status with enhanced visual feedback */}
      <Card 
        sx={{ 
          mb: 4, 
          border: 2,
          borderColor: getConfidenceColor(loop3Progress, metrics.gateThreshold) === 'success' ? 'success.main' : 'warning.main',
          transition: 'border-color 0.3s ease'
        }} 
        data-testid="current-loop-status"
      >
        <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
          <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
            Loop {currentLoopNumber} - {currentPhaseName}
          </Typography>
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 2, mt: 2 }}>
            <Chip
              label={`Confidence: ${(loop3Progress * 100).toFixed(0)}%`}
              color={getConfidenceColor(loop3Progress, metrics.gateThreshold)}
              sx={{ 
                fontWeight: 'bold',
                '& .MuiChip-label': {
                  fontSize: { xs: '0.8rem', sm: '0.875rem' }
                }
              }}
              aria-label={`Current confidence ${(loop3Progress * 100).toFixed(0)} percent`}
            />
            <Chip 
              label={`Validators: ${validators}/4`} 
              aria-label={`${validators} out of 4 validators active`}
            />
            <Chip
              label={`Status: ${loop3Progress >= metrics.gateThreshold ? 'PASS' : 'FAIL'}`}
              color={getConfidenceColor(loop3Progress, metrics.gateThreshold)}
              aria-label={`Gate status ${loop3Progress >= metrics.gateThreshold ? 'pass' : 'fail'}`}
            />
          </Box>
        </CardContent>
      </Card>

      {/* Metrics Cards with responsive grid */}
      <Grid container spacing={{ xs: 2, sm: 3 }} sx={{ mb: 4 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            data-testid="metric-gate-threshold"
            sx={{
              transition: 'transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              }
            }}
          >
            <CardContent sx={{ textAlign: 'center', p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Gate Threshold
              </Typography>
              <Typography 
                variant="h3" 
                component="h3"
                sx={{ 
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                  fontWeight: 'bold',
                  color: 'primary.main'
                }}
              >
                {(metrics.gateThreshold * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Minimum confidence to proceed
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            data-testid="metric-consensus-threshold"
            sx={{
              transition: 'transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              }
            }}
          >
            <CardContent sx={{ textAlign: 'center', p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Consensus Threshold
              </Typography>
              <Typography 
                variant="h3" 
                component="h3"
                sx={{ 
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                  fontWeight: 'bold',
                  color: 'primary.main'
                }}
              >
                {(metrics.consensusThreshold * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Minimum consensus for validation
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            data-testid="metric-avg-loop3"
            sx={{
              border: 2,
              borderColor: getConfidenceHexColor(loop3Progress, metrics.gateThreshold),
              transition: 'border-color 0.3s ease, transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              }
            }}
          >
            <CardContent sx={{ textAlign: 'center', p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Loop 3 Confidence
              </Typography>
              <Typography 
                variant="h3" 
                component="h3"
                sx={{ 
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                  fontWeight: 'bold',
                  color: getConfidenceHexColor(loop3Progress, metrics.gateThreshold)
                }}
              >
                {(loop3Progress * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {getConfidenceColor(loop3Progress, metrics.gateThreshold) === 'success' ? '✅ Above threshold' : '⚠️ Below threshold'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card 
            data-testid="metric-avg-loop2"
            sx={{
              border: 2,
              borderColor: getConfidenceHexColor(loop2Progress, metrics.consensusThreshold),
              transition: 'border-color 0.3s ease, transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'translateY(-2px)',
              }
            }}
          >
            <CardContent sx={{ textAlign: 'center', p: { xs: 2, sm: 3 } }}>
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Avg Loop 2 Consensus
              </Typography>
              <Typography 
                variant="h3" 
                component="h3"
                sx={{ 
                  fontSize: { xs: '2rem', sm: '2.5rem', md: '3rem' },
                  fontWeight: 'bold',
                  color: getConfidenceHexColor(loop2Progress, metrics.consensusThreshold)
                }}
              >
                {(loop2Progress * 100).toFixed(0)}%
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {getConfidenceColor(loop2Progress, metrics.consensusThreshold) === 'success' ? '✅ Above threshold' : '⚠️ Below threshold'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Loop 3 Iterations with enhanced display */}
      {loop3Iterations.length > 0 && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
              Loop 3 Iterations
            </Typography>
            <Chip
              label={`${loop3Iterations.length} iterations`}
              size="small"
              color="primary"
              aria-label={`${loop3Iterations.length} loop 3 iterations`}
            />
          </Box>
          <Grid container spacing={{ xs: 2, sm: 3 }}>
            {loop3Iterations.map((iter) => (
              <Grid item xs={12} sm={6} lg={4} key={iter.iteration}>
                <Card
                  sx={{
                    border: 2,
                    borderColor: getConfidenceHexColor(iter.confidence, 0.75),
                    transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
                    '&:hover': {
                      transform: 'translateY(-2px)',
                      boxShadow: 4,
                    }
                  }}
                >
                  <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                      <Typography variant="h6" sx={{ fontSize: { xs: '1rem', sm: '1.25rem' } }}>
                        Iteration {iter.iteration}/{iter.maxIterations}
                      </Typography>
                      <Chip
                        label={iter.gateResult}
                        color={iter.gateResult === 'PASS' ? 'success' : 'error'}
                        size="small"
                        sx={{ fontWeight: 'bold' }}
                        aria-label={`Gate result ${iter.gateResult}`}
                      />
                    </Box>

                    <Box sx={{ mb: 2 }}>
                      <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <span>Confidence:</span>
                        <Typography 
                          variant="body2" 
                          component="span"
                          sx={{ 
                            fontWeight: 'bold',
                            color: getConfidenceHexColor(iter.confidence, 0.75)
                          }}
                        >
                          {(iter.confidence * 100).toFixed(0)}%
                        </Typography>
                      </Typography>

                      <LinearProgress
                        variant="determinate"
                        value={iter.confidence * 100}
                        sx={{
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: 'grey.200',
                          '& .MuiLinearProgress-bar': {
                            backgroundColor: getConfidenceHexColor(iter.confidence, 0.75),
                            borderRadius: 4,
                          },
                        }}
                        aria-label={`Confidence progress ${(iter.confidence * 100).toFixed(0)} percent`}
                      />
                    </Box>

                    <Typography variant="body2" sx={{ mb: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                      <span>Tests:</span>
                      <Typography 
                        variant="body2" 
                        component="span"
                        sx={{ 
                          fontWeight: 'bold',
                          color: iter.testResults.failed === 0 ? 'success.main' : 'error.main'
                        }}
                      >
                        {iter.testResults.passed}/{iter.testResults.total} passed
                      </Typography>
                    </Typography>

                    {iter.artifacts.length > 0 && (
                      <Box sx={{ mt: 2 }}>
                        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                          Artifacts ({iter.artifacts.length}):
                        </Typography>
                        <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                          {iter.artifacts.map((artifact, idx) => (
                            <Chip
                              key={idx}
                              label={artifact}
                              size="small"
                              variant="outlined"
                              sx={{ 
                                fontSize: '0.7rem',
                                height: 'auto',
                                '& .MuiChip-label': {
                                  padding: '2px 6px'
                                }
                              }}
                            />
                          ))}
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>
      )}

      {/* Loop 4 Decision with enhanced display */}
      {loop4Decision && (
        <Box sx={{ mb: 4 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 2 }}>
            <Typography variant="h5" sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
              Loop 4 Product Owner Decision
            </Typography>
            <InfoIcon 
              color="info" 
              fontSize="small" 
              sx={{ cursor: 'help' }}
              titleAccess="Final decision after Loop 3 and Loop 2 validation"
            />
          </Box>
          <Card
            sx={{
              border: 2,
              borderColor: getDecisionColor(loop4Decision.decision) === 'success' ? 'success.main' :
                         getDecisionColor(loop4Decision.decision) === 'warning' ? 'warning.main' :
                         getDecisionColor(loop4Decision.decision) === 'error' ? 'error.main' : 'info.main',
              transition: 'border-color 0.3s ease'
            }}
          >
            <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2, flexDirection: { xs: 'column', sm: 'row' }, gap: { xs: 1, sm: 0 } }}>
                <Chip
                  label={loop4Decision.decision}
                  color={getDecisionColor(loop4Decision.decision)}
                  sx={{ 
                    fontSize: { xs: '0.9rem', sm: '1rem' }, 
                    px: 2, 
                    py: 1,
                    fontWeight: 'bold'
                  }}
                  aria-label={`Decision ${loop4Decision.decision}`}
                />
                <Typography variant="caption" color="text.secondary">
                  {new Date(loop4Decision.timestamp).toLocaleString()}
                </Typography>
              </Box>

              <Typography variant="body1" sx={{ mb: 2, lineHeight: 1.6 }}>
                {loop4Decision.reasoning}
              </Typography>

              {loop4Decision.backlogItems.length > 0 && (
                <Box sx={{ mb: 2 }}>
                  <Typography variant="subtitle2" gutterBottom sx={{ fontWeight: 'bold' }}>
                    Backlog Items ({loop4Decision.backlogItems.length}):
                  </Typography>
                  <Box component="ul" sx={{ pl: 2, m: 0 }}>
                    {loop4Decision.backlogItems.map((item, idx) => (
                      <Typography 
                        component="li" 
                        key={idx} 
                        variant="body2"
                        sx={{ 
                          mb: 0.5,
                          '&::marker': {
                            color: 'primary.main'
                          }
                        }}
                      >
                        {item}
                      </Typography>
                    ))}
                  </Box>
                </Box>
              )}

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                <Chip
                  label={`Cost Savings: $${loop4Decision.costSavings.toFixed(2)}`}
                  color="success"
                  size="small"
                  sx={{ fontWeight: 'bold' }}
                  aria-label={`Cost savings ${loop4Decision.costSavings.toFixed(2)} dollars`}
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      )}

      {/* Progress Bars with enhanced visual feedback */}
      <Box sx={{ mb: 4 }}>
        <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Loop 3 Progress (Implementation)
        </Typography>
        <Card 
          sx={{ 
            mb: 2,
            border: 2,
            borderColor: getConfidenceHexColor(loop3Progress, metrics.gateThreshold),
            transition: 'border-color 0.3s ease'
          }}
        >
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <LinearProgress
              variant="determinate"
              value={loop3Progress * 100}
              data-testid="loop3-progress-bar"
              sx={{
                height: { xs: 8, sm: 10 },
                borderRadius: { xs: 4, sm: 5 },
                mb: 1,
                backgroundColor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getConfidenceHexColor(loop3Progress, metrics.gateThreshold),
                  borderRadius: { xs: 4, sm: 5 },
                  transition: 'background-color 0.3s ease',
                },
              }}
              aria-label={`Loop 3 progress ${(loop3Progress * 100).toFixed(0)} percent`}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
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
                fontWeight: 'medium',
                color: getConfidenceColor(loop3Progress, metrics.gateThreshold) === 'success' ? 'success.main' : 'warning.main',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              {loop3Status}
            </Typography>
          </CardContent>
        </Card>

        <Typography variant="h5" gutterBottom sx={{ fontSize: { xs: '1.25rem', sm: '1.5rem' } }}>
          Loop 2 Progress (Validation)
        </Typography>
        <Card
          sx={{
            border: 2,
            borderColor: getConfidenceHexColor(loop2Progress, metrics.consensusThreshold),
            transition: 'border-color 0.3s ease'
          }}
        >
          <CardContent sx={{ p: { xs: 2, sm: 3 } }}>
            <LinearProgress
              variant="determinate"
              value={loop2Progress * 100}
              data-testid="loop2-progress-bar"
              sx={{
                height: { xs: 8, sm: 10 },
                borderRadius: { xs: 4, sm: 5 },
                mb: 1,
                backgroundColor: 'grey.200',
                '& .MuiLinearProgress-bar': {
                  backgroundColor: getConfidenceHexColor(loop2Progress, metrics.consensusThreshold),
                  borderRadius: { xs: 4, sm: 5 },
                  transition: 'background-color 0.3s ease',
                },
              }}
              aria-label={`Loop 2 progress ${(loop2Progress * 100).toFixed(0)} percent`}
            />
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
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
                fontWeight: 'medium',
                color: getConfidenceColor(loop2Progress, metrics.consensusThreshold) === 'success' ? 'success.main' : 'warning.main',
                display: 'flex',
                alignItems: 'center',
                gap: 1
              }}
            >
              {loop2Status}
            </Typography>
          </CardContent>
        </Card>
      </Box>

      {/* Real-time Status Footer */}
      {isConnected && lastUpdate && (
        <Box sx={{ 
          display: 'flex', 
          justifyContent: 'center', 
          alignItems: 'center', 
          gap: 1,
          mt: 2,
          p: 1,
          backgroundColor: 'grey.50',
          borderRadius: 1
        }}>
          <CheckCircleIcon color="success" fontSize="small" />
          <Typography variant="caption" color="text.secondary">
            Real-time updates active • Last update: {lastUpdate.toLocaleTimeString()}
          </Typography>
        </Box>
      )}
    </Box>
  );
};