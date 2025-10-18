/**
 * Performance Optimization Components and Utilities
 * Provides React.memo, virtualization, and performance monitoring
 */

import React, {
  memo,
  useMemo,
  useCallback,
  useState,
  useEffect,
  useRef,
  ComponentType,
  ReactNode,
  CSSProperties
} from 'react';

// Performance monitoring utilities
export interface PerformanceMetrics {
  renderTime: number;
  renderCount: number;
  lastRenderTime: number;
  averageRenderTime: number;
  memoryUsage?: number;
}

export const usePerformanceMonitor = (componentName: string) => {
  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    renderTime: 0,
    renderCount: 0,
    lastRenderTime: 0,
    averageRenderTime: 0
  });

  const renderStartTime = useRef<number>(0);

  useEffect(() => {
    const renderEndTime = performance.now();
    const renderTime = renderEndTime - renderStartTime.current;

    setMetrics(prev => {
      const newRenderCount = prev.renderCount + 1;
      const newAverageRenderTime =
        (prev.averageRenderTime * prev.renderCount + renderTime) / newRenderCount;

      return {
        renderTime,
        renderCount: newRenderCount,
        lastRenderTime: renderEndTime,
        averageRenderTime: newAverageRenderTime,
        memoryUsage: (performance as any).memory?.usedJSHeapSize
      };
    });

    // Log performance warnings
    if (renderTime > 16.67) { // > 60fps threshold
      console.warn(`⚡ Performance Warning: ${componentName} took ${renderTime.toFixed(2)}ms to render`);
    }
  });

  renderStartTime.current = performance.now();

  return metrics;
};

// Virtual list component for large datasets
interface VirtualListProps<T> {
  items: T[];
  itemHeight: number;
  containerHeight: number;
  renderItem: (item: T, index: number) => ReactNode;
  overscan?: number;
  className?: string;
  style?: CSSProperties;
}

export const VirtualList = memo(<T,>({
  items,
  itemHeight,
  containerHeight,
  renderItem,
  overscan = 5,
  className = '',
  style = {}
}: VirtualListProps<T>) => {
  const [scrollTop, setScrollTop] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const visibleRange = useMemo(() => {
    const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan);
    const endIndex = Math.min(
      items.length - 1,
      Math.ceil((scrollTop + containerHeight) / itemHeight) + overscan
    );
    return { startIndex, endIndex };
  }, [scrollTop, itemHeight, containerHeight, overscan, items.length]);

  const visibleItems = useMemo(() => {
    return items.slice(visibleRange.startIndex, visibleRange.endIndex + 1);
  }, [items, visibleRange]);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  const totalHeight = items.length * itemHeight;

  return (
    <div
      ref={containerRef}
      className={`virtual-list ${className}`}
      style={{
        height: containerHeight,
        overflow: 'auto',
        ...style
      }}
      onScroll={handleScroll}
      role="list"
      aria-label="Scrollable list"
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            transform: `translateY(${visibleRange.startIndex * itemHeight}px)`,
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0
          }}
        >
          {visibleItems.map((item, index) => (
            <div
              key={visibleRange.startIndex + index}
              style={{ height: itemHeight }}
              role="listitem"
            >
              {renderItem(item, visibleRange.startIndex + index)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}) as typeof VirtualList;

VirtualList.displayName = 'VirtualList';

// Optimized form input component
interface OptimizedInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
  debounceMs?: number;
  validationRules?: Array<{
    test: (value: string) => boolean;
    message: string;
  }>;
  onValidationError?: (error: string) => void;
}

export const OptimizedInput = memo(({
  value,
  onChange,
  placeholder = '',
  type = 'text',
  disabled = false,
  className = '',
  debounceMs = 300,
  validationRules = [],
  onValidationError
}: OptimizedInputProps) => {
  const [localValue, setLocalValue] = useState(value);
  const [error, setError] = useState<string | ''>('');
  const debounceTimeout = useRef<NodeJS.Timeout>();

  const metrics = usePerformanceMonitor('OptimizedInput');

  // Update local value when prop changes
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);

    // Clear previous timeout
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }

    // Debounce onChange
    debounceTimeout.current = setTimeout(() => {
      // Validate input
      const validationError = validationRules
        .map(rule => !rule.test(newValue) ? rule.message : null)
        .filter(Boolean)
        .join(', ');

      setError(validationError);

      if (validationError && onValidationError) {
        onValidationError(validationError);
      }

      if (!validationError) {
        onChange(newValue);
      }
    }, debounceMs);
  }, [onChange, debounceMs, validationRules, onValidationError]);

  return (
    <div className="optimized-input-container">
      <input
        type={type}
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className={`optimized-input ${className} ${error ? 'error' : ''}`}
        aria-invalid={!!error}
        aria-describedby={error ? 'input-error' : undefined}
      />
      {error && (
        <div
          id="input-error"
          className="input-error"
          role="alert"
          aria-live="polite"
          style={{ color: '#d63031', fontSize: '12px', marginTop: '4px' }}
        >
          {error}
        </div>
      )}
    </div>
  );
}) as typeof OptimizedInput;

