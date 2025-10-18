/**
 * Unified Memory Monitoring Configuration
 *
 * This configuration is shared between claude-flow-novice and ourstories-v2
 * to ensure consistent memory monitoring behavior across all CFN-distributed systems.
 */

export const MEMORY_THRESHOLDS = {
  // Process-specific memory thresholds (in MB)
  processes: {
    // CFN Coordinators - higher limits for complex orchestration
    'cfn-coordinator-mvp': {
      memory: 2000,
      timeout: 3600000, // 60 minutes
      description: 'MVP Coordinator - rapid iteration mode'
    },
    'cfn-coordinator-standard': {
      memory: 2000,
      timeout: 3600000, // 60 minutes
      description: 'Standard Coordinator - balanced mode'
    },
    'cfn-coordinator-enterprise': {
      memory: 3000,
      timeout: 7200000, // 120 minutes
      description: 'Enterprise Coordinator - full quality gates'
    },

    // Spawn coordinators and workers
    'spawn-coordinator': {
      memory: 1500,
      timeout: 1800000, // 30 minutes
      description: 'Spawn Coordinator - worker orchestration'
    },
    'spawn-workers': {
      memory: 1500,
      timeout: 1800000, // 30 minutes
      description: 'Spawn Workers - task execution'
    },

    // Development tools and runtimes
    'node': {
      memory: 1000,
      timeout: 900000, // 15 minutes
      description: 'Node.js processes'
    },
    'rust': {
      memory: 2000,
      timeout: 3600000, // 60 minutes
      description: 'Rust processes - optimized builds'
    },
    'cargo': {
      memory: 3000,
      timeout: 7200000, // 120 minutes
      description: 'Cargo builds - memory intensive compilation'
    },

    // Default fallback
    'default': {
      memory: 1500,
      timeout: 1800000, // 30 minutes
      description: 'Default threshold for unknown processes'
    }
  },

  // Analysis parameters
  analysis: {
    // Memory growth analysis thresholds
    growthRateThreshold: 5.0, // MB/second (was 1.0)
    totalGrowthThreshold: 500, // MB (was 100)
    consistentGrowthRatio: 0.7, // 70% of samples must be increasing

    // Sample collection
    maxHistorySamples: 30,
    minSamplesForAnalysis: 10,

    // Grace periods
    newProcessGracePeriod: 60000, // 60 seconds
    sigtermToSigkillDelay: 30000, // 30 seconds (was 5000)

    // Warning levels
    warningThreshold: 0.7, // 70% of max threshold
    criticalThreshold: 1.0, // 100% of max threshold
  },

  // System-wide thresholds
  system: {
    highMemoryUsagePercent: 85, // System memory usage warning
    checkInterval: 15000, // 15 seconds (was 10000)
    maxDuration: 300000, // 5 minutes for monitoring runs
  },

  // Logging configuration
  logging: {
    enableConsoleWarnings: true,
    enableFileLogging: true,
    logLevel: 'info', // debug, info, warn, error
    maxLogFileSize: 10 * 1024 * 1024, // 10MB
    maxLogEntries: 1000
  }
};

export const MEMORY_MONITOR_DEFAULTS = {
  interval: 2000, // 2 seconds
  maxDuration: 300000, // 5 minutes
  logFile: './memory-monitor.log',
  enableLeakDetection: true,
  enableGrowthAnalysis: true,
  enableContextAwareThresholds: true
};

export const getProcessThreshold = (processName, pid = null, cmdline = null) => {
  // Direct match
  if (MEMORY_THRESHOLDS.processes[processName]) {
    return MEMORY_THRESHOLDS.processes[processName];
  }

  // Command line analysis for node processes
  if (processName === 'node' && cmdline) {
    if (cmdline.includes('cfn-coordinator-mvp')) {
      return MEMORY_THRESHOLDS.processes['cfn-coordinator-mvp'];
    } else if (cmdline.includes('cfn-coordinator-standard')) {
      return MEMORY_THRESHOLDS.processes['cfn-coordinator-standard'];
    } else if (cmdline.includes('cfn-coordinator-enterprise')) {
      return MEMORY_THRESHOLDS.processes['cfn-coordinator-enterprise'];
    } else if (cmdline.includes('spawn-coordinator') || cmdline.includes('spawn-workers')) {
      return MEMORY_THRESHOLDS.processes['spawn-coordinator'];
    }
  }

  // Default fallback
  return MEMORY_THRESHOLDS.processes['default'];
};

export const isMemoryLeakPattern = (growthRate, totalGrowth, consistentRatio) => {
  const { analysis } = MEMORY_THRESHOLDS;

  return (
    growthRate > analysis.growthRateThreshold &&
    totalGrowth > analysis.totalGrowthThreshold &&
    consistentRatio > analysis.consistentGrowthRatio
  );
};

export default {
  MEMORY_THRESHOLDS,
  MEMORY_MONITOR_DEFAULTS,
  getProcessThreshold,
  isMemoryLeakPattern
};