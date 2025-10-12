/**
 * LoadingSpinner Component
 * Displays loading state with optional message
 */

import React from 'react';
import { Box, CircularProgress, Typography, Skeleton } from '@mui/material';

interface LoadingSpinnerProps {
  message?: string;
  size?: number;
  fullscreen?: boolean;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  message = 'Loading...',
  size = 40,
  fullscreen = false,
}) => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: fullscreen ? '100vh' : 200,
        gap: 2,
      }}
    >
      <CircularProgress size={size} />
      {message && (
        <Typography variant="body2" color="text.secondary">
          {message}
        </Typography>
      )}
    </Box>
  );
};

interface SkeletonLoaderProps {
  variant?: 'text' | 'rectangular' | 'circular' | 'rounded';
  width?: number | string;
  height?: number | string;
  count?: number;
  spacing?: number;
}

export const SkeletonLoader: React.FC<SkeletonLoaderProps> = ({
  variant = 'rectangular',
  width = '100%',
  height = 40,
  count = 1,
  spacing = 1,
}) => {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: spacing }}>
      {Array.from({ length: count }).map((_, index) => (
        <Skeleton key={index} variant={variant} width={width} height={height} />
      ))}
    </Box>
  );
};

export default LoadingSpinner;
