/**
 * WASM AST Operations - Real-time WebAssembly AST Processing
 * Main entry point for the WASM AST system
 */

// Core components
export { WASMEngine } from './engine/wasm-engine';
export { RealTimeASTProcessor } from './processors/real-time-processor';
export { CodeTransformationPipeline } from './transformers/code-transformation-pipeline';
export { PerformanceMonitor } from './performance/performance-monitor';
export { WASMASTCoordinator } from './wasm-ast-coordinator';

// Types
export * from './types/ast-types';

// Test suite
export { WASMASTTestSuite } from './tests/wasm-ast-test-suite';

// Convenience factory functions
export function createWASMASTCoordinator(swarmId: string, config?: any) {
  return new WASMASTCoordinator(swarmId, config);
}

export function createWASMEngine(config?: any) {
  return new WASMEngine(config);
}

export function createPerformanceMonitor() {
  return new PerformanceMonitor();
}

// Main entry point for quick setup
export async function initializeWASMASTSystem(swarmId: string = 'default-wasm-ast-swarm') {
  const coordinator = createWASMASTCoordinator(swarmId);
  await coordinator.initialize();

  console.log(`🚀 WASM AST System initialized with swarm ID: ${swarmId}`);
  console.log('📊 Sub-millisecond performance targets enabled');
  console.log('🔗 Redis swarm coordination active');
  console.log('📈 Real-time monitoring started');

  return coordinator;
}

// Version information
export const WASM_AST_VERSION = '1.0.0';
export const PERFORMANCE_TARGETS = {
  SUB_MILLISECOND_OPERATIONS: 0.95,    // 95% of operations under 1ms
  LARGE_SCALE_PROCESSING: 1000,         // 1000+ files processing
  REAL_TIME_TRANSFORMATIONS: true,      // Real-time code transformation
  REDIS_COORDINATION: true,             // Redis-based swarm coordination
} as const;

export default {
  WASMASTCoordinator,
  WASMEngine,
  RealTimeASTProcessor,
  CodeTransformationPipeline,
  PerformanceMonitor,
  WASMASTTestSuite,
  createWASMASTCoordinator,
  createWASMEngine,
  createPerformanceMonitor,
  initializeWASMASTSystem,
  WASM_AST_VERSION,
  PERFORMANCE_TARGETS,
};