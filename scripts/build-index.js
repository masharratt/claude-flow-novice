#!/usr/bin/env node

/**
 * Create index.js file in build output
 */

const fs = require('fs');
const path = require('path');

const buildDir = '.claude-flow-novice/dist';
const indexPath = path.join(buildDir, 'index.js');

// Create main index.js file
const indexContent = `/**
 * Claude Flow Novice - Main Entry Point
 * AI agent orchestration framework for beginners
 */

// Export main modules
export { AgentManager } from './src/core/agent-manager.js';
export { SimpleAgent } from './src/agents/simple-agent.js';
export { AgentType } from './src/types/agent-types.js';
export { ProjectManager } from './src/core/project-manager.js';

// Export CLI for direct usage
export { default as cli } from './src/cli/main.js';

// Export MCP server
export { default as mcpServer } from './mcp/mcp-server-sdk.js';

// Export core functionality
export * from './src/core/index.js';
`;

// Ensure build directory exists
if (!fs.existsSync(buildDir)) {
  fs.mkdirSync(buildDir, { recursive: true });
}

// Write index.js
fs.writeFileSync(indexPath, indexContent);

console.log('✅ Created main entry point:', indexPath);