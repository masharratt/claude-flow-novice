/**
 * CFNLoopDashboard Styles
 * Material-UI v6 styled components for CFN Loop dashboard
 */

import { styled } from '@mui/material/styles';
import {
  Box,
  Paper,
  Card,
  Typography,
  LinearProgress,
  Chip,
} from '@mui/material';

export const DashboardContainer = styled(Paper)(({ theme }) => ({
  padding: theme.spacing(3),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  boxShadow: theme.shadows[2],
}));

export const HeaderSection = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: theme.spacing(3),
  paddingBottom: theme.spacing(2),
  borderBottom: `1px solid ${theme.palette.divider}`,
}));

export const HeaderTitle = styled(Typography)(({ theme }) => ({
  fontSize: '1.5rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

export const HeaderSubtitle = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(0.5),
}));

export const LoopStepperSection = styled(Box)(({ theme }) => ({
  marginBottom: theme.spacing(4),
}));

export const PhaseProgressSection = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(3),
  backgroundColor: theme.palette.background.default,
  border: `1px solid ${theme.palette.divider}`,
}));

export const ProgressLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
  marginBottom: theme.spacing(1),
}));

export const StyledLinearProgress = styled(LinearProgress)(({ theme }) => ({
  height: 8,
  borderRadius: 4,
  backgroundColor: theme.palette.grey[200],
  '& .MuiLinearProgress-bar': {
    borderRadius: 4,
  },
}));

export const ConfidenceSection = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
  gap: theme.spacing(2),
  marginBottom: theme.spacing(3),
}));

export const ConfidenceCard = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  textAlign: 'center',
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}));

export const ConfidenceValue = styled(Typography)(({ theme }) => ({
  fontSize: '2rem',
  fontWeight: 700,
  marginBottom: theme.spacing(1),
}));

export const ConfidenceLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  fontWeight: 500,
  textTransform: 'uppercase',
  color: theme.palette.text.secondary,
}));

export const ActivityTimelineSection = styled(Box)(({ theme }) => ({
  marginTop: theme.spacing(3),
}));

export const TimelineHeader = styled(Typography)(({ theme }) => ({
  fontSize: '1.125rem',
  fontWeight: 600,
  marginBottom: theme.spacing(2),
  color: theme.palette.text.primary,
}));

export const ActivityItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'flex-start',
  padding: theme.spacing(1.5),
  marginBottom: theme.spacing(1),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.default,
  border: `1px solid ${theme.palette.divider}`,
  transition: 'background-color 0.2s',
  cursor: 'pointer',
  '&:hover': {
    backgroundColor: theme.palette.action.hover,
  },
}));

export const ActivityContent = styled(Box)(({ theme }) => ({
  flex: 1,
  marginLeft: theme.spacing(2),
}));

export const ActivityTitle = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
}));

export const ActivityTimestamp = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(0.5),
}));

export const DecisionSection = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2.5),
  marginTop: theme.spacing(3),
  backgroundColor: theme.palette.background.paper,
  border: `2px solid ${theme.palette.divider}`,
}));

export const DecisionHeader = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: theme.spacing(2),
}));

export const DecisionTitle = styled(Typography)(({ theme }) => ({
  fontSize: '1.125rem',
  fontWeight: 600,
  color: theme.palette.text.primary,
}));

export const DecisionChip = styled(Chip)(() => ({
  fontWeight: 600,
  fontSize: '0.875rem',
}));

export const DecisionReasoning = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  color: theme.palette.text.secondary,
  marginBottom: theme.spacing(2),
  lineHeight: 1.6,
}));

export const NextStepsList = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1),
  marginTop: theme.spacing(2),
}));

export const NextStepItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  alignItems: 'center',
  padding: theme.spacing(1),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.default,
}));

export const ConsensusSection = styled(Card)(({ theme }) => ({
  padding: theme.spacing(2),
  marginBottom: theme.spacing(3),
  backgroundColor: theme.palette.background.default,
  border: `1px solid ${theme.palette.divider}`,
}));

export const ConsensusHeader = styled(Typography)(({ theme }) => ({
  fontSize: '1rem',
  fontWeight: 600,
  marginBottom: theme.spacing(2),
  color: theme.palette.text.primary,
}));

export const ValidatorList = styled(Box)(({ theme }) => ({
  display: 'flex',
  flexDirection: 'column',
  gap: theme.spacing(1.5),
}));

export const ValidatorItem = styled(Box)(({ theme }) => ({
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
}));

export const ValidatorInfo = styled(Box)({
  display: 'flex',
  flexDirection: 'column',
});

export const ValidatorName = styled(Typography)(({ theme }) => ({
  fontSize: '0.875rem',
  fontWeight: 500,
  color: theme.palette.text.primary,
}));

export const ValidatorScore = styled(Typography)(({ theme }) => ({
  fontSize: '1.25rem',
  fontWeight: 700,
  color: theme.palette.text.primary,
}));

export const MetricsGrid = styled(Box)(({ theme }) => ({
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
  gap: theme.spacing(2),
  marginTop: theme.spacing(2),
}));

export const MetricBox = styled(Box)(({ theme }) => ({
  padding: theme.spacing(1.5),
  borderRadius: theme.shape.borderRadius,
  backgroundColor: theme.palette.background.paper,
  border: `1px solid ${theme.palette.divider}`,
  textAlign: 'center',
}));

export const MetricValue = styled(Typography)(({ theme }) => ({
  fontSize: '1.5rem',
  fontWeight: 700,
  color: theme.palette.text.primary,
}));

export const MetricLabel = styled(Typography)(({ theme }) => ({
  fontSize: '0.75rem',
  color: theme.palette.text.secondary,
  marginTop: theme.spacing(0.5),
}));
