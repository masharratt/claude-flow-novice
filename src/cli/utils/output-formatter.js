/**
 * Output Formatter Utilities for CLI Swarm Interface
 */

import { writeFileSync } from 'fs';
import { createWriteStream } from 'fs';

/**
 * Base output formatter class
 */
class OutputFormatter {
  constructor(options = {}) {
    this.options = {
      verbose: options.verbose || false,
      color: options.color !== false, // Default to color
      timestamp: options.timestamp || false,
      ...options
    };
  }

  /**
   * Format and output data
   */
  format(data, format = 'text') {
    switch (format.toLowerCase()) {
      case 'json':
        return this.formatJSON(data);
      case 'stream':
        return this.formatStream(data);
      case 'text':
      default:
        return this.formatText(data);
    }
  }

  /**
   * Format data as JSON
   */
  formatJSON(data) {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      ...data
    }, null, 2);
  }

  /**
   * Format data as stream (single line JSON)
   */
  formatStream(data) {
    return JSON.stringify({
      type: 'swarm_update',
      timestamp: new Date().toISOString(),
      data
    });
  }

  /**
   * Format data as text
   */
  formatText(data) {
    let output = '';

    if (this.options.timestamp) {
      output += `[${new Date().toISOString()}] `;
    }

    if (data.type === 'swarm_started') {
      output += this.formatSwarmStarted(data);
    } else if (data.type === 'swarm_progress') {
      output += this.formatSwarmProgress(data);
    } else if (data.type === 'swarm_completed') {
      output += this.formatSwarmCompleted(data);
    } else if (data.type === 'agent_spawned') {
      output += this.formatAgentSpawned(data);
    } else if (data.type === 'task_started') {
      output += this.formatTaskStarted(data);
    } else if (data.type === 'task_completed') {
      output += this.formatTaskCompleted(data);
    } else if (data.type === 'error') {
      output += this.formatError(data);
    } else {
      output += this.formatGeneric(data);
    }

    return output;
  }

  formatSwarmStarted(data) {
    const { swarmId, objective, config } = data;
    let output = `🚀 Swarm Started\n`;
    output += `  🆔 ID: ${swarmId}\n`;
    output += `  📋 Objective: ${objective}\n`;
    output += `  🎯 Strategy: ${config.strategy}\n`;
    output += `  🏗️  Mode: ${config.mode}\n`;
    output += `  🤖 Max Agents: ${config.maxAgents}\n`;
    if (config.timeout) {
      output += `  ⏰ Timeout: ${config.timeout} minutes\n`;
    }
    return output;
  }

  formatSwarmProgress(data) {
    const { swarmId, progress, currentPhase } = data;
    let output = `📊 Swarm Progress: ${swarmId}\n`;
    output += `  📈 Progress: ${progress}%\n`;
    if (currentPhase) {
      output += `  🔄 Current Phase: ${currentPhase}\n`;
    }
    return output;
  }

  formatSwarmCompleted(data) {
    const { swarmId, success, summary, duration } = data;
    let output = success ? '✅ Swarm Completed\n' : '❌ Swarm Failed\n';
    output += `  🆔 ID: ${swarmId}\n`;

    if (summary) {
      output += `  🤖 Agents: ${summary.agents || 0}\n`;
      output += `  📋 Tasks: ${summary.tasks?.completed || 0}/${summary.tasks?.total || 0}\n`;
    }

    if (duration) {
      output += `  ⏱️  Duration: ${Math.round(duration / 1000)}s\n`;
    }

    return output;
  }

  formatAgentSpawned(data) {
    const { agentId, type, name } = data;
    return `🤖 Agent Spawned: ${name} (${type}) [${agentId}]\n`;
  }

  formatTaskStarted(data) {
    const { taskId, description, assignedTo } = data;
    let output = `📋 Task Started: ${description} [${taskId}]\n`;
    if (assignedTo) {
      output += `  👤 Assigned to: ${assignedTo}\n`;
    }
    return output;
  }

  formatTaskCompleted(data) {
    const { taskId, description, duration, success } = data;
    let output = success ? '✅ Task Completed' : '❌ Task Failed';
    output += `: ${description} [${taskId}]\n`;

    if (duration) {
      output += `  ⏱️  Duration: ${Math.round(duration / 1000)}s\n`;
    }

    return output;
  }

  formatError(data) {
    const { error, context } = data;
    let output = `❌ Error: ${error}\n`;
    if (context && this.options.verbose) {
      output += `  📍 Context: ${context}\n`;
    }
    return output;
  }

  formatGeneric(data) {
    return `📄 ${JSON.stringify(data, null, 2)}\n`;
  }
}

/**
 * Streaming output formatter for real-time updates
 */
class StreamFormatter extends OutputFormatter {
  constructor(options = {}) {
    super(options);
    this.stream = options.stream || process.stdout;
  }

  /**
   * Write data to stream
   */
  write(data, format = 'stream') {
    const formatted = this.format(data, format);
    this.stream.write(formatted + '\n');
  }

  /**
   * Start streaming output
   */
  startStreaming() {
    if (this.options.file) {
      this.stream = createWriteStream(this.options.file, { flags: 'a' });
      this.stream.on('error', (err) => {
        console.error('Stream error:', err.message);
      });
    }
  }

  /**
   * Stop streaming and cleanup
   */
  stopStreaming() {
    if (this.options.file && this.stream !== process.stdout) {
      this.stream.end();
    }
  }
}

