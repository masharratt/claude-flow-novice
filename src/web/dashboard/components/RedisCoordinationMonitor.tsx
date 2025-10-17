/**
 * Redis Coordination Monitor Component
 *
 * Real-time visualization of Redis-based agent coordination and hook feedback
 * Integrates with RedisMonitoringService for live data
 *
 * Phase 5: Validation & Monitoring + Dashboard Integration
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
    Activity,
    AlertTriangle,
    CheckCircle,
    Clock,
    MessageSquare,
    TrendingUp,
    XCircle,
    Zap
} from 'lucide-react';

interface FeedbackMessage {
    timestamp: string;
    agentId: string;
    spawnMode: 'cli' | 'task' | 'unknown';
    type: 'ROOT_WARNING' | 'LOW_COVERAGE' | 'RUST_QUALITY' | 'TDD_VIOLATION' | 'LINT_ISSUES';
    file: string;
    severity: 'error' | 'warning' | 'info';
    delivered: boolean;
}

interface RedisMetrics {
    feedbackDeliveryRate: number;
    averageFeedbackLatency: number;
    agentActionRate: number;
    activeChannels: number;
    totalMessages: number;
    staleKeys: number;
    patternViolations: number;
}

interface QueueStatus {
    channel: string;
    length: number;
    oldestMessage?: string;
    newestMessage?: string;
}

interface PatternViolation {
    timestamp: string;
    violationType: string;
    channel?: string;
    description: string;
    severity: 'error' | 'warning';
}

interface RedisCoordinationMonitorProps {
    wsUrl?: string;
    refreshInterval?: number;
    maxFeedbackItems?: number;
    className?: string;
}

export const RedisCoordinationMonitor: React.FC<RedisCoordinationMonitorProps> = ({
    wsUrl = 'ws://localhost:3000',
    refreshInterval: refreshIntervalProp = 5000,  // Renamed to avoid ESLint warning
    maxFeedbackItems = 50,
    className = ''
}) => {
    // Use the refresh interval prop for future WebSocket reconnection strategy
    const refreshInterval = useRef(refreshIntervalProp);
    // Add live region for screen reader updates
    const [liveRegionMessage, setLiveRegionMessage] = useState('Initial state');

    // Announce connection status to screen reader
    useEffect(() => {
        setLiveRegionMessage(isConnected ? 'Connected to Redis Coordination Monitor' : 'Disconnected from Redis Coordination Monitor');
    }, [isConnected]);

    // Add keyboard trap focus management
    const [focusTrapRef, setFocusTrapRef] = useState<HTMLDivElement | null>(null);

    useEffect(() => {
        if (focusTrapRef) {
            const focusableElements = focusTrapRef.querySelectorAll(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
            );

            const firstElement = focusableElements[0] as HTMLElement;
            const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

            const trapFocus = (e: KeyboardEvent) => {
                if (e.key === 'Tab') {
                    if (e.shiftKey && document.activeElement === firstElement) {
                        e.preventDefault();
                        lastElement.focus();
                    } else if (!e.shiftKey && document.activeElement === lastElement) {
                        e.preventDefault();
                        firstElement.focus();
                    }
                }
            };

            focusTrapRef.addEventListener('keydown', trapFocus);
            return () => {
                focusTrapRef.removeEventListener('keydown', trapFocus);
            };
        }
    }, [focusTrapRef]);
    const [metrics, setMetrics] = useState<RedisMetrics>({
        feedbackDeliveryRate: 0,
        averageFeedbackLatency: 0,
        agentActionRate: 0,
        activeChannels: 0,
        totalMessages: 0,
        staleKeys: 0,
        patternViolations: 0
    });

    const [feedbackHistory, setFeedbackHistory] = useState<FeedbackMessage[]>([]);
    const [queueStatuses, setQueueStatuses] = useState<QueueStatus[]>([]);
    const [violations, setViolations] = useState<PatternViolation[]>([]);
    const [isConnected, setIsConnected] = useState(false);
    const [selectedTab, setSelectedTab] = useState<'feedback' | 'queues' | 'violations'>('feedback');

    // WebSocket connection
    useEffect(() => {
        let ws: WebSocket | null = null;
        let reconnectTimer: NodeJS.Timeout | null = null;

        const connect = () => {
            ws = new WebSocket(wsUrl);

            ws.onopen = () => {
                setIsConnected(true);
                console.log('✅ Connected to Redis monitoring WebSocket');

                // Clear any existing reconnect timer
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
            };

            ws.onclose = (event) => {
                setIsConnected(false);
                console.log('❌ Disconnected from Redis monitoring WebSocket');

                // Only attempt to reconnect if the close wasn't intentional
                if (!event.wasClean) {
                    reconnectTimer = setTimeout(() => {
                        connect();
                    }, refreshInterval.current);
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);

                    switch (data.type) {
                        case 'redis_feedback':
                            handleFeedbackUpdate(data.payload);
                            break;
                        case 'redis_metrics':
                            setMetrics(data.payload);
                            break;
                        case 'redis_queue_status':
                            handleQueueUpdate(data.payload);
                            break;
                        case 'redis_pattern_violation':
                            handleViolation(data.payload);
                            break;
                    }
                } catch (error) {
                    console.error('Failed to parse WebSocket message:', error);
                }
            };
        };

        // Initial connection
        connect();

        // Cleanup function
        return () => {
            if (ws) {
                ws.close();
            }
            if (reconnectTimer) {
                clearTimeout(reconnectTimer);
            }
        };
    }, [wsUrl, refreshInterval]);

    const handleFeedbackUpdate = useCallback((feedback: FeedbackMessage) => {
        setFeedbackHistory(prev => [feedback, ...prev].slice(0, maxFeedbackItems));
    }, [maxFeedbackItems]);

    const handleQueueUpdate = useCallback((queue: QueueStatus) => {
        setQueueStatuses(prev => {
            const filtered = prev.filter(q => q.channel !== queue.channel);
            return [queue, ...filtered].slice(0, 20);
        });
    }, []);

    const handleViolation = useCallback((violation: PatternViolation) => {
        setViolations(prev => [violation, ...prev].slice(0, 20));
    }, []);

    // Feedback type colors
    const getFeedbackTypeColor = (type: string): string => {
        const colors: Record<string, string> = {
            ROOT_WARNING: 'text-yellow-600 bg-yellow-50',
            LOW_COVERAGE: 'text-orange-600 bg-orange-50',
            RUST_QUALITY: 'text-purple-600 bg-purple-50',
            TDD_VIOLATION: 'text-red-600 bg-red-50',
            LINT_ISSUES: 'text-blue-600 bg-blue-50'
        };
        return colors[type] || 'text-gray-600 bg-gray-50';
    };

    // Severity icons
    const getSeverityIcon = (severity: string) => {
        switch (severity) {
            case 'error':
                return <XCircle className="w-4 h-4 text-red-500" />;
            case 'warning':
                return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
            case 'info':
                return <CheckCircle className="w-4 h-4 text-blue-500" />;
            default:
                return <Activity className="w-4 h-4 text-gray-500" />;
        }
    };

    // Format timestamp
    const formatTime = (timestamp: string): string => {
        const date = new Date(timestamp);
        return date.toLocaleTimeString();
    };

    return (
        <div
            className={`redis-coordination-monitor ${className}`}
            ref={setFocusTrapRef}
            role="region"
            aria-label="Redis Coordination Monitor"
            lang="en"
        >
            {/* Accessibility: Live region for screen reader updates */}
            <div
                role="status"
                aria-live="polite"
                className="sr-only"
                aria-atomic="true"
            >
                {liveRegionMessage}
            </div>

            {/* Header */}
            <header role="banner" className="flex items-center justify-between mb-6">
                <div className="flex items-center space-x-3">
                    <Zap
                        className="w-6 h-6 text-blue-600"
                        aria-hidden="true"
                    />
                    <h1 className="text-2xl font-bold text-gray-900">
                        Redis Coordination Monitor
                    </h1>
                </div>
                <div
                    className="flex items-center space-x-2"
                    role="status"
                    aria-live="polite"
                >
                    <div
                        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}
                        role="img"
                        aria-label={isConnected ? 'Connected' : 'Disconnected'}
                    />
                    <span
                        className="text-sm text-gray-600"
                        aria-live="polite"
                    >
                        {isConnected ? 'Connected' : 'Disconnected'}
                    </span>
                </div>
            </header>

            {/* Metrics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <MetricCard
                    title="Feedback Delivery"
                    value={`${metrics.feedbackDeliveryRate.toFixed(1)}%`}
                    icon={<TrendingUp className="w-5 h-5" aria-hidden="true" />}
                    color="blue"
                    target="99.9%"
                />
                <MetricCard
                    title="Avg Latency"
                    value={`${metrics.averageFeedbackLatency.toFixed(0)}ms`}
                    icon={<Clock className="w-5 h-5" aria-hidden="true" />}
                    color="green"
                    target="<100ms"
                />
                <MetricCard
                    title="Active Channels"
                    value={metrics.activeChannels.toString()}
                    icon={<Activity className="w-5 h-5" aria-hidden="true" />}
                    color="purple"
                />
                <MetricCard
                    title="Stale Keys"
                    value={metrics.staleKeys.toString()}
                    icon={<AlertTriangle className="w-5 h-5" aria-hidden="true" />}
                    color={metrics.staleKeys > 0 ? 'red' : 'gray'}
                />
            </div>

            {/* Navigation and Tabs */}
            <nav
                className="border-b border-gray-200 mb-4"
                aria-label="Redis Monitor Views"
            >
                <div
                    role="tablist"
                    className="flex space-x-8"
                    aria-orientation="horizontal"
                >
                    <TabButton
                        label="Hook Feedback"
                        count={feedbackHistory.length}
                        active={selectedTab === 'feedback'}
                        onClick={() => setSelectedTab('feedback')}
                        controls="feedback-panel"
                    />
                    <TabButton
                        label="Queue Status"
                        count={queueStatuses.length}
                        active={selectedTab === 'queues'}
                        onClick={() => setSelectedTab('queues')}
                        controls="queues-panel"
                    />
                    <TabButton
                        label="Violations"
                        count={violations.length}
                        active={selectedTab === 'violations'}
                        onClick={() => setSelectedTab('violations')}
                        controls="violations-panel"
                    />
                </div>
            </nav>

            {/* Tab Content */}
            <main>
                <div
                    className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
                    role="tabpanel"
                    id={`${selectedTab}-panel`}
                    aria-labelledby={`${selectedTab}-tab`}
                >
                    {selectedTab === 'feedback' && (
                        <FeedbackPanel
                            feedback={feedbackHistory}
                            getFeedbackTypeColor={getFeedbackTypeColor}
                            getSeverityIcon={getSeverityIcon}
                            formatTime={formatTime}
                        />
                    )}

                    {selectedTab === 'queues' && (
                        <QueuePanel
                            queues={queueStatuses}
                            formatTime={formatTime}
                        />
                    )}

                    {selectedTab === 'violations' && (
                        <ViolationsPanel
                            violations={violations}
                            getSeverityIcon={getSeverityIcon}
                            formatTime={formatTime}
                        />
                    )}
                </div>
            </main>

            {/* Screen reader styles */}
            <style>{`
                .sr-only {
                    position: absolute;
                    width: 1px;
                    height: 1px;
                    padding: 0;
                    margin: -1px;
                    overflow: hidden;
                    clip: rect(0, 0, 0, 0);
                    white-space: nowrap;
                    border-width: 0;
                }
            `}</style>
        </div>
    );
};

