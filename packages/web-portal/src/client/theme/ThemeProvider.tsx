import React, { createContext, useContext, useMemo, useState, useCallback, useEffect } from 'react';
import { ThemeProvider as MuiThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { createAppTheme } from './theme';

type ThemeMode = 'light' | 'dark';

interface ThemeContextValue {
  mode: ThemeMode;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const useThemeMode = (): ThemeContextValue => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useThemeMode must be used within ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
  defaultMode?: ThemeMode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({
  children,
  defaultMode = 'light',
}) => {
  const [mode, setMode] = useState<ThemeMode>(() => {
    try {
      const savedMode = localStorage.getItem('theme-mode') as ThemeMode | null;
      return savedMode || defaultMode;
    } catch {
      return defaultMode;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('theme-mode', mode);
    } catch {
      // Ignore localStorage errors in test environment
    }
  }, [mode]);

  const toggleTheme = useCallback(() => {
    setMode((prevMode) => (prevMode === 'light' ? 'dark' : 'light'));
  }, []);

  const setThemeMode = useCallback((newMode: ThemeMode) => {
    setMode(newMode);
  }, []);

  const theme = useMemo(() => createAppTheme(mode), [mode]);

  const contextValue = useMemo(
    () => ({
      mode,
      toggleTheme,
      setThemeMode,
    }),
    [mode, toggleTheme, setThemeMode]
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      <MuiThemeProvider theme={theme}>
        <CssBaseline />
        {children}
      </MuiThemeProvider>
    </ThemeContext.Provider>
  );
};
