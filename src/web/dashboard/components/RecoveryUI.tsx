/**
 * Recovery UI Component - Dashboard for Crash Recovery
 *
 * Provides visual interface for detecting and recovering from interrupted epics:
 * - List of interrupted epics with progress indicators
 * - Recovery options (resume/restart/inspect/abandon)
 * - Real-time recovery progress monitoring
 * - Work loss percentage estimates
 * - Checkpoint timestamps and history
 *
 * Integrates with recovery CLI commands for execution.
 *
 * @module web/dashboard/components/RecoveryUI
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  Button,
  LinearProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  Grid,
  IconButton,
  Tooltip,
} from '@mui/material';
import {
  Refresh as RefreshIcon,
  PlayArrow as ResumeIcon,
  RestartAlt as RestartIcon,
  Visibility as InspectIcon,
  Delete as AbandonIcon,
  CheckCircle as CompletedIcon,
  Warning as WarningIcon,
  Error as ErrorIcon,
  Pause as WaitingIcon,
} from '@mui/icons-material';

// ===== TYPE DEFINITIONS =====

interface InterruptedEpic {
  epicId: string;
  name: string;
  status: string;
  startTime: number;
  lastCheckpoint: number;
  crashDuration: number;
  sprints: InterruptedSprint[];
  estimatedWorkLoss: number;
  estimatedRecoveryTime: number;
}

interface InterruptedSprint {
  sprintId: string;
  name: string;
  status: 'completed' | 'in-progress' | 'starting' | 'waiting';
  progress: number;
  filesCompleted: number;
  filesTotal: number;
  lastFile?: string;
  lastLine?: number;
  confidence?: number;
  recoveryStrategy: 'skip' | 'resume' | 'restart';
}

interface CheckpointMetadata {
  version: number;
  timestamp: number;
  checkpointId: string;
  previousCheckpointId?: string;
  sizeBytes: number;
  compressionRatio: number;
  writeLatencyMs: number;
}

interface RecoveryProgress {
  epicId: string;
  status: 'idle' | 'resuming' | 'completed' | 'failed';
  currentSprint?: string;
  progress: number;
  message: string;
}

// ===== MAIN COMPONENT =====

export const RecoveryUI: React.FC = () => {
  const [interruptedEpics, setInterruptedEpics] = useState<InterruptedEpic[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEpic, setSelectedEpic] = useState<InterruptedEpic | null>(null);
  const [recoveryProgress, setRecoveryProgress] = useState<RecoveryProgress | null>(null);
  const [checkpointHistory, setCheckpointHistory] = useState<CheckpointMetadata[]>([]);
  const [showInspectDialog, setShowInspectDialog] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'resume' | 'abandon' | null>(null);

  // ===== DATA FETCHING =====

  useEffect(() => {
    loadInterruptedEpics();
  }, []);

  const loadInterruptedEpics = async () => {
    setLoading(true);
    try {
      // Call recovery:status API
      const response = await fetch('/api/recovery/status');
      const data = await response.json();
      setInterruptedEpics(data.interrupted || []);
    } catch (error) {
      console.error('Failed to load interrupted epics:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCheckpointHistory = async (epicId: string) => {
    try {
      const response = await fetch(`/api/recovery/inspect/${epicId}`);
      const data = await response.json();
      setCheckpointHistory(data.history || []);
    } catch (error) {
      console.error('Failed to load checkpoint history:', error);
    }
  };

  // ===== ACTION HANDLERS =====

  const handleResumeEpic = async (epic: InterruptedEpic) => {
    setSelectedEpic(epic);
    setConfirmAction('resume');
    setShowConfirmDialog(true);
  };

  const handleAbandonEpic = async (epic: InterruptedEpic) => {
    setSelectedEpic(epic);
    setConfirmAction('abandon');
    setShowConfirmDialog(true);
  };

  const handleInspectEpic = async (epic: InterruptedEpic) => {
    setSelectedEpic(epic);
    await loadCheckpointHistory(epic.epicId);
    setShowInspectDialog(true);
  };

  const executeAction = async () => {
    if (!selectedEpic || !confirmAction) return;

    setShowConfirmDialog(false);

    if (confirmAction === 'resume') {
      await executeResume(selectedEpic);
    } else if (confirmAction === 'abandon') {
      await executeAbandon(selectedEpic);
    }

    setSelectedEpic(null);
    setConfirmAction(null);
  };

  const executeResume = async (epic: InterruptedEpic) => {
    setRecoveryProgress({
      epicId: epic.epicId,
      status: 'resuming',
      progress: 0,
      message: 'Initializing recovery...',
    });

    try {
      // Call recovery:resume API
      const response = await fetch(`/api/recovery/resume/${epic.epicId}`, {
        method: 'POST',
      });

      const result = await response.json();

      setRecoveryProgress({
        epicId: epic.epicId,
        status: 'completed',
        progress: 100,
        message: `Recovered ${result.sprintsResumed} sprints successfully`,
      });

      // Reload interrupted epics
      setTimeout(() => {
        loadInterruptedEpics();
        setRecoveryProgress(null);
      }, 3000);
    } catch (error) {
      setRecoveryProgress({
        epicId: epic.epicId,
        status: 'failed',
        progress: 0,
        message: `Recovery failed: ${(error as Error).message}`,
      });
    }
  };

  const executeAbandon = async (epic: InterruptedEpic) => {
    try {
      await fetch(`/api/recovery/abandon/${epic.epicId}`, {
        method: 'DELETE',
      });

      // Reload interrupted epics
      await loadInterruptedEpics();
    } catch (error) {
      console.error('Failed to abandon epic:', error);
    }
  };

  // ===== RENDER =====

  if (loading) {
    return (
      <Box sx={{ p: 3 }}>
        <Typography>Loading interrupted epics...</Typography>
        <LinearProgress sx={{ mt: 2 }} />
      </Box>
    );
  }

  if (interruptedEpics.length === 0) {
    return (
      <Box sx={{ p: 3 }}>
        <Alert severity="success">
          No interrupted executions found. All epics completed or never started.
        </Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4">Crash Recovery</Typography>
        <Button startIcon={<RefreshIcon />} onClick={loadInterruptedEpics}>
          Refresh
        </Button>
      </Box>

      {recoveryProgress && (
        <Alert
          severity={
            recoveryProgress.status === 'completed'
              ? 'success'
              : recoveryProgress.status === 'failed'
              ? 'error'
              : 'info'
          }
          sx={{ mb: 3 }}
        >
          <Typography variant="body2">{recoveryProgress.message}</Typography>
          {recoveryProgress.status === 'resuming' && (
            <LinearProgress
              variant="determinate"
              value={recoveryProgress.progress}
              sx={{ mt: 1 }}
            />
          )}
        </Alert>
      )}

      <Grid container spacing={3}>
        {interruptedEpics.map((epic) => (
          <Grid item xs={12} key={epic.epicId}>
            <EpicCard
              epic={epic}
              onResume={handleResumeEpic}
              onAbandon={handleAbandonEpic}
              onInspect={handleInspectEpic}
            />
          </Grid>
        ))}
      </Grid>

      {/* Inspect Dialog */}
      <Dialog
        open={showInspectDialog}
        onClose={() => setShowInspectDialog(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Checkpoint History: {selectedEpic?.name}</DialogTitle>
        <DialogContent>
          <CheckpointHistoryTable history={checkpointHistory} />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowInspectDialog(false)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Confirm Dialog */}
      <Dialog open={showConfirmDialog} onClose={() => setShowConfirmDialog(false)}>
        <DialogTitle>
          {confirmAction === 'resume' ? 'Resume Epic?' : 'Abandon Epic?'}
        </DialogTitle>
        <DialogContent>
          {confirmAction === 'resume' ? (
            <Typography>
              This will resume execution from the last checkpoint. Estimated recovery time:{' '}
              {Math.ceil(selectedEpic?.estimatedRecoveryTime || 0)} minutes.
            </Typography>
          ) : (
            <Alert severity="warning">
              This will permanently delete all state for this epic. This action cannot be
              undone.
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowConfirmDialog(false)}>Cancel</Button>
          <Button
            onClick={executeAction}
            color={confirmAction === 'abandon' ? 'error' : 'primary'}
            variant="contained"
          >
            {confirmAction === 'resume' ? 'Resume' : 'Abandon'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

// ===== EPIC CARD COMPONENT =====

interface EpicCardProps {
  epic: InterruptedEpic;
  onResume: (epic: InterruptedEpic) => void;
  onAbandon: (epic: InterruptedEpic) => void;
  onInspect: (epic: InterruptedEpic) => void;
}

const EpicCard: React.FC<EpicCardProps> = ({ epic, onResume, onAbandon, onInspect }) => {
  return (
    <Card>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 2 }}>
          <Box>
            <Typography variant="h6">{epic.name}</Typography>
            <Typography variant="body2" color="text.secondary">
              ID: {epic.epicId}
            </Typography>
          </Box>
          <Box>
            <Tooltip title="Resume">
              <IconButton color="primary" onClick={() => onResume(epic)}>
                <ResumeIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Inspect">
              <IconButton onClick={() => onInspect(epic)}>
                <InspectIcon />
              </IconButton>
            </Tooltip>
            <Tooltip title="Abandon">
              <IconButton color="error" onClick={() => onAbandon(epic)}>
                <AbandonIcon />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        <Grid container spacing={2} sx={{ mb: 2 }}>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Started: {new Date(epic.startTime).toLocaleString()}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Last Activity: {new Date(epic.lastCheckpoint).toLocaleString()}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Crash Duration: {formatDuration(epic.crashDuration)}
            </Typography>
          </Grid>
          <Grid item xs={6}>
            <Typography variant="body2" color="text.secondary">
              Estimated Work Loss: {epic.estimatedWorkLoss.toFixed(1)}%
            </Typography>
          </Grid>
        </Grid>

        <Typography variant="subtitle2" sx={{ mb: 1 }}>
          Sprints:
        </Typography>
        {epic.sprints.map((sprint) => (
          <SprintRow key={sprint.sprintId} sprint={sprint} />
        ))}

        <Box sx={{ mt: 2, display: 'flex', justifyContent: 'space-between' }}>
          <Typography variant="body2" color="text.secondary">
            Estimated Recovery Time: {Math.ceil(epic.estimatedRecoveryTime)} minutes
          </Typography>
          <Button variant="contained" startIcon={<ResumeIcon />} onClick={() => onResume(epic)}>
            Resume Epic
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};

// ===== SPRINT ROW COMPONENT =====

interface SprintRowProps {
  sprint: InterruptedSprint;
}

const SprintRow: React.FC<SprintRowProps> = ({ sprint }) => {
  const getStatusIcon = () => {
    switch (sprint.status) {
      case 'completed':
        return <CompletedIcon color="success" fontSize="small" />;
      case 'in-progress':
        return <WarningIcon color="warning" fontSize="small" />;
      case 'starting':
        return <ErrorIcon color="error" fontSize="small" />;
      case 'waiting':
        return <WaitingIcon color="info" fontSize="small" />;
      default:
        return null;
    }
  };

  const getStatusColor = (): 'success' | 'warning' | 'error' | 'info' | 'default' => {
    switch (sprint.status) {
      case 'completed':
        return 'success';
      case 'in-progress':
        return 'warning';
      case 'starting':
        return 'error';
      case 'waiting':
        return 'info';
      default:
        return 'default';
    }
  };

  return (
    <Box sx={{ mb: 2, p: 1, bgcolor: 'background.default', borderRadius: 1 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
        {getStatusIcon()}
        <Typography variant="body2" sx={{ ml: 1, fontWeight: 'medium' }}>
          {sprint.name}
        </Typography>
        <Chip
          label={sprint.status.toUpperCase()}
          color={getStatusColor()}
          size="small"
          sx={{ ml: 1 }}
        />
        <Chip
          label={`Strategy: ${sprint.recoveryStrategy}`}
          size="small"
          variant="outlined"
          sx={{ ml: 1 }}
        />
      </Box>

      <LinearProgress
        variant="determinate"
        value={sprint.progress}
        sx={{ mb: 1 }}
      />

      <Grid container spacing={1}>
        <Grid item xs={6}>
          <Typography variant="caption" color="text.secondary">
            Progress: {sprint.progress.toFixed(0)}%
          </Typography>
        </Grid>
        <Grid item xs={6}>
          <Typography variant="caption" color="text.secondary">
            Files: {sprint.filesCompleted}/{sprint.filesTotal}
          </Typography>
        </Grid>
        {sprint.lastFile && (
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Last file: {sprint.lastFile}
            </Typography>
          </Grid>
        )}
        {sprint.confidence && (
          <Grid item xs={12}>
            <Typography variant="caption" color="text.secondary">
              Confidence: {sprint.confidence.toFixed(2)}
            </Typography>
          </Grid>
        )}
      </Grid>
    </Box>
  );
};

// ===== CHECKPOINT HISTORY TABLE =====

interface CheckpointHistoryTableProps {
  history: CheckpointMetadata[];
}

const CheckpointHistoryTable: React.FC<CheckpointHistoryTableProps> = ({ history }) => {
  return (
    <TableContainer component={Paper}>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Version</TableCell>
            <TableCell>Timestamp</TableCell>
            <TableCell>Size</TableCell>
            <TableCell>Latency</TableCell>
            <TableCell>Compression</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {history.map((checkpoint) => (
            <TableRow key={checkpoint.checkpointId}>
              <TableCell>{checkpoint.version}</TableCell>
              <TableCell>{new Date(checkpoint.timestamp).toLocaleTimeString()}</TableCell>
              <TableCell>{formatBytes(checkpoint.sizeBytes)}</TableCell>
              <TableCell>{checkpoint.writeLatencyMs}ms</TableCell>
              <TableCell>{checkpoint.compressionRatio.toFixed(2)}x</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
  );
};

// ===== UTILITY FUNCTIONS =====

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default RecoveryUI;
