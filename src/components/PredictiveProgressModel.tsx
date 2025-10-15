import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';
import {
  TrendingUp,
  Brain,
  Target,
  Activity,
  Clock,
  CheckCircle,
  AlertTriangle,
  Zap,
  BarChart3,
  RefreshCw,
  Settings
} from 'lucide-react';

// Types
interface PredictionModel {
  id: string;
  name: string;
  type: 'regression' | 'classification' | 'time_series';
  accuracy: number;
  confidence: number;
  lastTrained: string;
  trainingDataPoints: number;
  features: string[];
  status: 'active' | 'training' | 'error' | 'needs_retraining';
}

interface Prediction {
  id: string;
  modelId: string;
  timestamp: string;
  inputValue: number;
  predictedValue: number;
  actualValue?: number;
  confidence: number;
  features: Record<string, number>;
  error?: number;
}

interface ModelTraining {
  id: string;
  modelId: string;
  startTime: string;
  endTime?: string;
  status: 'running' | 'completed' | 'failed';
  progress: number;
  accuracy: number;
  loss: number;
  epochs: number;
  currentEpoch: number;
}

interface FeatureImportance {
  feature: string;
  importance: number;
  impact: 'positive' | 'negative';
}

interface PredictiveProgressModelProps {
  models: PredictionModel[];
  predictions: Prediction[];
  trainingHistory: ModelTraining[];
  featureImportance: FeatureImportance[];
  onModelSelect?: (modelId: string) => void;
  onRetrainModel?: (modelId: string) => void;
}

