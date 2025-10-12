/**
 * CFNLoopDashboard Component
 * Comprehensive dashboard for CFN Loop monitoring
 */

import React, { useEffect, useMemo } from 'react';
import {
  Box,
  Stepper,
  Step,
  StepLabel,
  StepContent,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
} from '@mui/material';
import {
  Timeline,
  TimelineItem,
  TimelineSeparator,
  TimelineConnector,
  TimelineContent,
  TimelineDot,
  TimelineOppositeContent,
} from '@mui/lab';
import {
  Refresh as RefreshIcon,
  CheckCircle as CheckCircleIcon,
  Error as ErrorIcon,
  HourglassEmpty as HourglassIcon,
  Architecture as ArchitectureIcon,
  Code as CodeIcon,
  Verified as VerifiedIcon,
  Assignment as AssignmentIcon,
  Gavel as GavelIcon,
  TrendingUp as TrendingUpIcon,
  ArrowForward as ArrowForwardIcon,
  Warning as WarningIcon,
} from '@mui/icons-material';
import type {
  CFNLoopDashboardProps,
  LoopStepConfig,
  LoopStatus,
} from './CFNLoopDashboard.types';
import * as S from './CFNLoopDashboard.styles';

const loopStepConfigs: LoopStepConfig[] = [
  {
    loopType: 0,
    label: 'Loop 0: Epic/Sprint',
    description: 'Multi-phase orchestration',
    icon: <ArchitectureIcon />,
  },
  {
    loopType: 1,
    label: 'Loop 1: Phase Execution',
    description: 'Sequential phase execution',
    icon: <CodeIcon />,
  },
  {
    loopType: 2,
    label: 'Loop 2: Validation',
    description: 'Consensus validation (≥0.90)',
    icon: <VerifiedIcon />,
  },
  {
    loopType: 3,
    label: 'Loop 3: Implementation',
    description: 'Primary swarm (≥0.75)',
    icon: <AssignmentIcon />,
  },
  {
    loopType: 4,
    label: 'Loop 4: Product Owner',
    description: 'GOAP decision gate',
    icon: <GavelIcon />,
  },
];

const getConfidenceColor = (
  value: number,
  threshold: number
): 'success' | 'warning' | 'error' => {
  if (value >= threshold) return 'success';
  if (value >= threshold * 0.8) return 'warning';
  return 'error';
};

const getStatusIcon = (status: LoopStatus) => {
  switch (status) {
    case 'completed':
      return <CheckCircleIcon color="success" />;
    case 'failed':
      return <ErrorIcon color="error" />;
    case 'blocked':
      return <WarningIcon color="warning" />;
    case 'in-progress':
      return <HourglassIcon color="primary" />;
    default:
      return <HourglassIcon color="disabled" />;
  }
};

const getDecisionColor = (
  decision: string
): 'success' | 'warning' | 'error' | 'default' => {
  switch (decision) {
    case 'PROCEED':
      return 'success';
    case 'DEFER':
      return 'warning';
    case 'ESCALATE':
      return 'error';
    default:
      return 'default';
  }
};