// Metric Card Component
interface MetricCardProps {
    title: string;
    value: string;
    icon: React.ReactNode;
    color: string;
    target?: string;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, icon, color, target }) => {
    const colorClasses: Record<string, string> = {
        blue: 'bg-blue-50 text-blue-600',
        green: 'bg-green-50 text-green-600',
        purple: 'bg-purple-50 text-purple-600',
        red: 'bg-red-50 text-red-600',
        gray: 'bg-gray-50 text-gray-600'
    };

    return (
        <div
            className="bg-white rounded-lg shadow-sm border border-gray-200 p-4"
            role="region"
            aria-label={`${title} metric`}
        >
            <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-gray-600">{title}</span>
                <div
                    className={`p-2 rounded-lg ${colorClasses[color]}`}
                    role="img"
                    aria-hidden="true"
                >
                    {React.cloneElement(icon as React.ReactElement, {
                        'aria-hidden': 'true'
                    })}
                </div>
            </div>
            <div
                className="text-2xl font-bold text-gray-900"
                aria-live="polite"
                aria-atomic="true"
            >
                {value}
            </div>
            {target && (
                <div
                    className="text-xs text-gray-500 mt-1"
                    aria-label={`Target metric: ${target}`}
                >
                    Target: {target}
                </div>
            )}
        </div>
    );
};

