#!/usr/bin/env node

/**
 * MCP Server - DEPRECATED in v2.0.0
 *
 * ⚠️ WARNING: MCP server has been completely removed in v2.0.0
 */

// Simple console colors without chalk (ES module compatible)
const red = (text) => `\x1b[31m${text}\x1b[0m`;
const yellow = (text) => `\x1b[33m${text}\x1b[0m`;
const cyan = (text) => `\x1b[36m${text}\x1b[0m`;
const white = (text) => `\x1b[37m${text}\x1b[0m`;
const gray = (text) => `\x1b[90m${text}\x1b[0m`;
const green = (text) => `\x1b[32m${text}\x1b[0m`;
const blue = (text) => `\x1b[34m${text}\x1b[0m`;
const bold = (text) => `\x1b[1m${text}\x1b[0m`;

console.error(bold(red('\n❌ ERROR: MCP Server has been removed in v2.0.0\n')));
console.error(yellow('The Model Context Protocol (MCP) server has been deprecated and removed.'));
console.error(yellow('All functionality is now available via the unified CLI.\n'));

console.error(cyan('Migration Required:\n'));
console.error(white('  Old (MCP):'));
console.error(gray('    node node_modules/claude-flow-novice/mcp/mcp-server.js'));
console.error(gray('    mcp://swarm/init { objective: "Build API" }\n'));

console.error(white('  New (CLI):'));
console.error(green('    claude-flow-novice start'));
console.error(green('    claude-flow-novice swarm init "Build API"\n'));

console.error(cyan('Complete Command Mapping:\n'));
console.error(white('  Swarm:'));
console.error(gray('    mcp://swarm/init       →  claude-flow-novice swarm init <objective>'));
console.error(gray('    mcp://swarm/spawn      →  claude-flow-novice swarm spawn <agent> <task>'));
console.error(gray('    mcp://swarm/status     →  claude-flow-novice swarm status\n'));

console.error(white('  Fleet:'));
console.error(gray('    mcp://fleet/init       →  claude-flow-novice fleet init --max-agents <n>'));
console.error(gray('    mcp://fleet/scale      →  claude-flow-novice fleet scale --target <n>'));
console.error(gray('    mcp://fleet/status     →  claude-flow-novice fleet status\n'));

console.error(white('  Memory:'));
console.error(gray('    mcp://memory/store     →  claude-flow-novice memory store <key> --value <val>'));
console.error(gray('    mcp://memory/retrieve  →  claude-flow-novice memory get <key>\n'));

console.error(white('  Monitoring:'));
console.error(gray('    mcp://monitor/metrics  →  claude-flow-novice monitor --component <name>'));
console.error(gray('    mcp://monitor/dashboard→  claude-flow-novice dashboard start\n'));

console.error(cyan('Programmatic Usage:\n'));
console.error(white('  Use the new CLI wrapper SDK:\n'));
console.error(green('    import { ClaudeFlowCLI } from \'claude-flow-novice\';\n'));
console.error(green('    const cli = new ClaudeFlowCLI();'));
console.error(green('    await cli.swarm.init({ objective: \'Build API\' });\n'));

console.error(cyan('Documentation:\n'));
console.error(white('  Migration Guide:'), blue('https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md'));
console.error(white('  CLI Help:'), blue('claude-flow-novice help'));
console.error(white('  Support:'), blue('https://github.com/ruvnet/claude-flow-novice/issues\n'));

console.error(bold(red('MCP server cannot be started. Please migrate to CLI.\n')));

process.exit(1);
