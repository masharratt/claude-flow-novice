/**
 * Mock for @mui/material/styles
 */
import React from 'react';

export const ThemeProvider = ({ children }: any) => <>{children}</>;
export const useTheme = () => ({
  palette: { mode: 'light', primary: { main: '#1976d2' } },
  spacing: (factor: number) => factor * 8,
  breakpoints: { up: () => '@media (min-width: 0px)', down: () => '@media (max-width: 9999px)' }
});
export const createTheme = (options?: any) => options || {};
export const styled = (component: any) => component;
