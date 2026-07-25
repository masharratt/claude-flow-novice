/**
 * FleetOverview Component Styles
 * Styled components using MUI v6 styling system
 */

import { styled } from '@mui/material/styles';
import { Box, Paper, Chip } from '@mui/material';
import { AgentStatus, ConnectionStatus } from './FleetOverview.types';

/**
 * Main container for FleetOverview
 */
export const FleetContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(2),
  height: '100%',
  overflow: 'hidden',
}));

/**
 * Header section with controls
 */
export const FleetHeader = styled(Paper)(({ theme }) => ({
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
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: theme.spacing(2),
  flexWrap: 'wrap',
}));

/**
 * Filter and sort controls
 */
export const FilterControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  alignItems: 'center',
  flexWrap: 'wrap',
}));

/**
 * Statistics summary grid
 */
export const StatisticsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: theme.spacing(2),
  padding: theme.spacing(2, 0),
}));

/**
 * Individual statistic card
 */
export const StatCard = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  textAlign: 'center',

  '& .stat-value': {
    fontSize: '1.75rem',
    fontWeight: 700,
    lineHeight: 1.2,
  },

  '& .stat-label': {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
}));

/**
 * View mode toggle buttons container
 */
export const ViewModeToggle = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(0.5),
}));

/**
 * Content area with agents
 */
export const FleetContent = styled(Box)(({ theme }) => ({
  flex: 1,
  overflow: 'auto',
  padding: theme.spacing(2),

  '&::-webkit-scrollbar': {
    width: '8px',
  },

  '&::-webkit-scrollbar-track': {
    background: theme.palette.background.default,
  },

  '&::-webkit-scrollbar-thumb': {
    background: theme.palette.divider,
    borderRadius: '4px',
  },

  '&::-webkit-scrollbar-thumb:hover': {
    background: theme.palette.action.hover,
  },
}));

/**
 * Grid view container
 */
export const GridView = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
  gap: theme.spacing(2),

  '&.compact': {
    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
    gap: theme.spacing(1),
  },
}));

/**
 * List view container
 */
export const ListView = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
}));

/**
 * Agent card component
 */
export const AgentCard = styled(Paper)<{ status: AgentStatus; selected?: boolean }>(
  ({ theme, status, selected }) => ({
    padding: theme.spacing(2),
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    position: 'relative',
    overflow: 'hidden',
    border: `2px solid ${selected ? theme.palette.primary.main : 'transparent'}`,

    '&::before': {
      content: '""',
      position: 'absolute',
      top: 0,
      left: 0,
      width: '4px',
      height: '100%',
      backgroundColor:
        status === 'active' || status === 'busy'
          ? theme.palette.success.main
          : status === 'error'
          ? theme.palette.error.main
          : status === 'paused'
          ? theme.palette.warning.main
          : status === 'terminated'
          ? theme.palette.grey[500]
          : status === 'offline'
          ? theme.palette.grey[400]
          : theme.palette.info.main,
    },

    '&:hover': {
      boxShadow: theme.shadows[4],
      transform: 'translateY(-2px)',
    },

    '&.compact': {
      padding: theme.spacing(1.5),
    },
  })
);

/**
 * Agent card header
 */
export const AgentCardHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  marginBottom: theme.spacing(1.5),
  gap: theme.spacing(1),
}));

/**
 * Agent info section
 */
export const AgentInfo = styled(Box)(({ theme }) => ({
  flex: 1,
  minWidth: 0,

  '& .agent-name': {
    fontSize: '0.95rem',
    fontWeight: 600,
    marginBottom: theme.spacing(0.25),
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },

  '& .agent-type': {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
  },

  '& .agent-activity': {
    fontSize: '0.75rem',
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.25),
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
}));

/**
 * Agent avatar
 */
export const AgentAvatar = styled(Box)(({ theme }) => ({
  width: 40,
  height: 40,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: theme.palette.primary.main,
  color: theme.palette.primary.contrastText,
  fontSize: '1rem',
  fontWeight: 600,
  flexShrink: 0,
}));

/**
 * Status chip
 */
