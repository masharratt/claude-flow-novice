/**
 * ErrorBoundary Component
 * Catches React errors and displays user-friendly fallback UI
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Box, Typography, Button, Alert } from '@mui/material';
import { ErrorOutline as ErrorIcon, Refresh as RefreshIcon } from '@mui/icons-material';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  resetKeys?: Array<string | number>;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('ErrorBoundary caught error:', error, errorInfo);
    }

    // Log to monitoring service (production)
    if (process.env.NODE_ENV === 'production') {
      // TODO: Integrate with monitoring service (e.g., Sentry, LogRocket)
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } });
      console.error('[ErrorBoundary] Production error:', {
        error: error.message,
        stack: error.stack,
        componentStack: errorInfo.componentStack,
      });
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  componentDidUpdate(prevProps: ErrorBoundaryProps): void {
    // Reset error boundary when resetKeys change
    if (
      this.state.hasError &&
      prevProps.resetKeys &&
      this.props.resetKeys &&
      prevProps.resetKeys.join(',') !== this.props.resetKeys.join(',')
    ) {
      this.resetError();
    }
  }

  resetError = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <Box
          sx={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: 200,
            p: 3,
            textAlign: 'center',
          }}
        >
          <ErrorIcon sx={{ fontSize: 48, color: 'error.main', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            Something went wrong
          </Typography>
          <Typography variant="body2" color="text.secondary" paragraph>
            {this.state.error?.message || 'An unexpected error occurred'}
          </Typography>
          {process.env.NODE_ENV === 'development' && this.state.error && (
            <Alert severity="error" sx={{ mt: 2, mb: 2, textAlign: 'left', maxWidth: 600 }}>
              <Typography variant="caption" component="pre" sx={{ whiteSpace: 'pre-wrap' }}>
                {this.state.error.stack}
              </Typography>
            </Alert>
          )}
          <Button
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={this.resetError}
            sx={{ mt: 2 }}
          >
            Try Again
          </Button>
        </Box>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
