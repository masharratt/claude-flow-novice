/**
 * AgentHierarchyTree Material-UI Styles
 * Uses Material-UI v6 styling system
 */

import { Theme } from '@mui/material/styles';
import { SxProps } from '@mui/system';

/**
 * Agent state color mapping
 */
export const stateColors = {
  active: '#10b981',
  idle: '#6b7280',
  busy: '#3b82f6',
  paused: '#eab308',
  error: '#ef4444',
  terminated: '#9ca3af',
  ready: '#22c55e',
  working: '#0ea5e9',
  completed: '#10b981',
  failed: '#dc2626',
  degraded: '#f59e0b',
  offline: '#991b1b',
  initializing: '#fbbf24',
} as const;

/**
 * Agent type color mapping
 */
export const typeColors = {
  coordinator: '#6366f1',
  orchestrator: '#8b5cf6',
  coder: '#10b981',
  tester: '#f59e0b',
  reviewer: '#8b5cf6',
  'security-specialist': '#ef4444',
  architect: '#3b82f6',
  'backend-dev': '#06b6d4',
  'frontend-dev': '#ec4899',
  'devops-engineer': '#84cc16',
  planner: '#6366f1',
  researcher: '#a855f7',
  'mobile-dev': '#f97316',
  'cicd-engineer': '#14b8a6',
  'api-docs': '#8b5cf6',
  'perf-analyzer': '#fbbf24',
} as const;

/**
 * Container styles
 */
export const containerStyles: SxProps<Theme> = {
  backgroundColor: 'background.paper',
  borderRadius: 2,
  boxShadow: 1,
  border: 1,
  borderColor: 'divider',
  overflow: 'hidden',
};

/**
 * Header styles
 */
export const headerStyles: SxProps<Theme> = {
  p: 2,
  borderBottom: 1,
  borderColor: 'divider',
  backgroundColor: 'background.default',
};

/**
 * Search input styles
 */
export const searchInputStyles: SxProps<Theme> = {
  width: '100%',
  '& .MuiOutlinedInput-root': {
    borderRadius: 2,
  },
};

/**
 * Tree content styles
 */
export const treeContentStyles = (maxHeight: number): SxProps<Theme> => ({
  maxHeight,
  overflow: 'auto',
  p: 1,
  '&::-webkit-scrollbar': {
    width: 8,
    height: 8,
  },
  '&::-webkit-scrollbar-thumb': {
    backgroundColor: 'action.disabled',
    borderRadius: 4,
  },
  '&::-webkit-scrollbar-track': {
    backgroundColor: 'action.hover',
  },
});

/**
 * Tree node styles
 */
export const treeNodeStyles = (
  level: number,
  isSelected: boolean,
  isHovered: boolean
): SxProps<Theme> => ({
  display: 'flex',
  alignItems: 'center',
  py: 1,
  px: 1.5,
  pl: `${level * 24 + 12}px`,
  borderRadius: 1.5,
  cursor: 'pointer',
  transition: 'all 0.2s ease',
  userSelect: 'none',
  backgroundColor: isSelected
    ? 'primary.light'
    : isHovered
    ? 'action.hover'
    : 'transparent',
  border: 1,
  borderColor: isSelected ? 'primary.main' : 'transparent',
  '&:hover': {
    backgroundColor: isSelected ? 'primary.light' : 'action.hover',
  },
});

/**
 * Expand/collapse button styles
 */
export const expandButtonStyles: SxProps<Theme> = {
  minWidth: 20,
  width: 20,
  height: 20,
  p: 0,
  mr: 0.5,
  borderRadius: 0.5,
  '&:hover': {
    backgroundColor: 'action.hover',
  },
};

/**
 * Icon container styles
 */
export const iconContainerStyles: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 24,
  height: 24,
  mr: 1,
};

/**
 * Node info styles
 */
export const nodeInfoStyles: SxProps<Theme> = {
  flex: 1,
  minWidth: 0,
  overflow: 'hidden',
};

/**
 * Node label styles
 */
export const nodeLabelStyles: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 1,
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'text.primary',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

/**
 * State badge styles
 */
export const stateBadgeStyles = (state: string): SxProps<Theme> => {
  const color = stateColors[state as keyof typeof stateColors] || stateColors.idle;
  return {
    px: 1,
    py: 0.25,
    fontSize: '0.75rem',
    fontWeight: 500,
    borderRadius: 2,
    border: 1,
    borderColor: color,
    color: color,
    backgroundColor: `${color}20`,
  };
};

/**
 * Metrics container styles
 */
export const metricsContainerStyles: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 2,
  fontSize: '0.75rem',
  color: 'text.secondary',
};

/**
 * Metric item styles
 */
export const metricItemStyles: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'flex-end',
  minWidth: 60,
};

/**
 * Footer stats styles
 */
export const footerStatsStyles: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  p: 1.5,
  borderTop: 1,
  borderColor: 'divider',
  backgroundColor: 'action.hover',
  fontSize: '0.75rem',
  color: 'text.secondary',
};

/**
 * Legend styles
 */
export const legendStyles: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 3,
  mt: 2,
  fontSize: '0.75rem',
  color: 'text.secondary',
};

/**
 * Legend item styles
 */
export const legendItemStyles: SxProps<Theme> = {
  display: 'flex',
  alignItems: 'center',
  gap: 0.5,
};

/**
 * Legend dot styles
 */
export const legendDotStyles = (color: string): SxProps<Theme> => ({
  width: 12,
  height: 12,
  borderRadius: '50%',
  backgroundColor: color,
});

/**
 * Empty state styles
 */
export const emptyStateStyles: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  py: 8,
  px: 4,
  color: 'text.secondary',
};

/**
 * Loading state styles
 */
export const loadingStateStyles: SxProps<Theme> = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  py: 12,
  px: 4,
  color: 'text.secondary',
  gap: 2,
};

/**
 * Get health color based on score
 */
export const getHealthColor = (health: number): string => {
  if (health >= 90) return stateColors.active;
  if (health >= 75) return stateColors.ready;
  if (health >= 60) return stateColors.degraded;
  if (health >= 40) return '#f97316'; // orange-500
  return stateColors.error;
};

/**
 * Get confidence color based on score
 */
export const getConfidenceColor = (confidence: number): string => {
  if (confidence >= 0.9) return stateColors.active;
  if (confidence >= 0.75) return stateColors.degraded;
  return stateColors.error;
};
