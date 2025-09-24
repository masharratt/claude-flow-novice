import React, { useState, useEffect, useMemo, useCallback } from 'react';
import './TransparencyInsights.css';

// Type definitions for transparency and decision analysis
export interface DecisionPoint {
  id: string;
  timestamp: Date;
  agentId: string;
  agentName: string;
  context: string;
  decision: string;
  confidence: number;
  reasoning: {
    factors: Array<{
      factor: string;
      weight: number;
      impact: 'positive' | 'negative' | 'neutral';
      description: string;
    }>;
    alternatives: Array<{
      option: string;
      score: number;
      pros: string[];
      cons: string[];
      reasoning: string;
    }>;
    methodology: string;
    assumptions: string[];
  };
  outcome?: {
    success: boolean;
    actualResult: string;
    deviationFromExpected: number;
    lessons: string[];
  };
  humanFeedback?: {
    rating: number;
    comments: string;
    corrections?: string[];
  };
  related: string[]; // Related decision IDs
  tags: string[];
}

export interface SwarmDecisionPattern {
  id: string;
  pattern: string;
  frequency: number;
  successRate: number;
  avgConfidence: number;
  commonFactors: string[];
  improvementSuggestions: string[];
  examples: string[];
}

export interface AgentMessage {
  id: string;
  agentId: string;
  agentName: string;
  content: string;
  timestamp: Date;
  type: string;
  metadata: {
    confidence: number;
    reasoning?: string[];
    alternatives?: string[];
  };
}

interface TransparencyInsightsProps {
  insights: DecisionPoint[];
  swarmId?: string;
  messages: AgentMessage[];
  websocketUrl?: string;
  theme?: 'light' | 'dark';
  className?: string;
  onDecisionFeedback?: (decisionId: string, feedback: any) => void;
  enableRealTimeAnalysis?: boolean;
  playwrightTests?: any[];
  testMetrics?: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    skippedTests: number;
    coverage: number;
    averageDuration: number;
  };
}

