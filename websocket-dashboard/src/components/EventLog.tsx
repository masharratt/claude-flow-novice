import React, { useState, useEffect, useRef } from 'react';
import { SwarmEvent } from '../types/websocket';

interface EventLogProps {
  events: SwarmEvent[];
  maxEvents?: number;
}

export const EventLog: React.FC<EventLogProps> = ({ events, maxEvents = 50 }) => {
  const [displayedEvents, setDisplayedEvents] = useState<SwarmEvent[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const eventLogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDisplayedEvents(events.slice(0, maxEvents));
  }, [events, maxEvents]);

  useEffect(() => {
    if (autoScroll && eventLogRef.current) {
      eventLogRef.current.scrollTop = eventLogRef.current.scrollHeight;
    }
  }, [displayedEvents, autoScroll]);

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'agent-spawned': return '🚀';
      case 'agent-completed': return '✅';
      case 'agent-failed': return '❌';
      case 'gate-passed': return '🎯';
      case 'gate-failed': return '🚧';
      case 'iteration-start': return '🔄';
      case 'swarm-created': return '🏗️';
      case 'swarm-completed': return '🎉';
      case 'consensus-reached': return '🤝';
      case 'decision-made': return '⚖️';
      default: return '📝';
    }
  };

  const getEventColor = (type: string) => {
    if (type.includes('failed') || type.includes('error')) return 'text-red-600';
    if (type.includes('completed') || type.includes('passed') || type.includes('reached')) return 'text-green-600';
    if (type.includes('spawned') || type.includes('started') || type.includes('created')) return 'text-blue-600';
    return 'text-gray-600';
  };

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <div className="bg-white rounded-lg shadow-md border border-gray-200">
      <div className="p-4 border-b border-gray-200">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-gray-900">Event Log</h3>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">{displayedEvents.length} events</span>
            <label className="flex items-center space-x-2 text-sm">
              <input
                type="checkbox"
                checked={autoScroll}
                onChange={(e) => setAutoScroll(e.target.checked)}
                className="rounded"
              />
              <span>Auto-scroll</span>
            </label>
          </div>
        </div>
      </div>

      <div
        ref={eventLogRef}
        className="h-96 overflow-y-auto p-4 space-y-2"
        onScroll={(e) => {
          const element = e.currentTarget;
          const isAtBottom = element.scrollHeight - element.scrollTop <= element.clientHeight + 10;
          setAutoScroll(isAtBottom);
        }}
      >
        {displayedEvents.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No events yet. Waiting for WebSocket connections...
          </div>
        ) : (
          displayedEvents.map((event, index) => (
            <div
              key={`${event.timestamp}-${index}`}
              className="flex items-start space-x-3 p-3 hover:bg-gray-50 rounded transition-colors"
            >
              <span className="text-lg flex-shrink-0">{getEventIcon(event.type)}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center space-x-2 mb-1">
                  <span className={`text-sm font-medium ${getEventColor(event.type)}`}>
                    {event.type.replace('-', ' ')}
                  </span>
                  {event.agentId && (
                    <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                      {event.agentId}
                    </span>
                  )}
                </div>
                {event.swarmId && (
                  <div className="text-xs text-gray-600 mb-1">
                    Swarm: {event.swarmId}
                  </div>
                )}
                {event.status && (
                  <div className="text-xs text-gray-600 mb-1">
                    Status: {event.status}
                  </div>
                )}
                <div className="text-xs text-gray-400">
                  {formatTimestamp(event.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};