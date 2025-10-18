#!/usr/bin/env node

/**
 * Base SlashCommand Class
 * 
 * Provides a consistent interface for all slash commands in the claude-flow-novice system
 */

export class SlashCommand {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.version = '1.0.0';
    this.timestamp = new Date().toISOString();
  }

  /**
   * Execute the slash command
   * @param {Array} args - Command arguments
   * @param {Object} context - Execution context
   * @returns {Promise<Object>} - Command result
   */
  async execute(args, context = {}) {
    throw new Error(`Execute method must be implemented by ${this.constructor.name}`);
  }

  /**
   * Get command help information
   * @returns {Object} - Help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      version: this.version,
      usage: this.getUsage(),
      examples: this.getExamples()
    };
  }

  /**
   * Get usage string - override in subclasses
   * @returns {string} - Usage string
   */
  getUsage() {
    return `/${this.name} [options]`;
  }

  /**
   * Get examples - override in subclasses
   * @returns {Array} - Array of example strings
   */
  getExamples() {
    return [];
  }

  /**
   * Validate arguments - override in subclasses
   * @param {Array} args - Arguments to validate
   * @returns {Object} - Validation result
   */
  validateArgs(args) {
    return { valid: true };
  }

  /**
   * Format response for consistent output
   * @param {Object} result - Command result
   * @returns {Object} - Formatted response
   */
  formatResponse(result) {
    return {
      command: this.name,
      timestamp: this.timestamp,
      version: this.version,
      ...result
    };
  }

  /**
   * Log command execution
   * @param {Array} args - Command arguments
   * @param {Object} result - Execution result
   */
  logExecution(args, result) {
    console.log(`[${this.name}] Executed with args: ${JSON.stringify(args)}`);
    if (result.success) {
      console.log(`[${this.name}] Success: ${result.message || 'Command completed'}`);
    } else {
      console.error(`[${this.name}] Error: ${result.error || 'Command failed'}`);
    }
  }
}

export default SlashCommand;
