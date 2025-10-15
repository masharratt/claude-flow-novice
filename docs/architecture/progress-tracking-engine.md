# Progress Tracking Engine Design

## Overview

The Progress Tracking Engine is a sophisticated system designed to provide granular, real-time progress monitoring for multi-agent swarm operations. It aggregates progress data from individual agents, computes hierarchical progress metrics, and provides predictive analytics for task completion.

## Architecture Overview

### Core Components

```typescript
interface ProgressTrackingConfig {
  aggregationInterval: number; // milliseconds
  historyRetention: number; // days
  predictionWindow: number; // hours
  milestoneThreshold: number; // percentage
  alertThresholds: AlertThresholds;
}

interface AlertThresholds {
  stuckTask: number; // hours without progress
  lowConfidence: number; // confidence threshold
  highErrorRate: number; // error rate threshold
  resourceExhaustion: number; // resource usage threshold
}

class ProgressTrackingEngine extends EventEmitter {
  private progressStore: ProgressStore;
  private aggregationEngine: ProgressAggregationEngine;
  private predictionEngine: ProgressPredictionEngine;
  private milestoneTracker: MilestoneTracker;
  private alertManager: AlertManager;
  private analyticsEngine: ProgressAnalyticsEngine;
  
  constructor(config: ProgressTrackingConfig);
  
  // Core progress tracking
  async updateProgress(update: ProgressUpdate): Promise<void>;
  async getProgress(taskId: string): Promise<TaskProgress>;
  async getSwarmProgress(swarmId: string): Promise<SwarmProgress>;
  
  // Prediction and analytics
  async predictCompletion(taskId: string): Promise<CompletionPrediction>;
  async getProgressTrends(timeRange: TimeRange): Promise<ProgressTrend[]>;
  
  // Milestone management
  async defineMilestone(milestone: MilestoneDefinition): Promise<void>;
  async checkMilestones(taskId: string): Promise<MilestoneAchievement[]>;
  
  // Alert management
  async checkAlerts(): Promise<Alert[]>;
  async acknowledgeAlert(alertId: string): Promise<void>;
}
```

## Progress Data Model

### Progress Update Structure

```typescript
interface ProgressUpdate {
  // Identification
  agentId: string;
  taskId: string;
  operationId?: string;
  updateId: string;
  timestamp: number;
  
  // Progress information
  currentStep: number;
  totalSteps: number;
  stepDescription: string;
  progressPercentage: number;
  
  // Timing information
  stepStartTime: number;
  stepEstimatedDuration?: number;
  taskStartTime: number;
  taskEstimatedCompletion?: number;
  
  // Quality and confidence
  confidence: number; // 0.0 to 1.0
  quality: QualityMetrics;
  
  // Dependencies and blockers
  dependencies: DependencyInfo[];
  blockers: BlockerInfo[];
  
  // Resource usage
  resources: ResourceUsage;
  
  // Context information
  context: ProgressContext;
  
  // Metadata
  metadata: ProgressMetadata;
}

interface QualityMetrics {
  accuracy?: number;
  completeness?: number;
  consistency?: number;
  performance?: number;
  overallScore: number;
}

interface DependencyInfo {
  taskId: string;
  type: 'hard' | 'soft';
  status: 'pending' | 'completed' | 'failed';
  estimatedCompletion?: number;
}

interface BlockerInfo {
  type: 'dependency' | 'resource' | 'error' | 'external';
  description: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  estimatedResolution?: number;
  resolution?: string;
}

interface ResourceUsage {
  cpu: number;
  memory: number;
  network: number;
  disk: number;
  customResources: Record<string, number>;
}

interface ProgressContext {
  previousStep?: string;
  nextStep?: string;
  relatedOperations: string[];
  affectedAgents: string[];
  environment: Record<string, any>;
}

interface ProgressMetadata {
  source: 'agent' | 'system' | 'manual';
  verified: boolean;
  tags: string[];
  correlationId?: string;
}
```

### Hierarchical Progress Structure

