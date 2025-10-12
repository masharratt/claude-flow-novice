/**
 * Mock for @mui/material to prevent slow DOM operations in tests
 * Provides basic React component stubs for MUI components
 */
import React from 'react';
import { vi } from 'vitest';

// Basic passthrough component
const MockComponent = ({ children, ...props }: any) => <div {...props}>{children}</div>;

export const Box = MockComponent;
export const Grid = MockComponent;
export const Paper = MockComponent;
export const Typography = MockComponent;
export const IconButton = MockComponent;
export const Tooltip = ({ children }: any) => <>{children}</>;
export const Select = MockComponent;
export const MenuItem = MockComponent;
export const FormControl = MockComponent;
export const InputLabel = MockComponent;
export const Button = MockComponent;
export const AppBar = MockComponent;
export const Toolbar = MockComponent;
export const Drawer = MockComponent;
export const List = MockComponent;
export const ListItem = MockComponent;
export const ListItemText = MockComponent;
export const ListItemIcon = MockComponent;
export const Card = MockComponent;
export const CardContent = MockComponent;
export const CardHeader = MockComponent;
export const CardActions = MockComponent;
export const Divider = MockComponent;
export const TextField = MockComponent;
export const Chip = MockComponent;
export const Avatar = MockComponent;
export const Badge = MockComponent;
export const CircularProgress = MockComponent;
export const LinearProgress = MockComponent;
export const Skeleton = MockComponent;
export const Alert = MockComponent;
export const Snackbar = MockComponent;
export const Dialog = MockComponent;
export const DialogTitle = MockComponent;
export const DialogContent = MockComponent;
export const DialogActions = MockComponent;
export const Menu = MockComponent;
export const Tab = MockComponent;
export const Tabs = MockComponent;
export const Stack = MockComponent;
export const Container = MockComponent;

export const CssBaseline = () => null;

// Export commonly used hooks and utilities
export const useTheme = () => ({
  palette: { mode: 'light', primary: { main: '#1976d2' } },
  spacing: (factor: number) => factor * 8,
  breakpoints: { up: () => '@media (min-width: 0px)', down: () => '@media (max-width: 9999px)' }
});

export const styled = (component: any) => component;
export const createTheme = (options?: any) => options || {};
