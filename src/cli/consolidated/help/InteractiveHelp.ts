/**
 * InteractiveHelp - Progressive disclosure help system
 * Provides contextual, interactive help with learning paths
 */

import { TierManager, UserTier, CommandMetadata } from '../core/TierManager.js';
import { IntelligenceEngine } from '../intelligence/IntelligenceEngine.js';

export interface HelpSession {
  id: string;
  startTime: number;
  currentPath: string[];
  completedTopics: string[];
  userQuestions: string[];
  suggestions: string[];
}

export interface LearningPath {
  id: string;
  name: string;
  description: string;
  tier: UserTier;
  steps: LearningStep[];
  estimatedTime: string;
  prerequisites: string[];
}

export interface LearningStep {
  id: string;
  title: string;
  content: string;
  type: 'explanation' | 'example' | 'exercise' | 'quiz';
  interactive: boolean;
  nextSteps: string[];
}

export interface HelpContext {
  command?: string;
  userTier: UserTier;
  projectType?: string;
  recentCommands: string[];
  strugglingWith?: string[];
}

export class InteractiveHelp {
  private tierManager: TierManager;
  private intelligenceEngine: IntelligenceEngine;
  private currentSession: HelpSession | null = null;
  private learningPaths: Map<string, LearningPath> = new Map();

  constructor(tierManager: TierManager, intelligenceEngine: IntelligenceEngine) {
    this.tierManager = tierManager;
    this.intelligenceEngine = intelligenceEngine;
    this.initializeLearningPaths();
  }

  /**
   * Start an interactive help session
   */
  startSession(context: HelpContext): HelpSession {
    this.currentSession = {
      id: this.generateSessionId(),
      startTime: Date.now(),
      currentPath: [],
      completedTopics: [],
      userQuestions: [],
      suggestions: this.getInitialSuggestions(context)
    };

    this.displayWelcome(context);
    return this.currentSession;
  }

  /**
   * Process user input in interactive session
   */
  async processInput(input: string): Promise<{
    response: string;
    suggestions: string[];
    nextSteps: string[];
    canExit: boolean;
  }> {
    if (!this.currentSession) {
      throw new Error('No active help session');
    }

    this.currentSession.userQuestions.push(input);

    // Handle special commands
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      return this.endSession();
    }

    if (input.toLowerCase() === 'menu' || input.toLowerCase() === 'back') {
      return this.showMainMenu();
    }