export const StatusChip = styled(Chip)<{ status: AgentStatus }>(({ theme, status }) => ({
  height: 24,
  fontSize: '0.7rem',
  fontWeight: 600,
  backgroundColor:
    status === 'active' || status === 'busy'
      ? theme.palette.success.light
      : status === 'error'
      ? theme.palette.error.light
      : status === 'paused'
      ? theme.palette.warning.light
      : status === 'terminated'
      ? theme.palette.grey[300]
      : status === 'offline'
      ? theme.palette.grey[200]
      : theme.palette.info.light,
  color:
    status === 'active' || status === 'busy'
      ? theme.palette.success.dark
      : status === 'error'
      ? theme.palette.error.dark
      : status === 'paused'
      ? theme.palette.warning.dark
      : status === 'terminated'
      ? theme.palette.grey[700]
      : status === 'offline'
      ? theme.palette.grey[600]
      : theme.palette.info.dark,
}));

/**
 * Connection indicator
 */
export const ConnectionIndicator = styled(Box)<{ status: ConnectionStatus }>(({ theme, status }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  fontSize: '0.7rem',
  color: theme.palette.text.secondary,

  '& .connection-dot': {
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor:
      status === 'connected'
        ? theme.palette.success.main
        : status === 'disconnected'
        ? theme.palette.error.main
        : status === 'reconnecting'
        ? theme.palette.warning.main
        : theme.palette.grey[400],
    animation: status === 'reconnecting' ? 'pulse 1.5s ease-in-out infinite' : 'none',
  },

  '@keyframes pulse': {
    '0%, 100%': {
      opacity: 1,
    },
    '50%': {
      opacity: 0.4,
    },
  },
}));

/**
 * Progress bar container
 */
export const ProgressBar = styled(Box)(({ theme }) => ({
  height: 6,
  backgroundColor: theme.palette.action.hover,
  borderRadius: 3,
  overflow: 'hidden',
  position: 'relative',
}));

/**
 * Progress bar fill
 */
export const ProgressFill = styled(Box)<{ progress: number; severity: 'success' | 'warning' | 'error' }>(
  ({ theme, progress, severity }) => ({
    height: '100%',
    width: `${progress}%`,
    backgroundColor:
      severity === 'success'
        ? theme.palette.success.main
        : severity === 'warning'
        ? theme.palette.warning.main
        : theme.palette.error.main,
    transition: 'width 0.3s ease',
  })
);

/**
 * Metrics grid
 */
export const MetricsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(2, 1fr)',
  gap: theme.spacing(1),
  marginTop: theme.spacing(1.5),
}));

/**
 * Metric item
 */
export const MetricItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.75),

  '& .metric-icon': {
    color: theme.palette.text.secondary,
    fontSize: '1rem',
  },

  '& .metric-label': {
    fontSize: '0.7rem',
    color: theme.palette.text.secondary,
    lineHeight: 1.2,
  },

  '& .metric-value': {
    fontSize: '0.8rem',
    fontWeight: 600,
    lineHeight: 1.2,
  },
}));

/**
 * Error badge
 */
export const ErrorBadge = styled(Box)<{ severity: 'warning' | 'error' | 'critical' }>(({ theme, severity }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(0.5),
  padding: theme.spacing(0.5, 1),
  borderRadius: theme.shape.borderRadius,
  backgroundColor:
    severity === 'critical'
      ? theme.palette.error.light
      : severity === 'error'
      ? theme.palette.warning.light
      : theme.palette.info.light,
  color:
    severity === 'critical'
      ? theme.palette.error.dark
      : severity === 'error'
      ? theme.palette.warning.dark
      : theme.palette.info.dark,
  fontSize: '0.7rem',
}));

/**
 * Agent card footer
 */
export const AgentCardFooter = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginTop: theme.spacing(1.5),
  paddingTop: theme.spacing(1.5),
  borderTop: `1px solid ${theme.palette.divider}`,
}));

/**
 * Empty state
 */
export const EmptyState = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(8, 2),
  textAlign: 'center',

  '& .empty-icon': {
    fontSize: '4rem',
    marginBottom: theme.spacing(2),
    opacity: 0.5,
  },

  '& .empty-title': {
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: theme.spacing(1),
  },

  '& .empty-description': {
    color: theme.palette.text.secondary,
    maxWidth: 400,
  },
}));

/**
 * Pagination container
 */
export const PaginationContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  padding: theme.spacing(2),
  borderTop: `1px solid ${theme.palette.divider}`,
}));

/**
 * Loading overlay
 */
export const LoadingOverlay = styled(Box)(() => ({
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  backgroundColor: 'rgba(255, 255, 255, 0.8)',
  zIndex: 1000,
}));