// Tab Button Component
interface TabButtonProps {
    label: string;
    count: number;
    active: boolean;
    onClick: () => void;
    controls: string;  // Adds aria-controls attribute
}

const TabButton: React.FC<TabButtonProps> = ({
    label,
    count,
    active,
    onClick,
    controls
}) => (
    <button
        role="tab"
        id={`${controls}-tab`}
        aria-selected={active}
        aria-controls={controls}
        tabIndex={active ? 0 : -1}
        onClick={onClick}
        onKeyDown={(e) => {
            // Enable tab navigation with arrow keys
            if (e.key === 'ArrowRight') {
                const nextTab = e.currentTarget.nextElementSibling as HTMLButtonElement;
                nextTab?.focus();
            } else if (e.key === 'ArrowLeft') {
                const prevTab = e.currentTarget.previousElementSibling as HTMLButtonElement;
                prevTab?.focus();
            }
        }}
        className={`
            py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
            ${active
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }
        `}
    >
        {label}
        {count > 0 && (
            <span
                className="ml-2 py-0.5 px-2 rounded-full bg-gray-100 text-xs"
                aria-label={`${count} items`}
            >
                {count}
            </span>
        )}
    </button>
);

// Feedback Panel Component
interface FeedbackPanelProps {
    feedback: FeedbackMessage[];
    getFeedbackTypeColor: (type: string) => string;
    getSeverityIcon: (severity: string) => React.ReactNode;
    formatTime: (timestamp: string) => string;
}