```typescript
interface TaskProgress {
  // Basic information
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  
  // Progress metrics
  currentProgress: number;
  overallProgress: number;
  weightedProgress: number;
  
  // Timing information
  startTime: number;
  estimatedCompletion: number;
  actualCompletion?: number;
  duration: number;
  remainingTime: number;
  
  // Step information
  currentStep: TaskStep;
  completedSteps: TaskStep[];
  remainingSteps: TaskStep[];
  totalSteps: number;
  
  // Agent information
  assignedAgent: string;
  contributingAgents: string[];
  
  // Quality metrics
  confidence: number;
  quality: QualityMetrics;
  errorRate: number;
  
  // Dependencies
  dependencies: DependencyInfo[];
  dependents: string[];
  
  // Milestones
  milestones: MilestoneAchievement[];
  upcomingMilestones: MilestoneDefinition[];
  
  // History
  progressHistory: ProgressHistoryEntry[];
  stateTransitions: StateTransition[];
  
  // Analytics
  progressVelocity: number;
  efficiency: number;
  predictedAccuracy: number;
}

interface TaskStep {
  stepId: string;
  title: string;
  description: string;
  status: StepStatus;
  progress: number;
  startTime?: number;
  endTime?: number;
  estimatedDuration?: number;
  actualDuration?: number;
  dependencies: string[];
  output?: any;
  quality?: QualityMetrics;
}

enum TaskStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  BLOCKED = 'blocked',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled'
}

enum StepStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  SKIPPED = 'skipped'
}
```

## Progress Aggregation Engine

### Hierarchical Aggregation

```typescript
class ProgressAggregationEngine {
  private aggregationRules: Map<string, AggregationRule>;
  private weightCalculator: WeightCalculator;
  
  async aggregateTaskProgress(taskId: string): Promise<TaskProgress> {
    // Get all progress updates for the task
    const updates = await this.progressStore.getTaskUpdates(taskId);
    
    // Calculate basic progress metrics
    const basicProgress = this.calculateBasicProgress(updates);
    
    // Apply weighting rules
    const weightedProgress = await this.applyWeighting(taskId, basicProgress);
    
    // Calculate derived metrics
    const derivedMetrics = this.calculateDerivedMetrics(updates, weightedProgress);
    
    // Combine into final progress object
    return this.combineProgressMetrics(taskId, weightedProgress, derivedMetrics);
  }
  
  async aggregateSwarmProgress(swarmId: string): Promise<SwarmProgress> {
    // Get all agents in the swarm
    const agents = await this.swarmManager.getSwarmAgents(swarmId);
    
    // Get progress for each agent
    const agentProgresses = await Promise.all(
      agents.map(agent => this.getAgentProgress(agent.id))
    );
    
    // Calculate swarm-level metrics
    const swarmMetrics = this.calculateSwarmMetrics(agentProgresses);
    
    // Identify bottlenecks and critical path
    const analysis = await this.analyzeSwarmDynamics(agentProgresses);
    
    return {
      swarmId,
      overallProgress: swarmMetrics.overallProgress,
      agentProgresses,
      bottlenecks: analysis.bottlenecks,
      criticalPath: analysis.criticalPath,
      efficiency: swarmMetrics.efficiency,
      estimatedCompletion: swarmMetrics.estimatedCompletion,
      health: swarmMetrics.health,
      alerts: analysis.alerts
    };
  }
  
  private calculateBasicProgress(updates: ProgressUpdate[]): BasicProgressMetrics {
    if (updates.length === 0) {
      return { progress: 0, confidence: 0, quality: 0 };
    }
    
    const latestUpdate = updates[updates.length - 1];
    const recentUpdates = updates.filter(u => 
      Date.now() - u.timestamp < 300000 // Last 5 minutes
    );
    
    // Calculate progress velocity
    const velocity = this.calculateProgressVelocity(recentUpdates);
    
    // Calculate trend
    const trend = this.calculateProgressTrend(updates);
    
    // Calculate confidence based on consistency
    const confidence = this.calculateConfidence(recentUpdates);
    
    return {
      progress: latestUpdate.progressPercentage,
      velocity,
      trend,
      confidence,
      lastUpdate: latestUpdate.timestamp,
      updateFrequency: recentUpdates.length
    };
  }
  
  private async applyWeighting(
    taskId: string, 
    basicProgress: BasicProgressMetrics
  ): Promise<WeightedProgressMetrics> {
    const task = await this.taskStore.getTask(taskId);
    const rules = this.aggregationRules.get(task.type) || this.getDefaultRules();
    
    let weightedProgress = basicProgress.progress;
    
    // Apply importance weighting
    weightedProgress *= rules.importanceWeight;
    
    // Apply complexity weighting
    weightedProgress *= rules.complexityWeight;
    
    // Apply agent capability weighting
    const agentWeight = await this.weightCalculator.calculateAgentWeight(
      task.assignedAgent,
      task.type
    );
    weightedProgress *= agentWeight;
    
    // Apply historical performance weighting
    const historicalWeight = await this.weightCalculator.calculateHistoricalWeight(
      task.assignedAgent,
      task.type
    );
    weightedProgress *= historicalWeight;
    
    return {
      ...basicProgress,
      weightedProgress: Math.min(100, weightedProgress),
      weights: {
        importance: rules.importanceWeight,
        complexity: rules.complexityWeight,
        agent: agentWeight,
        historical: historicalWeight
      }
    };
  }
  
  private calculateProgressVelocity(updates: ProgressUpdate[]): number {
    if (updates.length < 2) return 0;
    
    const recent = updates.slice(-10); // Last 10 updates
    let totalProgress = 0;
    let totalTime = 0;
    
    for (let i = 1; i < recent.length; i++) {
      const progressDiff = recent[i].progressPercentage - recent[i-1].progressPercentage;
      const timeDiff = recent[i].timestamp - recent[i-1].timestamp;
      
      totalProgress += progressDiff;
      totalTime += timeDiff;
    }
    
    return totalTime > 0 ? (totalProgress / totalTime) * 1000 : 0; // Progress per second
  }
  
  private calculateProgressTrend(updates: ProgressUpdate[]): ProgressTrend {
    if (updates.length < 3) return 'stable';
    
    const recent = updates.slice(-10);
    const progressValues = recent.map(u => u.progressPercentage);
    
    // Simple linear regression to determine trend
    const n = progressValues.length;
    const x = Array.from({length: n}, (_, i) => i);
    const y = progressValues;
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    
    if (slope > 0.5) return 'accelerating';
    if (slope > 0.1) return 'improving';
    if (slope < -0.5) return 'decelerating';
    if (slope < -0.1) return 'declining';
    return 'stable';
  }
}
```

