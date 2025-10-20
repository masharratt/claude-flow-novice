/**
 * React Error Boundary Component
 * Provides graceful error handling and logging for React component trees
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';

// DOMPurify will be added when dependencies are available
// For now, we'll use basic sanitization
const sanitizeString = (str: string): string => {
  return str
    .replace(/[<>]/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .substring(0, 500);
};

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  errorId: string | null;
  retryCount: number;
}

class ErrorBoundary extends Component<Props, State> {
  private maxRetries = 3;
  private retryTimeouts: number[] = [];

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return {
      hasError: true,
      error,
      errorId: `error-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });

    // Sanitize error message for logging
    const sanitizedMessage = sanitizeString(error.message);
    const sanitizedStack = sanitizeString(error.stack || '');

    // Log error details
    console.group(`🚨 Error Boundary: ${this.state.errorId}`);
    console.error('Error:', sanitizedMessage);
    console.error('Stack:', sanitizedStack);
    console.error('Component Stack:', errorInfo.componentStack);
    console.groupEnd();

    // Store error in localStorage for debugging
    try {
      const errorLog = {
        id: this.state.errorId,
        timestamp: new Date().toISOString(),
        message: sanitizedMessage,
        stack: sanitizedStack,
        componentStack: errorInfo.componentStack,
        userAgent: navigator.userAgent,
        url: window.location.href
      };

      const existingErrors = JSON.parse(localStorage.getItem('error-boundary-logs') || '[]');
      existingErrors.push(errorLog);

      // Keep only last 50 errors
      if (existingErrors.length > 50) {
        existingErrors.splice(0, existingErrors.length - 50);
      }

      localStorage.setItem('error-boundary-logs', JSON.stringify(existingErrors));
    } catch (storageError) {
      console.warn('Could not store error log:', storageError);
    }

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleRetry = () => {
    if (this.state.retryCount < this.maxRetries) {
      this.setState(prevState => ({
        hasError: false,
        error: null,
        errorInfo: null,
        errorId: null,
        retryCount: prevState.retryCount + 1
      }));

      // Add exponential backoff for retries
      const backoffDelay = Math.pow(2, this.state.retryCount) * 1000;
      const timeout = setTimeout(() => {
        // Force re-render
        this.forceUpdate();
      }, backoffDelay);

      this.retryTimeouts.push(timeout);
    }
  };

  handleReset = () => {
    // Clear all pending timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
    this.retryTimeouts = [];

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      errorId: null,
      retryCount: 0
    });
  };

  componentWillUnmount() {
    // Clear any pending timeouts
    this.retryTimeouts.forEach(timeout => clearTimeout(timeout));
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return (
        <div
          role="alert"
          aria-live="assertive"
          className="error-boundary-fallback"
          style={{
            padding: '20px',
            margin: '20px',
            border: '2px solid #ff6b6b',
            borderRadius: '8px',
            backgroundColor: '#ffe0e0',
            color: '#d63031',
            fontFamily: 'monospace',
            fontSize: '14px'
          }}
        >
          <h2
            style={{
              margin: '0 0 16px 0',
              color: '#d63031',
              fontSize: '18px'
            }}
          >
            🚨 Something went wrong
          </h2>

          <details style={{ marginBottom: '16px' }}>
            <summary
              style={{
                cursor: 'pointer',
                fontWeight: 'bold',
                marginBottom: '8px'
              }}
            >
              Error Details (ID: {this.state.errorId})
            </summary>
            <div style={{ marginTop: '8px' }}>
              <p><strong>Error:</strong> {this.state.error?.message}</p>
              {this.state.retryCount > 0 && (
                <p><strong>Retry Attempt:</strong> {this.state.retryCount}/{this.maxRetries}</p>
              )}
            </div>
          </details>

          <div
            style={{
              marginBottom: '16px',
              fontSize: '12px',
              color: '#666'
            }}
          >
            The application encountered an unexpected error. You can try reloading the component or contact support if the problem persists.
          </div>

          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            {this.state.retryCount < this.maxRetries && (
              <button
                onClick={this.handleRetry}
                style={{
                  padding: '8px 16px',
                  backgroundColor: '#0984e3',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '14px'
                }}
                aria-label={`Retry component (attempt ${this.state.retryCount + 1} of ${this.maxRetries})`}
              >
                🔄 Retry ({this.maxRetries - this.state.retryCount} attempts left)
              </button>
            )}

            <button
              onClick={this.handleReset}
              style={{
                padding: '8px 16px',
                backgroundColor: '#00b894',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
              aria-label="Reset component"
            >
              🔄 Reset Component
            </button>

            <button
              onClick={() => window.location.reload()}
              style={{
                padding: '8px 16px',
                backgroundColor: '#636e72',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
              aria-label="Reload page"
            >
              🔄 Reload Page
            </button>

            <button
              onClick={() => {
                navigator.clipboard.writeText(
                  `Error ID: ${this.state.errorId}\nMessage: ${this.state.error?.message}\nTimestamp: ${new Date().toISOString()}`
                );
              }}
              style={{
                padding: '8px 16px',
                backgroundColor: '#fdcb6e',
                color: '#2d3436',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '14px'
              }}
              aria-label="Copy error details to clipboard"
            >
              📋 Copy Error Details
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;