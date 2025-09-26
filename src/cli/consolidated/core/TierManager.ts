/**
 * TierManager - Progressive CLI disclosure system
 * Manages 3-tier command access levels for different user experience levels
 */

export enum UserTier {
  NOVICE = 'novice',      // 5 essential commands
  INTERMEDIATE = 'intermediate', // +10 commands (15 total)
  EXPERT = 'expert'       // Full 112-tool access
}

export interface TierConfig {
  tier: UserTier;
  maxCommands: number;
  allowedFeatures: string[];
  helpLevel: 'basic' | 'detailed' | 'comprehensive';
  autoUpgrade: boolean;
}

export interface CommandMetadata {
  name: string;
  tier: UserTier;
  category: string;
  complexity: number;
  prerequisites?: string[];
  usage: string;
  description: string;
  examples: string[];
}

export class TierManager {
  private currentTier: UserTier = UserTier.NOVICE;
  private userProgress: Map<string, number> = new Map();
  private commandHistory: string[] = [];

  // Tier 1 (Novice): 5 essential commands
  private readonly noviceCommands: CommandMetadata[] = [
    {
      name: 'init',
      tier: UserTier.NOVICE,
      category: 'setup',
      complexity: 1,
      usage: 'claude-flow init [project-type]',
      description: 'Initialize a new project with intelligent defaults',
      examples: [
        'claude-flow init',
        'claude-flow init react',
        'claude-flow init "build a todo app"'
      ]
    },
    {
      name: 'build',
      tier: UserTier.NOVICE,
      category: 'development',
      complexity: 2,
      usage: 'claude-flow build [feature-description]',
      description: 'Build features using AI agents with natural language',
      examples: [
        'claude-flow build "add user authentication"',
        'claude-flow build "create REST API"',
        'claude-flow build'
      ]
    },
    {
      name: 'status',
      tier: UserTier.NOVICE,
      category: 'monitoring',
      complexity: 1,
      usage: 'claude-flow status [--detailed]',
      description: 'Check project status, agents, and recent activity',
      examples: [
        'claude-flow status',
        'claude-flow status --detailed'
      ]
    },
    {
      name: 'help',
      tier: UserTier.NOVICE,
      category: 'guidance',
      complexity: 1,
      usage: 'claude-flow help [command]',
      description: 'Get contextual help and learn new commands',
      examples: [
        'claude-flow help',
        'claude-flow help build',
        'claude-flow help --interactive'
      ]
    },
    {
      name: 'learn',
      tier: UserTier.NOVICE,
      category: 'progression',
      complexity: 1,
      usage: 'claude-flow learn [topic]',
      description: 'Learn advanced features and unlock new commands',
      examples: [
        'claude-flow learn',
        'claude-flow learn agents',
        'claude-flow learn "testing strategies"'
      ]
    }
  ];

  // Tier 2 (Intermediate): Additional 10 commands
  private readonly intermediateCommands: CommandMetadata[] = [
    {
      name: 'agents',
      tier: UserTier.INTERMEDIATE,
      category: 'agents',
      complexity: 3,
      usage: 'claude-flow agents <action> [options]',
      description: 'Direct agent management and spawning',
      examples: [
        'claude-flow agents list',
        'claude-flow agents spawn coder',
        'claude-flow agents metrics'
      ]
    },
    {
      name: 'test',
      tier: UserTier.INTERMEDIATE,
      category: 'quality',
      complexity: 3,
      usage: 'claude-flow test [test-type]',
      description: 'Run tests with AI-powered test generation',
      examples: [
        'claude-flow test',
        'claude-flow test unit',
        'claude-flow test "integration tests for API"'
      ]
    },
    {
      name: 'deploy',
      tier: UserTier.INTERMEDIATE,
      category: 'deployment',
      complexity: 4,
      usage: 'claude-flow deploy [environment]',
      description: 'Deploy with intelligent CI/CD setup',
      examples: [
        'claude-flow deploy staging',
        'claude-flow deploy production --auto-setup'
      ]
    },
    {
      name: 'optimize',
      tier: UserTier.INTERMEDIATE,
      category: 'performance',
      complexity: 4,
      usage: 'claude-flow optimize [target]',
      description: 'Performance optimization with AI analysis',
      examples: [
        'claude-flow optimize',
        'claude-flow optimize bundle-size',
        'claude-flow optimize database'
      ]
    },
    {
      name: 'review',
      tier: UserTier.INTERMEDIATE,
      category: 'quality',
      complexity: 3,
      usage: 'claude-flow review [scope]',
      description: 'AI code review and quality analysis',
      examples: [
        'claude-flow review',
        'claude-flow review security',
        'claude-flow review performance'
      ]
    }
  ];

  constructor() {
    this.loadUserProgress();
  }

  getCurrentTier(): UserTier {
    return this.currentTier;
  }