const PredictiveProgressModel: React.FC<PredictiveProgressModelProps> = ({
  models,
  predictions,
  trainingHistory,
  featureImportance,
  onModelSelect,
  onRetrainModel
}) => {
  const [selectedModelId, setSelectedModelId] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('24h');
  const [showTrainingDetails, setShowTrainingDetails] = useState(false);

  const selectedModel = useMemo(() => 
    models.find(m => m.id === selectedModelId), 
    [models, selectedModelId]
  );

  const modelPredictions = useMemo(() => 
    predictions.filter(p => p.modelId === selectedModelId),
    [predictions, selectedModelId]
  );

  const modelAccuracy = useMemo(() => {
    if (!modelPredictions.length || !modelPredictions.some(p => p.actualValue !== undefined)) {
      return 0;
    }
    const validPredictions = modelPredictions.filter(p => p.actualValue !== undefined);
    const errors = validPredictions.map(p => Math.abs(p.predictedValue - p.actualValue!));
    const meanError = errors.reduce((sum, error) => sum + error, 0) / errors.length;
    const meanValue = validPredictions.reduce((sum, p) => sum + p.actualValue!, 0) / validPredictions.length;
    return Math.max(0, 1 - (meanError / meanValue));
  }, [modelPredictions]);

  const predictionChartData = useMemo(() => {
    return modelPredictions.map(prediction => ({
      timestamp: new Date(prediction.timestamp).toLocaleTimeString(),
      predicted: prediction.predictedValue,
      actual: prediction.actualValue,
      confidence: prediction.confidence * 100,
      error: prediction.actualValue ? Math.abs(prediction.predictedValue - prediction.actualValue) : null
    })).sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  }, [modelPredictions]);

  const trainingProgressData = useMemo(() => {
    return trainingHistory
      .filter(training => training.modelId === selectedModelId)
      .map(training => ({
        epoch: training.currentEpoch,
        accuracy: training.accuracy,
        loss: training.loss,
        timestamp: new Date(training.startTime).toLocaleTimeString()
      }));
  }, [trainingHistory, selectedModelId]);

  const currentTraining = useMemo(() => 
    trainingHistory.find(t => t.modelId === selectedModelId && t.status === 'running'),
    [trainingHistory, selectedModelId]
  );

  const handleModelSelect = (modelId: string) => {
    setSelectedModelId(modelId);
    onModelSelect?.(modelId);
  };

  const getAccuracyColor = (accuracy: number) => {
    if (accuracy >= 0.9) return 'text-green-600';
    if (accuracy >= 0.7) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'active':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'training':
        return <RefreshCw className="h-4 w-4 text-yellow-500 animate-spin" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'needs_retraining':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Model Selection Header */}
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center space-x-3">
            <Brain className="h-6 w-6 text-purple-600" />
            <h2 className="text-xl font-semibold text-gray-900">Predictive Progress Models</h2>
          </div>
          <div className="flex items-center space-x-4">
            <select
              value={timeRange}
              onChange={(e) => setTimeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="1h">Last Hour</option>
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>
            <button
              onClick={() => setShowTrainingDetails(!showTrainingDetails)}
              className="flex items-center px-4 py-2 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200"
            >
              <Settings className="h-4 w-4 mr-2" />
              Training Details
            </button>
          </div>
        </div>

        {/* Model Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {models.map((model) => (
            <div
              key={model.id}
              onClick={() => handleModelSelect(model.id)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedModelId === model.id
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-900">{model.name}</h3>
                {getStatusIcon(model.status)}
              </div>
              
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Type:</span>
                  <span className="font-medium">{model.type.replace('_', ' ')}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Accuracy:</span>
                  <span className={`font-medium ${getAccuracyColor(model.accuracy)}`}>
                    {(model.accuracy * 100).toFixed(1)}%
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Confidence:</span>
                  <span className="font-medium">{(model.confidence * 100).toFixed(1)}%</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Data Points:</span>
                  <span className="font-medium">{model.trainingDataPoints.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Last Trained:</span>
                  <span className="font-medium">
                    {new Date(model.lastTrained).toLocaleDateString()}
                  </span>
                </div>
              </div>

              {model.status === 'needs_retraining' && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetrainModel?.(model.id);
                  }}
                  className="mt-3 w-full px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm"
                >
                  Retrain Model
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Selected Model Details */}
      {selectedModel && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Prediction Performance */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Prediction Performance</h3>
            
            {predictionChartData.length > 0 ? (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={predictionChartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="timestamp" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="predicted"
                    stroke="#8b5cf6"
                    name="Predicted"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke="#10b981"
                    name="Actual"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="confidence"
                    stroke="#f59e0b"
                    name="Confidence %"
                    strokeWidth={1}
                    strokeDasharray="5 5"
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <BarChart3 className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No prediction data available</p>
                </div>
              </div>
            )}

            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Live Accuracy</p>
                <p className={`text-lg font-semibold ${getAccuracyColor(modelAccuracy)}`}>
                  {(modelAccuracy * 100).toFixed(1)}%
                </p>
              </div>
              <div className="bg-gray-50 rounded-lg p-3">
                <p className="text-sm text-gray-600">Total Predictions</p>
                <p className="text-lg font-semibold text-gray-900">
                  {modelPredictions.length.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Feature Importance */}
          <div className="bg-white rounded-lg shadow-sm p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Feature Importance</h3>
            
            {featureImportance.length > 0 ? (
              <div className="space-y-3">
                {featureImportance
                  .sort((a, b) => b.importance - a.importance)
                  .slice(0, 8)
                  .map((feature, index) => (
                    <div key={feature.feature} className="flex items-center space-x-3">
                      <span className="text-sm text-gray-600 w-32 truncate">
                        {feature.feature}
                      </span>
                      <div className="flex-1 bg-gray-200 rounded-full h-6 relative">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            feature.impact === 'positive' ? 'bg-green-500' : 'bg-red-500'
                          }`}
                          style={{ width: `${feature.importance * 100}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-700">
                          {(feature.importance * 100).toFixed(1)}%
                        </span>
                      </div>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="flex items-center justify-center h-64 text-gray-500">
                <div className="text-center">
                  <Target className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No feature importance data available</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Training Progress */}
      {showTrainingDetails && selectedModel && (
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Training Progress</h3>
          
          {currentTraining ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <RefreshCw className="h-5 w-5 text-purple-600 animate-spin" />
                  <span className="font-medium">Training in Progress</span>
                </div>
                <span className="text-sm text-gray-600">
                  Epoch {currentTraining.currentEpoch} / {currentTraining.epochs}
                </span>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className="bg-purple-600 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${currentTraining.progress}%` }}
                />
              </div>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Current Accuracy</p>
                  <p className="text-lg font-semibold text-green-600">
                    {(currentTraining.accuracy * 100).toFixed(2)}%
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Current Loss</p>
                  <p className="text-lg font-semibold text-red-600">
                    {currentTraining.loss.toFixed(4)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Time Elapsed</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {Math.floor((Date.now() - new Date(currentTraining.startTime).getTime()) / 1000 / 60)}m
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-gray-500 py-8">
              <Clock className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No training in progress</p>
            </div>
          )}

          {trainingProgressData.length > 0 && (
            <div className="mt-6">
              <h4 className="font-medium text-gray-900 mb-3">Training History</h4>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={trainingProgressData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="epoch" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="accuracy"
                    stroke="#10b981"
                    name="Accuracy"
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="loss"
                    stroke="#ef4444"
                    name="Loss"
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PredictiveProgressModel;