import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export const Performance: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Performance Metrics
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Performance charts and metrics will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};
