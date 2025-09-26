/**
 * Team Collaboration CLI Commands
 *
 * Command-line interface for team collaboration and preference sharing
 */

import TeamCollaborationSystem from './team-sync.js';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';

export class TeamCollaborationCLI {
  constructor() {
    this.teamSystem = new TeamCollaborationSystem();
  }

  async initialize() {
    await this.teamSystem.initialize();
  }

  async handleCommand(command, args) {
    switch (command) {
      case 'create':
        return await this.createTeam(args);

      case 'join':
        return await this.joinTeam(args);

      case 'sync':
        return await this.syncPreferences(args);

      case 'status':
        return await this.showTeamStatus(args);

      case 'members':
        return await this.manageMembers(args);

      case 'preferences':
        return await this.manageSharedPreferences(args);

      case 'conflicts':
        return await this.handleConflicts(args);

      case 'export':
        return await this.exportTeamConfig(args);

      case 'import':
        return await this.importTeamConfig(args);

      case 'leave':
        return await this.leaveTeam(args);

      default:
        return this.showHelp();
    }
  }

  async createTeam(args) {
    if (args.length === 0) {
      console.log('❌ Please provide a team name');
      return { success: false };
    }

    const teamName = args[0];
    const interactive = args.includes('--interactive');

    let teamConfig = {
      name: teamName,
      description: '',
      mode: 'developer',
      members: [],
      sharedPreferences: {},
    };

    if (interactive) {
      teamConfig = await this.interactiveTeamCreation(teamConfig);
    }

    try {
      const team = await this.teamSystem.createTeam(teamConfig);

      console.log('✅ Team created successfully!');
      console.log(`📋 Team ID: ${team.id}`);
      console.log(`👥 Team Name: ${team.name}`);
      console.log(`🎯 Mode: ${team.mode}`);
      console.log(`📅 Created: ${new Date(team.createdAt).toLocaleString()}`);

      console.log('\n💡 Next steps:');
      console.log(`1. Share team ID with members: ${team.id}`);
      console.log(`2. Members can join with: claude-flow-novice team join ${team.id}`);
      console.log('3. Configure shared preferences with: claude-flow-novice team preferences');

      return { success: true, team };
    } catch (error) {
      console.log(`❌ Failed to create team: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async interactiveTeamCreation(baseConfig) {
    const { default: inquirer } = await import('inquirer');

    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Team description (optional):',
        default: '',
      },
      {
        type: 'list',
        name: 'mode',
        message: 'Collaboration mode:',
        choices: [
          {
            name: 'Developer Team - Code quality focused',
            value: 'developer',
          },
          {
            name: 'Research Team - Documentation focused',
            value: 'research',
          },
          {
            name: 'Enterprise Team - Standardized settings',
            value: 'enterprise',
          },
          {
            name: 'Flexible Team - Minimal shared preferences',
            value: 'flexible',
          },
        ],
      },
      {
        type: 'confirm',
        name: 'autoSync',
        message: 'Enable automatic preference synchronization?',
        default: true,
      },
    ]);

    return {
      ...baseConfig,
      ...answers,
    };
  }

  async joinTeam(args) {
    if (args.length === 0) {
      console.log('❌ Please provide a team ID');
      console.log('Usage: claude-flow-novice team join <team-id> [member-name]');
      return { success: false };
    }

    const teamId = args[0];
    const memberName = args[1] || 'Anonymous';

    try {
      // Load current user preferences to sync with team
      const currentPrefs = await this.loadCurrentUserPreferences();

      const memberInfo = {
        name: memberName,
        role: 'member',
        preferences: currentPrefs,
      };

      const member = await this.teamSystem.joinTeam(teamId, memberInfo);

      console.log('✅ Successfully joined team!');
      console.log(`👤 Member ID: ${member.id}`);
      console.log(`📋 Team ID: ${teamId}`);
      console.log(`📅 Joined: ${new Date(member.joinedAt).toLocaleString()}`);

      // Perform initial sync
      console.log('\n🔄 Performing initial preference sync...');
      const syncResult = await this.teamSystem.syncPreferences(teamId, member.id, currentPrefs);

      if (syncResult.conflicts > 0) {
        console.log(`⚠️  Resolved ${syncResult.conflicts} preference conflicts`);
      }

      console.log('🎉 Team setup complete! Your preferences are now synchronized.');

      return { success: true, member, syncResult };
    } catch (error) {
      console.log(`❌ Failed to join team: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async syncPreferences(args) {
    const teamId = args[0];
    const force = args.includes('--force');

    if (!teamId) {
      console.log('❌ Please provide a team ID');
      return { success: false };
    }

    try {
      console.log('🔄 Synchronizing preferences with team...');

      const currentPrefs = await this.loadCurrentUserPreferences();
      const memberId = await this.getCurrentMemberId(teamId);

      const syncResult = await this.teamSystem.syncPreferences(teamId, memberId, currentPrefs);

      console.log('✅ Synchronization completed!');
      console.log(`📊 Conflicts resolved: ${syncResult.conflicts}`);
      console.log(`📅 Synced at: ${new Date(syncResult.syncedAt).toLocaleString()}`);

      if (syncResult.conflicts > 0) {
        console.log('\n📋 Conflict resolution summary:');
        Object.entries(syncResult.resolvedPreferences).forEach(([key, value]) => {
          console.log(`  ${key}: ${JSON.stringify(value)}`);
        });

        if (!force) {
          const { default: inquirer } = await import('inquirer');
          const { applyChanges } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'applyChanges',
              message: 'Apply synchronized preferences to your local settings?',
              default: true,
            },
          ]);

          if (applyChanges) {
            await this.applyMergedPreferences(syncResult.mergedPreferences);
            console.log('✅ Local preferences updated successfully!');
          }
        }
      }

      return { success: true, syncResult };
    } catch (error) {
      console.log(`❌ Sync failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async showTeamStatus(args) {
    const teamId = args[0];

    if (!teamId) {
      console.log('❌ Please provide a team ID');
      return { success: false };
    }

    try {
      const stats = await this.teamSystem.getTeamStats(teamId);

      if (!stats) {
        console.log(`❌ Team not found: ${teamId}`);
        return { success: false };
      }

      console.log(`📋 Team Status: ${stats.team.name}\n`);
      console.log(`🆔 Team ID: ${stats.team.id}`);
      console.log(`👥 Members: ${stats.team.memberCount}`);
      console.log(`🎯 Mode: ${stats.team.mode}`);
      console.log(`📊 Version: ${stats.team.version}`);
      console.log(
        `📅 Last Sync: ${stats.team.lastSync ? new Date(stats.team.lastSync).toLocaleString() : 'Never'}\n`,
      );

      console.log('⚙️  Shared Preferences:');
      console.log(`  Count: ${stats.preferences.sharedCount}`);
      console.log(`  Keys: ${stats.preferences.sharedKeys.join(', ')}\n`);

      console.log('🔄 Synchronization:');
      console.log(`  Frequency: ${stats.sync.frequency}`);
      console.log(`  Auto Sync: ${stats.sync.autoSync ? 'Enabled' : 'Disabled'}`);
      console.log(`  Conflict Resolution: ${stats.sync.conflictResolution}`);

      return { success: true, stats };
    } catch (error) {
      console.log(`❌ Failed to get team status: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async manageMembers(args) {
    if (args.length === 0) {
      return this.showMembersHelp();
    }

    const [action, ...params] = args;

    switch (action) {
      case 'list':
        return await this.listMembers(params);
      case 'remove':
        return await this.removeMember(params);
      case 'promote':
        return await this.promoteMember(params);
      default:
        return this.showMembersHelp();
    }
  }

  async listMembers(params) {
    const teamId = params[0];

    if (!teamId) {
      console.log('❌ Please provide a team ID');
      return { success: false };
    }

    try {
      const team = await this.teamSystem.loadTeamConfig(teamId);

      if (!team) {
        console.log(`❌ Team not found: ${teamId}`);
        return { success: false };
      }

      console.log(`👥 Team Members: ${team.name}\n`);

      team.members.forEach((member, index) => {
        const roleIcon = member.role === 'admin' ? '👑' : '👤';
        console.log(`${index + 1}. ${roleIcon} ${member.name} (${member.id})`);
        console.log(`   Role: ${member.role}`);
        console.log(`   Joined: ${new Date(member.joinedAt).toLocaleString()}\n`);
      });

      return { success: true, members: team.members };
    } catch (error) {
      console.log(`❌ Failed to list members: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async exportTeamConfig(args) {
    const teamId = args[0];
    const outputFile = args[1] || `team-${teamId}-config.json`;

    if (!teamId) {
      console.log('❌ Please provide a team ID');
      return { success: false };
    }

    try {
      const team = await this.teamSystem.loadTeamConfig(teamId);
      const sharedPrefs = await this.teamSystem.loadSharedPreferences(teamId);

      const exportData = {
        team,
        sharedPreferences: sharedPrefs,
        exportedAt: new Date().toISOString(),
      };

      await writeFile(outputFile, JSON.stringify(exportData, null, 2));

      console.log(`✅ Team configuration exported to: ${outputFile}`);
      console.log(`📊 Exported data includes:`);
      console.log(`  - Team settings and member list`);
      console.log(`  - ${Object.keys(sharedPrefs).length} shared preferences`);
      console.log(`  - Collaboration mode configuration`);

      return { success: true, exportFile: outputFile };
    } catch (error) {
      console.log(`❌ Export failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  async loadCurrentUserPreferences() {
    try {
      const prefsPath = join(process.cwd(), '.claude-flow-novice/preferences/user-global.json');
      const data = await readFile(prefsPath, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      console.log('⚠️  Could not load current user preferences, using defaults');
      return {};
    }
  }

  async getCurrentMemberId(teamId) {
    // In a real implementation, this would be stored securely
    // For now, generate a temporary ID
    return `member-${Date.now()}`;
  }

  async applyMergedPreferences(mergedPreferences) {
    const prefsPath = join(process.cwd(), '.claude-flow-novice/preferences/user-global.json');

    try {
      await writeFile(prefsPath, JSON.stringify(mergedPreferences, null, 2));
    } catch (error) {
      throw new Error(`Failed to apply merged preferences: ${error.message}`);
    }
  }

  showMembersHelp() {
    console.log(`
👥 Team Members Management

Usage: claude-flow-novice team members <action> [options]

Actions:
  list <team-id>              List all team members
  remove <team-id> <member>   Remove a member from team
  promote <team-id> <member>  Promote member to admin

Examples:
  claude-flow-novice team members list abc123
  claude-flow-novice team members remove abc123 john
`);

    return { success: true };
  }

  showHelp() {
    console.log(`
👥 Team Collaboration Commands

Usage: claude-flow-novice team <command> [options]

Commands:
  create <name>               Create a new team
    --interactive               Interactive team setup

  join <team-id> [name]       Join an existing team

  sync <team-id>              Synchronize preferences with team
    --force                     Apply changes without confirmation

  status <team-id>            Show team status and information

  members <action>            Manage team members
    list <team-id>              List all members
    remove <team-id> <member>   Remove a member
    promote <team-id> <member>  Promote to admin

  preferences <team-id>       Manage shared preferences
    show                        Show current shared preferences
    add <key>                   Add preference to shared list
    remove <key>                Remove from shared list

  export <team-id> [file]     Export team configuration
  import <file>               Import team configuration
  leave <team-id>             Leave a team

  help                        Show this help message

Collaboration Modes:
  developer     Code quality focused, shared linting and build settings
  research      Documentation focused, shared verbosity and analysis
  enterprise    Standardized settings, admin-controlled changes
  flexible      Minimal sharing, maximum individual freedom

Examples:
  claude-flow-novice team create "My Dev Team" --interactive
  claude-flow-novice team join abc123 "John Developer"
  claude-flow-novice team sync abc123
  claude-flow-novice team status abc123
`);

    return { success: true };
  }
}

export default TeamCollaborationCLI;
