import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error('Dashboard error caught by boundary:', error, errorInfo);
        // Optionally send error to logging service
    }

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex items-center justify-center min-h-screen bg-gray-50">
                    <div className="max-w-md p-6 bg-white rounded-lg shadow-lg border border-red-200">
                        <div className="flex items-center space-x-3 mb-4">
                            <AlertTriangle className="w-8 h-8 text-red-500" />
                            <h2 className="text-xl font-bold text-gray-900">Dashboard Error</h2>
                        </div>
                        <p className="text-gray-700 mb-4">
                            An error occurred while rendering the dashboard.
                        </p>
                        <details className="text-sm text-gray-600 mb-4">
                            <summary className="cursor-pointer font-medium">Error Details</summary>
                            <pre className="mt-2 p-2 bg-gray-100 rounded overflow-x-auto">
                                {this.state.error?.toString()}
                            </pre>
                        </details>
                        <button
                            onClick={() => window.location.reload()}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                            Reload Dashboard
                        </button>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}