/**
 * Frontend Agent Team
 * Coordinates UI design, interaction testing, and state architecture
 */

export { UIDesigner } from './ui-designer';
export { InteractionTester } from './interaction-tester';
export { StateArchitect } from './state-architect';

export const FRONTEND_TEAM_CAPABILITIES = {
  uiDesigner: {
    name: 'UI Designer',
    description: 'Component design, layout, accessibility, shadcn integration',
    mcpTools: ['mcp__shadcn__getComponents', 'mcp__shadcn__getComponent'],
    expertise: ['react', 'tailwindcss', 'shadcn/ui', 'responsive-design', 'accessibility'],
  },
  interactionTester: {
    name: 'Interaction Tester',
    description: 'Browser automation, user flows, visual regression, Playwright integration',
    mcpTools: [
      'mcp__playwright__browser_navigate',
      'mcp__playwright__browser_click',
      'mcp__playwright__browser_snapshot',
      'mcp__playwright__browser_take_screenshot',
    ],
    expertise: ['playwright', 'e2e-testing', 'visual-testing', 'accessibility-testing'],
  },
  stateArchitect: {
    name: 'State Architect',
    description: 'State management, data flow, sequential planning',
    mcpTools: ['mcp__sequential-thinking'],
    expertise: ['zustand', 'react-query', 'state-management', 'data-fetching', 'architecture'],
  },
};

/**
 * Frontend team coordination
 */
export class FrontendTeam {
  /**
   * Coordinate full frontend implementation
   */
  static async coordinateImplementation(requirements: any): Promise<any> {
    return {
      phase: 'coordination',
      teams: [
        { agent: 'state-architect', task: 'Design state architecture', priority: 1 },
        { agent: 'ui-designer', task: 'Design component hierarchy', priority: 2 },
        { agent: 'interaction-tester', task: 'Plan test scenarios', priority: 3 },
      ],
      mcpIntegration: {
        sequentialThinking: 'Planning agent coordination',
        shadcn: 'Component specifications',
        playwright: 'Interaction validation',
      },
    };
  }

  /**
   * Recommended agent spawning pattern
   */
  static getSpawnPattern(complexity: 'simple' | 'medium' | 'complex'): any {
    const patterns = {
      simple: {
        agents: ['ui-designer', 'interaction-tester'],
        topology: 'mesh',
        maxAgents: 2,
      },
      medium: {
        agents: ['state-architect', 'ui-designer', 'interaction-tester'],
        topology: 'mesh',
        maxAgents: 3,
      },
      complex: {
        agents: [
          'state-architect',
          'ui-designer',
          'ui-designer', // Multiple for parallel component work
          'interaction-tester',
          'interaction-tester', // Multiple for parallel test scenarios
        ],
        topology: 'hierarchical',
        maxAgents: 5,
      },
    };

    return patterns[complexity];
  }
}

export default FrontendTeam;
