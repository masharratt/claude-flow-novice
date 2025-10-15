#!/usr/bin/env node

/**
 * List Agents Rebuild Slash Command
 *
 * Rebuild the available agents list from file system
 */

export class ListAgentsRebuildCommand {
  constructor() {
    this.name = 'list-agents-rebuild';
    this.description = 'Rebuild the available agents list from file system';
    this.usage = '/list-agents-rebuild [--scan-path path] [--output file] [--format json|markdown]';
  }

  /**
   * Execute the list agents rebuild command
   * @param {Array<string>} args - Command arguments
   * @param {Object} context - Execution context
   */
  async execute(args, context = {}) {
    const options = this.parseArgs(args);

    try {
      const scanPath = options.scanPath || './src/cli/hybrid-routing';
      const outputPath = options.output || './src/cli/hybrid-routing/AVAILABLE-AGENTS.md';

      // Scan for agent files
      const agents = await this.scanForAgents(scanPath);

      // Generate agent list content
      const content = this.generateAgentList(agents, options.format);

      // Write to output file
      const fs = await import('fs/promises');
      const path = await import('path');

      await fs.writeFile(path.resolve(outputPath), content);

      return {
        success: true,
        agentsFound: agents.length,
        scanPath: scanPath,
        outputPath: outputPath,
        format: options.format,
        agents: agents,
        message: `Rebuilt agents list with ${agents.length} agents`
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to rebuild agents list: ${error.message}`,
        options: options
      };
    }
  }

  /**
   * Parse command arguments
   * @param {Array<string>} args - Command arguments
   */
  parseArgs(args) {
    const options = {
      scanPath: null,
      output: null,
      format: 'markdown'
    };

    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      if (arg.startsWith('--')) {
        const [key, value] = arg.substring(2).split('=');
        if (key === 'scan-path') {
          options.scanPath = value;
        } else if (key === 'output') {
          options.output = value;
        } else if (key === 'format') {
          options.format = value || 'markdown';
        }
      }
    }

    return options;
  }

  /**
   * Scan for agent files in the specified path
   * @param {string} scanPath - Path to scan
   */
  async scanForAgents(scanPath) {
    const fs = await import('fs/promises');
    const path = await import('path');

    const agents = [];
    const agentFiles = [];

    // Find all JavaScript and TypeScript files
    async function scanDirectory(currentPath) {
      try {
        const items = await fs.readdir(currentPath, { withFileTypes: true });

        for (const item of items) {
          const itemPath = path.join(currentPath, item.name);

          if (item.isDirectory()) {
            // Skip node_modules and other common ignore directories
            if (!['node_modules', '.git', 'dist', 'build'].includes(item.name)) {
              await scanDirectory(itemPath);
            }
          } else if (item.isFile()) {
            // Look for agent files
            const ext = path.extname(item.name);
            if (['.js', '.ts'].includes(ext)) {
              agentFiles.push(itemPath);
            }
          }
        }
      } catch (error) {
        console.warn(`Failed to scan directory ${currentPath}: ${error.message}`);
      }
    }

    await scanDirectory(path.resolve(scanPath));

    // Analyze each file to extract agent information
    for (const filePath of agentFiles) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const agentInfo = this.extractAgentInfo(content, filePath);

        if (agentInfo) {
          agents.push(agentInfo);
        }
      } catch (error) {
        console.warn(`Failed to analyze file ${filePath}: ${error.message}`);
      }
    }

    return agents;
  }

  /**
   * Extract agent information from file content
   * @param {string} content - File content
   * @param {string} filePath - File path
   */
  extractAgentInfo(content, filePath) {
    const path = require('path');
    const filename = path.basename(filePath, path.extname(filePath));

    // Look for agent class patterns
    const classMatch = content.match(/class\s+(\w+Agent)\s+extends\s+\w+/);
    const functionMatch = content.match(/function\s+create(\w+)Agent|const\s+(\w+)Agent\s*=/);

    // Look for export patterns
    const exportMatch = content.match(/export\s+(?:class\s+)?(\w+Agent)/);

    // Look for agent metadata
    const descriptionMatch = content.match(/(?:\/\*\*[\s\S]*?\*\/|\/\/.*description:)\s*([\s\S]*?)\s*(?:class|function|const)/);
    const capabilitiesMatch = content.match(/(?:capabilities|skills)\s*[:=]\s*\[([\s\S]*?)\]/);
    const costMatch = content.match(/cost\s*[:=]\s*(?:\$)?([\d.]+)/);

    if (classMatch || functionMatch || exportMatch) {
      const agentName = (classMatch && classMatch[1]) ||
                       (functionMatch && (functionMatch[1] || functionMatch[2])) ||
                       (exportMatch && exportMatch[1]) ||
                       filename;

      // Extract description
      let description = '';
      if (descriptionMatch) {
        description = descriptionMatch[1]
          .replace(/\/\*\*|\/\/|\*|\@/g, '')
          .replace(/\s+/g, ' ')
          .trim();
      }

      // Extract capabilities
      let capabilities = [];
      if (capabilitiesMatch) {
        const capsString = capabilitiesMatch[1];
        const capMatches = capsString.match(/['"]([^'"]+)['"]/g);
        if (capMatches) {
          capabilities = capMatches.map(cap => cap.replace(/['"]/g, ''));
        }
      }

      // Extract cost
      let cost = null;
      if (costMatch) {
        cost = parseFloat(costMatch[1]);
      }

      // Determine agent type from name or content
      let type = 'general';
      const nameLower = agentName.toLowerCase();
      if (nameLower.includes('code')) type = 'coder';
      else if (nameLower.includes('test')) type = 'tester';
      else if (nameLower.includes('architect')) type = 'architect';
      else if (nameLower.includes('security')) type = 'security';
      else if (nameLower.includes('analyst')) type = 'analyst';
      else if (nameLower.includes('design')) type = 'designer';
      else if (nameLower.includes('review')) type = 'reviewer';
      else if (nameLower.includes('optimize')) type = 'optimizer';

      return {
        name: agentName,
        type: type,
        description: description || `${type} agent for ${nameLower.replace('agent', '')} tasks`,
        capabilities: capabilities.length > 0 ? capabilities : this.getDefaultCapabilities(type),
        cost: cost || this.getDefaultCost(type),
        file: filePath,
        class: classMatch ? classMatch[1] : agentName
      };
    }

    return null;
  }

  /**
   * Get default capabilities for agent type
   * @param {string} type - Agent type
   */
  getDefaultCapabilities(type) {
    const defaults = {
      'coder': ['coding', 'implementation', 'debugging', 'refactoring'],
      'tester': ['testing', 'quality assurance', 'test coverage', 'validation'],
      'architect': ['architecture', 'design', 'planning', 'system design'],
      'security': ['security analysis', 'vulnerability assessment', 'penetration testing'],
      'analyst': ['analysis', 'research', 'documentation', 'requirements'],
      'designer': ['ui/ux design', 'user experience', 'interface design'],
      'reviewer': ['code review', 'quality assessment', 'best practices'],
      'optimizer': ['performance optimization', 'code optimization', 'efficiency'],
      'general': ['general tasks', 'problem solving', 'implementation']
    };

    return defaults[type] || defaults['general'];
  }

  /**
   * Get default cost for agent type
   * @param {string} type - Agent type
   */
  getDefaultCost(type) {
    const costs = {
      'coder': 1.0,
      'tester': 0.8,
      'architect': 1.5,
      'security': 1.2,
      'analyst': 0.9,
      'designer': 1.1,
      'reviewer': 0.7,
      'optimizer': 1.0,
      'general': 0.5
    };

    return costs[type] || 0.5;
  }

  /**
   * Generate agent list content
   * @param {Array} agents - List of agents
   * @param {string} format - Output format
   */
  generateAgentList(agents, format) {
    if (format === 'json') {
      return JSON.stringify({
        generatedAt: new Date().toISOString(),
        count: agents.length,
        agents: agents
      }, null, 2);
    }

    // Markdown format
    let content = `# Available Agents

*Generated on ${new Date().toISOString()}*
*Total agents: ${agents.length}*

`;

    // Group agents by type
    const agentsByType = agents.reduce((groups, agent) => {
      if (!groups[agent.type]) {
        groups[agent.type] = [];
      }
      groups[agent.type].push(agent);
      return groups;
    }, {});

    // Generate sections for each type
    for (const [type, typeAgents] of Object.entries(agentsByType)) {
      content += `## ${type.charAt(0).toUpperCase() + type.slice(1)} Agents\n\n`;

      for (const agent of typeAgents.sort((a, b) => a.name.localeCompare(b.name))) {
        content += `### ${agent.name}\n\n`;
        content += `**Type:** ${agent.type}\n\n`;
        content += `**Description:** ${agent.description}\n\n`;

        if (agent.capabilities.length > 0) {
          content += `**Capabilities:**\n`;
          agent.capabilities.forEach(cap => {
            content += `- ${cap}\n`;
          });
          content += '\n';
        }

        if (agent.cost !== null) {
          content += `**Cost:** $${agent.cost}/1M tokens\n\n`;
        }

        content += `**File:** \`${agent.file}\`\n\n`;

        if (agent.class && agent.class !== agent.name) {
          content += `**Class:** \`${agent.class}\`\n\n`;
        }

        content += '---\n\n';
      }
    }

    // Add usage section
    content += `## Usage

Use agents with the spawn command:

\`\`\`bash
node src/cli/hybrid-routing/spawn-workers.js \\
  "Task description" \\
  --agents=${agents.map(a => a.type).join(',')} \\
  --provider zai
\`\`\`

## Agent Types

- **coder:** Implementation, debugging, refactoring
- **tester:** Testing, quality assurance, validation
- **architect:** System design, planning, architecture
- **security:** Security analysis, vulnerability assessment
- **analyst:** Research, analysis, documentation
- **designer:** UI/UX design, user experience
- **reviewer:** Code review, quality assessment
- **optimizer:** Performance optimization, efficiency
- **general:** General tasks, problem solving

## Adding New Agents

1. Create agent class in \`src/cli/hybrid-routing/agents/\`
2. Extend appropriate base class
3. Implement required methods
4. Run \`/list-agents-rebuild\` to update this list

## Generated Metadata

This file is automatically generated. Do not edit manually.
Regenerate with: \`/list-agents-rebuild\`
`;

    return content;
  }

  /**
   * Get help information
   */
  getHelp() {
    return {
      name: this.name,
      description: this.description,
      usage: this.usage,
      examples: [
        '/list-agents-rebuild',
        '/list-agents-rebuild --scan-path ./src/agents',
        '/list-agents-rebuild --output ./CUSTOM-AGENTS.md --format json'
      ],
      options: [
        {
          name: '--scan-path',
          description: 'Path to scan for agent files (default: ./src/cli/hybrid-routing)'
        },
        {
          name: '--output',
          description: 'Output file path (default: ./src/cli/hybrid-routing/AVAILABLE-AGENTS.md)'
        },
        {
          name: '--format',
          description: 'Output format: json or markdown (default: markdown)'
        }
      ]
    };
  }
}

export default ListAgentsRebuildCommand;