/**
 * AlertsPanel Component Styles
 * MUI v6 styled components and theme integration
 */

import { styled } from '@mui/material/styles';
import { Box, Paper, Alert, Badge, Chip } from '@mui/material';

/**
 * Main container for AlertsPanel
 */
export const AlertsPanelContainer = styled(Paper)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  overflow: 'hidden',
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  border: `1px solid ${theme.palette.divider}`,
}));

/**
 * Header section with title and badge
 */
export const AlertsPanelHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
}));

/**
 * Filter and sort controls container
 */
export const AlertsControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing(1.5),
  padding: theme.spacing(1.5, 2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
  alignItems: 'center',
}));

/**
 * Alert list container with scroll
 */
export const AlertsList = styled(Box)(({ theme }) => ({
  flex: 1,
  overflowY: 'auto',
  overflowX: 'hidden',
  padding: theme.spacing(1.5),
  '&::-webkit-scrollbar': {
    width: '8px',
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: theme.palette.background.default,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: theme.palette.divider,
    borderRadius: '4px',
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    },
  },
}));

/**
 * Individual alert item wrapper
 */
export const AlertItem = styled(Alert, {
  shouldForwardProp: (prop) => prop !== 'compact',
})<{ compact?: boolean }>(({ theme, compact }) => ({
  marginBottom: theme.spacing(1.5),
  cursor: 'pointer',
  transition: 'all 0.2s ease-in-out',
  padding: compact ? theme.spacing(1, 1.5) : theme.spacing(1.5, 2),
  '&:hover': {
    boxShadow: theme.shadows[2],
    transform: 'translateY(-1px)',
  },
  '&:last-child': {
    marginBottom: 0,
  },
}));

/**
 * Alert content wrapper
 */
export const AlertContent = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
  gap: '8px',
  width: '100%',
});

/**
 * Alert header with title and metadata
 */
export const AlertHeader = styled(Box)({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: '12px',
});

/**
 * Alert title
 */
export const AlertTitle = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'compact',
})<{ compact?: boolean }>(({ theme, compact }) => ({
  fontWeight: 600,
  fontSize: compact ? '0.875rem' : '1rem',
  color: theme.palette.text.primary,
  lineHeight: 1.4,
}));

/**
 * Alert message
 */
export const AlertMessage = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'compact',
})<{ compact?: boolean }>(({ theme, compact }) => ({
  fontSize: compact ? '0.75rem' : '0.875rem',
  color: theme.palette.text.secondary,
  lineHeight: 1.5,
  whiteSpace: 'pre-wrap',
  wordBreak: 'break-word',
}));

/**
 * Alert metadata (timestamp, source, etc.)
 */
export const AlertMetadata = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1.5),
  alignItems: 'center',
  flexWrap: 'wrap',
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(0.5),
}));

/**
 * Alert actions container
 */
export const AlertActions = styled(Box)(({ theme }) => ({
  display: 'flex',
  gap: theme.spacing(1),
  marginTop: theme.spacing(1),
  flexWrap: 'wrap',
}));

/**
 * Summary badge for alert counts
 */
export const SummaryBadge = styled(Badge)(() => ({
  '& .MuiBadge-badge': {
    fontSize: '0.75rem',
    fontWeight: 600,
    height: '20px',
    minWidth: '20px',
    padding: '0 6px',
  },
}));

/**
 * Category group header
 */
export const CategoryGroupHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(1.5, 2),
  backgroundColor: theme.palette.background.default,
  borderRadius: theme.shape.borderRadius,
  marginBottom: theme.spacing(1),
  fontWeight: 600,
  fontSize: '0.875rem',
  color: theme.palette.text.primary,
  position: 'sticky',
  top: 0,
  zIndex: 1,
}));

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
  color: theme.palette.text.secondary,
  '& svg': {
    fontSize: '3rem',
    marginBottom: theme.spacing(2),
    opacity: 0.5,
  },
}));

/**
 * Filter chip styled component
 */
export const FilterChip = styled(Chip)(({ theme }) => ({
  height: '28px',
  fontSize: '0.75rem',
  '&.active': {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
  },
}));

/**
 * Severity color mapping helper
 */
export const getSeverityColor = (severity: 'error' | 'warning' | 'info' | 'success'): string => {
  const colorMap = {
    error: '#d32f2f',
    warning: '#ed6c02',
    info: '#0288d1',
    success: '#2e7d32',
  };
  return colorMap[severity];
};

/**
 * Category icon color mapping
 */
export const getCategoryColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    system: '#1976d2',
    agent: '#9c27b0',
    security: '#d32f2f',
    performance: '#ed6c02',
    validation: '#2e7d32',
    user: '#0288d1',
  };
  return colorMap[category] || '#757575';
};