export const CFNLoopDashboard: React.FC<CFNLoopDashboardProps> = ({
  loopState,
  onAgentSelect,
  showDetailedMetrics = false,
  maxActivities = 10,
  refreshInterval,
  onRefresh,
  className,
  'data-testid': testId = 'cfn-loop-dashboard',
}) => {
  // Auto-refresh effect
  useEffect(() => {
    if (refreshInterval && onRefresh) {
      const intervalId = setInterval(onRefresh, refreshInterval);
      return () => clearInterval(intervalId);
    }
    return undefined;
  }, [refreshInterval, onRefresh]);

  // Get active step from current phase
  const activeStep = useMemo(() => {
    return loopState.currentPhase.currentLoop;
  }, [loopState.currentPhase.currentLoop]);

  // Filter recent activities
  const displayActivities = useMemo(() => {
    return loopState.recentActivity.slice(0, maxActivities);
  }, [loopState.recentActivity, maxActivities]);

  // Calculate overall metrics
  const metrics = useMemo(() => {
    const completedLoops = loopState.loops.filter(
      (l) => l.status === 'completed'
    ).length;
    const totalLoops = loopState.loops.length;
    const avgConfidence =
      loopState.loops
        .filter((l) => l.confidence)
        .reduce((sum, l) => sum + (l.confidence?.value || 0), 0) /
      loopState.loops.filter((l) => l.confidence).length;

    return {
      completedLoops,
      totalLoops,
      progressPercent: (completedLoops / totalLoops) * 100,
      avgConfidence: avgConfidence || 0,
    };
  }, [loopState.loops]);

  return (
    <S.DashboardContainer className={className} data-testid={testId}>
      {/* Header */}
      <S.HeaderSection>
        <Box>
          <S.HeaderTitle>{loopState.objective}</S.HeaderTitle>
          <S.HeaderSubtitle>Swarm ID: {loopState.swarmId}</S.HeaderSubtitle>
        </Box>
        <Box display="flex" gap={1} alignItems="center">
          <Chip
            label={`Phase: ${loopState.currentPhase.phaseName}`}
            color="primary"
            size="small"
          />
          {onRefresh && (
            <Tooltip title="Refresh">
              <IconButton onClick={onRefresh} size="small">
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          )}
        </Box>
      </S.HeaderSection>

      {/* Overall Metrics */}
      <S.ConfidenceSection>
        <S.ConfidenceCard>
          <S.ConfidenceValue
            color={getConfidenceColor(loopState.overallConfidence, 0.75)}
          >
            {(loopState.overallConfidence * 100).toFixed(0)}%
          </S.ConfidenceValue>
          <S.ConfidenceLabel>Overall Confidence</S.ConfidenceLabel>
        </S.ConfidenceCard>

        <S.ConfidenceCard>
          <S.ConfidenceValue color="primary">
            {metrics.completedLoops}/{metrics.totalLoops}
          </S.ConfidenceValue>
          <S.ConfidenceLabel>Loops Completed</S.ConfidenceLabel>
        </S.ConfidenceCard>

        <S.ConfidenceCard>
          <S.ConfidenceValue
            color={getConfidenceColor(metrics.avgConfidence, 0.75)}
          >
            {(metrics.avgConfidence * 100).toFixed(0)}%
          </S.ConfidenceValue>
          <S.ConfidenceLabel>Avg Loop Confidence</S.ConfidenceLabel>
        </S.ConfidenceCard>

        <S.ConfidenceCard>
          <S.ConfidenceValue color="secondary">
            {loopState.recentActivity.length}
          </S.ConfidenceValue>
          <S.ConfidenceLabel>Agent Activities</S.ConfidenceLabel>
        </S.ConfidenceCard>
      </S.ConfidenceSection>

      {/* Phase Progress */}
      <S.PhaseProgressSection>
        <S.ProgressLabel>
          {loopState.currentPhase.phaseName} - Loop{' '}
          {loopState.currentPhase.currentLoop}
        </S.ProgressLabel>
        <S.StyledLinearProgress
          variant="determinate"
          value={loopState.currentPhase.progress}
          color={
            loopState.currentPhase.loopStatus === 'completed'
              ? 'success'
              : 'primary'
          }
        />
        <Box display="flex" justifyContent="space-between" mt={1}>
          <S.ActivityTimestamp>
            Progress: {loopState.currentPhase.progress.toFixed(0)}%
          </S.ActivityTimestamp>
          {loopState.currentPhase.confidence && (
            <S.ActivityTimestamp>
              Confidence:{' '}
              {(loopState.currentPhase.confidence.value * 100).toFixed(0)}%
            </S.ActivityTimestamp>
          )}
        </Box>
      </S.PhaseProgressSection>

      {/* CFN Loop Stepper */}
      <S.LoopStepperSection>
        <Stepper activeStep={activeStep} orientation="vertical">
          {loopStepConfigs.map((config) => {
            const loopMetric = loopState.loops.find(
              (l) => l.loopType === config.loopType
            );
            const isActive = config.loopType === activeStep;

            return (
              <Step key={config.loopType} completed={loopMetric?.status === 'completed'}>
                <StepLabel
                  icon={config.icon}
                  error={loopMetric?.status === 'failed'}
                  optional={
                    loopMetric && (
                      <Box display="flex" gap={1} mt={0.5}>
                        <Chip
                          label={loopMetric.status}
                          size="small"
                          color={
                            loopMetric.status === 'completed'
                              ? 'success'
                              : loopMetric.status === 'failed'
                              ? 'error'
                              : 'default'
                          }
                        />
                        {loopMetric.confidence && (
                          <Chip
                            label={`${(loopMetric.confidence.value * 100).toFixed(0)}%`}
                            size="small"
                            color={getConfidenceColor(
                              loopMetric.confidence.value,
                              loopMetric.confidence.threshold
                            )}
                          />
                        )}
                      </Box>
                    )
                  }
                >
                  <Box>
                    <S.ProgressLabel>{config.label}</S.ProgressLabel>
                    <S.ActivityTimestamp>{config.description}</S.ActivityTimestamp>
                  </Box>
                </StepLabel>
                {isActive && loopMetric && (
                  <StepContent>
                    <Box mt={1}>
                      {showDetailedMetrics && loopMetric.consensus && loopMetric.consensus.validators && (
                        <S.ConsensusSection>
                          <S.ConsensusHeader>
                            Consensus Metrics
                          </S.ConsensusHeader>
                          <S.ValidatorList>
                            {loopMetric.consensus.validators.map((validator) => (
                              <S.ValidatorItem key={validator.agentId}>
                                <S.ValidatorInfo>
                                  <S.ValidatorName>
                                    {validator.agentId}
                                  </S.ValidatorName>
                                  <S.ActivityTimestamp>
                                    {validator.recommendations.length}{' '}
                                    recommendations
                                  </S.ActivityTimestamp>
                                </S.ValidatorInfo>
                                <S.ValidatorScore
                                  color={getConfidenceColor(
                                    validator.score,
                                    loopMetric.consensus?.threshold ?? 0.75
                                  )}
                                >
                                  {(validator.score * 100).toFixed(0)}%
                                </S.ValidatorScore>
                              </S.ValidatorItem>
                            ))}
                          </S.ValidatorList>
                        </S.ConsensusSection>
                      )}
                      {loopMetric.retryCount !== undefined && (
                        <S.MetricsGrid>
                          <S.MetricBox>
                            <S.MetricValue>
                              {loopMetric.retryCount}/{loopMetric.maxRetries}
                            </S.MetricValue>
                            <S.MetricLabel>Retry Count</S.MetricLabel>
                          </S.MetricBox>
                          {loopMetric.duration && (
                            <S.MetricBox>
                              <S.MetricValue>
                                {(loopMetric.duration / 1000).toFixed(1)}s
                              </S.MetricValue>
                              <S.MetricLabel>Duration</S.MetricLabel>
                            </S.MetricBox>
                          )}
                        </S.MetricsGrid>
                      )}
                    </Box>
                  </StepContent>
                )}
              </Step>
            );
          })}
        </Stepper>
      </S.LoopStepperSection>

      {/* Product Owner Decision */}
      {loopState.productOwnerDecision && (
        <S.DecisionSection>
          <S.DecisionHeader>
            <S.DecisionTitle>Product Owner Decision</S.DecisionTitle>
            <S.DecisionChip
              label={loopState.productOwnerDecision.decision}
              color={getDecisionColor(loopState.productOwnerDecision.decision)}
            />
          </S.DecisionHeader>
          <S.DecisionReasoning>
            {loopState.productOwnerDecision.reasoning}
          </S.DecisionReasoning>
          <S.MetricsGrid>
            <S.MetricBox>
              <S.MetricValue>
                {(loopState.productOwnerDecision.confidence * 100).toFixed(0)}%
              </S.MetricValue>
              <S.MetricLabel>Decision Confidence</S.MetricLabel>
            </S.MetricBox>
            <S.MetricBox>
              <S.MetricValue>
                {loopState.productOwnerDecision.nextSteps.length}
              </S.MetricValue>
              <S.MetricLabel>Next Steps</S.MetricLabel>
            </S.MetricBox>
          </S.MetricsGrid>
          <S.NextStepsList>
            {loopState.productOwnerDecision.nextSteps.map((step, index) => (
              <S.NextStepItem key={index}>
                <ArrowForwardIcon fontSize="small" sx={{ mr: 1 }} />
                <S.ActivityTitle>{step}</S.ActivityTitle>
              </S.NextStepItem>
            ))}
          </S.NextStepsList>
        </S.DecisionSection>
      )}

      {/* Agent Activity Timeline */}
      <S.ActivityTimelineSection>
        <S.TimelineHeader>Recent Agent Activity</S.TimelineHeader>
        <Timeline position="right">
          {displayActivities.map((activity, index) => (
            <TimelineItem key={`${activity.agentId}-${activity.timestamp}-${index}`}>
              <TimelineOppositeContent color="text.secondary">
                <S.ActivityTimestamp>
                  {new Date(activity.timestamp).toLocaleTimeString()}
                </S.ActivityTimestamp>
              </TimelineOppositeContent>
              <TimelineSeparator>
                <TimelineDot
                  color={
                    activity.status === 'success'
                      ? 'success'
                      : activity.status === 'failure'
                      ? 'error'
                      : 'primary'
                  }
                >
                  {getStatusIcon(
                    activity.status === 'success'
                      ? 'completed'
                      : activity.status === 'failure'
                      ? 'failed'
                      : 'in-progress'
                  )}
                </TimelineDot>
                {index < displayActivities.length - 1 && <TimelineConnector />}
              </TimelineSeparator>
              <TimelineContent>
                <S.ActivityItem
                  onClick={() => onAgentSelect?.(activity.agentId)}
                >
                  <Avatar sx={{ bgcolor: 'primary.main' }}>
                    {activity.agentType.charAt(0).toUpperCase()}
                  </Avatar>
                  <S.ActivityContent>
                    <S.ActivityTitle>
                      {activity.agentName}: {activity.action}
                    </S.ActivityTitle>
                    <Box display="flex" gap={1} mt={0.5}>
                      <Chip
                        label={activity.agentType}
                        size="small"
                        variant="outlined"
                      />
                      {activity.confidence !== undefined && (
                        <Chip
                          label={`${(activity.confidence * 100).toFixed(0)}%`}
                          size="small"
                          color={getConfidenceColor(activity.confidence, 0.75)}
                          icon={<TrendingUpIcon />}
                        />
                      )}
                    </Box>
                  </S.ActivityContent>
                </S.ActivityItem>
              </TimelineContent>
            </TimelineItem>
          ))}
        </Timeline>
      </S.ActivityTimelineSection>
    </S.DashboardContainer>
  );
};

export default CFNLoopDashboard;