    // Analyze input and provide contextual help
    const response = await this.analyzeAndRespond(input);
    return response;
  }

  /**
   * Get contextual help for specific command
   */
  getCommandHelp(commandName: string, context: HelpContext): {
    overview: string;
    usage: string;
    examples: string[];
    tips: string[];
    relatedCommands: string[];
    troubleshooting: string[];
  } {
    const commands = this.tierManager.getAvailableCommands();
    const command = commands.find(cmd => cmd.name === commandName);

    if (!command) {
      return this.getCommandNotFoundHelp(commandName, context);
    }

    return {
      overview: this.getCommandOverview(command, context),
      usage: this.getCommandUsage(command, context),
      examples: this.getCommandExamples(command, context),
      tips: this.getCommandTips(command, context),
      relatedCommands: this.getRelatedCommands(command, context),
      troubleshooting: this.getCommandTroubleshooting(command, context)
    };
  }

  /**
   * Get learning path recommendations
   */
  getRecommendedLearningPaths(context: HelpContext): LearningPath[] {
    const userTier = context.userTier;
    const availablePaths = Array.from(this.learningPaths.values())
      .filter(path => this.canAccessLearningPath(path, userTier));

    // Sort by relevance to user's context
    return availablePaths
      .map(path => ({
        ...path,
        relevance: this.calculatePathRelevance(path, context)
      }))
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, 5)
      .map(({ relevance, ...path }) => path);
  }

  /**
   * Start a learning path
   */
  startLearningPath(pathId: string): {
    path: LearningPath;
    currentStep: LearningStep;
    progress: { current: number; total: number };
  } {
    const path = this.learningPaths.get(pathId);
    if (!path) {
      throw new Error(`Learning path '${pathId}' not found`);
    }

    if (!this.canAccessLearningPath(path, this.tierManager.getCurrentTier())) {
      throw new Error(`Learning path '${pathId}' requires ${path.tier} tier`);
    }

    const currentStep = path.steps[0];
    return {
      path,
      currentStep,
      progress: { current: 1, total: path.steps.length }
    };
  }

  /**
   * Get help for natural language queries
   */
  async getNaturalLanguageHelp(query: string, context: HelpContext): Promise<{
    interpretation: string;
    suggestions: string[];
    examples: string[];
    learnMore: string[];
  }> {
    const analysis = await this.intelligenceEngine.analyzeTask(query);

    return {
      interpretation: `I think you want to ${analysis.intent} something related to ${analysis.domain}`,
      suggestions: this.getSuggestionsForQuery(analysis, context),
      examples: this.getExamplesForQuery(analysis, context),
      learnMore: this.getLearnMoreForQuery(analysis, context)
    };
  }

  // Private implementation methods

  private initializeLearningPaths(): void {
    // Novice Learning Paths
    this.learningPaths.set('getting-started', {
      id: 'getting-started',
      name: 'Getting Started with Claude Flow',
      description: 'Learn the fundamentals of AI-powered development',
      tier: UserTier.NOVICE,
      estimatedTime: '15 minutes',
      prerequisites: [],
      steps: [
        {
          id: 'welcome',
          title: 'Welcome to Claude Flow',
          content: 'Claude Flow is your AI-powered development companion. It uses intelligent agents to help you build software faster and better.',
          type: 'explanation',
          interactive: false,
          nextSteps: ['core-commands']
        },
        {
          id: 'core-commands',
          title: 'The 5 Core Commands',
          content: 'Claude Flow has 5 essential commands:\n• init - Start new projects\n• build - Create features\n• status - Check progress\n• help - Get assistance\n• learn - Unlock more features',
          type: 'explanation',
          interactive: true,
          nextSteps: ['first-project']
        },
        {
          id: 'first-project',
          title: 'Create Your First Project',
          content: 'Try: claude-flow init "my first app"\n\nThis will create a new project with intelligent defaults based on your description.',
          type: 'exercise',
          interactive: true,
          nextSteps: ['natural-language']
        },
        {
          id: 'natural-language',
          title: 'Natural Language Magic',
          content: 'You can describe what you want in plain English:\n• "add user authentication"\n• "create a REST API"\n• "setup testing"',
          type: 'example',
          interactive: true,
          nextSteps: ['next-tier']
        },
        {
          id: 'next-tier',
          title: 'Unlock More Features',
          content: 'Keep using Claude Flow to unlock Intermediate tier with more commands and direct agent control!',
          type: 'explanation',
          interactive: false,
          nextSteps: []
        }
      ]
    });

    this.learningPaths.set('natural-language', {
      id: 'natural-language',
      name: 'Master Natural Language Commands',
      description: 'Learn to communicate effectively with AI agents',
      tier: UserTier.NOVICE,
      estimatedTime: '10 minutes',
      prerequisites: ['getting-started'],
      steps: [
        {
          id: 'basic-patterns',
          title: 'Basic Language Patterns',
          content: 'Effective patterns:\n• "add [feature]" - Add new functionality\n• "create [component]" - Build components\n• "setup [tool]" - Configure tools\n• "fix [problem]" - Resolve issues',
          type: 'explanation',
          interactive: false,
          nextSteps: ['specificity']
        },
        {
          id: 'specificity',
          title: 'Be Specific',
          content: 'Better: "add JWT authentication with login/logout"\nWorse: "add auth"\n\nSpecific descriptions get better results!',
          type: 'example',
          interactive: true,
          nextSteps: ['context']
        },
        {
          id: 'context',
          title: 'Provide Context',
          content: 'Include relevant details:\n• Framework: "using React"\n• Database: "with PostgreSQL"\n• Style: "following REST conventions"',
          type: 'explanation',
          interactive: true,
          nextSteps: ['practice']
        },
        {
          id: 'practice',
          title: 'Practice Exercise',
          content: 'Try describing these in natural language:\n1. Add a user registration form\n2. Create API endpoints for blog posts\n3. Setup automated testing',
          type: 'exercise',
          interactive: true,
          nextSteps: []
        }
      ]
    });

    // Intermediate Learning Paths
    this.learningPaths.set('agents', {
      id: 'agents',
      name: 'Understanding AI Agents',
      description: 'Learn how different agents work together',
      tier: UserTier.INTERMEDIATE,
      estimatedTime: '20 minutes',
      prerequisites: ['getting-started'],
      steps: [
        {
          id: 'agent-types',
          title: 'Agent Specializations',
          content: 'Different agents for different tasks:\n• Coder - General programming\n• Tester - Quality assurance\n• Reviewer - Code review\n• Researcher - Analysis & planning',
          type: 'explanation',
          interactive: false,
          nextSteps: ['agent-selection']
        },
        {
          id: 'agent-selection',
          title: 'How Agents Are Selected',
          content: 'Claude Flow automatically selects agents based on:\n• Task description\n• Project context\n• Complexity level\n• Your tier level',
          type: 'explanation',
          interactive: true,
          nextSteps: ['coordination']
        },
        {
          id: 'coordination',
          title: 'Agent Coordination',
          content: 'Agents work together through:\n• Shared memory\n• Workflow orchestration\n• Progress synchronization\n• Result handoffs',
          type: 'explanation',
          interactive: false,
          nextSteps: ['direct-control']
        },
        {
          id: 'direct-control',
          title: 'Direct Agent Control',
          content: 'In Intermediate tier, you can:\n• claude-flow agents list\n• claude-flow agents spawn coder\n• claude-flow agents metrics',
          type: 'example',
          interactive: true,
          nextSteps: []
        }
      ]
    });

    // Expert Learning Paths
    this.learningPaths.set('advanced-workflows', {
      id: 'advanced-workflows',
      name: 'Advanced Workflow Patterns',
      description: 'Master complex development workflows',
      tier: UserTier.EXPERT,
      estimatedTime: '30 minutes',
      prerequisites: ['agents'],
      steps: [
        {
          id: 'workflow-types',
          title: 'Workflow Patterns',
          content: 'Advanced patterns:\n• Parallel execution\n• Pipeline workflows\n• Conditional branching\n• Error recovery',
          type: 'explanation',
          interactive: false,
          nextSteps: ['custom-workflows']
        }
        // More steps would be defined...
      ]
    });
  }

  private displayWelcome(context: HelpContext): void {
    console.log('🎓 Welcome to Claude Flow Interactive Help!');
    console.log(`You're currently ${context.userTier.toUpperCase()} tier.\n`);

    if (context.command) {
      console.log(`Let's learn about the "${context.command}" command.`);
    } else {
      console.log('What would you like to learn about today?');
    }

    console.log('\nYou can:');
    console.log('• Ask questions in natural language');
    console.log('• Type "menu" to see learning paths');
    console.log('• Type "exit" to leave help');
    console.log('\nWhat would you like to know?');
  }

  private getInitialSuggestions(context: HelpContext): string[] {
    const suggestions = [];

    if (context.userTier === UserTier.NOVICE) {
      suggestions.push('How do I create a new project?');
      suggestions.push('What commands are available?');
      suggestions.push('How does natural language work?');
    } else {
      suggestions.push('How do I use agents directly?');
      suggestions.push('What are the advanced features?');
      suggestions.push('How do I optimize performance?');
    }

    if (context.recentCommands.length === 0) {
      suggestions.push('How do I get started?');
    }

    return suggestions;
  }

  private async analyzeAndRespond(input: string): Promise<{
    response: string;
    suggestions: string[];
    nextSteps: string[];
    canExit: boolean;
  }> {
    const lowerInput = input.toLowerCase();

    // Handle common questions
    if (lowerInput.includes('how') && lowerInput.includes('start')) {
      return this.handleGettingStartedQuestion();
    }

    if (lowerInput.includes('command') && lowerInput.includes('available')) {
      return this.handleAvailableCommandsQuestion();
    }

    if (lowerInput.includes('natural language') || lowerInput.includes('describe')) {
      return this.handleNaturalLanguageQuestion();
    }

    if (lowerInput.includes('agent')) {
      return this.handleAgentQuestion();
    }

    if (lowerInput.includes('tier') || lowerInput.includes('unlock')) {
      return this.handleTierQuestion();
    }

    // Try to provide contextual help using intelligence engine
    try {
      const context: HelpContext = {
        userTier: this.tierManager.getCurrentTier(),
        recentCommands: []
      };

      const nlHelp = await this.getNaturalLanguageHelp(input, context);

      return {
        response: `${nlHelp.interpretation}\n\n${nlHelp.suggestions.join('\n')}`,
        suggestions: nlHelp.examples,
        nextSteps: nlHelp.learnMore,
        canExit: false
      };
    } catch (error) {
      return this.handleUnknownQuestion(input);
    }
  }

  private handleGettingStartedQuestion(): any {
    return {
      response: `🚀 Getting started is easy!\n\n1. Create a project: claude-flow init "my app"\n2. Build features: claude-flow build "add user login"\n3. Check status: claude-flow status\n\nClaude Flow uses AI to understand what you want and creates it automatically!`,
      suggestions: [
        'Show me an example project setup',
        'What project types can I create?',
        'How does the AI understand my requests?'
      ],
      nextSteps: [
        'Try creating your first project',
        'Learn about natural language commands',
        'Explore the learning paths'
      ],
      canExit: false
    };
  }

  private handleAvailableCommandsQuestion(): any {
    const commands = this.tierManager.getAvailableCommands();
    const commandList = commands.map(cmd => `• ${cmd.name} - ${cmd.description}`).join('\n');

    return {
      response: `📋 Available Commands (${commands.length} total):\n\n${commandList}\n\nUse natural language with any command!`,
      suggestions: [
        'Tell me more about the build command',
        'How do I unlock more commands?',
        'Show me command examples'
      ],
      nextSteps: [
        'Try using a command',
        'Learn about tier progression',
        'Practice with examples'
      ],
      canExit: false
    };
  }

  private handleNaturalLanguageQuestion(): any {
    return {
      response: `🧠 Natural Language Magic!\n\nJust describe what you want:\n• "create a todo app with React"\n• "add authentication to my API"\n• "setup testing for my project"\n\nThe AI analyzes your description and selects the right agents and workflows automatically!`,
      suggestions: [
        'Give me more examples',
        'What makes a good description?',
        'How specific should I be?'
      ],
      nextSteps: [
        'Try a natural language command',
        'Learn the learning path for natural language',
        'Practice with different descriptions'
      ],
      canExit: false
    };
  }

  private handleAgentQuestion(): any {
    const tier = this.tierManager.getCurrentTier();

    if (tier === UserTier.NOVICE) {
      return {
        response: `🤖 Agents work behind the scenes!\n\nIn Novice tier, agents are selected automatically based on your requests. Different agents handle different tasks:\n• Coder - Writes code\n• Tester - Creates tests\n• Reviewer - Checks quality\n\nUnlock Intermediate tier for direct agent control!`,
        suggestions: [
          'How do I unlock more agent features?',
          'What agents are available?',
          'How do agents work together?'
        ],
        nextSteps: [
          'Use more commands to unlock Intermediate tier',
          'Learn about agent coordination',
          'Try the agents learning path'
        ],
        canExit: false
      };
    } else {
      return {
        response: `🤖 Direct Agent Control!\n\nYou can now:\n• claude-flow agents list - See active agents\n• claude-flow agents spawn [type] - Create specific agents\n• claude-flow agents metrics - Check performance\n\nAgents coordinate automatically through shared memory and workflows.`,
        suggestions: [
          'Show me agent commands',
          'How do I spawn specific agents?',
          'What metrics can I see?'
        ],
        nextSteps: [
          'Try listing active agents',
          'Spawn a specific agent',
          'Check agent metrics'
        ],
        canExit: false
      };
    }
  }

  private handleTierQuestion(): any {
    const progress = this.tierManager.getProgressSummary();

    return {
      response: `🎯 Tier System:\n\nCurrent: ${progress.currentTier.toUpperCase()}\nCommands used: ${progress.commandsUsed}\nAvailable commands: ${progress.availableCommands}\n\n${progress.nextTierRequirements || 'You have full access!'}`,
      suggestions: [
        'What features unlock at each tier?',
        'How do I progress faster?',
        'What can I do at my current tier?'
      ],
      nextSteps: [
        'Use more commands to progress',
        'Try different types of commands',
        'Explore learning paths'
      ],
      canExit: false
    };
  }

  private handleUnknownQuestion(input: string): any {
    return {
      response: `🤔 I'm not sure about "${input}"\n\nTry asking about:\n• Getting started\n• Available commands\n• Natural language\n• Agents and tiers\n• Specific features\n\nOr type "menu" to see learning paths!`,
      suggestions: [
        'How do I get started?',
        'What commands are available?',
        'Show me the menu'
      ],
      nextSteps: [
        'Try a more specific question',
        'Explore the learning menu',
        'Ask about a specific command'
      ],
      canExit: false
    };
  }

  private showMainMenu(): any {
    const paths = this.getRecommendedLearningPaths({
      userTier: this.tierManager.getCurrentTier(),
      recentCommands: []
    });

    const pathList = paths.map((path, index) =>
      `${index + 1}. ${path.name} (${path.estimatedTime})\n   ${path.description}`
    ).join('\n\n');

    return {
      response: `📚 Learning Menu\n\nRecommended learning paths:\n\n${pathList}\n\nType the number or name of a path to start, or ask a specific question.`,
      suggestions: [
        'Start getting started path',
        'Learn about natural language',
        'Understand agents'
      ],
      nextSteps: [
        'Choose a learning path',
        'Ask a specific question',
        'Type "exit" to leave help'
      ],
      canExit: false
    };
  }

  private endSession(): any {
    const session = this.currentSession!;
    const duration = Math.round((Date.now() - session.startTime) / 1000);

    this.currentSession = null;

    return {
      response: `👋 Thanks for learning with Claude Flow!\n\nSession summary:\n• Duration: ${duration} seconds\n• Topics explored: ${session.completedTopics.length}\n• Questions asked: ${session.userQuestions.length}\n\nKeep building awesome things!`,
      suggestions: [],
      nextSteps: [
        'Try what you learned',
        'Start a new help session anytime',
        'Use claude-flow learn for more'
      ],
      canExit: true
    };
  }

  private generateSessionId(): string {
    return `help-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCommandOverview(command: CommandMetadata, context: HelpContext): string {
    const baseOverview = command.description;

    if (context.projectType) {
      return `${baseOverview}\n\nFor ${context.projectType} projects: ${this.getProjectSpecificOverview(command.name, context.projectType)}`;
    }

    return baseOverview;
  }

  private getCommandUsage(command: CommandMetadata, context: HelpContext): string {
    return command.usage;
  }

  private getCommandExamples(command: CommandMetadata, context: HelpContext): string[] {
    let examples = [...command.examples];

    // Add context-specific examples
    if (context.projectType) {
      examples.push(...this.getProjectSpecificExamples(command.name, context.projectType));
    }

    return examples.slice(0, 5); // Limit to 5 examples
  }

  private getCommandTips(command: CommandMetadata, context: HelpContext): string[] {
    const tips = [];

    switch (command.name) {
      case 'init':
        tips.push('Use descriptive names for better project setup');
        tips.push('Include framework preferences in your description');
        break;
      case 'build':
        tips.push('Be specific about what you want to build');
        tips.push('Include technology preferences');
        tips.push('Mention any constraints or requirements');
        break;
      case 'status':
        tips.push('Use --detailed for comprehensive information');
        tips.push('Check status before starting new work');
        break;
    }

    return tips;
  }

  private getRelatedCommands(command: CommandMetadata, context: HelpContext): string[] {
    const related: Record<string, string[]> = {
      'init': ['build', 'status'],
      'build': ['status', 'test', 'review'],
      'status': ['build', 'agents'],
      'help': ['learn'],
      'learn': ['help']
    };

    return related[command.name] || [];
  }

  private getCommandTroubleshooting(command: CommandMetadata, context: HelpContext): string[] {
    const troubleshooting = [];

    switch (command.name) {
      case 'init':
        troubleshooting.push('If init fails, check directory permissions');
        troubleshooting.push('Use --skip-git if git initialization fails');
        break;
      case 'build':
        troubleshooting.push('If build fails, try a more specific description');
        troubleshooting.push('Use --dry-run to see what would happen');
        break;
      case 'status':
        troubleshooting.push('If status shows errors, check recent command logs');
        break;
    }

    return troubleshooting;
  }

  private getCommandNotFoundHelp(commandName: string, context: HelpContext): any {
    return {
      overview: `Command "${commandName}" not found or not available in your tier.`,
      usage: 'Use claude-flow help to see available commands',
      examples: ['claude-flow help', 'claude-flow learn'],
      tips: ['Check your tier level', 'Use more commands to unlock new features'],
      relatedCommands: ['help', 'learn'],
      troubleshooting: ['Command might require higher tier', 'Check spelling']
    };
  }

  private getProjectSpecificOverview(commandName: string, projectType: string): string {
    // Return project-specific context for commands
    return `Optimized for ${projectType} development patterns`;
  }

  private getProjectSpecificExamples(commandName: string, projectType: string): string[] {
    const examples: Record<string, Record<string, string[]>> = {
      build: {
        web: [
          'claude-flow build "add React component for user profile"',
          'claude-flow build "create responsive navigation"'
        ],
        api: [
          'claude-flow build "add REST endpoint for users"',
          'claude-flow build "implement JWT middleware"'
        ]
      }
    };

    return examples[commandName]?.[projectType] || [];
  }

  private canAccessLearningPath(path: LearningPath, userTier: UserTier): boolean {
    switch (userTier) {
      case UserTier.NOVICE:
        return path.tier === UserTier.NOVICE;
      case UserTier.INTERMEDIATE:
        return path.tier === UserTier.NOVICE || path.tier === UserTier.INTERMEDIATE;
      case UserTier.EXPERT:
        return true;
      default:
        return false;
    }
  }

  private calculatePathRelevance(path: LearningPath, context: HelpContext): number {
    let relevance = 0;

    // Base relevance by tier match
    if (path.tier === context.userTier) relevance += 3;
    if (path.tier < context.userTier) relevance += 1;

    // Boost for command-specific paths
    if (context.command && path.id.includes(context.command)) {
      relevance += 5;
    }

    // Boost for struggling areas
    if (context.strugglingWith) {
      context.strugglingWith.forEach(area => {
        if (path.id.includes(area) || path.name.toLowerCase().includes(area)) {
          relevance += 4;
        }
      });
    }

    // Boost for project type relevance
    if (context.projectType && path.description.includes(context.projectType)) {
      relevance += 2;
    }

    return relevance;
  }

  private getSuggestionsForQuery(analysis: any, context: HelpContext): string[] {
    const suggestions = [];

    switch (analysis.intent) {
      case 'create':
        suggestions.push('Use: claude-flow init "your project description"');
        suggestions.push('Try: claude-flow build "create [what you want]"');
        break;
      case 'build':
        suggestions.push('Use: claude-flow build "your feature description"');
        suggestions.push('Be specific about technologies and requirements');
        break;
      case 'test':
        if (context.userTier !== UserTier.NOVICE) {
          suggestions.push('Use: claude-flow test [test-type]');
        } else {
          suggestions.push('Use: claude-flow build "setup testing"');
        }
        break;
      default:
        suggestions.push('Try using natural language with build command');
        suggestions.push('Use claude-flow help for available commands');
    }

    return suggestions;
  }

  private getExamplesForQuery(analysis: any, context: HelpContext): string[] {
    const examples = [];

    if (analysis.domain === 'frontend') {
      examples.push('claude-flow build "create React login form"');
      examples.push('claude-flow build "add responsive navigation"');
    }

    if (analysis.domain === 'backend') {
      examples.push('claude-flow build "create REST API for users"');
      examples.push('claude-flow build "add database authentication"');
    }

    return examples;
  }

  private getLearnMoreForQuery(analysis: any, context: HelpContext): string[] {
    return [
      'claude-flow learn natural-language',
      'claude-flow help build',
      'claude-flow learn agents'
    ];
  }
}