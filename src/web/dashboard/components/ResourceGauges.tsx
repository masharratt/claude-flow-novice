/**
 * Resource Gauges Component
 * Real-time gauges and meters for system resource usage monitoring
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Cpu, MemoryStick, HardDrive, Wifi, Activity, Zap, AlertTriangle } from 'lucide-react';
import { ResourceUsage, PerformanceAlert, ComponentProps } from '../types';

interface GaugeProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  icon?: React.ReactNode;
  color?: string;
  size?: 'small' | 'medium' | 'large';
  showValue?: boolean;
  thresholds?: {
    warning: number;
    critical: number;
  };
  alert?: PerformanceAlert;
}

const Gauge: React.FC<GaugeProps> = ({
  value,
  max,
  label,
  unit,
  icon,
  color = '#3B82F6',
  size = 'medium',
  showValue = true,
  thresholds,
  alert
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();
  const currentValueRef = useRef(0);

  const getSize = () => {
    switch (size) {
      case 'small': return { width: 120, height: 120, strokeWidth: 8 };
      case 'medium': return { width: 160, height: 160, strokeWidth: 12 };
      case 'large': return { width: 200, height: 200, strokeWidth: 16 };
      default: return { width: 160, height: 160, strokeWidth: 12 };
    }
  };

  const getThresholdColor = (value: number) => {
    if (!thresholds) return color;
    if (value >= thresholds.critical) return '#EF4444';
    if (value >= thresholds.warning) return '#F59E0B';
    return color;
  };

  const percentage = (value / max) * 100;
  const gaugeColor = getThresholdColor(percentage);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { width, height, strokeWidth } = getSize();
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = (Math.min(width, height) / 2) - strokeWidth;

    // Set canvas size
    canvas.width = width;
    canvas.height = height;

    const animate = () => {
      const targetValue = percentage;
      const currentValue = currentValueRef.current;

      // Smooth animation
      const diff = targetValue - currentValue;
      const step = diff * 0.1;
      currentValueRef.current = Math.abs(diff) < 0.1 ? targetValue : currentValue + step;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Draw background arc
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, Math.PI * 0.75, Math.PI * 2.25, false);
      ctx.strokeStyle = '#E5E7EB';
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw value arc
      const endAngle = Math.PI * 0.75 + (Math.PI * 1.5 * currentValueRef.current) / 100;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, Math.PI * 0.75, endAngle, false);
      ctx.strokeStyle = gaugeColor;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.stroke();

      // Draw threshold indicators
      if (thresholds) {
        const warningAngle = Math.PI * 0.75 + (Math.PI * 1.5 * thresholds.warning) / 100;
        const criticalAngle = Math.PI * 0.75 + (Math.PI * 1.5 * thresholds.critical) / 100;

        // Warning threshold
        ctx.beginPath();
        ctx.arc(
          centerX + Math.cos(warningAngle) * radius,
          centerY + Math.sin(warningAngle) * radius,
          3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = '#F59E0B';
        ctx.fill();

        // Critical threshold
        ctx.beginPath();
        ctx.arc(
          centerX + Math.cos(criticalAngle) * radius,
          centerY + Math.sin(criticalAngle) * radius,
          3,
          0,
          Math.PI * 2
        );
        ctx.fillStyle = '#EF4444';
        ctx.fill();
      }

      // Draw center text
      if (showValue) {
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${Math.round(currentValueRef.current)}%`, centerX, centerY - 10);

        ctx.font = '12px sans-serif';
        ctx.fillStyle = '#6B7280';
        ctx.fillText(unit, centerX, centerY + 10);
      }

      if (Math.abs(currentValueRef.current - targetValue) > 0.1) {
        animationRef.current = requestAnimationFrame(animate);
      }
    };

    animate();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [percentage, gaugeColor, showValue, unit, thresholds, getSize]);

  return (
    <div className="flex flex-col items-center space-y-2">
      <div className="relative">
        <canvas
          ref={canvasRef}
          className="drop-shadow-sm"
        />
        {alert && (
          <div className="absolute -top-2 -right-2">
            <AlertTriangle className="w-5 h-5 text-red-500" title={alert.message} />
          </div>
        )}
      </div>
      <div className="flex items-center space-x-2 text-center">
        {icon}
        <div>
          <p className="text-sm font-medium text-gray-900">{label}</p>
          <p className="text-xs text-gray-500">
            {value.toLocaleString()} / {max.toLocaleString()} {unit}
          </p>
        </div>
      </div>
    </div>
  );
};

interface ProgressBarProps {
  value: number;
  max: number;
  label: string;
  unit: string;
  color?: string;
  showPercentage?: boolean;
  thresholds?: {
    warning: number;
    critical: number;
  };
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  value,
  max,
  label,
  unit,
  color = '#3B82F6',
  showPercentage = true,
  thresholds
}) => {
  const percentage = (value / max) * 100;

  const getBarColor = () => {
    if (!thresholds) return color;
    if (percentage >= thresholds.critical) return '#EF4444';
    if (percentage >= thresholds.warning) return '#F59E0B';
    return color;
  };

  const getBgColor = () => {
    if (!thresholds) return 'bg-gray-200';
    if (percentage >= thresholds.critical) return 'bg-red-100';
    if (percentage >= thresholds.warning) return 'bg-yellow-100';
    return 'bg-blue-50';
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-gray-900">{label}</span>
        <div className="text-right">
          <span className="font-medium text-gray-900">{value.toLocaleString()}</span>
          <span className="text-gray-500 ml-1">/ {max.toLocaleString()} {unit}</span>
          {showPercentage && (
            <span className="text-gray-500 ml-2">({percentage.toFixed(1)}%)</span>
          )}
        </div>
      </div>
      <div className={`w-full rounded-full h-2 ${getBgColor()}`}>
        <div
          className="h-2 rounded-full transition-all duration-500 ease-out"
          style={{
            width: `${Math.min(percentage, 100)}%`,
            backgroundColor: getBarColor()
          }}
        />
      </div>
    </div>
  );
};

interface ResourceGaugesProps extends Partial<ComponentProps> {
  resourceUsage: ResourceUsage;
  alerts?: PerformanceAlert[];
  autoRefresh?: boolean;
  refreshInterval?: number;
  showTrends?: boolean;
  historicalData?: {
    timestamp: Date;
    memoryUsage: number;
    cpuUsage: number;
    networkLatency: number;
    diskUsage: number;
  }[];
}

export const ResourceGauges: React.FC<ResourceGaugesProps> = ({
  resourceUsage,
  alerts = [],
  autoRefresh = true,
  refreshInterval = 3000,
  showTrends = false,
  historicalData = [],
  ...props
}) => {
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());
  const [selectedResource, setSelectedResource] = useState<string>();

  // Get alerts for each resource type
  const getAlertForResource = (resourceType: string) => {
    return alerts.find(alert => alert.type === resourceType);
  };

  // Calculate trends from historical data
  const trends = useMemo(() => {
    if (historicalData.length < 2) return {};

    const latest = historicalData[historicalData.length - 1];
    const previous = historicalData[historicalData.length - 2];

    return {
      memoryUsage: ((latest.memoryUsage - previous.memoryUsage) / previous.memoryUsage) * 100,
      cpuUsage: ((latest.cpuUsage - previous.cpuUsage) / previous.cpuUsage) * 100,
      networkLatency: ((latest.networkLatency - previous.networkLatency) / previous.networkLatency) * 100,
      diskUsage: ((latest.diskUsage - previous.diskUsage) / previous.diskUsage) * 100,
    };
  }, [historicalData]);

  // Auto-refresh
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      setLastUpdated(new Date());
    }, refreshInterval);

    return () => clearInterval(interval);
  }, [autoRefresh, refreshInterval]);

  const formatBytes = (bytes: number) => {
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    if (bytes === 0) return '0 B';
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${sizes[i]}`;
  };

  const criticalAlerts = alerts.filter(alert => alert.severity === 'critical');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Resource Usage</h3>
          <div className="flex items-center space-x-2">
            {criticalAlerts.length > 0 && (
              <div className="flex items-center space-x-1 px-3 py-2 bg-red-50 text-red-600 rounded-lg">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-sm font-medium">{criticalAlerts.length} Critical</span>
              </div>
            )}
            <div className="text-sm text-gray-500">
              Updated: {lastUpdated.toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Critical Alerts Summary */}
        {criticalAlerts.length > 0 && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center space-x-2 mb-2">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <h4 className="font-medium text-red-900">Critical Alerts</h4>
            </div>
            <div className="space-y-1">
              {criticalAlerts.slice(0, 3).map(alert => (
                <div key={alert.id} className="text-sm text-red-700">
                  <span className="font-medium">{alert.agentId}:</span> {alert.message}
                </div>
              ))}
              {criticalAlerts.length > 3 && (
                <div className="text-sm text-red-600">
                  ... and {criticalAlerts.length - 3} more
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Main Gauges */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 mb-6">System Resources</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <Gauge
            value={resourceUsage.memoryUsage}
            max={16 * 1024 * 1024 * 1024} // 16GB max
            label="Memory"
            unit="GB"
            icon={<MemoryStick className="w-5 h-5 text-blue-500" />}
            color="#3B82F6"
            thresholds={{ warning: 70, critical: 90 }}
            alert={getAlertForResource('memory_usage')}
          />

          <Gauge
            value={resourceUsage.cpuUsage}
            max={100}
            label="CPU"
            unit="%"
            icon={<Cpu className="w-5 h-5 text-green-500" />}
            color="#10B981"
            thresholds={{ warning: 70, critical: 90 }}
            alert={getAlertForResource('cpu_usage')}
          />

          <Gauge
            value={resourceUsage.networkLatency}
            max={1000} // 1000ms max
            label="Network"
            unit="ms"
            icon={<Wifi className="w-5 h-5 text-purple-500" />}
            color="#8B5CF6"
            thresholds={{ warning: 200, critical: 500 }}
            alert={getAlertForResource('network_latency')}
          />

          <Gauge
            value={resourceUsage.diskUsage}
            max={1000 * 1024 * 1024 * 1024} // 1TB max
            label="Disk"
            unit="GB"
            icon={<HardDrive className="w-5 h-5 text-orange-500" />}
            color="#F97316"
            thresholds={{ warning: 80, critical: 95 }}
            alert={getAlertForResource('disk_usage')}
          />
        </div>
      </div>

      {/* Additional Resources */}
      {resourceUsage.gpuUsage !== undefined && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-4">GPU Resources</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Gauge
              value={resourceUsage.gpuUsage}
              max={100}
              label="GPU Usage"
              unit="%"
              icon={<Activity className="w-5 h-5 text-cyan-500" />}
              color="#06B6D4"
              thresholds={{ warning: 80, critical: 95 }}
            />
          </div>
        </div>
      )}

      {/* Detailed Progress Bars */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 mb-4">Detailed Usage</h4>
        <div className="space-y-4">
          <ProgressBar
            value={resourceUsage.memoryUsage}
            max={16 * 1024 * 1024 * 1024}
            label="Memory Usage"
            unit={formatBytes(resourceUsage.memoryUsage).split(' ')[1]}
            color="#3B82F6"
            thresholds={{ warning: 70, critical: 90 }}
          />

          <ProgressBar
            value={resourceUsage.cpuUsage}
            max={100}
            label="CPU Usage"
            unit="%"
            color="#10B981"
            thresholds={{ warning: 70, critical: 90 }}
          />

          <ProgressBar
            value={resourceUsage.networkLatency}
            max={1000}
            label="Network Latency"
            unit="ms"
            color="#8B5CF6"
            thresholds={{ warning: 200, critical: 500 }}
          />

          <ProgressBar
            value={resourceUsage.diskUsage}
            max={1000 * 1024 * 1024 * 1024}
            label="Disk Usage"
            unit={formatBytes(resourceUsage.diskUsage).split(' ')[1]}
            color="#F97316"
            thresholds={{ warning: 80, critical: 95 }}
          />
        </div>
      </div>

      {/* Trends */}
      {showTrends && Object.keys(trends).length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <h4 className="font-semibold text-gray-900 mb-4">Usage Trends</h4>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {Object.entries(trends).map(([resource, trend]) => {
              const isPositive = trend > 0;
              const trendIcon = isPositive ? '↑' : '↓';
              const trendColor = isPositive ? 'text-red-600' : 'text-green-600';

              return (
                <div key={resource} className="text-center">
                  <div className={`text-2xl font-bold ${trendColor}`}>
                    {trendIcon} {Math.abs(trend).toFixed(1)}%
                  </div>
                  <div className="text-sm text-gray-500 capitalize">
                    {resource.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Resource Efficiency Score */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h4 className="font-semibold text-gray-900 mb-4">Resource Efficiency</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-600 mb-2">
              {Math.max(0, 100 - (resourceUsage.memoryUsage / (16 * 1024 * 1024 * 1024)) * 100).toFixed(0)}%
            </div>
            <p className="text-sm text-gray-500">Memory Efficiency</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-600 mb-2">
              {Math.max(0, 100 - resourceUsage.cpuUsage).toFixed(0)}%
            </div>
            <p className="text-sm text-gray-500">CPU Efficiency</p>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-purple-600 mb-2">
              {Math.max(0, 100 - (resourceUsage.networkLatency / 1000) * 100).toFixed(0)}%
            </div>
            <p className="text-sm text-gray-500">Network Efficiency</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceGauges;