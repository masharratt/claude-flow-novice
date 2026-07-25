/**
 * StatusMonitor Component Styles
 * Material-UI v6 emotion-based styling
 */

import { styled } from '@mui/material/styles';
import { Card, Chip, Box } from '@mui/material';

/**
 * Main container for StatusMonitor
 */
export const StatusMonitorContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  width: '100%',
  minHeight: 0,
}));

/**
 * Header section with controls and summary
 */
export const StatusHeader = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
}));

/**
 * Header controls row
 */
export const HeaderControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: theme.spacing(2),
}));

/**
 * Filter controls container
 */
export const FilterControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  flexWrap: 'wrap',
}));

/**
 * Summary statistics grid
 */
export const SummaryGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: theme.spacing(2),
  padding: theme.spacing(1, 0),
}));

/**
 * Summary stat item
 */
export const SummaryStat = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',
  '& .stat-value': {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: 1.2,
  },
  '& .stat-label': {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
}));

/**
 * Status cards grid container
 */
export interface StatusGridProps {
  maxCardsPerRow: 1 | 2 | 3 | 4;
}

export const StatusGrid = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'maxCardsPerRow',
})<StatusGridProps>(({ theme, maxCardsPerRow }) => ({
  display: 'grid',
  gap: theme.spacing(2),
  gridTemplateColumns: {
    1: '1fr',
    2: 'repeat(auto-fill, minmax(400px, 1fr))',
    3: 'repeat(auto-fill, minmax(320px, 1fr))',
    4: 'repeat(auto-fill, minmax(280px, 1fr))',
  }[maxCardsPerRow],
  [theme.breakpoints.down('md')]: {
    gridTemplateColumns: maxCardsPerRow <= 2 ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
  },
  [theme.breakpoints.down('sm')]: {
    gridTemplateColumns: '1fr',
  },
}));

/**
 * Status card component
 */
export interface StatusCardProps {
  status: 'idle' | 'active' | 'busy' | 'paused' | 'error' | 'terminated' | 'offline';
  selected?: boolean;
  compact?: boolean;
}

export const StatusCard = styled(Card, {
  shouldForwardProp: (prop) => !['status', 'selected', 'compact'].includes(prop as string),
})<StatusCardProps>(({ theme, status, selected, compact }) => {
  const statusColors = {
    idle: theme.palette.success.light,
    active: theme.palette.success.main,
    busy: theme.palette.warning.main,
    paused: theme.palette.info.main,
    error: theme.palette.error.main,
    terminated: theme.palette.grey[400],
    offline: theme.palette.grey[600],
  };

  const backgroundColor = {
    idle: '#f0fdf4',
    active: '#f0fdf4',
    busy: '#fffbeb',
    paused: '#f0f9ff',
    error: '#fef2f2',
    terminated: theme.palette.grey[50],
    offline: theme.palette.grey[100],
  };

  return {
    padding: compact ? theme.spacing(1.5) : theme.spacing(2),
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    backgroundColor: backgroundColor[status],
    borderLeft: `4px solid ${statusColors[status]}`,
    ...(selected && {
      boxShadow: theme.shadows[4],
      borderColor: theme.palette.primary.main,
    }),
    '&:hover': {
      boxShadow: theme.shadows[3],
      transform: 'translateY(-2px)',
    },
  };
});

/**
 * Status chip styled component
 */
export const StatusChip = styled(Chip, {
  shouldForwardProp: (prop) => prop !== 'status',
})<{ status: StatusCardProps['status'] }>(({ theme, status }) => {
  const statusColors = {
    idle: { bg: theme.palette.success.light, color: theme.palette.success.contrastText },
    active: { bg: theme.palette.success.main, color: theme.palette.success.contrastText },
    busy: { bg: theme.palette.warning.main, color: theme.palette.warning.contrastText },
    paused: { bg: theme.palette.info.main, color: theme.palette.info.contrastText },
    error: { bg: theme.palette.error.main, color: theme.palette.error.contrastText },
    terminated: { bg: theme.palette.grey[400], color: theme.palette.grey[50] },
    offline: { bg: theme.palette.grey[600], color: theme.palette.grey[50] },
  };

  return {
    backgroundColor: statusColors[status].bg,
    color: statusColors[status].color,
    fontWeight: 600,
    fontSize: '0.75rem',
  };
});

/**
 * Progress bar container
 */
export const ProgressBar = styled(Box)(({ theme }) => ({
  width: '100%',
  height: 8,
  backgroundColor: theme.palette.grey[200],
  borderRadius: theme.shape.borderRadius,
  overflow: 'hidden',
  position: 'relative',
}));

/**
 * Progress fill
 */
export interface ProgressFillProps {
  progress: number;
  severity?: 'success' | 'warning' | 'error';
}

export const ProgressFill = styled(Box, {
  shouldForwardProp: (prop) => !['progress', 'severity'].includes(prop as string),
})<ProgressFillProps>(({ theme, progress, severity = 'success' }) => {
  const severityColors = {
    success: theme.palette.success.main,
    warning: theme.palette.warning.main,
    error: theme.palette.error.main,
  };

  return {
    height: '100%',
    width: `${progress}%`,
    backgroundColor: severityColors[severity],
    transition: 'width 0.3s ease, background-color 0.3s ease',
  };
});

/**
 * Metrics grid for resource usage
 */
export const MetricsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: theme.spacing(1.5),
}));

/**
 * Metric item
 */
export const MetricItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  '& .metric-icon': {
    color: theme.palette.primary.main,
  },
  '& .metric-label': {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },
  '& .metric-value': {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
  },
}));

/**
 * Error badge
 */
export interface ErrorBadgeProps {
  severity: 'critical' | 'error' | 'warning';
}

export const ErrorBadge = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'severity',
})<ErrorBadgeProps>(({ theme, severity }) => {
  const severityColors = {
    critical: { bg: theme.palette.error.dark, color: theme.palette.error.contrastText },
    error: { bg: theme.palette.error.main, color: theme.palette.error.contrastText },
    warning: { bg: theme.palette.warning.main, color: theme.palette.warning.contrastText },
  };

  return {
    padding: theme.spacing(0.75, 1),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: severityColors[severity].bg,
    color: severityColors[severity].color,
    fontSize: '0.75rem',
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
  };
});

/**
 * Empty state container
 */
export const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(6, 2),
  textAlign: 'center',
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  '& .empty-icon': {
    fontSize: '3rem',
    color: theme.palette.grey[300],
    marginBottom: theme.spacing(2),
  },
  '& .empty-title': {
    fontSize: '1.125rem',
    fontWeight: 600,
    color: theme.palette.text.primary,
    marginBottom: theme.spacing(0.5),
  },
  '& .empty-description': {
    fontSize: '0.875rem',
    color: theme.palette.text.secondary,
  },
}));