### Swarm-Level Aggregation

```typescript
interface SwarmProgress {
  swarmId: string;
  overallProgress: number;
  agentProgresses: AgentProgress[];
  bottlenecks: BottleneckInfo[];
  criticalPath: CriticalPathInfo[];
  efficiency: number;
  estimatedCompletion: number;
  health: SwarmHealth;
  alerts: SwarmAlert[];
}

interface AgentProgress {
  agentId: string;
  agentType: string;
  currentTasks: TaskProgress[];
  completedTasks: TaskProgress[];
  overallProgress: number;
  efficiency: number;
  health: AgentHealth;
  collaboration: CollaborationMetrics;
}

interface BottleneckInfo {
  agentId: string;
  taskId: string;
  type: 'performance' | 'dependency' | 'resource' | 'coordination';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  impact: string;
  estimatedDelay: number;
  resolution?: string;
}

interface CriticalPathInfo {
  tasks: string[];
  totalDuration: number;
  slack: number;
  criticalAgents: string[];
  riskFactors: string[];
}

class SwarmAggregator {
  async analyzeSwarmDynamics(agentProgresses: AgentProgress[]): Promise<SwarmAnalysis> {
    // Identify bottlenecks
    const bottlenecks = await this.identifyBottlenecks(agentProgresses);
    
    // Calculate critical path
    const criticalPath = await this.calculateCriticalPath(agentProgresses);
    
    // Analyze collaboration patterns
    const collaboration = await this.analyzeCollaboration(agentProgresses);
    
    // Predict swarm completion
    const prediction = await this.predictSwarmCompletion(agentProgresses);
    
    return {
      bottlenecks,
      criticalPath,
      collaboration,
      prediction,
      recommendations: this.generateRecommendations(bottlenecks, criticalPath)
    };
  }
  
  private async identifyBottlenecks(
    agentProgresses: AgentProgress[]
  ): Promise<BottleneckInfo[]> {
    const bottlenecks: BottleneckInfo[] = [];
    
    for (const agent of agentProgresses) {
      // Performance bottlenecks
      if (agent.efficiency < 0.7) {
        bottlenecks.push({
          agentId: agent.agentId,
          taskId: agent.currentTasks[0]?.taskId || 'unknown',
          type: 'performance',
          severity: agent.efficiency < 0.5 ? 'high' : 'medium',
          description: `Low efficiency: ${(agent.efficiency * 100).toFixed(1)}%`,
          impact: 'Slowing overall swarm progress',
          estimatedDelay: this.calculateDelayImpact(agent)
        });
      }
      
      // Resource bottlenecks
      if (agent.health.resourceUtilization > 0.9) {
        bottlenecks.push({
          agentId: agent.agentId,
          taskId: agent.currentTasks[0]?.taskId || 'unknown',
          type: 'resource',
          severity: 'high',
          description: 'High resource utilization',
          impact: 'Risk of performance degradation',
          estimatedDelay: 300000 // 5 minutes
        });
      }
      
      // Coordination bottlenecks
      if (agent.collaboration.coordinationOverhead > 0.3) {
        bottlenecks.push({
          agentId: agent.agentId,
          taskId: agent.currentTasks[0]?.taskId || 'unknown',
          type: 'coordination',
          severity: 'medium',
          description: 'High coordination overhead',
          impact: 'Excessive time spent on coordination',
          estimatedDelay: this.calculateCoordinationDelay(agent)
        });
      }
    }
    
    return bottlenecks.sort((a, b) => this.getSeverityWeight(b.severity) - this.getSeverityWeight(a.severity));
  }
  
  private async calculateCriticalPath(
    agentProgresses: AgentProgress[]
  ): Promise<CriticalPathInfo[]> {
    // Build dependency graph
    const graph = this.buildDependencyGraph(agentProgresses);
    
    // Find critical paths using longest path algorithm
    const criticalPaths = this.findLongestPaths(graph);
    
    return criticalPaths.map(path => ({
      tasks: path.tasks,
      totalDuration: path.duration,
      slack: path.slack,
      criticalAgents: this.getCriticalAgents(path.tasks, agentProgresses),
      riskFactors: this.identifyRiskFactors(path)
    }));
  }
}
```

