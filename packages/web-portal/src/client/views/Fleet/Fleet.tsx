import React from 'react';
import { Box, Typography, Paper } from '@mui/material';

export const Fleet: React.FC = () => {
  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom>
        Fleet Overview
      </Typography>
      <Paper sx={{ p: 3, mt: 2 }}>
        <Typography variant="body1" color="text.secondary">
          Fleet overview and status will be implemented here.
        </Typography>
      </Paper>
    </Box>
  );
};
