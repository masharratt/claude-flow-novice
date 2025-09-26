/**
 * Team Collaboration and Preference Sharing System
 *
 * Enables teams to share personalization preferences, maintain consistency,
 * and collaborate effectively with synchronized settings
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import { existsSync } from 'fs';
import crypto from 'crypto';

export class TeamCollaborationSystem {
  constructor() {
    this.teamConfigPath = '.claude-flow-novice/team';
    this.lockTimeout = 30000; // 30 seconds
    this.syncInProgress = false;
    this.collaborationModes = new Map();
    this.conflictResolvers = new Map();

    this.setupCollaborationModes();
    this.setupConflictResolvers();
  }

  async initialize() {
    await this.ensureTeamDirectories();
    await this.loadTeamConfiguration();
    await this.initializeCollaborationModes();
  }

  async ensureTeamDirectories() {
    const directories = [
      this.teamConfigPath,
      join(this.teamConfigPath, 'shared'),
      join(this.teamConfigPath, 'profiles'),
      join(this.teamConfigPath, 'sync'),
      join(this.teamConfigPath, 'conflicts'),
      join(this.teamConfigPath, 'backups'),
    ];

    for (const dir of directories) {
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true });
      }
    }
  }

  setupCollaborationModes() {
    // Developer Team Mode - Focus on code quality and consistency
    this.collaborationModes.set('developer', {
      name: 'Developer Team',
      description: 'Optimized for development teams with focus on code quality',
      sharedPreferences: [
        'tone.style',
        'documentation.verbosity',
        'languages.auto_setup_linting',
        'resourceDelegation.mode',
        'customizations.message_filters',
      ],
      conflictResolution: 'vote',
      autoSync: true,
      syncFrequency: 'on-change',
    });

    // Research Team Mode - Focus on documentation and analysis
    this.collaborationModes.set('research', {
      name: 'Research Team',
      description: 'Optimized for research teams with comprehensive documentation',
      sharedPreferences: [
        'documentation.verbosity',
        'tone.technical_depth',
        'guidance.experience_level',
        'workflow.analytics_driven',
      ],
      conflictResolution: 'merge',
      autoSync: false,
      syncFrequency: 'manual',
    });

    // Enterprise Mode - Focus on standardization and compliance
    this.collaborationModes.set('enterprise', {
      name: 'Enterprise Team',
      description: 'Standardized settings for enterprise environments',
      sharedPreferences: [
        'tone.style',
        'documentation.verbosity',
        'resourceDelegation',
        'customizations',
        'languages.auto_setup_linting',
      ],
      conflictResolution: 'admin-override',
      autoSync: true,
      syncFrequency: 'scheduled',
    });

    // Flexible Mode - Minimal shared preferences
    this.collaborationModes.set('flexible', {
      name: 'Flexible Team',
      description: 'Minimal shared preferences, maximum individual flexibility',
      sharedPreferences: ['tone.style', 'resourceDelegation.mode'],
      conflictResolution: 'individual-choice',
      autoSync: false,
      syncFrequency: 'on-request',
    });
  }

  setupConflictResolvers() {
    // Voting-based resolution
    this.conflictResolvers.set('vote', async (conflicts, teamMembers) => {
      return await this.resolveByVoting(conflicts, teamMembers);
    });

    // Merge compatible preferences
    this.conflictResolvers.set('merge', async (conflicts, teamMembers) => {
      return await this.resolveByMerging(conflicts, teamMembers);
    });

    // Admin override resolution
    this.conflictResolvers.set('admin-override', async (conflicts, teamMembers) => {
      return await this.resolveByAdminOverride(conflicts, teamMembers);
    });

    // Individual choice resolution
    this.conflictResolvers.set('individual-choice', async (conflicts, teamMembers) => {
      return await this.resolveByIndividualChoice(conflicts, teamMembers);
    });
  }

  async createTeam(teamConfig) {
    const {
      name,
      description,
      mode = 'developer',
      members = [],
      adminId,
      sharedPreferences = {},
    } = teamConfig;

    const teamId = this.generateTeamId(name);
    const team = {
      id: teamId,
      name,
      description,
      mode,
      adminId,
      members: members.map((member) => ({
        id: member.id || this.generateMemberId(),
        name: member.name,
        role: member.role || 'member',
        joinedAt: new Date().toISOString(),
        preferences: member.preferences || {},
      })),
      sharedPreferences,
      collaborationMode: this.collaborationModes.get(mode),
      createdAt: new Date().toISOString(),
      lastSyncAt: null,
      version: 1,
    };

    await this.saveTeamConfig(team);
    await this.initializeSharedPreferences(team);

    return team;
  }

  async joinTeam(teamId, memberInfo) {
    const team = await this.loadTeamConfig(teamId);

    if (!team) {
      throw new Error(`Team not found: ${teamId}`);
    }

    const member = {
      id: memberInfo.id || this.generateMemberId(),
      name: memberInfo.name,
      role: memberInfo.role || 'member',
      joinedAt: new Date().toISOString(),
      preferences: memberInfo.preferences || {},
    };

    team.members.push(member);
    team.version++;

    await this.saveTeamConfig(team);
    await this.syncMemberWithTeam(member.id, team);

    return member;
  }

  async syncPreferences(teamId, memberId, localPreferences) {
    if (this.syncInProgress) {
      throw new Error('Sync already in progress');
    }

    this.syncInProgress = true;

    try {
      const team = await this.loadTeamConfig(teamId);
      const lockAcquired = await this.acquireSyncLock(teamId, memberId);

      if (!lockAcquired) {
        throw new Error('Could not acquire sync lock');
      }

      const syncResult = await this.performSync(team, memberId, localPreferences);

      await this.releaseSyncLock(teamId, memberId);
      return syncResult;
    } finally {
      this.syncInProgress = false;
    }
  }

  async performSync(team, memberId, localPreferences) {
    const sharedKeys = team.collaborationMode.sharedPreferences;
    const currentShared = await this.loadSharedPreferences(team.id);

    // Extract shared preferences from local settings
    const localShared = this.extractSharedPreferences(localPreferences, sharedKeys);

    // Detect conflicts
    const conflicts = this.detectConflicts(currentShared, localShared, sharedKeys);

    let resolvedPreferences = currentShared;

    if (conflicts.length > 0) {
      console.log(`Detected ${conflicts.length} preference conflicts`);

      // Resolve conflicts based on team mode
      const resolver = this.conflictResolvers.get(team.collaborationMode.conflictResolution);
      resolvedPreferences = await resolver(conflicts, team.members);

      // Log conflict resolution
      await this.logConflictResolution(team.id, conflicts, resolvedPreferences);
    }

    // Update shared preferences
    await this.saveSharedPreferences(team.id, resolvedPreferences);

    // Update team sync timestamp
    team.lastSyncAt = new Date().toISOString();
    team.version++;
    await this.saveTeamConfig(team);

    // Merge resolved shared preferences back into local preferences
    const mergedPreferences = this.mergePreferences(
      localPreferences,
      resolvedPreferences,
      sharedKeys,
    );

    return {
      success: true,
      conflicts: conflicts.length,
      resolvedPreferences: resolvedPreferences,
      mergedPreferences: mergedPreferences,
      syncedAt: team.lastSyncAt,
    };
  }

  detectConflicts(currentShared, localShared, sharedKeys) {
    const conflicts = [];

    for (const key of sharedKeys) {
      const currentValue = this.getNestedValue(currentShared, key);
      const localValue = this.getNestedValue(localShared, key);

      if (
        currentValue !== undefined &&
        localValue !== undefined &&
        JSON.stringify(currentValue) !== JSON.stringify(localValue)
      ) {
        conflicts.push({
          key,
          currentValue,
          localValue,
          type: this.getConflictType(currentValue, localValue),
        });
      }
    }

    return conflicts;
  }

  getConflictType(currentValue, localValue) {
    if (typeof currentValue !== typeof localValue) {
      return 'type-mismatch';
    }

    if (Array.isArray(currentValue) && Array.isArray(localValue)) {
      return 'array-difference';
    }

    if (typeof currentValue === 'object' && currentValue !== null) {
      return 'object-difference';
    }

    return 'value-difference';
  }

  async resolveByVoting(conflicts, teamMembers) {
    // Simulate voting by analyzing member preferences
    const resolutions = {};

    for (const conflict of conflicts) {
      // In a real implementation, this would collect votes from team members
      // For now, we'll use a simple majority rule simulation
      const votes = await this.simulateVoting(conflict, teamMembers);
      resolutions[conflict.key] = votes.winner;
    }

    return resolutions;
  }

  async simulateVoting(conflict, teamMembers) {
    // Simulate voting - in real implementation, would be interactive
    const votes = {
      current: Math.floor(teamMembers.length * 0.4),
      local: Math.floor(teamMembers.length * 0.6),
    };

    return {
      winner: votes.local > votes.current ? conflict.localValue : conflict.currentValue,
      votes,
    };
  }

  async resolveByMerging(conflicts, teamMembers) {
    const resolutions = {};

    for (const conflict of conflicts) {
      if (conflict.type === 'array-difference') {
        // Merge arrays by combining unique values
        resolutions[conflict.key] = [
          ...new Set([...conflict.currentValue, ...conflict.localValue]),
        ];
      } else if (conflict.type === 'object-difference') {
        // Merge objects
        resolutions[conflict.key] = {
          ...conflict.currentValue,
          ...conflict.localValue,
        };
      } else {
        // For primitive values, prefer local changes
        resolutions[conflict.key] = conflict.localValue;
      }
    }

    return resolutions;
  }

  async resolveByAdminOverride(conflicts, teamMembers) {
    // Admin preferences take precedence
    const admin = teamMembers.find((member) => member.role === 'admin');
    const resolutions = {};

    for (const conflict of conflicts) {
      if (admin && admin.preferences) {
        const adminValue = this.getNestedValue(admin.preferences, conflict.key);
        resolutions[conflict.key] = adminValue !== undefined ? adminValue : conflict.currentValue;
      } else {
        resolutions[conflict.key] = conflict.currentValue;
      }
    }

    return resolutions;
  }

  async resolveByIndividualChoice(conflicts, teamMembers) {
    // Keep individual preferences, don't force synchronization
    const resolutions = {};

    for (const conflict of conflicts) {
      resolutions[conflict.key] = conflict.localValue; // Preserve individual choice
    }

    return resolutions;
  }

  extractSharedPreferences(preferences, sharedKeys) {
    const shared = {};

    for (const key of sharedKeys) {
      const value = this.getNestedValue(preferences, key);
      if (value !== undefined) {
        this.setNestedValue(shared, key, value);
      }
    }

    return shared;
  }

  mergePreferences(localPreferences, sharedPreferences, sharedKeys) {
    const merged = JSON.parse(JSON.stringify(localPreferences));

    for (const key of sharedKeys) {
      const sharedValue = this.getNestedValue(sharedPreferences, key);
      if (sharedValue !== undefined) {
        this.setNestedValue(merged, key, sharedValue);
      }
    }

    return merged;
  }

  getNestedValue(obj, path) {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  setNestedValue(obj, path, value) {
    const keys = path.split('.');
    const lastKey = keys.pop();
    const target = keys.reduce((current, key) => {
      if (!(key in current)) current[key] = {};
      return current[key];
    }, obj);
    target[lastKey] = value;
  }

  async acquireSyncLock(teamId, memberId) {
    const lockFile = join(this.teamConfigPath, 'sync', `${teamId}.lock`);
    const lockData = {
      memberId,
      timestamp: Date.now(),
      expires: Date.now() + this.lockTimeout,
    };

    try {
      if (existsSync(lockFile)) {
        const existingLock = JSON.parse(await readFile(lockFile, 'utf8'));
        if (existingLock.expires > Date.now()) {
          return false; // Lock still valid
        }
      }

      await writeFile(lockFile, JSON.stringify(lockData, null, 2));
      return true;
    } catch (error) {
      return false;
    }
  }

  async releaseSyncLock(teamId, memberId) {
    const lockFile = join(this.teamConfigPath, 'sync', `${teamId}.lock`);

    try {
      if (existsSync(lockFile)) {
        const lockData = JSON.parse(await readFile(lockFile, 'utf8'));
        if (lockData.memberId === memberId) {
          // Remove lock file
          await import('fs/promises').then((fs) => fs.unlink(lockFile));
        }
      }
    } catch (error) {
      console.warn('Failed to release sync lock:', error);
    }
  }

  async loadTeamConfig(teamId) {
    try {
      const configFile = join(this.teamConfigPath, `${teamId}.json`);
      const data = await readFile(configFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return null;
    }
  }

  async saveTeamConfig(team) {
    const configFile = join(this.teamConfigPath, `${team.id}.json`);
    await writeFile(configFile, JSON.stringify(team, null, 2));
  }

  async loadSharedPreferences(teamId) {
    try {
      const sharedFile = join(this.teamConfigPath, 'shared', `${teamId}.json`);
      const data = await readFile(sharedFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      return {};
    }
  }

  async saveSharedPreferences(teamId, preferences) {
    const sharedFile = join(this.teamConfigPath, 'shared', `${teamId}.json`);
    await writeFile(sharedFile, JSON.stringify(preferences, null, 2));
  }

  async initializeSharedPreferences(team) {
    const sharedPrefs = this.extractSharedPreferences(
      team.sharedPreferences,
      team.collaborationMode.sharedPreferences,
    );

    await this.saveSharedPreferences(team.id, sharedPrefs);
  }

  async syncMemberWithTeam(memberId, team) {
    const sharedPrefs = await this.loadSharedPreferences(team.id);

    // This would typically update the member's local preferences
    // Implementation depends on how preferences are stored locally
    console.log(`Syncing member ${memberId} with team preferences`);
  }

  async logConflictResolution(teamId, conflicts, resolutions) {
    const logEntry = {
      teamId,
      timestamp: new Date().toISOString(),
      conflicts: conflicts.map((c) => ({
        key: c.key,
        type: c.type,
        resolved: this.getNestedValue(resolutions, c.key),
      })),
      resolutionMethod: 'automated',
    };

    const logFile = join(this.teamConfigPath, 'conflicts', `${teamId}_${Date.now()}.json`);
    await writeFile(logFile, JSON.stringify(logEntry, null, 2));
  }

  generateTeamId(name) {
    return crypto
      .createHash('sha256')
      .update(name + Date.now())
      .digest('hex')
      .substring(0, 16);
  }

  generateMemberId() {
    return crypto.randomBytes(8).toString('hex');
  }

  async getTeamStats(teamId) {
    const team = await this.loadTeamConfig(teamId);
    if (!team) return null;

    const sharedPrefs = await this.loadSharedPreferences(teamId);

    return {
      team: {
        id: team.id,
        name: team.name,
        memberCount: team.members.length,
        mode: team.mode,
        lastSync: team.lastSyncAt,
        version: team.version,
      },
      preferences: {
        sharedCount: Object.keys(sharedPrefs).length,
        sharedKeys: team.collaborationMode.sharedPreferences,
      },
      sync: {
        frequency: team.collaborationMode.syncFrequency,
        autoSync: team.collaborationMode.autoSync,
        conflictResolution: team.collaborationMode.conflictResolution,
      },
    };
  }
}

export default TeamCollaborationSystem;