## Progress Prediction Engine

### Completion Prediction

```typescript
class ProgressPredictionEngine {
  private historicalData: HistoricalProgressData;
  private mlModels: Map<string, PredictionModel>;
  
  async predictCompletion(taskId: string): Promise<CompletionPrediction> {
    const taskProgress = await this.progressStore.getTaskProgress(taskId);
    const historicalData = await this.getHistoricalData(taskProgress);
    
    // Use multiple prediction methods
    const linearPrediction = this.linearRegressionPrediction(taskProgress, historicalData);
    const velocityPrediction = this.velocityBasedPrediction(taskProgress, historicalData);
    const mlPrediction = await this.machineLearningPrediction(taskProgress, historicalData);
    
    // Ensemble the predictions
    const ensemblePrediction = this.ensemblePredictions([
      { method: 'linear', prediction: linearPrediction, weight: 0.3 },
      { method: 'velocity', prediction: velocityPrediction, weight: 0.3 },
      { method: 'ml', prediction: mlPrediction, weight: 0.4 }
    ]);
    
    // Calculate confidence intervals
    const confidenceInterval = this.calculateConfidenceInterval(
      ensemblePrediction,
      historicalData
    );
    
    return {
      taskId,
      predictedCompletion: ensemblePrediction.estimatedCompletion,
      confidence: ensemblePrediction.confidence,
      confidenceInterval,
      methodology: ensemblePrediction.methodology,
      factors: ensemblePrediction.factors,
      risks: this.identifyPredictionRisks(taskProgress, historicalData)
    };
  }
  
  private linearRegressionPrediction(
    taskProgress: TaskProgress,
    historicalData: HistoricalProgressData
  ): PredictionResult {
    const progressHistory = taskProgress.progressHistory.slice(-20); // Last 20 updates
    
    if (progressHistory.length < 3) {
      return this.defaultPrediction(taskProgress);
    }
    
    // Perform linear regression on progress vs time
    const n = progressHistory.length;
    const x = progressHistory.map(p => p.timestamp);
    const y = progressHistory.map(p => p.progress);
    
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = y.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    // Predict when progress will reach 100%
    if (slope <= 0) {
      return this.defaultPrediction(taskProgress);
    }
    
    const estimatedCompletion = (100 - intercept) / slope;
    const confidence = this.calculateRegressionConfidence(progressHistory);
    
    return {
      estimatedCompletion,
      confidence,
      methodology: 'linear_regression',
      factors: {
        slope,
        intercept,
        dataPoints: n,
        rSquared: this.calculateRSquared(progressHistory, slope, intercept)
      }
    };
  }
  
  private velocityBasedPrediction(
    taskProgress: TaskProgress,
    historicalData: HistoricalProgressData
  ): PredictionResult {
    const currentVelocity = taskProgress.progressVelocity;
    const remainingProgress = 100 - taskProgress.currentProgress;
    
    if (currentVelocity <= 0) {
      return this.defaultPrediction(taskProgress);
    }
    
    // Adjust velocity based on historical patterns
    const velocityAdjustment = this.calculateVelocityAdjustment(
      taskProgress,
      historicalData
    );
    
    const adjustedVelocity = currentVelocity * velocityAdjustment;
    const estimatedTime = remainingProgress / adjustedVelocity;
    const estimatedCompletion = Date.now() + estimatedTime;
    
    // Calculate confidence based on velocity consistency
    const velocityHistory = this.getVelocityHistory(taskProgress);
    const confidence = this.calculateVelocityConfidence(velocityHistory);
    
    return {
      estimatedCompletion,
      confidence,
      methodology: 'velocity_based',
      factors: {
        currentVelocity,
        adjustedVelocity,
        velocityAdjustment,
        remainingProgress,
        velocityConsistency: this.calculateVelocityConsistency(velocityHistory)
      }
    };
  }
  
  private async machineLearningPrediction(
    taskProgress: TaskProgress,
    historicalData: HistoricalProgressData
  ): Promise<PredictionResult> {
    const modelKey = `${taskProgress.taskType}_${taskProgress.assignedAgent}`;
    const model = this.mlModels.get(modelKey);
    
    if (!model) {
      return this.defaultPrediction(taskProgress);
    }
    
    // Prepare features for ML model
    const features = this.extractFeatures(taskProgress, historicalData);
    
    // Get prediction from model
    const prediction = await model.predict(features);
    
    return {
      estimatedCompletion: prediction.completionTime,
      confidence: prediction.confidence,
      methodology: 'machine_learning',
      factors: {
        modelAccuracy: model.accuracy,
        featureImportance: prediction.featureImportance,
        trainingDataSize: model.trainingSize
      }
    };
  }
  
  private ensemblePredictions(
    predictions: WeightedPrediction[]
  ): EnsemblePrediction {
    let weightedTime = 0;
    let totalWeight = 0;
    let weightedConfidence = 0;
    
    const methodologies: string[] = [];
    const factors: Record<string, any> = {};
    
    for (const { method, prediction, weight } of predictions) {
      weightedTime += prediction.estimatedCompletion * weight;
      totalWeight += weight;
      weightedConfidence += prediction.confidence * weight;
      methodologies.push(method);
      
      // Combine factors
      Object.assign(factors, prediction.factors);
    }
    
    const ensembleTime = weightedTime / totalWeight;
    const ensembleConfidence = weightedConfidence / totalWeight;
    
    return {
      estimatedCompletion: ensembleTime,
      confidence: ensembleConfidence,
      methodology: `ensemble_${methodologies.join('_')}`,
      factors,
      componentPredictions: predictions
    };
  }
}
```

