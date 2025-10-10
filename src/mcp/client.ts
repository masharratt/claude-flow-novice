/**
 * ⚠️ DEPRECATED: MCP client has been removed in v2.0.0
 *
 * All MCP functionality is now available via the unified CLI.
 *
 * Migration Required:
 *
 *   Old (MCP Client):
 *     import { MCPClient } from 'claude-flow-novice/mcp/client';
 *     const client = new MCPClient(config);
 *
 *   New (CLI Wrapper):
 *     import { ClaudeFlowCLI } from 'claude-flow-novice';
 *     const cli = new ClaudeFlowCLI();
 *     await cli.swarm.init({ objective: 'Build API' });
 *
 * See: https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md
 */

const MCP_DEPRECATION_ERROR = `
❌ MCP client has been removed in v2.0.0

The Model Context Protocol (MCP) client has been deprecated and removed.
All functionality is now available via the unified CLI.

Migration Required:

  Old (MCP Client):
    import { MCPClient } from 'claude-flow-novice/mcp/client';
    const client = new MCPClient({ transport });
    await client.connect();
    await client.request('swarm/init', { objective: 'Build API' });

  New (CLI Wrapper):
    import { ClaudeFlowCLI } from 'claude-flow-novice';
    const cli = new ClaudeFlowCLI();
    await cli.swarm.init({ objective: 'Build API' });

Documentation:
  • Migration Guide: https://github.com/ruvnet/claude-flow-novice/blob/main/MCP_DEPRECATION_NOTICE.md
  • CLI Help: claude-flow-novice help
  • Support: https://github.com/ruvnet/claude-flow-novice/issues
`;

// Throw error immediately
throw new Error(MCP_DEPRECATION_ERROR);

// Export empty to prevent import errors
export default undefined;
