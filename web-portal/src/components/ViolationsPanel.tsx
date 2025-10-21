/**
 * ViolationsPanel - Real-time CFN Loop violation monitoring
 *
 * Displays detected violations with severity indicators, descriptions,
 * and actionable recommendations for debugging orchestrator issues.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Socket } from 'socket.io-client';
import './ViolationsPanel.css';

export interface CFNViolation {
  timestamp: string;
  task_id: string;
  violation_type: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  recommendation: string;
  evidence: Record<string, any>;
  acknowledged?: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
}

interface ViolationsPanelProps {
  socket: Socket | null;
  currentSwarmId?: string;
}

const ViolationsPanel: React.FC<ViolationsPanelProps> = ({ socket, currentSwarmId }) => {
  const [violations, setViolations] = useState<CFNViolation[]>([]);
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'info'>('all');
  const [showAcknowledged, setShowAcknowledged] = useState(false);
  const [expandedViolation, setExpandedViolation] = useState<string | null>(null);

  // Listen for real-time violations
  useEffect(() => {
    if (!socket) return;

    const handleViolation = (violation: CFNViolation) => {
      // Filter by current swarm if specified
      if (currentSwarmId && violation.task_id !== currentSwarmId) {
        return;
      }

      setViolations(prev => {
        // Prevent duplicates
        const exists = prev.some(v =>
          v.timestamp === violation.timestamp &&
          v.task_id === violation.task_id &&
          v.violation_type === violation.violation_type
        );

        if (exists) return prev;

        // Add new violation at the beginning (newest first)
        return [violation, ...prev].slice(0, 100); // Keep last 100
      });
    };

    const handleHistoricalViolations = (data: { swarmId: string, violations: CFNViolation[] }) => {
      if (currentSwarmId && data.swarmId !== currentSwarmId) return;

      setViolations(prev => {
        // Merge historical violations
        const existing = new Set(prev.map(v => `${v.timestamp}-${v.violation_type}`));
        const newViolations = data.violations.filter(v =>
          !existing.has(`${v.timestamp}-${v.violation_type}`)
        );

        return [...newViolations, ...prev].slice(0, 100);
      });
    };

    const handleAcknowledged = (data: { violationId: string, acknowledgedBy: string, timestamp: string }) => {
      setViolations(prev => prev.map(v => {
        const violationId = `${v.timestamp}-${v.task_id}-${v.violation_type}`;
        if (violationId === data.violationId) {
          return {
            ...v,
            acknowledged: true,
            acknowledgedBy: data.acknowledgedBy,
            acknowledgedAt: data.timestamp
          };
        }
        return v;
      }));
    };

    socket.on('cfn-violation', handleViolation);
    socket.on('historical-violations', handleHistoricalViolations);
    socket.on('violation-acknowledged', handleAcknowledged);

    return () => {
      socket.off('cfn-violation', handleViolation);
      socket.off('historical-violations', handleHistoricalViolations);
      socket.off('violation-acknowledged', handleAcknowledged);
    };
  }, [socket, currentSwarmId]);

  // Acknowledge violation
  const handleAcknowledge = useCallback((violation: CFNViolation) => {
    if (!socket) return;

    const violationId = `${violation.timestamp}-${violation.task_id}-${violation.violation_type}`;
    socket.emit('acknowledge-violation', {
      violationId,
      acknowledgedBy: 'web-portal-user'
    });
  }, [socket]);

  // Filter violations
  const filteredViolations = violations.filter(v => {
    if (!showAcknowledged && v.acknowledged) return false;
    if (filter !== 'all' && v.severity !== filter) return false;
    return true;
  });

  // Group by severity
  const criticalCount = violations.filter(v => v.severity === 'critical' && !v.acknowledged).length;
  const warningCount = violations.filter(v => v.severity === 'warning' && !v.acknowledged).length;
  const infoCount = violations.filter(v => v.severity === 'info' && !v.acknowledged).length;

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return '🔴';
      case 'warning':
        return '🟡';
      case 'info':
        return '🔵';
      default:
        return '⚪';
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleString();
  };

  return (
    <div className="violations-panel">
      <div className="violations-header">
        <h2>CFN Loop Violations</h2>
        <div className="violations-stats">
          <span className="stat critical" title="Critical violations">
            🔴 {criticalCount}
          </span>
          <span className="stat warning" title="Warnings">
            🟡 {warningCount}
          </span>
          <span className="stat info" title="Info">
            🔵 {infoCount}
          </span>
        </div>
      </div>

      <div className="violations-filters">
        <div className="filter-buttons">
          <button
            className={filter === 'all' ? 'active' : ''}
            onClick={() => setFilter('all')}
          >
            All ({violations.length})
          </button>
          <button
            className={filter === 'critical' ? 'active' : ''}
            onClick={() => setFilter('critical')}
          >
            Critical ({criticalCount})
          </button>
          <button
            className={filter === 'warning' ? 'active' : ''}
            onClick={() => setFilter('warning')}
          >
            Warnings ({warningCount})
          </button>
          <button
            className={filter === 'info' ? 'active' : ''}
            onClick={() => setFilter('info')}
          >
            Info ({infoCount})
          </button>
        </div>

        <label className="show-acknowledged">
          <input
            type="checkbox"
            checked={showAcknowledged}
            onChange={(e) => setShowAcknowledged(e.target.checked)}
          />
          Show acknowledged
        </label>
      </div>

      <div className="violations-list">
        {filteredViolations.length === 0 ? (
          <div className="no-violations">
            ✅ No {filter !== 'all' ? filter : ''} violations detected
            {currentSwarmId && ` for swarm ${currentSwarmId}`}
          </div>
        ) : (
          filteredViolations.map((violation, index) => {
            const violationId = `${violation.timestamp}-${violation.task_id}-${violation.violation_type}`;
            const isExpanded = expandedViolation === violationId;

            return (
              <div
                key={index}
                className={`violation-item ${violation.severity} ${violation.acknowledged ? 'acknowledged' : ''}`}
              >
                <div
                  className="violation-summary"
                  onClick={() => setExpandedViolation(isExpanded ? null : violationId)}
                >
                  <span className="severity-icon">{getSeverityIcon(violation.severity)}</span>
                  <div className="violation-content">
                    <div className="violation-header-row">
                      <span className="violation-type">{violation.violation_type.replace(/_/g, ' ')}</span>
                      <span className="violation-timestamp">{formatTimestamp(violation.timestamp)}</span>
                    </div>
                    <div className="violation-description">{violation.description}</div>
                    {violation.acknowledged && (
                      <div className="acknowledged-badge">
                        ✓ Acknowledged by {violation.acknowledgedBy}
                      </div>
                    )}
                  </div>
                  <button
                    className="expand-button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedViolation(isExpanded ? null : violationId);
                    }}
                  >
                    {isExpanded ? '▼' : '▶'}
                  </button>
                </div>

                {isExpanded && (
                  <div className="violation-details">
                    <div className="detail-section">
                      <h4>Task ID</h4>
                      <code>{violation.task_id}</code>
                    </div>

                    <div className="detail-section">
                      <h4>💡 Recommendation</h4>
                      <p>{violation.recommendation}</p>
                    </div>

                    {Object.keys(violation.evidence).length > 0 && (
                      <div className="detail-section">
                        <h4>🔍 Evidence</h4>
                        <pre className="evidence-json">
                          {JSON.stringify(violation.evidence, null, 2)}
                        </pre>
                      </div>
                    )}

                    {!violation.acknowledged && (
                      <button
                        className="acknowledge-button"
                        onClick={() => handleAcknowledge(violation)}
                      >
                        ✓ Acknowledge Violation
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default ViolationsPanel;