## Milestone Tracking

### Milestone Definition and Detection

```typescript
interface MilestoneDefinition {
  milestoneId: string;
  name: string;
  description: string;
  type: MilestoneType;
  condition: MilestoneCondition;
  priority: MilestonePriority;
  dependencies: string[];
  tags: string[];
}

enum MilestoneType {
  PROGRESS = 'progress',           // Based on progress percentage
  TIME = 'time',                  // Based on time elapsed
  QUALITY = 'quality',            // Based on quality metrics
  DEPENDENCY = 'dependency',      // Based on dependency completion
  CUSTOM = 'custom'               // Custom condition
}

interface MilestoneCondition {
  type: MilestoneType;
  operator: 'equals' | 'greater_than' | 'less_than' | 'between';
  value: number | string | boolean;
  secondaryValue?: number;        // For 'between' operator
  customFunction?: string;        // For custom conditions
}

interface MilestoneAchievement {
  milestoneId: string;
  achievedAt: number;
  taskId: string;
  agentId: string;
  progressAtAchievement: number;
  qualityAtAchievement?: QualityMetrics;
  timeToAchievement: number;
  deviationFromExpected?: number;
}

class MilestoneTracker {
  private milestones: Map<string, MilestoneDefinition>;
  private achievements: Map<string, MilestoneAchievement[]>;
  
  async defineMilestone(milestone: MilestoneDefinition): Promise<void> {
    // Validate milestone definition
    this.validateMilestoneDefinition(milestone);
    
    // Store milestone
    this.milestones.set(milestone.milestoneId, milestone);
    
    // Check if milestone is already achieved
    await this.checkMilestoneForExistingTasks(milestone);
    
    this.emit('milestone_defined', milestone);
  }
  
  async checkMilestones(taskId: string): Promise<MilestoneAchievement[]> {
    const taskProgress = await this.progressStore.getTaskProgress(taskId);
    const newAchievements: MilestoneAchievement[] = [];
    
    // Check all defined milestones
    for (const [milestoneId, milestone] of this.milestones.entries()) {
      // Skip if already achieved for this task
      if (await this.isMilestoneAchieved(milestoneId, taskId)) {
        continue;
      }
      
      // Check if milestone condition is met
      if (await this.evaluateMilestoneCondition(milestone, taskProgress)) {
        const achievement = await this.createMilestoneAchievement(
          milestone,
          taskProgress
        );
        
        newAchievements.push(achievement);
        this.recordAchievement(achievement);
        
        this.emit('milestone_achieved', achievement);
      }
    }
    
    return newAchievements;
  }
  
  private async evaluateMilestoneCondition(
    milestone: MilestoneDefinition,
    taskProgress: TaskProgress
  ): Promise<boolean> {
    const { condition } = milestone;
    
    switch (condition.type) {
      case MilestoneType.PROGRESS:
        return this.evaluateProgressCondition(condition, taskProgress);
      
      case MilestoneType.TIME:
        return this.evaluateTimeCondition(condition, taskProgress);
      
      case MilestoneType.QUALITY:
        return this.evaluateQualityCondition(condition, taskProgress);
      
      case MilestoneType.DEPENDENCY:
        return this.evaluateDependencyCondition(condition, taskProgress);
      
      case MilestoneType.CUSTOM:
        return this.evaluateCustomCondition(condition, taskProgress);
      
      default:
        return false;
    }
  }
  
  private evaluateProgressCondition(
    condition: MilestoneCondition,
    taskProgress: TaskProgress
  ): boolean {
    const progress = taskProgress.currentProgress;
    
    switch (condition.operator) {
      case 'equals':
        return progress === condition.value;
      case 'greater_than':
        return progress > condition.value;
      case 'less_than':
        return progress < condition.value;
      case 'between':
        return progress >= condition.value && 
               progress <= (condition.secondaryValue || 100);
      default:
        return false;
    }
  }
  
  private evaluateTimeCondition(
    condition: MilestoneCondition,
    taskProgress: TaskProgress
  ): boolean {
    const currentTime = Date.now();
    const elapsedTime = currentTime - taskProgress.startTime;
    
    switch (condition.operator) {
      case 'greater_than':
        return elapsedTime > condition.value;
      case 'less_than':
        return elapsedTime < condition.value;
      case 'between':
        return elapsedTime >= condition.value && 
               elapsedTime <= (condition.secondaryValue || Infinity);
      default:
        return false;
    }
  }
  
  private evaluateQualityCondition(
    condition: MilestoneCondition,
    taskProgress: TaskProgress
  ): boolean {
    const quality = taskProgress.quality.overallScore;
    
    switch (condition.operator) {
      case 'greater_than':
        return quality > condition.value;
      case 'less_than':
        return quality < condition.value;
      case 'between':
        return quality >= condition.value && 
               quality <= (condition.secondaryValue || 1.0);
      default:
        return false;
    }
  }
  
  private async evaluateDependencyCondition(
    condition: MilestoneCondition,
    taskProgress: TaskProgress
  ): Promise<boolean> {
    if (condition.type !== 'dependency') return false;
    
    const dependencyId = condition.value as string;
    const dependency = await this.taskStore.getTask(dependencyId);
    
    return dependency?.status === TaskStatus.COMPLETED;
  }
  
  private evaluateCustomCondition(
    condition: MilestoneCondition,
    taskProgress: TaskProgress
  ): boolean {
    if (!condition.customFunction) return false;
    
    try {
      // Create safe evaluation context
      const context = this.createEvaluationContext(taskProgress);
      
      // Evaluate custom function (in sandboxed environment)
      return this.evaluateSafely(condition.customFunction, context);
    } catch (error) {
      console.error('Error evaluating custom milestone condition:', error);
      return false;
    }
  }
  
  private createEvaluationContext(taskProgress: TaskProgress): Record<string, any> {
    return {
      progress: taskProgress.currentProgress,
      quality: taskProgress.quality,
      confidence: taskProgress.confidence,
      elapsedTime: Date.now() - taskProgress.startTime,
      completedSteps: taskProgress.completedSteps.length,
      totalSteps: taskProgress.totalSteps,
      errorRate: taskProgress.errorRate,
      agentId: taskProgress.assignedAgent,
      taskId: taskProgress.taskId
    };
  }
  
  private evaluateSafely(functionCode: string, context: Record<string, any>): boolean {
    // Simple sandbox evaluation - in production, use a proper sandbox
    try {
      const func = new Function(...Object.keys(context), `return ${functionCode}`);
      return func(...Object.values(context));
    } catch (error) {
      console.error('Custom function evaluation failed:', error);
      return false;
    }
  }
}
```

