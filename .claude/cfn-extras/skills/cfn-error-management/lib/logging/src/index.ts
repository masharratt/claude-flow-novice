/**
 * CFN Error Logging - Barrel Export
 * 
 * Main entry point for the error logging module.
 * Exports all public APIs from error-logger and types.
 */

// Export all types
export * from './types';

// Export main error logger class and utilities
export { ErrorLogger } from './error-logger';
