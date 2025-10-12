import React from 'react';
import { BrowserRouter } from 'react-router-dom';
import { ThemeProvider } from './theme/ThemeProvider';
import { AppRoutes } from './routes';

export const App: React.FC = () => {
  return (
    <ThemeProvider defaultMode="light">
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </ThemeProvider>
  );
};
