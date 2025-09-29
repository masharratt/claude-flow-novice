#!/usr/bin/env node

/**
 * SPARC Methodology Slash Command
 * Usage: /sparc <mode> <task>
 */

import { SlashCommand } from '../core/slash-command.js';

export class SparcCommand extends SlashCommand {
  constructor() {
    super('sparc', 'Execute SPARC methodology phases');
  }

  async execute(args, context) {
    const [mode, ...taskArgs] = args;
    const task = taskArgs.join(' ');

    const modes = {
      'spec': 'Specification - Requirements analysis and user story definition',
      'pseudo': 'Pseudocode - Algorithm design and logic flow',
      'arch': 'Architecture - System design and component structure',
      'refine': 'Refinement - Iterative improvement and optimization',
      'complete': 'Completion - Final implementation and testing'
    };

    if (!mode || !modes[mode]) {
      return {
        success: false,
        error: `Invalid mode. Available modes: ${Object.keys(modes).join(', ')}`,
        usage: '/sparc <mode> <task_description>'
      };
    }

    if (!task) {
      return {
        success: false,
        error: 'Task description required',
        usage: `/sparc ${mode} <task_description>`
      };
    }

    console.log(`🎯 SPARC ${mode.toUpperCase()}: ${task}`);

    const sparcPrompt = `
🎯 **SPARC Methodology - ${modes[mode]}**

**Task**: ${task}

**Phase**: ${mode.toUpperCase()}
**Description**: ${modes[mode]}

**Instructions for ${mode.toUpperCase()} phase**:
${this.getPhaseInstructions(mode)}

**Execute this SPARC phase now**:
`;

    return {
      success: true,
      prompt: sparcPrompt,
      mode: `sparc-${mode}`,
      task: task,
      timestamp: new Date().toISOString()
    };
  }

  getPhaseInstructions(mode) {
    const instructions = {
      'spec': `
- Define clear requirements and acceptance criteria
- Create user stories and use cases
- Identify constraints and assumptions
- Specify input/output requirements
- Document functional and non-functional requirements`,

      'pseudo': `
- Break down the problem into logical steps
- Write high-level algorithm pseudocode
- Define data structures and flow
- Identify key functions and modules
- Plan error handling and edge cases`,

      'arch': `
- Design system architecture and components
- Define interfaces and APIs
- Choose appropriate patterns and technologies
- Plan data flow and storage
- Consider scalability and maintainability`,

      'refine': `
- Review and improve the design
- Optimize algorithms and data structures
- Refactor for clarity and efficiency
- Add comprehensive error handling
- Enhance documentation and comments`,

      'complete': `
- Implement the final solution
- Write comprehensive tests
- Perform integration testing
- Document usage and deployment
- Prepare for production deployment`
    };

    return instructions[mode] || 'Execute the specified SPARC phase';
  }
}

export default SparcCommand;