OptimizedInput.displayName = 'OptimizedInput';

// Performance-optimized data grid component
interface DataGridProps<T> {
  data: T[];
  columns: Array<{
    key: keyof T;
    label: string;
    width?: number;
    render?: (value: any, row: T) => ReactNode;
  }>;
  rowHeight?: number;
  maxHeight?: number;
  className?: string;
  onRowClick?: (row: T, index: number) => void;
}

export const DataGrid = memo(<T,>({
  data,
  columns,
  rowHeight = 40,
  maxHeight = 400,
  className = '',
  onRowClick
}: DataGridProps<T>) => {
  const [sortColumn, setSortColumn] = useState<keyof T | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const sortedData = useMemo(() => {
    if (!sortColumn) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortColumn];
      const bValue = b[sortColumn];

      if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
      if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortColumn, sortDirection]);

  const handleSort = useCallback((column: keyof T) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  }, [sortColumn]);

  const renderRow = useCallback((item: T, index: number) => (
    <div
      key={index}
      className="data-grid-row"
      style={{
        display: 'flex',
        height: rowHeight,
        borderBottom: '1px solid #e0e0e0',
        alignItems: 'center',
        cursor: onRowClick ? 'pointer' : 'default'
      }}
      onClick={() => onRowClick?.(item, index)}
      role="row"
    >
      {columns.map((column) => (
        <div
          key={String(column.key)}
          style={{
            width: column.width || 150,
            padding: '0 8px',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
          role="cell"
        >
          {column.render ? column.render(item[column.key], item) : String(item[column.key] || '')}
        </div>
      ))}
    </div>
  ), [columns, rowHeight, onRowClick]);

  return (
    <div className={`data-grid ${className}`} style={{ border: '1px solid #ccc' }}>
      {/* Header */}
      <div
        className="data-grid-header"
        style={{
          display: 'flex',
          height: rowHeight,
          backgroundColor: '#f5f5f5',
          borderBottom: '2px solid #ccc',
          fontWeight: 'bold'
        }}
        role="rowheader"
      >
        {columns.map((column) => (
          <div
            key={String(column.key)}
            style={{
              width: column.width || 150,
              padding: '0 8px',
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              userSelect: 'none'
            }}
            onClick={() => handleSort(column.key)}
            role="columnheader"
            aria-sort={sortColumn === column.key ? sortDirection : 'none'}
          >
            {column.label}
            {sortColumn === column.key && (
              <span style={{ marginLeft: '4px' }}>
                {sortDirection === 'asc' ? '▲' : '▼'}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Virtualized body */}
      <VirtualList
        items={sortedData}
        itemHeight={rowHeight}
        containerHeight={maxHeight}
        renderItem={renderRow}
      />
    </div>
  );
}) as typeof DataGrid;

DataGrid.displayName = 'DataGrid';

// Image lazy loading component
interface LazyImageProps {
  src: string;
  alt: string;
  placeholder?: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const LazyImage = memo(({
  src,
  alt,
  placeholder = '/placeholder.png',
  className = '',
  onLoad,
  onError
}: LazyImageProps) => {
  const [imageSrc, setImageSrc] = useState(placeholder);
  const [isLoaded, setIsLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          const img = new Image();
          img.onload = () => {
            setImageSrc(src);
            setIsLoaded(true);
            onLoad?.();
          };
          img.onerror = () => {
            onError?.();
          };
          img.src = src;
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );

    if (imgRef.current) {
      observer.observe(imgRef.current);
    }

    return () => observer.disconnect();
  }, [src, onLoad, onError]);

  return (
    <img
      ref={imgRef}
      src={imageSrc}
      alt={alt}
      className={`lazy-image ${className} ${isLoaded ? 'loaded' : 'loading'}`}
      style={{
        transition: 'opacity 0.3s ease-in-out',
        opacity: isLoaded ? 1 : 0.7
      }}
      loading="lazy"
    />
  );
}) as typeof LazyImage;

LazyImage.displayName = 'LazyImage';

// Performance monitoring dashboard component
export const PerformanceMonitor = () => {
  const [metrics, setMetrics] = useState<{ [key: string]: PerformanceMetrics }>({});
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Listen for custom performance events
    const handlePerformanceUpdate = (event: CustomEvent) => {
      const { componentName, metrics: componentMetrics } = event.detail;
      setMetrics(prev => ({
        ...prev,
        [componentName]: componentMetrics
      }));
    };

    window.addEventListener('performance-update', handlePerformanceUpdate as EventListener);
    return () => window.removeEventListener('performance-update', handlePerformanceUpdate as EventListener);
  }, []);

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        style={{
          position: 'fixed',
          bottom: '20px',
          right: '20px',
          backgroundColor: '#0984e3',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          padding: '8px 12px',
          cursor: 'pointer',
          zIndex: 1000
        }}
        aria-label="Show performance monitor"
      >
        📊 Performance
      </button>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        bottom: '20px',
        right: '20px',
        width: '300px',
        maxHeight: '400px',
        backgroundColor: 'white',
        border: '1px solid #ccc',
        borderRadius: '4px',
        padding: '16px',
        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        zIndex: 1000,
        overflow: 'auto'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h3 style={{ margin: 0 }}>Performance Monitor</h3>
        <button
          onClick={() => setIsVisible(false)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            fontSize: '16px',
            cursor: 'pointer'
          }}
          aria-label="Close performance monitor"
        >
          ×
        </button>
      </div>

      {Object.entries(metrics).map(([componentName, componentMetrics]) => (
        <div key={componentName} style={{ marginBottom: '12px', padding: '8px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
          <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{componentName}</div>
          <div style={{ fontSize: '12px', color: '#666' }}>
            <div>Renders: {componentMetrics.renderCount}</div>
            <div>Last render: {componentMetrics.lastRenderTime.toFixed(2)}ms</div>
            <div>Average: {componentMetrics.averageRenderTime.toFixed(2)}ms</div>
            {componentMetrics.memoryUsage && (
              <div>Memory: {(componentMetrics.memoryUsage / 1024 / 1024).toFixed(2)}MB</div>
            )}
          </div>
        </div>
      ))}

      {Object.keys(metrics).length === 0 && (
        <div style={{ textAlign: 'center', color: '#666', padding: '20px' }}>
          No performance data available yet
        </div>
      )}
    </div>
  );
};

// Higher-order component for performance monitoring
export const withPerformanceMonitoring = <P extends object>(
  WrappedComponent: ComponentType<P>,
  componentName: string
) => {
  const MonitoredComponent = memo((props: P) => {
    const metrics = usePerformanceMonitor(componentName);

    useEffect(() => {
      // Emit performance event
      window.dispatchEvent(new CustomEvent('performance-update', {
        detail: { componentName, metrics }
      }));
    }, [metrics]);

    return <WrappedComponent {...props} />;
  });

  MonitoredComponent.displayName = `withPerformanceMonitoring(${componentName})`;
  return MonitoredComponent;
};