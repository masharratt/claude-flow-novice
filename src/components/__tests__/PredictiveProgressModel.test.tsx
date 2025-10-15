import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import PredictiveProgressModel from '../PredictiveProgressModel';

// Mock Recharts components
jest.mock('recharts', () => ({
  LineChart: ({ children }: any) => <div data-testid="line-chart">{children}</div>,
  Line: () => <div data-testid="line" />,
  AreaChart: ({ children }: any) => <div data-testid="area-chart">{children}</div>,
  Area: () => <div data-testid="area" />,
  ScatterChart: ({ children }: any) => <div data-testid="scatter-chart">{children}</div>,
  Scatter: () => <div data-testid="scatter" />,
  XAxis: () => <div data-testid="x-axis" />,
  YAxis: () => <div data-testid="y-axis" />,
  CartesianGrid: () => <div data-testid="cartesian-grid" />,
  Tooltip: () => <div data-testid="tooltip" />,
  Legend: () => <div data-testid="legend" />,
  ReferenceLine: () => <div data-testid="reference-line" />,
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>
}));

// Mock lucide-react icons
jest.mock('lucide-react', () => ({
  TrendingUp: () => <div data-testid="trending-up" />,
  Brain: () => <div data-testid="brain" />,
  Target: () => <div data-testid="target" />,
  Activity: () => <div data-testid="activity" />,
  Clock: () => <div data-testid="clock" />,
  CheckCircle: () => <div data-testid="check-circle" />,
  AlertTriangle: () => <div data-testid="alert-triangle" />,
  Zap: () => <div data-testid="zap" />,
  BarChart3: () => <div data-testid="bar-chart-3" />,
  RefreshCw: () => <div data-testid="refresh-cw" />,
  Settings: () => <div data-testid="settings" />
}));

const mockProps = {
  models: [
    {
      id: 'model-1',
      name: 'Latency Prediction Model',
      type: 'regression' as const,
      accuracy: 0.94,
      confidence: 0.87,
      lastTrained: '2024-01-15T10:00:00Z',
      trainingDataPoints: 50000,
      features: ['cpu_usage', 'memory_usage', 'connection_count'],
      status: 'active' as const
    },
    {
      id: 'model-2',
      name: 'Anomaly Detection Model',
      type: 'classification' as const,
      accuracy: 0.91,
      confidence: 0.92,
      lastTrained: '2024-01-15T08:00:00Z',
      trainingDataPoints: 75000,
      features: ['latency', 'error_rate', 'throughput'],
      status: 'training' as const
    },
    {
      id: 'model-3',
      name: 'Resource Forecast Model',
      type: 'time_series' as const,
      accuracy: 0.88,
      confidence: 0.79,
      lastTrained: '2024-01-14T10:00:00Z',
      trainingDataPoints: 100000,
      features: ['historical_usage', 'time_patterns'],
      status: 'needs_retraining' as const
    }
  ],
  predictions: [
    {
      id: 'pred-1',
      modelId: 'model-1',
      timestamp: '2024-01-15T10:30:00Z',
      inputValue: 75,
      predictedValue: 48.5,
      actualValue: 47.2,
      confidence: 0.89,
      features: { cpu_usage: 65, memory_usage: 70, connection_count: 500 }
    },
    {
      id: 'pred-2',
      modelId: 'model-1',
      timestamp: '2024-01-15T10:25:00Z',
      inputValue: 80,
      predictedValue: 52.1,
      actualValue: 51.8,
      confidence: 0.92,
      features: { cpu_usage: 72, memory_usage: 75, connection_count: 550 }
    }
  ],
  trainingHistory: [
    {
      id: 'training-1',
      modelId: 'model-2',
      startTime: '2024-01-15T09:00:00Z',
      endTime: undefined,
      status: 'running' as const,
      progress: 0.65,
      accuracy: 0.89,
      loss: 0.0234,
      epochs: 100,
      currentEpoch: 65
    }
  ],
  featureImportance: [
    { feature: 'cpu_usage', importance: 0.35, impact: 'positive' as const },
    { feature: 'memory_usage', importance: 0.28, impact: 'positive' as const },
    { feature: 'connection_count', importance: 0.22, impact: 'negative' as const },
    { feature: 'request_rate', importance: 0.15, impact: 'positive' as const }
  ],
  onModelSelect: jest.fn(),
  onRetrainModel: jest.fn()
};

