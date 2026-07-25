/**
 * MetricCard Component
 * Displays individual dashboard metrics with trends and icons
 */

import React from 'react';
import { Box, Card, CardContent, Typography, CircularProgress, Skeleton } from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  TrendingFlat as TrendingFlatIcon,
} from '@mui/icons-material';
import type { MetricCardProps } from '../Dashboard.types';

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  trend,
  trendLabel,
  icon,
  color = 'primary',
  loading = false,
}) => {
  const getTrendIcon = () => {
    if (trend === undefined || trend === 0) {
      return <TrendingFlatIcon sx={{ fontSize: 16 }} />;
    }
    return trend > 0 ? (
      <TrendingUpIcon sx={{ fontSize: 16 }} />
    ) : (
      <TrendingDownIcon sx={{ fontSize: 16 }} />
    );
  };

  const getTrendColor = () => {
    if (trend === undefined || trend === 0) return 'text.secondary';
    return trend > 0 ? 'success.main' : 'error.main';
  };

  return (
    <Card
      elevation={2}
      sx={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: 4,
        },
      }}
    >
      <CardContent sx={{ flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Header */}
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Typography variant="body2" color="text.secondary" fontWeight={500} noWrap>
            {title}
          </Typography>
          {icon && (
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 40,
                height: 40,
                borderRadius: 1,
                bgcolor: `${color}.lighter`,
                color: `${color}.main`,
              }}
            >
              {icon}
            </Box>
          )}
        </Box>

        {/* Value */}
        <Box sx={{ flexGrow: 1, display: 'flex', alignItems: 'center' }}>
          {loading ? (
            <Box sx={{ width: '100%' }}>
              <Skeleton variant="text" width="60%" height={48} />
              <Skeleton variant="text" width="40%" height={24} />
            </Box>
          ) : (
            <Box sx={{ width: '100%' }}>
              <Typography
                variant="h4"
                component="div"
                fontWeight={700}
                color="text.primary"
                sx={{ mb: 0.5 }}
              >
                {value}
              </Typography>

              {/* Trend */}
              {trend !== undefined && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 0.5,
                    color: getTrendColor(),
                  }}
                >
                  {getTrendIcon()}
                  <Typography variant="body2" fontWeight={600}>
                    {Math.abs(trend)}%
                  </Typography>
                  {trendLabel && (
                    <Typography variant="caption" color="text.secondary">
                      {trendLabel}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};

export default MetricCard;
