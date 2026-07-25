/**
 * EventTimeline Component Styles
 * Material-UI styled components for EventTimeline
 */

import { styled } from '@mui/material/styles';
import { Box, Paper, Typography, Chip } from '@mui/material';

export const TimelineContainer = styled(Paper)(({ theme }) => ({
  backgroundColor: theme.palette.background.paper,
  borderRadius: theme.shape.borderRadius,
  boxShadow: theme.shadows[1],
  border: `1px solid ${theme.palette.divider}`,
  overflow: 'hidden',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
}));

export const TimelineHeader = styled(Box)(({ theme }) => ({
  padding: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
  backgroundColor: theme.palette.background.default,
}));

export const TimelineTitle = styled(Typography)(({ theme }) => ({
  fontSize: '1.125rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

export const TimelineActions = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: theme.spacing(1),
  marginTop: theme.spacing(2),
}));

export const StatsContainer = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const StatCard = styled(Box)(({ theme }) => ({
  textAlign: 'center',
  padding: theme.spacing(1),
}));

export const StatValue = styled(Typography)(({ theme }) => ({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: theme.palette.text.primary,
}));

export const StatLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(0.5),
}));

export const SearchContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
}));

export const FiltersContainer = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(2),
  padding: theme.spacing(2),
  backgroundColor: theme.palette.background.default,
  borderRadius: theme.shape.borderRadius,
}));

export const FilterSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(2),
  '&:last-child': {
    marginBottom: 0,
  },
}));

export const FilterLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(1),
}));

export const FilterChipContainer = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexWrap: 'wrap',
  gap: theme.spacing(1),
}));

export const FilterChip = styled(Chip)<{ selected?: boolean }>(({ theme, selected }) => ({
  fontSize: '0.75rem',
  height: 28,
  backgroundColor: selected ? theme.palette.primary.main : theme.palette.background.paper,
  color: selected ? theme.palette.primary.contrastText : theme.palette.text.primary,
  border: `1px solid ${selected ? theme.palette.primary.main : theme.palette.divider}`,
  '&:hover': {
    backgroundColor: selected ? theme.palette.primary.dark : theme.palette.action.hover,
  },
}));

export const TimelineContent = styled(Box)({
  flex: 1,
  overflow: 'auto',
  position: 'relative',
});

export const EventItemContainer = styled(Box)<{ selected?: boolean }>(({ theme, selected }) => ({
  position: 'relative',
  paddingLeft: theme.spacing(8),
  paddingBottom: theme.spacing(4),
  cursor: 'pointer',
  transition: 'background-color 0.2s',
  backgroundColor: selected ? theme.palette.action.selected : 'transparent',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

export const TimelineLine = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: theme.spacing(4),
  top: theme.spacing(8),
  bottom: 0,
  width: 1,
  backgroundColor: theme.palette.divider,
}));

export const TimelineNode = styled(Box)(({ theme }) => ({
  position: 'absolute',
  left: theme.spacing(2),
  top: theme.spacing(2),
  width: 16,
  height: 16,
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${theme.palette.divider}`,
  borderRadius: '50%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
}));

export const EventContent = styled(Paper)<{ severity?: string }>(({ theme, severity }) => {
  const severityColors = {
    error: {
      background: theme.palette.error.light,
      border: theme.palette.error.main,
    },
    warning: {
      background: theme.palette.warning.light,
      border: theme.palette.warning.main,
    },
    success: {
      background: theme.palette.success.light,
      border: theme.palette.success.main,
    },
    info: {
      background: theme.palette.grey[50],
      border: theme.palette.grey[300],
    },
  };

  const colors = severityColors[severity as keyof typeof severityColors] || severityColors.info;

  return {
    marginLeft: theme.spacing(6),
    padding: theme.spacing(1.5),
    borderRadius: theme.shape.borderRadius,
    backgroundColor: colors.background,
    border: `1px solid ${colors.border}`,
  };
});

export const EventHeader = styled(Box)({
  display: 'flex',
  alignItems: 'flex-start',
  justifyContent: 'space-between',
});

export const EventTitleContainer = styled(Box)({
  flex: 1,
});

export const EventTitle = styled(Typography)(({ theme }) => ({
  fontWeight: 600,
  fontSize: '0.875rem',
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(0.5),
}));

export const EventDescription = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(1),
}));

export const EventMetadata = styled(Box)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  '& > div': {
    marginBottom: theme.spacing(0.5),
  },
}));

export const EventTimestamp = styled(Box)(({ theme }) => ({
  textAlign: 'right',
  marginLeft: theme.spacing(2),
}));

export const EventTime = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
}));

export const EventDuration = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.disabled,
  marginTop: theme.spacing(0.5),
}));

export const EmptyStateContainer = styled(Box)(({ theme }) => ({
  padding: theme.spacing(8),
  textAlign: 'center',
  color: theme.palette.text.secondary,
}));

export const EmptyStateIcon = styled(Box)(({ theme }) => ({
  width: 48,
  height: 48,
  margin: '0 auto',
  marginBottom: theme.spacing(3),
  color: theme.palette.text.disabled,
}));

export const EmptyStateTitle = styled(Typography)(({ theme }) => ({
  fontSize: '1.125rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(1),
}));

export const EmptyStateDescription = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
}));

export const LastUpdatedText = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(2),
  paddingTop: theme.spacing(2),
  borderTop: `1px solid ${theme.palette.divider}`,
}));
