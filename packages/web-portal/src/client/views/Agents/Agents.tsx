import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export const Agents: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Agents
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Agent list view will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};