describe('PredictiveProgressModel', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders component header correctly', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    expect(screen.getByText('Predictive Progress Models')).toBeInTheDocument();
    expect(screen.getByTestId('brain')).toBeInTheDocument();
  });

  it('displays all model cards', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    expect(screen.getByText('Latency Prediction Model')).toBeInTheDocument();
    expect(screen.getByText('Anomaly Detection Model')).toBeInTheDocument();
    expect(screen.getByText('Resource Forecast Model')).toBeInTheDocument();
  });

  it('shows model details correctly', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    expect(screen.getByText('94.0%')).toBeInTheDocument(); // Accuracy for model 1
    expect(screen.getByText('91.0%')).toBeInTheDocument(); // Accuracy for model 2
    expect(screen.getByText('88.0%')).toBeInTheDocument(); // Accuracy for model 3
    expect(screen.getByText('87.0%')).toBeInTheDocument(); // Confidence for model 1
  });

  it('displays model status with correct icons', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    // Check that status indicators are rendered
    expect(screen.getByTestId('check-circle')).toBeInTheDocument(); // active status
    expect(screen.getByTestId('refresh-cw')).toBeInTheDocument(); // training status
    expect(screen.getByTestId('alert-triangle')).toBeInTheDocument(); // needs_retraining status
  });

  it('handles model selection', async () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    const modelCard = screen.getByText('Latency Prediction Model');
    fireEvent.click(modelCard);
    
    await waitFor(() => {
      expect(mockProps.onModelSelect).toHaveBeenCalledWith('model-1');
    });
  });

  it('shows prediction performance when model is selected', async () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    // Select first model
    const modelCard = screen.getByText('Latency Prediction Model');
    fireEvent.click(modelCard);
    
    await waitFor(() => {
      expect(screen.getByText('Prediction Performance')).toBeInTheDocument();
      expect(screen.getByTestId('line-chart')).toBeInTheDocument();
    });
  });

  it('displays feature importance correctly', async () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    // Select first model
    const modelCard = screen.getByText('Latency Prediction Model');
    fireEvent.click(modelCard);
    
    await waitFor(() => {
      expect(screen.getByText('Feature Importance')).toBeInTheDocument();
      expect(screen.getByText('cpu_usage')).toBeInTheDocument();
      expect(screen.getByText('memory_usage')).toBeInTheDocument();
      expect(screen.getByText('35.0%')).toBeInTheDocument(); // importance percentage
    });
  });

  it('handles time range selection', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    const timeRangeSelect = screen.getByDisplayValue('Last 24 Hours');
    fireEvent.change(timeRangeSelect, { target: { value: '7d' } });
    
    expect(timeRangeSelect).toHaveValue('7d');
  });

  it('shows training details when toggle is clicked', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    const trainingDetailsButton = screen.getByText('Training Details');
    fireEvent.click(trainingDetailsButton);
    
    expect(screen.getByText('Training Progress')).toBeInTheDocument();
    expect(screen.getByText('Training in Progress')).toBeInTheDocument();
  });

  it('displays training progress correctly', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    const trainingDetailsButton = screen.getByText('Training Details');
    fireEvent.click(trainingDetailsButton);
    
    expect(screen.getByText('Epoch 65 / 100')).toBeInTheDocument();
    expect(screen.getByText('89.00%')).toBeInTheDocument(); // Current accuracy
    expect(screen.getByText('0.0234')).toBeInTheDocument(); // Current loss
  });

  it('handles model retraining', async () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    // Find the retrain button for the model that needs retraining
    const retrainButtons = screen.getAllByText('Retrain Model');
    expect(retrainButtons).toHaveLength(1); // Only one model needs retraining
    
    fireEvent.click(retrainButtons[0]);
    
    await waitFor(() => {
      expect(mockProps.onRetrainModel).toHaveBeenCalledWith('model-3');
    });
  });

  it('displays no data message when no predictions available', () => {
    const propsWithoutPredictions = {
      ...mockProps,
      predictions: []
    };
    
    render(<PredictiveProgressModel {...propsWithoutPredictions} />);
    
    // Select a model
    const modelCard = screen.getByText('Latency Prediction Model');
    fireEvent.click(modelCard);
    
    expect(screen.getByText('No prediction data available')).toBeInTheDocument();
  });

  it('displays no data message when no feature importance available', () => {
    const propsWithoutFeatures = {
      ...mockProps,
      featureImportance: []
    };
    
    render(<PredictiveProgressModel {...propsWithoutFeatures} />);
    
    // Select a model
    const modelCard = screen.getByText('Latency Prediction Model');
    fireEvent.click(modelCard);
    
    expect(screen.getByText('No feature importance data available')).toBeInTheDocument();
  });

  it('shows no training message when no training in progress', () => {
    const propsWithoutTraining = {
      ...mockProps,
      trainingHistory: []
    };
    
    render(<PredictiveProgressModel {...propsWithoutTraining} />);
    
    const trainingDetailsButton = screen.getByText('Training Details');
    fireEvent.click(trainingDetailsButton);
    
    expect(screen.getByText('No training in progress')).toBeInTheDocument();
  });

  it('calculates live accuracy correctly', async () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    // Select first model
    const modelCard = screen.getByText('Latency Prediction Model');
    fireEvent.click(modelCard);
    
    await waitFor(() => {
      expect(screen.getByText('Live Accuracy')).toBeInTheDocument();
      expect(screen.getByText('Total Predictions')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument(); // Number of predictions
    });
  });

  it('formats model types correctly', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    expect(screen.getByText('regression')).toBeInTheDocument();
    expect(screen.getByText('classification')).toBeInTheDocument();
    expect(screen.getByText('time series')).toBeInTheDocument();
  });

  it('formats training data points with locale', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    expect(screen.getByText('50,000')).toBeInTheDocument();
    expect(screen.getByText('75,000')).toBeInTheDocument();
    expect(screen.getByText('100,000')).toBeInTheDocument();
  });

  it('displays training history chart when available', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    const trainingDetailsButton = screen.getByText('Training Details');
    fireEvent.click(trainingDetailsButton);
    
    expect(screen.getByText('Training History')).toBeInTheDocument();
    expect(screen.getByTestId('line-chart')).toBeInTheDocument();
  });

  it('is accessible with proper ARIA labels', () => {
    render(<PredictiveProgressModel {...mockProps} />);
    
    expect(screen.getByRole('heading', { name: 'Predictive Progress Models' })).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument(); // Time range select
    expect(screen.getByRole('button', { name: 'Training Details' })).toBeInTheDocument();
  });
});