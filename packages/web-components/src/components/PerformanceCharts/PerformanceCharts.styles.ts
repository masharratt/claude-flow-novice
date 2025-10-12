/**
 * Performance Charts Styles
 * Material-UI v6 theme integration and responsive styles
 */

import { styled } from '@mui/material/styles';
import { Box, Paper } from '@mui/material';
import { ChartTheme, ThemeMode } from './PerformanceCharts.types';

export const getChartTheme = (mode: ThemeMode): ChartTheme => {
  const lightTheme: ChartTheme = {
    background: '#ffffff',
    text: '#1f2937',
    grid: '#e5e7eb',
    border: '#d1d5db',
    primary: '#3b82f6',
    secondary: '#10b981',
    tertiary: '#f59e0b',
    quaternary: '#ef4444',
    quinary: '#8b5cf6',
    success: '#10b981',
    warning: '#f59e0b',
    error: '#ef4444',
    info: '#3b82f6',
  };

  const darkTheme: ChartTheme = {
    background: '#1f2937',
    text: '#f9fafb',
    grid: '#374151',
    border: '#4b5563',
    primary: '#60a5fa',
    secondary: '#34d399',
    tertiary: '#fbbf24',
    quaternary: '#f87171',
    quinary: '#a78bfa',
    success: '#34d399',
    warning: '#fbbf24',
    error: '#f87171',
    info: '#60a5fa',
  };

  return mode === 'dark' ? darkTheme : lightTheme;
};

export const ChartContainer = styled(Paper, {
  shouldForwardProp: (prop) => prop !== 'themeMode',
})<{ themeMode: ThemeMode }>(({ theme, themeMode }) => {
  const chartTheme = getChartTheme(themeMode);

  return {
    backgroundColor: chartTheme.background,
    color: chartTheme.text,
    padding: theme.spacing(3),
    borderRadius: theme.spacing(1),
    border: `1px solid ${chartTheme.border}`,
    minHeight: 400,
    position: 'relative',
    transition: 'all 0.3s ease',

    '&:hover': {
      boxShadow: theme.shadows[4],
    },

    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(2),
      minHeight: 300,
    },
  };
});

export const ChartHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing(3),
  flexWrap: 'wrap',
  gap: theme.spacing(2),

  [theme.breakpoints.down('sm')]: {
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
}));

export const ChartTitle = styled('h3')(({ theme }) => ({
  margin: 0,
  fontSize: '1.25rem',
  fontWeight: 600,
  color: 'inherit',

  [theme.breakpoints.down('sm')]: {
    fontSize: '1rem',
  },
}));

export const ChartControls = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(2),
  flexWrap: 'wrap',

  [theme.breakpoints.down('sm')]: {
    width: '100%',
    justifyContent: 'space-between',
  },
}));

export const ChartContent = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'aspectRatio',
})<{ aspectRatio?: number }>(({ theme, aspectRatio = 16 / 9 }) => ({
  width: '100%',
  height: 'auto',
  position: 'relative',

  '& .recharts-wrapper': {
    width: '100% !important',
    height: 'auto !important',
  },

  '& .recharts-surface': {
    overflow: 'visible',
  },

  '& .recharts-cartesian-grid-horizontal line, & .recharts-cartesian-grid-vertical line': {
    strokeOpacity: 0.3,
  },

  '& .recharts-tooltip-wrapper': {
    zIndex: 1000,
  },

  [theme.breakpoints.down('md')]: {
    aspectRatio: `${aspectRatio}`,
  },

  [theme.breakpoints.down('sm')]: {
    aspectRatio: `${Math.min(aspectRatio, 4 / 3)}`,
  },
}));

export const ChartLegendContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'center',
  alignItems: 'center',
  gap: theme.spacing(3),
  marginTop: theme.spacing(2),
  flexWrap: 'wrap',

  [theme.breakpoints.down('sm')]: {
    gap: theme.spacing(1.5),
  },
}));

export const ChartLegendItem = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'color',
})<{ color: string }>(({ theme, color }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  fontSize: '0.875rem',

  '&::before': {
    content: '""',
    width: 12,
    height: 12,
    borderRadius: '50%',
    backgroundColor: color,
    display: 'block',
  },

  [theme.breakpoints.down('sm')]: {
    fontSize: '0.75rem',

    '&::before': {
      width: 10,
      height: 10,
    },
  },
}));

export const TooltipContainer = styled(Paper, {
  shouldForwardProp: (prop) => prop !== 'themeMode',
})<{ themeMode: ThemeMode }>(({ theme, themeMode }) => {
  const chartTheme = getChartTheme(themeMode);

  return {
    backgroundColor: chartTheme.background,
    color: chartTheme.text,
    border: `1px solid ${chartTheme.border}`,
    padding: theme.spacing(1.5),
    borderRadius: theme.spacing(0.5),
    boxShadow: theme.shadows[4],
    minWidth: 150,
  };
});

export const TooltipLabel = styled('div')(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 600,
  marginBottom: theme.spacing(0.5),
  borderBottom: '1px solid currentColor',
  paddingBottom: theme.spacing(0.5),
  opacity: 0.9,
}));

export const TooltipItem = styled('div')(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: theme.spacing(2),
  fontSize: '0.8125rem',
  padding: theme.spacing(0.25, 0),
}));

export const TooltipItemLabel = styled('span')({
  opacity: 0.8,
});

export const TooltipItemValue = styled('span', {
  shouldForwardProp: (prop) => prop !== 'color',
})<{ color?: string }>(({ color }) => ({
  fontWeight: 600,
  color: color || 'inherit',
}));

export const StatusIndicator = styled(Box, {
  shouldForwardProp: (prop) => prop !== 'active',
})<{ active: boolean }>(({ theme, active }) => ({
  position: 'absolute',
  bottom: theme.spacing(2),
  right: theme.spacing(2),
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  padding: theme.spacing(0.75, 1.5),
  borderRadius: theme.spacing(0.5),
  backgroundColor: 'rgba(0, 0, 0, 0.05)',
  fontSize: '0.75rem',

  '&::before': {
    content: '""',
    width: 8,
    height: 8,
    borderRadius: '50%',
    backgroundColor: active ? '#10b981' : '#f59e0b',
    animation: active ? 'pulse 2s infinite' : 'none',
    display: 'block',
  },

  '@keyframes pulse': {
    '0%, 100%': {
      opacity: 1,
    },
    '50%': {
      opacity: 0.5,
    },
  },

  [theme.breakpoints.down('sm')]: {
    fontSize: '0.625rem',
    padding: theme.spacing(0.5, 1),

    '&::before': {
      width: 6,
      height: 6,
    },
  },
}));

export const GaugeContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  padding: theme.spacing(2),
}));

export const GaugeLabel = styled('div')(({ theme }) => ({
  fontSize: '1.5rem',
  fontWeight: 700,
  marginTop: theme.spacing(2),
  textAlign: 'center',

  [theme.breakpoints.down('sm')]: {
    fontSize: '1.25rem',
  },
}));

export const GaugeSubLabel = styled('div')(({ theme }) => ({
  fontSize: '0.875rem',
  opacity: 0.7,
  marginTop: theme.spacing(0.5),
  textAlign: 'center',

  [theme.breakpoints.down('sm')]: {
    fontSize: '0.75rem',
  },
}));
