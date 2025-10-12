import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export const CFNLoop: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        CFN Loop Visualization
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          CFN Loop visualization will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};