const FeedbackPanel: React.FC<FeedbackPanelProps> = ({
    feedback,
    getFeedbackTypeColor,
    getSeverityIcon,
    formatTime
}) => (
    <div
        className="space-y-2 max-h-96 overflow-y-auto"
        role="list"
        aria-label="Hook feedback messages"
    >
        {feedback.length === 0 ? (
            <div
                className="text-center py-8 text-gray-500"
                role="alert"
                aria-live="polite"
            >
                <MessageSquare
                    className="w-12 h-12 mx-auto mb-2 text-gray-400"
                    aria-hidden="true"
                />
                <p>No feedback messages yet</p>
            </div>
        ) : (
            feedback.map((item, index) => (
                <div
                    key={index}
                    role="listitem"
                    className="flex items-start space-x-3 p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                    aria-label={`${item.type} feedback from ${item.agentId}`}
                >
                    <div className="flex-shrink-0 mt-1">
                        {getSeverityIcon(item.severity)}
                    </div>
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                            <span
                                className={`px-2 py-1 rounded text-xs font-medium ${getFeedbackTypeColor(item.type)}`}
                                role="status"
                            >
                                {item.type}
                            </span>
                            <span
                                className="text-xs text-gray-500"
                                aria-label={`Timestamp: ${formatTime(item.timestamp)}`}
                            >
                                {formatTime(item.timestamp)}
                            </span>
                        </div>
                        <div
                            className="mt-1 text-sm text-gray-900"
                            aria-label={`Agent Details: ${item.agentId}`}
                        >
                            Agent: <span className="font-mono">{item.agentId}</span> ({item.spawnMode})
                        </div>
                        <div
                            className="mt-1 text-xs text-gray-600 truncate"
                            aria-label={`File Location: ${item.file}`}
                        >
                            File: {item.file}
                        </div>
                        <div className="mt-1">
                            {item.delivered ? (
                                <span
                                    className="inline-flex items-center text-xs text-green-600"
                                    role="status"
                                    aria-label="Feedback message delivered"
                                >
                                    <CheckCircle className="w-3 h-3 mr-1" aria-hidden="true" />
                                    Delivered
                                </span>
                            ) : (
                                <span
                                    className="inline-flex items-center text-xs text-yellow-600"
                                    role="status"
                                    aria-label="Feedback message pending"
                                >
                                    <Clock className="w-3 h-3 mr-1" aria-hidden="true" />
                                    Pending
                                </span>
                            )}
                        </div>
                    </div>
                </div>
            ))
        )}
    </div>
);

