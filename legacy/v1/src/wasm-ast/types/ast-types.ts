/**
 * WebAssembly AST Processing Types
 * Real-time code analysis and transformation types
 */

export interface WASMModule {
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  exports: Record<string, Function>;
}

export interface ASTNode {
  type: string;
  start: number;
  end: number;
  value?: any;
  children?: ASTNode[];
  metadata?: Record<string, any>;
}

export interface ASTOperation {
  id: string;
  type: 'parse' | 'transform' | 'analyze' | 'validate';
  input: string | ASTNode;
  options?: Record<string, any>;
  timestamp: number;
  priority: number;
}

export interface ProcessingResult {
  success: boolean;
  ast?: ASTNode;
  transformed?: string;
  metrics: PerformanceMetrics;
  errors?: string[];
  warnings?: string[];
}

export interface PerformanceMetrics {
  parseTime: number;
  transformTime: number;
  totalTime: number;
  memoryUsed: number;
  nodesProcessed: number;
  throughput: number; // nodes per millisecond
}

export interface BatchProcessingJob {
  id: string;
  files: string[];
  operations: ASTOperation[];
  status: 'pending' | 'processing' | 'completed' | 'failed';
  results: Map<string, ProcessingResult>;
  progress: number;
  startTime: number;
  endTime?: number;
}

export interface CodeTransformation {
  type: 'replace' | 'insert' | 'delete' | 'move';
  target: ASTNode;
  replacement?: string | ASTNode;
  position?: number;
  metadata?: Record<string, any>;
}

export interface AnalysisRule {
  id: string;
  name: string;
  description: string;
  pattern: string | RegExp;
  severity: 'error' | 'warning' | 'info';
  action: (node: ASTNode) => boolean;
}

export interface RealTimeAnalysisEvent {
  type: 'ast_parsed' | 'transformation_applied' | 'error_detected' | 'performance_alert';
  timestamp: number;
  fileId: string;
  data: any;
  metrics?: PerformanceMetrics;
}

// WASM-specific types for AST operations
export interface WASMHeapPointer {
  ptr: number;
  size: number;
}

export interface WASMFunctionExports {
  parse_code: (inputPtr: number, inputSize: number) => WASMHeapPointer;
  transform_ast: (astPtr: number, transformPtr: number) => WASMHeapPointer;
  analyze_ast: (astPtr: number) => WASMHeapPointer;
  free_memory: (ptr: number, size: number) => void;
  get_metrics: () => number;
}

// Performance targets
export const PERFORMANCE_TARGETS = {
  PARSE_TIME_SUB_MILLISECOND: 0.95, // 95% of operations under 1ms
  THROUGHPUT_THRESHOLD: 1000, // 1000+ files processing
  MEMORY_EFFICIENCY: 0.8, // 80% memory efficiency
  CONCURRENT_OPERATIONS: 100, // 100+ concurrent operations
} as const;

// Error types
export class WASMError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: any
  ) {
    super(message);
    this.name = 'WASMError';
  }
}

export class ASTProcessingError extends Error {
  constructor(
    message: string,
    public operation: string,
    public nodeId?: string,
    public recoverable: boolean = false
  ) {
    super(message);
    this.name = 'ASTProcessingError';
  }
}

// Configuration types
export interface WASMConfig {
  maxMemoryPages: number;
  initialMemoryPages: number;
  enableSIMD: boolean;
  enableThreads: boolean;
  debugMode: boolean;
  performanceTracking: boolean;
}

export const DEFAULT_WASM_CONFIG: WASMConfig = {
  maxMemoryPages: 1024, // 64MB max
  initialMemoryPages: 256, // 16MB initial
  enableSIMD: true,
  enableThreads: false, // Disabled for compatibility
  debugMode: false,
  performanceTracking: true,
};