const TransparencyInsights: React.FC<TransparencyInsightsProps> = ({
  insights,
  swarmId,
  messages,
  websocketUrl,
  theme = 'light',
  className = '',
  onDecisionFeedback,
  enableRealTimeAnalysis = true,
  playwrightTests = [],
  testMetrics = {
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    skippedTests: 0,
    coverage: 0,
    averageDuration: 0
  }
}) => {
  // State management
  const [selectedDecision, setSelectedDecision] = useState<DecisionPoint | null>(null);
  const [viewMode, setViewMode] = useState<'timeline' | 'patterns' | 'analysis' | 'feedback' | 'testing'>('timeline');
  const [filterAgent, setFilterAgent] = useState<string>('all');
  const [filterConfidence, setFilterConfidence] = useState<number>(0);
  const [feedbackForm, setFeedbackForm] = useState<{
    decisionId: string;
    rating: number;
    comments: string;
  } | null>(null);
  const [analysisResults, setAnalysisResults] = useState<any>(null);
  const [realTimeDecisions, setRealTimeDecisions] = useState<DecisionPoint[]>([]);

  // WebSocket connection for real-time decision tracking
  useEffect(() => {
    if (!enableRealTimeAnalysis || !websocketUrl) return;

    const ws = new WebSocket(websocketUrl);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'decision-point') {
          setRealTimeDecisions(prev => [data.decision, ...prev.slice(0, 99)]); // Keep last 100
        } else if (data.type === 'decision-analysis') {
          setAnalysisResults(data.analysis);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    };

    return () => {
      ws.close();
    };
  }, [websocketUrl, enableRealTimeAnalysis]);

  // Combine insights with real-time decisions
  const allDecisions = useMemo(() => {
    return [...realTimeDecisions, ...insights]
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [insights, realTimeDecisions]);

  // Filter decisions
  const filteredDecisions = useMemo(() => {
    let filtered = [...allDecisions];

    if (filterAgent !== 'all') {
      filtered = filtered.filter(d => d.agentId === filterAgent);
    }

    if (filterConfidence > 0) {
      filtered = filtered.filter(d => d.confidence >= filterConfidence / 100);
    }

    return filtered;
  }, [allDecisions, filterAgent, filterConfidence]);

  // Get unique agents
  const agents = useMemo(() => {
    return [...new Set(allDecisions.map(d => d.agentName))];
  }, [allDecisions]);

  // Analyze decision patterns
  const decisionPatterns = useMemo(() => {
    const patterns: Map<string, SwarmDecisionPattern> = new Map();
    
    filteredDecisions.forEach(decision => {
      const pattern = decision.reasoning.methodology;
      if (!patterns.has(pattern)) {
        patterns.set(pattern, {
          id: pattern,
          pattern,
          frequency: 0,
          successRate: 0,
          avgConfidence: 0,
          commonFactors: [],
          improvementSuggestions: [],
          examples: []
        });
      }
      
      const p = patterns.get(pattern)!;
      p.frequency++;
      p.avgConfidence += decision.confidence;
      
      if (decision.outcome) {
        p.successRate += decision.outcome.success ? 1 : 0;
      }
      
      if (p.examples.length < 3) {
        p.examples.push(decision.decision);
      }
    });
    
    // Calculate averages
    patterns.forEach(pattern => {
      pattern.avgConfidence /= pattern.frequency;
      pattern.successRate /= pattern.frequency;
    });
    
    return Array.from(patterns.values());
  }, [filteredDecisions]);

  // Handle feedback submission
  const handleFeedbackSubmit = useCallback(() => {
    if (feedbackForm && onDecisionFeedback) {
      onDecisionFeedback(feedbackForm.decisionId, {
        rating: feedbackForm.rating,
        comments: feedbackForm.comments
      });
      setFeedbackForm(null);
    }
  }, [feedbackForm, onDecisionFeedback]);

  // Get confidence color
  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return '#10B981';
    if (confidence >= 0.6) return '#F59E0B';
    if (confidence >= 0.4) return '#EF4444';
    return '#7C2D12';
  };

  // Format timestamp
  const formatTimestamp = (timestamp: Date) => {
    return timestamp.toLocaleString();
  };

  // Render timeline view
  const renderTimeline = () => {
    return (
      <div className="timeline-view">
        {filteredDecisions.map((decision, index) => (
          <div 
            key={decision.id}
            className={`timeline-item ${selectedDecision?.id === decision.id ? 'selected' : ''}`}
            onClick={() => setSelectedDecision(decision)}
          >
            <div className="timeline-marker">
              <div 
                className="confidence-indicator"
                style={{ backgroundColor: getConfidenceColor(decision.confidence) }}
                title={`Confidence: ${(decision.confidence * 100).toFixed(1)}%`}
              />
            </div>
            
            <div className="timeline-content">
              <div className="decision-header">
                <div className="decision-info">
                  <span className="agent-name">{decision.agentName}</span>
                  <span className="timestamp">{formatTimestamp(decision.timestamp)}</span>
                  <span className="confidence">{(decision.confidence * 100).toFixed(1)}%</span>
                </div>
                
                {decision.outcome && (
                  <div className={`outcome-indicator ${decision.outcome.success ? 'success' : 'failure'}`}>
                    {decision.outcome.success ? '✅' : '❌'}
                  </div>
                )}
              </div>
              
              <div className="decision-summary">
                <div className="context">{decision.context}</div>
                <div className="decision">{decision.decision}</div>
              </div>
              
              <div className="reasoning-preview">
                <strong>Key factors:</strong>
                {decision.reasoning.factors.slice(0, 3).map((factor, idx) => (
                  <span key={idx} className="factor-tag" data-impact={factor.impact}>
                    {factor.factor}
                  </span>
                ))}
                {decision.reasoning.factors.length > 3 && (
                  <span className="more-factors">+{decision.reasoning.factors.length - 3} more</span>
                )}
              </div>
              
              {decision.tags.length > 0 && (
                <div className="tags">
                  {decision.tags.map(tag => (
                    <span key={tag} className="tag">{tag}</span>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  // Render patterns view
  const renderPatterns = () => {
    return (
      <div className="patterns-view">
        <div className="patterns-grid">
          {decisionPatterns.map(pattern => (
            <div key={pattern.id} className="pattern-card">
              <div className="pattern-header">
                <h3>{pattern.pattern}</h3>
                <div className="pattern-stats">
                  <span className="frequency">Used {pattern.frequency} times</span>
                  <span className="success-rate">{(pattern.successRate * 100).toFixed(1)}% success</span>
                </div>
              </div>
              
              <div className="pattern-metrics">
                <div className="metric">
                  <span className="metric-label">Avg Confidence:</span>
                  <div className="confidence-bar">
                    <div 
                      className="confidence-fill"
                      style={{ 
                        width: `${pattern.avgConfidence * 100}%`,
                        backgroundColor: getConfidenceColor(pattern.avgConfidence)
                      }}
                    />
                  </div>
                  <span className="metric-value">{(pattern.avgConfidence * 100).toFixed(1)}%</span>
                </div>
              </div>
              
              <div className="pattern-examples">
                <h4>Examples:</h4>
                <ul>
                  {pattern.examples.map((example, idx) => (
                    <li key={idx}>{example.substring(0, 80)}...</li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // Render analysis view
  const renderAnalysis = () => {
    const totalDecisions = filteredDecisions.length;
    const successfulDecisions = filteredDecisions.filter(d => d.outcome?.success).length;
    const avgConfidence = totalDecisions > 0 ? 
      filteredDecisions.reduce((sum, d) => sum + d.confidence, 0) / totalDecisions : 0;
    
    return (
      <div className="analysis-view">
        <div className="analysis-summary">
          <div className="summary-cards">
            <div className="summary-card">
              <h3>Total Decisions</h3>
              <div className="card-value">{totalDecisions}</div>
            </div>
            
            <div className="summary-card">
              <h3>Success Rate</h3>
              <div className="card-value">
                {totalDecisions > 0 ? (successfulDecisions / totalDecisions * 100).toFixed(1) : 0}%
              </div>
            </div>
            
            <div className="summary-card">
              <h3>Avg Confidence</h3>
              <div className="card-value">{(avgConfidence * 100).toFixed(1)}%</div>
            </div>
            
            <div className="summary-card">
              <h3>Patterns Identified</h3>
              <div className="card-value">{decisionPatterns.length}</div>
            </div>
          </div>
        </div>
        
        <div className="analysis-charts">
          <div className="chart-section">
            <h3>Decision Distribution by Agent</h3>
            <div className="agent-distribution">
              {agents.map(agent => {
                const agentDecisions = filteredDecisions.filter(d => d.agentName === agent);
                const percentage = totalDecisions > 0 ? 
                  (agentDecisions.length / totalDecisions * 100) : 0;
                
                return (
                  <div key={agent} className="agent-bar">
                    <span className="agent-label">{agent}</span>
                    <div className="bar">
                      <div 
                        className="bar-fill"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <span className="bar-value">{agentDecisions.length}</span>
                  </div>
                );
              })}
            </div>
          </div>
          
          <div className="chart-section">
            <h3>Confidence Distribution</h3>
            <div className="confidence-histogram">
              {[0.2, 0.4, 0.6, 0.8, 1.0].map(threshold => {
                const count = filteredDecisions.filter(d => 
                  d.confidence >= threshold - 0.2 && d.confidence < threshold
                ).length;
                const percentage = totalDecisions > 0 ? (count / totalDecisions * 100) : 0;
                
                return (
                  <div key={threshold} className="histogram-bar">
                    <div 
                      className="bar-fill"
                      style={{ 
                        height: `${percentage}%`,
                        backgroundColor: getConfidenceColor(threshold - 0.1)
                      }}
                    />
                    <span className="bar-label">{((threshold - 0.2) * 100).toFixed(0)}-{(threshold * 100).toFixed(0)}%</span>
                    <span className="bar-count">{count}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {analysisResults && (
          <div className="ai-analysis">
            <h3>AI-Generated Insights</h3>
            <div className="insights-content">
              <div className="insight-section">
                <h4>Key Patterns:</h4>
                <ul>
                  {analysisResults.patterns?.map((pattern: string, idx: number) => (
                    <li key={idx}>{pattern}</li>
                  ))}
                </ul>
              </div>
              
              <div className="insight-section">
                <h4>Improvement Recommendations:</h4>
                <ul>
                  {analysisResults.recommendations?.map((rec: string, idx: number) => (
                    <li key={idx}>{rec}</li>
                  ))}
                </ul>
              </div>
              
              <div className="insight-section">
                <h4>Risk Factors:</h4>
                <ul>
                  {analysisResults.risks?.map((risk: string, idx: number) => (
                    <li key={idx}>{risk}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Render feedback view
  const renderFeedback = () => {
    const decisionsWithFeedback = filteredDecisions.filter(d => d.humanFeedback);
    const decisionsNeedingFeedback = filteredDecisions.filter(d => !d.humanFeedback);
    
    return (
      <div className="feedback-view">
        <div className="feedback-summary">
          <div className="feedback-stats">
            <span>Decisions with feedback: {decisionsWithFeedback.length}</span>
            <span>Pending feedback: {decisionsNeedingFeedback.length}</span>
          </div>
        </div>
        
        <div className="feedback-sections">
          <div className="section">
            <h3>Pending Feedback</h3>
            <div className="decisions-list">
              {decisionsNeedingFeedback.slice(0, 10).map(decision => (
                <div key={decision.id} className="decision-item">
                  <div className="decision-summary">
                    <span className="agent">{decision.agentName}</span>
                    <span className="timestamp">{formatTimestamp(decision.timestamp)}</span>
                    <span className="decision-text">{decision.decision}</span>
                  </div>
                  
                  <button
                    className="feedback-btn"
                    onClick={() => setFeedbackForm({
                      decisionId: decision.id,
                      rating: 5,
                      comments: ''
                    })}
                  >
                    Provide Feedback
                  </button>
                </div>
              ))}
            </div>
          </div>
          
          <div className="section">
            <h3>Recent Feedback</h3>
            <div className="feedback-list">
              {decisionsWithFeedback.slice(0, 10).map(decision => (
                <div key={decision.id} className="feedback-item">
                  <div className="decision-info">
                    <span className="agent">{decision.agentName}</span>
                    <span className="timestamp">{formatTimestamp(decision.timestamp)}</span>
                  </div>
                  
                  <div className="feedback-details">
                    <div className="rating">
                      Rating: {'★'.repeat(decision.humanFeedback!.rating)}{'☆'.repeat(5 - decision.humanFeedback!.rating)}
                    </div>
                    <div className="comments">{decision.humanFeedback!.comments}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Render testing view
  const renderTesting = () => {
    const testSuccessRate = testMetrics.totalTests > 0 ?
      (testMetrics.passedTests / testMetrics.totalTests) * 100 : 0;

    const recentFailedTests = playwrightTests.filter(test => test.status === 'failed').slice(0, 5);
    const recentSlowTests = playwrightTests
      .filter(test => test.duration && test.duration > 5000)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0))
      .slice(0, 5);

    return (
      <div className="testing-view">
        <div className="test-overview">
          <div className="test-metrics-grid">
            <div className="metric-card">
              <h3>Test Coverage</h3>
              <div className="metric-value">{testMetrics.coverage.toFixed(1)}%</div>
              <div className="metric-trend">
                {testMetrics.coverage >= 80 ? '✅ Good' : testMetrics.coverage >= 60 ? '⚠️ Fair' : '❌ Poor'}
              </div>
            </div>

            <div className="metric-card">
              <h3>Success Rate</h3>
              <div className="metric-value">{testSuccessRate.toFixed(1)}%</div>
              <div className="metric-trend">
                {testSuccessRate >= 90 ? '✅ Excellent' : testSuccessRate >= 80 ? '⚠️ Good' : '❌ Needs Attention'}
              </div>
            </div>

            <div className="metric-card">
              <h3>Avg Duration</h3>
              <div className="metric-value">{Math.round(testMetrics.averageDuration / 1000)}s</div>
              <div className="metric-trend">
                {testMetrics.averageDuration < 3000 ? '✅ Fast' : testMetrics.averageDuration < 10000 ? '⚠️ Moderate' : '❌ Slow'}
              </div>
            </div>

            <div className="metric-card">
              <h3>Total Tests</h3>
              <div className="metric-value">{testMetrics.totalTests}</div>
              <div className="metric-breakdown">
                <span className="passed">✅ {testMetrics.passedTests}</span>
                <span className="failed">❌ {testMetrics.failedTests}</span>
                <span className="skipped">⏭️ {testMetrics.skippedTests}</span>
              </div>
            </div>
          </div>
        </div>

        <div className="test-sections">
          <div className="section">
            <h3>🚨 Failed Tests ({recentFailedTests.length})</h3>
            {recentFailedTests.length > 0 ? (
              <div className="test-items">
                {recentFailedTests.map(test => (
                  <div key={test.id} className="test-item failed">
                    <div className="test-info">
                      <span className="test-name">{test.name || test.path}</span>
                      <span className="test-browser">{test.browser}</span>
                      <span className="test-timestamp">
                        {test.timestamp ? new Date(test.timestamp).toLocaleString() : 'N/A'}
                      </span>
                    </div>
                    {test.error && (
                      <div className="test-error">
                        <strong>Error:</strong> {test.error}
                      </div>
                    )}
                    <div className="test-actions">
                      <button className="btn-rerun">🔄 Re-run</button>
                      <button className="btn-debug">🐛 Debug</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">🎉 No failed tests - great job!</div>
            )}
          </div>

          <div className="section">
            <h3>🐌 Slow Tests ({recentSlowTests.length})</h3>
            {recentSlowTests.length > 0 ? (
              <div className="test-items">
                {recentSlowTests.map(test => (
                  <div key={test.id} className="test-item slow">
                    <div className="test-info">
                      <span className="test-name">{test.name || test.path}</span>
                      <span className="test-duration">⏱️ {Math.round((test.duration || 0) / 1000)}s</span>
                      <span className="test-browser">{test.browser}</span>
                    </div>
                    <div className="test-actions">
                      <button className="btn-optimize">⚡ Optimize</button>
                      <button className="btn-profile">📊 Profile</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">⚡ All tests are running efficiently!</div>
            )}
          </div>
        </div>

        <div className="test-insights">
          <h3>📊 Quality Insights</h3>
          <div className="insights-grid">
            <div className="insight-card">
              <h4>Test Stability</h4>
              <div className="insight-content">
                {testSuccessRate >= 95 ? (
                  <span className="positive">✅ Tests are very stable</span>
                ) : testSuccessRate >= 85 ? (
                  <span className="warning">⚠️ Some flaky tests detected</span>
                ) : (
                  <span className="negative">❌ Test stability needs improvement</span>
                )}
              </div>
            </div>

            <div className="insight-card">
              <h4>Coverage Analysis</h4>
              <div className="insight-content">
                {testMetrics.coverage >= 90 ? (
                  <span className="positive">✅ Excellent coverage</span>
                ) : testMetrics.coverage >= 70 ? (
                  <span className="warning">⚠️ Good coverage, room for improvement</span>
                ) : (
                  <span className="negative">❌ Coverage below recommended threshold</span>
                )}
              </div>
            </div>

            <div className="insight-card">
              <h4>Performance Impact</h4>
              <div className="insight-content">
                {testMetrics.averageDuration < 5000 ? (
                  <span className="positive">✅ Fast execution times</span>
                ) : testMetrics.averageDuration < 15000 ? (
                  <span className="warning">⚠️ Moderate execution times</span>
                ) : (
                  <span className="negative">❌ Slow tests impacting CI/CD</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="recent-activity">
          <h3>🔍 Recent Test Activity</h3>
          <div className="activity-timeline">
            {playwrightTests.slice(0, 10).map(test => (
              <div key={test.id} className={`activity-item ${test.status}`}>
                <div className="activity-icon">
                  {test.status === 'running' ? '🔄' :
                   test.status === 'passed' ? '✅' :
                   test.status === 'failed' ? '❌' : '⏸️'}
                </div>
                <div className="activity-content">
                  <div className="activity-title">{test.name || test.path}</div>
                  <div className="activity-details">
                    <span>{test.browser}</span>
                    {test.duration && <span>{Math.round(test.duration / 1000)}s</span>}
                    <span>{test.timestamp ? new Date(test.timestamp).toLocaleTimeString() : 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={`transparency-insights ${theme} ${className}`}>
      {/* Header */}
      <div className="insights-header">
        <h2>Decision Transparency</h2>
        <div className="header-controls">
          <div className="view-modes">
            {['timeline', 'patterns', 'analysis', 'feedback', 'testing'].map(mode => (
              <button
                key={mode}
                className={`mode-btn ${viewMode === mode ? 'active' : ''}`}
                onClick={() => setViewMode(mode as any)}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          
          <div className="filters">
            <select 
              value={filterAgent} 
              onChange={(e) => setFilterAgent(e.target.value)}
            >
              <option value="all">All Agents</option>
              {agents.map(agent => (
                <option key={agent} value={agent}>{agent}</option>
              ))}
            </select>
            
            <div className="confidence-filter">
              <label>Min Confidence: {filterConfidence}%</label>
              <input
                type="range"
                min="0"
                max="100"
                value={filterConfidence}
                onChange={(e) => setFilterConfidence(Number(e.target.value))}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="insights-content">
        {viewMode === 'timeline' && renderTimeline()}
        {viewMode === 'patterns' && renderPatterns()}
        {viewMode === 'analysis' && renderAnalysis()}
        {viewMode === 'feedback' && renderFeedback()}
        {viewMode === 'testing' && renderTesting()}
      </div>

      {/* Decision Details Modal */}
      {selectedDecision && (
        <div className="decision-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Decision Analysis</h3>
              <button 
                className="close-btn"
                onClick={() => setSelectedDecision(null)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="decision-overview">
                <div className="overview-item">
                  <strong>Agent:</strong> {selectedDecision.agentName}
                </div>
                <div className="overview-item">
                  <strong>Time:</strong> {formatTimestamp(selectedDecision.timestamp)}
                </div>
                <div className="overview-item">
                  <strong>Confidence:</strong> {(selectedDecision.confidence * 100).toFixed(1)}%
                </div>
                <div className="overview-item">
                  <strong>Context:</strong> {selectedDecision.context}
                </div>
                <div className="overview-item">
                  <strong>Decision:</strong> {selectedDecision.decision}
                </div>
              </div>
              
              <div className="reasoning-details">
                <h4>Decision Factors</h4>
                <div className="factors-list">
                  {selectedDecision.reasoning.factors.map((factor, idx) => (
                    <div key={idx} className={`factor-item ${factor.impact}`}>
                      <div className="factor-header">
                        <span className="factor-name">{factor.factor}</span>
                        <span className="factor-weight">Weight: {(factor.weight * 100).toFixed(1)}%</span>
                      </div>
                      <div className="factor-description">{factor.description}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              {selectedDecision.reasoning.alternatives.length > 0 && (
                <div className="alternatives-section">
                  <h4>Alternative Options Considered</h4>
                  {selectedDecision.reasoning.alternatives.map((alt, idx) => (
                    <div key={idx} className="alternative-item">
                      <div className="alt-header">
                        <span className="alt-option">{alt.option}</span>
                        <span className="alt-score">Score: {(alt.score * 100).toFixed(1)}</span>
                      </div>
                      <div className="alt-details">
                        <div className="pros">
                          <strong>Pros:</strong>
                          <ul>
                            {alt.pros.map((pro, pidx) => <li key={pidx}>{pro}</li>)}
                          </ul>
                        </div>
                        <div className="cons">
                          <strong>Cons:</strong>
                          <ul>
                            {alt.cons.map((con, cidx) => <li key={cidx}>{con}</li>)}
                          </ul>
                        </div>
                        <div className="alt-reasoning">
                          <strong>Reasoning:</strong> {alt.reasoning}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="methodology-section">
                <h4>Decision Methodology</h4>
                <p>{selectedDecision.reasoning.methodology}</p>
                
                <h4>Assumptions</h4>
                <ul>
                  {selectedDecision.reasoning.assumptions.map((assumption, idx) => (
                    <li key={idx}>{assumption}</li>
                  ))}
                </ul>
              </div>
              
              {selectedDecision.outcome && (
                <div className="outcome-section">
                  <h4>Actual Outcome</h4>
                  <div className={`outcome-status ${selectedDecision.outcome.success ? 'success' : 'failure'}`}>
                    {selectedDecision.outcome.success ? 'Success' : 'Failure'}
                  </div>
                  <div className="outcome-details">
                    <p><strong>Result:</strong> {selectedDecision.outcome.actualResult}</p>
                    <p><strong>Deviation from Expected:</strong> {(selectedDecision.outcome.deviationFromExpected * 100).toFixed(1)}%</p>
                    
                    <h5>Lessons Learned:</h5>
                    <ul>
                      {selectedDecision.outcome.lessons.map((lesson, idx) => (
                        <li key={idx}>{lesson}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-primary"
                onClick={() => setFeedbackForm({
                  decisionId: selectedDecision.id,
                  rating: 5,
                  comments: ''
                })}
              >
                Provide Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Feedback Form Modal */}
      {feedbackForm && (
        <div className="feedback-modal">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Decision Feedback</h3>
              <button 
                className="close-btn"
                onClick={() => setFeedbackForm(null)}
              >
                ×
              </button>
            </div>
            
            <div className="modal-body">
              <div className="rating-section">
                <label>Rating (1-5 stars):</label>
                <div className="star-rating">
                  {[1, 2, 3, 4, 5].map(star => (
                    <button
                      key={star}
                      className={`star ${star <= feedbackForm.rating ? 'active' : ''}`}
                      onClick={() => setFeedbackForm(prev => prev ? { ...prev, rating: star } : null)}
                    >
                      ★
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="comments-section">
                <label>Comments:</label>
                <textarea
                  value={feedbackForm.comments}
                  onChange={(e) => setFeedbackForm(prev => 
                    prev ? { ...prev, comments: e.target.value } : null
                  )}
                  placeholder="Provide feedback on this decision..."
                  rows={4}
                />
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                className="btn btn-primary"
                onClick={handleFeedbackSubmit}
              >
                Submit Feedback
              </button>
              <button 
                className="btn btn-secondary"
                onClick={() => setFeedbackForm(null)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TransparencyInsights;