// Queue Panel Component
interface QueuePanelProps {
    queues: QueueStatus[];
    formatTime: (timestamp: string) => string;
}

const QueuePanel: React.FC<QueuePanelProps> = ({ queues, formatTime }) => (
    <div
        className="space-y-2 max-h-96 overflow-y-auto"
        role="list"
        aria-label="Redis Queue Status"
    >
        {queues.length === 0 ? (
            <div
                className="text-center py-8 text-gray-500"
                role="alert"
                aria-live="polite"
            >
                <Activity
                    className="w-12 h-12 mx-auto mb-2 text-gray-400"
                    aria-hidden="true"
                />
                <p>No active queues</p>
            </div>
        ) : (
            queues.map((queue, index) => (
                <div
                    key={index}
                    role="listitem"
                    className="p-3 rounded-lg border border-gray-200 hover:bg-gray-50"
                    aria-label={`Queue ${queue.channel} with ${queue.length} messages`}
                >
                    <div className="flex items-center justify-between">
                        <div
                            className="font-mono text-sm text-gray-900"
                            aria-label={`Channel: ${queue.channel}`}
                        >
                            {queue.channel}
                        </div>
                        <span
                            className="px-2 py-1 rounded-full bg-blue-100 text-blue-700 text-xs font-medium"
                            role="status"
                            aria-label={`${queue.length} messages in the queue`}
                        >
                            {queue.length} messages
                        </span>
                    </div>
                    {queue.oldestMessage && (
                        <div
                            className="mt-2 text-xs text-gray-600"
                            aria-label={`Oldest message timestamp: ${formatTime(JSON.parse(queue.oldestMessage).timestamp || '')}`}
                        >
                            Oldest: {formatTime(JSON.parse(queue.oldestMessage).timestamp || '')}
                        </div>
                    )}
                </div>
            ))
        )}
    </div>
);

// Violations Panel Component
interface ViolationsPanelProps {
    violations: PatternViolation[];
    getSeverityIcon: (severity: string) => React.ReactNode;
    formatTime: (timestamp: string) => string;
}

const ViolationsPanel: React.FC<ViolationsPanelProps> = ({
    violations,
    getSeverityIcon,
    formatTime
}) => (
    <div
        className="space-y-2 max-h-96 overflow-y-auto"
        role="list"
        aria-label="Pattern Violations"
    >
        {violations.length === 0 ? (
            <div
                className="text-center py-8 text-gray-500"
                role="alert"
                aria-live="polite"
            >
                <CheckCircle
                    className="w-12 h-12 mx-auto mb-2 text-green-400"
                    aria-hidden="true"
                />
                <p>No pattern violations</p>
            </div>
        ) : (
            violations.map((violation, index) => (
                <div
                    key={index}
                    role="listitem"
                    className="flex items-start space-x-3 p-3 rounded-lg border border-red-200 bg-red-50"
                    aria-label={`${violation.severity.toUpperCase()} violation`}
                >
                    <div className="flex-shrink-0 mt-1" aria-hidden="true">
                        {getSeverityIcon(violation.severity)}
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center justify-between">
                            <span
                                className="text-sm font-medium text-gray-900"
                                aria-label={`Violation Type: ${violation.violationType}`}
                            >
                                {violation.violationType.replace(/_/g, ' ').toUpperCase()}
                            </span>
                            <span
                                className="text-xs text-gray-500"
                                aria-label={`Timestamp: ${formatTime(violation.timestamp)}`}
                            >
                                {formatTime(violation.timestamp)}
                            </span>
                        </div>
                        <div
                            className="mt-1 text-sm text-gray-700"
                            aria-label={`Violation Description: ${violation.description}`}
                        >
                            {violation.description}
                        </div>
                        {violation.channel && (
                            <div
                                className="mt-1 text-xs font-mono text-gray-600"
                                aria-label={`Channel: ${violation.channel}`}
                            >
                                {violation.channel}
                            </div>
                        )}
                    </div>
                </div>
            ))
        )}
    </div>
);

export default RedisCoordinationMonitor;