  getAvailableCommands(): CommandMetadata[] {
    switch (this.currentTier) {
      case UserTier.NOVICE:
        return this.noviceCommands;
      case UserTier.INTERMEDIATE:
        return [...this.noviceCommands, ...this.intermediateCommands];
      case UserTier.EXPERT:
        return this.getAllCommands();
      default:
        return this.noviceCommands;
    }
  }

  isCommandAvailable(commandName: string): boolean {
    return this.getAvailableCommands().some(cmd => cmd.name === commandName);
  }

  recordCommandUsage(commandName: string): void {
    this.commandHistory.push(commandName);
    const usage = this.userProgress.get(commandName) || 0;
    this.userProgress.set(commandName, usage + 1);

    this.evaluateTierUpgrade();
    this.saveUserProgress();
  }

  evaluateTierUpgrade(): boolean {
    if (this.currentTier === UserTier.EXPERT) {
      return false;
    }

    const totalCommands = this.commandHistory.length;
    const uniqueCommands = new Set(this.commandHistory).size;
    const successRate = this.calculateSuccessRate();

    // Upgrade to Intermediate
    if (this.currentTier === UserTier.NOVICE) {
      if (totalCommands >= 10 && uniqueCommands >= 4 && successRate > 0.8) {
        this.upgradeTier(UserTier.INTERMEDIATE);
        return true;
      }
    }

    // Upgrade to Expert
    if (this.currentTier === UserTier.INTERMEDIATE) {
      if (totalCommands >= 25 && uniqueCommands >= 10 && successRate > 0.85) {
        this.upgradeTier(UserTier.EXPERT);
        return true;
      }
    }

    return false;
  }

  private upgradeTier(newTier: UserTier): void {
    const oldTier = this.currentTier;
    this.currentTier = newTier;

    console.log(`\n🎉 Congratulations! You've been upgraded from ${oldTier} to ${newTier}!`);
    console.log(`You now have access to ${this.getAvailableCommands().length} commands.`);
    console.log(`Run 'claude-flow help --new-features' to see what's new.`);
  }

  private calculateSuccessRate(): number {
    // In a real implementation, this would track command success/failure
    // For now, return a reasonable default
    return 0.85;
  }

  private getAllCommands(): CommandMetadata[] {
    // This would include all 112 tools mapped to command metadata
    return [...this.noviceCommands, ...this.intermediateCommands];
  }

  private loadUserProgress(): void {
    try {
      const progressFile = process.env.HOME + '/.claude-flow/user-progress.json';
      // Implementation would load from file
    } catch (error) {
      // Start fresh
    }
  }

  private saveUserProgress(): void {
    try {
      const progressFile = process.env.HOME + '/.claude-flow/user-progress.json';
      // Implementation would save to file
    } catch (error) {
      console.warn('Could not save user progress');
    }
  }

  getTierConfig(): TierConfig {
    const configs: Record<UserTier, TierConfig> = {
      [UserTier.NOVICE]: {
        tier: UserTier.NOVICE,
        maxCommands: 5,
        allowedFeatures: ['basic-agents', 'simple-workflows'],
        helpLevel: 'basic',
        autoUpgrade: true
      },
      [UserTier.INTERMEDIATE]: {
        tier: UserTier.INTERMEDIATE,
        maxCommands: 15,
        allowedFeatures: ['direct-agents', 'custom-workflows', 'testing'],
        helpLevel: 'detailed',
        autoUpgrade: true
      },
      [UserTier.EXPERT]: {
        tier: UserTier.EXPERT,
        maxCommands: 112,
        allowedFeatures: ['all'],
        helpLevel: 'comprehensive',
        autoUpgrade: false
      }
    };

    return configs[this.currentTier];
  }

  getProgressSummary(): {
    currentTier: UserTier;
    commandsUsed: number;
    uniqueCommands: number;
    nextTierRequirements?: string;
    availableCommands: number;
  } {
    const totalCommands = this.commandHistory.length;
    const uniqueCommands = new Set(this.commandHistory).size;

    let nextTierRequirements: string | undefined;

    if (this.currentTier === UserTier.NOVICE) {
      nextTierRequirements = `Use ${Math.max(0, 10 - totalCommands)} more commands and try ${Math.max(0, 4 - uniqueCommands)} different commands to unlock Intermediate tier`;
    } else if (this.currentTier === UserTier.INTERMEDIATE) {
      nextTierRequirements = `Use ${Math.max(0, 25 - totalCommands)} more commands and try ${Math.max(0, 10 - uniqueCommands)} different commands to unlock Expert tier`;
    }

    return {
      currentTier: this.currentTier,
      commandsUsed: totalCommands,
      uniqueCommands,
      nextTierRequirements,
      availableCommands: this.getAvailableCommands().length
    };
  }
}