#!/usr/bin/env node

/**
 * Claude Flow Novice CLI
 * Simple command-line interface for AI agent orchestration
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { AgentManager } from '../core/agent-manager.js';
import { ProjectManager } from '../core/project-manager.js';
import { AgentType } from '../types/agent-types.js';

const program = new Command();

// ASCII Art Banner
const banner = `
 ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗    ███████╗██╗      ██████╗ ██╗    ██╗
██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝    ██╔════╝██║     ██╔═══██╗██║    ██║
██║     ██║     ███████║██║   ██║██║  ██║█████╗      █████╗  ██║     ██║   ██║██║ █╗ ██║
██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝      ██╔══╝  ██║     ██║   ██║██║███╗██║
╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗    ██║     ███████╗╚██████╔╝╚███╔███╔╝
 ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝    ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝

                               N O V I C E   E D I T I O N
`;

program
  .name('claude-flow-novice')
  .description('Simplified AI Agent Orchestration for Beginners')
  .version('1.0.0')
  .hook('preAction', () => {
    console.log(chalk.cyan(banner));
  });

// Initialize project
program
  .command('init')
  .description('Initialize a new Claude Flow Novice project')
  .argument('<name>', 'Project name')
  .option('-d, --description <desc>', 'Project description')
  .action((name, options) => {
    try {
      const projectManager = new ProjectManager();
      projectManager.initProject(name, options.description);
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// Project status
program
  .command('status')
  .description('Show project status')
  .action(() => {
    try {
      const projectManager = new ProjectManager();
      projectManager.getStatus();
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// Agent commands
const agentCmd = program
  .command('agent')
  .description('Manage agents');

agentCmd
  .command('create')
  .description('Create a new agent')
  .argument('<type>', 'Agent type (researcher, coder, reviewer, planner)')
  .argument('<task>', 'Task description')
  .action((type, task) => {
    try {
      if (!Object.values(AgentType).includes(type as AgentType)) {
        throw new Error(`Invalid agent type. Use: ${Object.values(AgentType).join(', ')}`);
      }

      const agentManager = new AgentManager();
      const id = agentManager.createAgent(type as AgentType, task);
      console.log(chalk.green(`Agent created with ID: ${id}`));
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

agentCmd
  .command('list')
  .description('List all agents')
  .action(() => {
    try {
      const agentManager = new AgentManager();
      const agents = agentManager.listAgents();

      if (agents.length === 0) {
        console.log(chalk.yellow('No agents found. Create one with: agent create <type> <task>'));
        return;
      }

      console.log(chalk.bold('\\n🤖 Agents:'));
      agents.forEach(agent => {
        const statusColor = agent.status === 'completed' ? 'green' :
                           agent.status === 'failed' ? 'red' : 'yellow';
        console.log(`  ${agent.id} - ${chalk[statusColor](agent.status)} - ${agent.type}: ${agent.task}`);
      });
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

agentCmd
  .command('remove')
  .description('Remove an agent')
  .argument('<id>', 'Agent ID')
  .action((id) => {
    try {
      const agentManager = new AgentManager();
      const success = agentManager.removeAgent(id);
      if (!success) {
        console.log(chalk.yellow(`Agent ${id} not found`));
      }
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// Run commands
program
  .command('run')
  .description('Run agents')
  .argument('[id]', 'Specific agent ID to run (optional)')
  .action(async (id) => {
    try {
      const agentManager = new AgentManager();

      if (id) {
        await agentManager.runAgent(id);
      } else {
        await agentManager.runAll();
      }
    } catch (error) {
      console.error(chalk.red('Error:'), (error as Error).message);
      process.exit(1);
    }
  });

// Help command
program
  .command('help-guide')
  .description('Show beginner guide')
  .action(() => {
    console.log(chalk.cyan(`
🎓 Claude Flow Novice - Beginner Guide

1️⃣  Initialize a project:
   claude-flow-novice init my-project

2️⃣  Create your first agent:
   claude-flow-novice agent create researcher "Research AI trends"

3️⃣  List your agents:
   claude-flow-novice agent list

4️⃣  Run your agents:
   claude-flow-novice run

🤖 Available Agent Types:
   • researcher - Gathers information and data
   • coder      - Writes and implements code
   • reviewer   - Reviews and checks quality
   • planner    - Plans and organizes tasks

💡 Tips:
   • Start with simple tasks
   • Use clear, specific task descriptions
   • Check status regularly with 'status' command
   • Remove agents you no longer need

📚 Need more help? Check the documentation or examples!
`));
  });

program.parse();