## Alert System

### Progress Alert Management

```typescript
interface ProgressAlert {
  alertId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  source: AlertSource;
  timestamp: number;
  acknowledged: boolean;
  resolved: boolean;
  resolution?: string;
  context: AlertContext;
  actions: AlertAction[];
}

enum AlertType {
  STUCK_TASK = 'stuck_task',
  LOW_CONFIDENCE = 'low_confidence',
  HIGH_ERROR_RATE = 'high_error_rate',
  MISSED_MILESTONE = 'missed_milestone',
  RESOURCE_EXHAUSTION = 'resource_exhaustion',
  PREDICTION_ANOMALY = 'prediction_anomaly',
  COORDINATION_FAILURE = 'coordination_failure'
}

enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  ERROR = 'error',
  CRITICAL = 'critical'
}

class AlertManager {
  private alertRules: Map<AlertType, AlertRule[]>;
  private activeAlerts: Map<string, ProgressAlert>;
  private alertHistory: ProgressAlert[];
  
  async checkAlerts(): Promise<ProgressAlert[]> {
    const newAlerts: ProgressAlert[] = [];
    
    // Check all alert rules
    for (const [alertType, rules] of this.alertRules.entries()) {
      for (const rule of rules) {
        const alerts = await this.evaluateAlertRule(rule);
        newAlerts.push(...alerts);
      }
    }
    
    // Filter out duplicates and existing alerts
    const uniqueNewAlerts = this.filterUniqueAlerts(newAlerts);
    
    // Store and emit new alerts
    for (const alert of uniqueNewAlerts) {
      this.activeAlerts.set(alert.alertId, alert);
      this.alertHistory.push(alert);
      this.emit('alert_triggered', alert);
    }
    
    return uniqueNewAlerts;
  }
  
  private async evaluateAlertRule(rule: AlertRule): Promise<ProgressAlert[]> {
    switch (rule.type) {
      case AlertType.STUCK_TASK:
        return await this.checkStuckTasks(rule);
      
      case AlertType.LOW_CONFIDENCE:
        return await this.checkLowConfidence(rule);
      
      case AlertType.HIGH_ERROR_RATE:
        return await this.checkHighErrorRate(rule);
      
      case AlertType.MISSED_MILESTONE:
        return await this.checkMissedMilestones(rule);
      
      case AlertType.RESOURCE_EXHAUSTION:
        return await this.checkResourceExhaustion(rule);
      
      case AlertType.PREDICTION_ANOMALY:
        return await this.checkPredictionAnomalies(rule);
      
      default:
        return [];
    }
  }
  
  private async checkStuckTasks(rule: AlertRule): Promise<ProgressAlert[]> {
    const alerts: ProgressAlert[] = [];
    const threshold = rule.parameters.thresholdHours * 60 * 60 * 1000; // Convert to milliseconds
    
    // Get all active tasks
    const activeTasks = await this.taskStore.getActiveTasks();
    
    for (const task of activeTasks) {
      const lastUpdate = task.progressHistory[task.progressHistory.length - 1];
      const timeSinceLastUpdate = Date.now() - lastUpdate.timestamp;
      
      if (timeSinceLastUpdate > threshold) {
        const alert: ProgressAlert = {
          alertId: this.generateAlertId(),
          type: AlertType.STUCK_TASK,
          severity: this.calculateSeverity(timeSinceLastUpdate, threshold),
          title: `Task stuck: ${task.title}`,
          description: `Task ${task.taskId} has not made progress in ${Math.round(timeSinceLastUpdate / (60 * 60 * 1000))} hours`,
          source: {
            type: 'system',
            component: 'progress_tracker',
            taskId: task.taskId,
            agentId: task.assignedAgent
          },
          timestamp: Date.now(),
          acknowledged: false,
          resolved: false,
          context: {
            taskId: task.taskId,
            agentId: task.assignedAgent,
            lastProgress: task.currentProgress,
            timeSinceLastUpdate,
            threshold
          },
          actions: [
            {
              type: 'investigate',
              label: 'Investigate Task',
              action: 'open_task_details'
            },
            {
              type: 'reassign',
              label: 'Reassign Task',
              action: 'reassign_task'
            },
            {
              type: 'cancel',
              label: 'Cancel Task',
              action: 'cancel_task'
            }
          ]
        };
        
        alerts.push(alert);
      }
    }
    
    return alerts;
  }
  
  private async checkLowConfidence(rule: AlertRule): Promise<ProgressAlert[]> {
    const alerts: ProgressAlert[] = [];
    const threshold = rule.parameters.confidenceThreshold;
    
    // Get all active tasks with low confidence
    const lowConfidenceTasks = await this.taskStore.getTasksWithConfidenceBelow(threshold);
    
    for (const task of lowConfidenceTasks) {
      const alert: ProgressAlert = {
        alertId: this.generateAlertId(),
        type: AlertType.LOW_CONFIDENCE,
        severity: task.confidence < 0.3 ? AlertSeverity.ERROR : AlertSeverity.WARNING,
        title: `Low confidence: ${task.title}`,
        description: `Task ${task.taskId} has low confidence score: ${(task.confidence * 100).toFixed(1)}%`,
        source: {
          type: 'agent',
          component: 'progress_tracker',
          taskId: task.taskId,
          agentId: task.assignedAgent
        },
        timestamp: Date.now(),
        acknowledged: false,
        resolved: false,
        context: {
          taskId: task.taskId,
          agentId: task.assignedAgent,
          confidence: task.confidence,
          threshold,
          quality: task.quality
        },
        actions: [
          {
            type: 'review',
            label: 'Review Progress',
            action: 'review_progress'
          },
          {
            type: 'guidance',
            label: 'Provide Guidance',
            action: 'provide_guidance'
          }
        ]
      };
      
      alerts.push(alert);
    }
    
    return alerts;
  }
  
  private calculateSeverity(actualValue: number, threshold: number): AlertSeverity {
    const ratio = actualValue / threshold;
    
    if (ratio > 3) return AlertSeverity.CRITICAL;
    if (ratio > 2) return AlertSeverity.ERROR;
    if (ratio > 1.5) return AlertSeverity.WARNING;
    return AlertSeverity.INFO;
  }
}
```

## Conclusion

The Progress Tracking Engine provides a comprehensive solution for monitoring and analyzing progress in multi-agent swarm systems. With its hierarchical aggregation, predictive analytics, milestone tracking, and intelligent alerting capabilities, it enables operators to maintain complete visibility into complex distributed operations while proactively identifying and addressing issues.

The engine's modular design allows for easy extension and customization, while its performance optimizations ensure it can handle the demands of large-scale swarm operations without becoming a bottleneck itself.