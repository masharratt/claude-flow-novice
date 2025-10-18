/**
 * ⚠️ DEPRECATED: MCP module has been removed in v2.0.0
 *
 * All MCP functionality is now available via the unified CLI.
 *
 * Migration Required:
 *
 *   Old (MCP):
 *     import { MCPServer } from 'claude-flow-novice/mcp';
 *     const server = new MCPServer();
 *
 *   New (CLI Wrapper):
 *     import { ClaudeFlowCLI } from 'claude-flow-novice';
 *     const cli = new ClaudeFlowCLI();
 *
 * See: https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md
 */

throw new Error(`
❌ MCP module has been removed in v2.0.0

The Model Context Protocol (MCP) server has been deprecated and removed.
All functionality is now available via the unified CLI.

Migration Required:

  Old (MCP):
    import { MCPServer } from 'claude-flow-novice/mcp';

  New (CLI Wrapper):
    import { ClaudeFlowCLI } from 'claude-flow-novice';
    const cli = new ClaudeFlowCLI();
    await cli.swarm.init({ objective: 'Build API' });

Documentation:
  • Migration Guide: https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md
  • CLI Help: claude-flow-novice help
  • Support: https://github.com/ruvnet/claude-flow-novice/issues
`);

export default undefined;