/**
 * Batch output formatter for collecting all output
 */
class BatchFormatter extends OutputFormatter {
  constructor(options = {}) {
    super(options);
    this.output = [];
  }

  /**
   * Add data to batch
   */
  add(data, format = 'text') {
    const formatted = this.format(data, format);
    this.output.push({
      data: formatted,
      timestamp: Date.now(),
      format
    });
  }

  /**
   * Get all formatted output
   */
  getOutput(format = null) {
    if (format) {
      // Filter by format
      return this.output.filter(item => item.format === format).map(item => item.data);
    }
    return this.output.map(item => item.data);
  }

  /**
   * Save batch output to file
   */
  saveToFile(filePath, format = null) {
    const output = this.getOutput(format).join('\n');
    writeFileSync(filePath, output);
    return output.length;
  }

  /**
   * Clear batch
   */
  clear() {
    this.output = [];
  }

  /**
   * Get batch statistics
   */
  getStats() {
    const stats = {
      total: this.output.length,
      byFormat: {},
      firstTimestamp: null,
      lastTimestamp: null
    };

    this.output.forEach(item => {
      stats.byFormat[item.format] = (stats.byFormat[item.format] || 0) + 1;

      if (!stats.firstTimestamp || item.timestamp < stats.firstTimestamp) {
        stats.firstTimestamp = item.timestamp;
      }

      if (!stats.lastTimestamp || item.timestamp > stats.lastTimestamp) {
        stats.lastTimestamp = item.timestamp;
      }
    });

    if (stats.firstTimestamp && stats.lastTimestamp) {
      stats.duration = stats.lastTimestamp - stats.firstTimestamp;
    }

    return stats;
  }
}

/**
 * Progress bar formatter
 */
class ProgressFormatter {
  constructor(options = {}) {
    this.options = {
      width: options.width || 40,
      complete: options.complete || '█',
      incomplete: options.incomplete || '░',
      showPercentage: options.showPercentage !== false,
      showTime: options.showTime !== false,
      ...options
    };
  }

  /**
   * Format progress bar
   */
  format(current, total, suffix = '') {
    const percentage = Math.round((current / total) * 100);
    const completedLength = Math.round((this.options.width * current) / total);
    const incompleteLength = this.options.width - completedLength;

    let bar = this.options.complete.repeat(completedLength);
    bar += this.options.incomplete.repeat(incompleteLength);

    let output = `[${bar}]`;

    if (this.options.showPercentage) {
      output += ` ${percentage}%`;
    }

    if (this.options.showTime) {
      output += ` (${current}/${total})`;
    }

    if (suffix) {
      output += ` ${suffix}`;
    }

    return output;
  }

  /**
   * Update progress bar in-place
   */
  update(current, total, suffix = '') {
    const bar = this.format(current, total, suffix);
    process.stdout.write(`\r${bar}`);

    if (current >= total) {
      process.stdout.write('\n');
    }
  }
}

/**
 * Table formatter for structured data
 */
class TableFormatter {
  constructor(options = {}) {
    this.options = {
      border: options.border !== false,
      header: options.header !== false,
      padding: options.padding || 1,
      ...options
    };
  }

  /**
   * Format data as table
   */
  format(data, columns) {
    if (!Array.isArray(data) || data.length === 0) {
      return 'No data to display';
    }

    // Calculate column widths
    const widths = {};
    columns.forEach(col => {
      widths[col.key] = Math.max(
        col.label.length,
        ...data.map(row => String(row[col.key] || '').length)
      );
    });

    let output = '';

    // Header
    if (this.options.header) {
      output += this.formatRow(columns.map(col => col.label), widths);
      if (this.options.border) {
        output += this.formatSeparator(widths);
      }
    }

    // Data rows
    data.forEach(row => {
      output += this.formatRow(
        columns.map(col => String(row[col.key] || '')),
        widths
      );
    });

    return output;
  }

  formatRow(values, widths) {
    const padding = ' '.repeat(this.options.padding);
    let row = '';

    if (this.options.border) {
      row += '│';
    }

    values.forEach((value, index) => {
      const key = Object.keys(widths)[index];
      const width = widths[key];
      row += padding + value.padEnd(width) + padding;

      if (this.options.border) {
        row += '│';
      }
    });

    return row + '\n';
  }

  formatSeparator(widths) {
    if (!this.options.border) return '';

    const padding = ' '.repeat(this.options.padding);
    let separator = '├';

    Object.values(widths).forEach((width, index) => {
      separator += '─'.repeat(width + (padding.length * 2));

      if (index < Object.keys(widths).length - 1) {
        separator += '┼';
      } else {
        separator += '┤\n';
      }
    });

    return separator;
  }
}

// Export formatters
export {
  OutputFormatter,
  StreamFormatter,
  BatchFormatter,
  ProgressFormatter,
  TableFormatter
};

/**
 * Create appropriate formatter based on options
 */
export function createFormatter(options = {}) {
  if (options.streaming) {
    return new StreamFormatter(options);
  } else if (options.batch) {
    return new BatchFormatter(options);
  } else {
    return new OutputFormatter(options);
  }
}

/**
 * Helper function to format and output data
 */
export function formatAndOutput(data, format, options = {}) {
  const formatter = createFormatter(options);
  const formatted = formatter.format(data, format);

  if (options.outputFile) {
    writeFileSync(options.outputFile, formatted);
  } else {
    console.log(formatted);
  }

  return formatted;
}