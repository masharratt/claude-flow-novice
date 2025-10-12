import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export const Events: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Event Timeline
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Event timeline view will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};
