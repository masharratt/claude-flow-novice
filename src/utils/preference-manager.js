/**
 * Preference Management Utilities
 * Handles user preferences, profiles, and real-time configuration updates
 */

import { FilterConfiguration } from '../config/filter-config.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

class PreferenceManager {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.filterConfig = new FilterConfiguration(projectRoot);
    this.userProfiles = new Map();
    this.activeProfile = null;
    this.preferencesCache = new Map();

    this.loadUserProfiles();
    this.setupPreferenceWatcher();
  }

  /**
   * Load user profiles from configuration
   */
  loadUserProfiles() {
    const config = this.filterConfig.exportConfig();

    if (config.profiles) {
      Object.entries(config.profiles).forEach(([name, profile]) => {
        this.userProfiles.set(name, {
          ...profile,
          lastUsed: profile.lastUsed || new Date(0).toISOString(),
          usageCount: profile.usageCount || 0
        });
      });
    }

    // Load default profiles if none exist
    if (this.userProfiles.size === 0) {
      this.createDefaultProfiles();
    }
  }

  /**
   * Create default user profiles
   */
  createDefaultProfiles() {
    const defaultProfiles = {
      'developer': {
        name: 'Developer',
        description: 'Optimized for development workflows',
        contentFilters: {
          maxMdFiles: 20,
          allowedDocTypes: ['API', 'README', 'CHANGELOG', 'GUIDE'],
          rootDirectoryProtection: true,
          blockedPatterns: [
            'IMPLEMENTATION_REPORT',
            'COMPLETION_SUMMARY',
            'STATUS_UPDATE',
            '^TEMP_',
            '^WORKING_'
          ]
        },
        toneProcessors: {
          defaultPreset: 'concise',
          removeSelfCongratulatory: true,
          simplifyJargon: false,
          focusOnActionable: true
        },
        userPreferences: {
          preferredTone: 'concise',
          allowReports: false,
          consolidateDocuments: true,
          strictMode: false
        }
      },

      'documentation-writer': {
        name: 'Documentation Writer',
        description: 'Optimized for documentation creation',
        contentFilters: {
          maxMdFiles: 50,
          allowedDocTypes: ['GUIDE', 'TUTORIAL', 'SPEC', 'API', 'README'],
          rootDirectoryProtection: false,
          blockedPatterns: [
            'IMPLEMENTATION_REPORT',
            'COMPLETION_SUMMARY',
            '^TEMP_',
            '^WORKING_'
          ]
        },
        toneProcessors: {
          defaultPreset: 'friendly',
          removeSelfCongratulatory: true,
          simplifyJargon: true,
          focusOnActionable: true
        },
        userPreferences: {
          preferredTone: 'friendly',
          allowReports: true,
          consolidateDocuments: false,
          maxDocumentLength: 10000
        }
      },

      'researcher': {
        name: 'Researcher',
        description: 'Optimized for research and analysis',
        contentFilters: {
          maxMdFiles: 30,
          allowedDocTypes: ['ANALYSIS', 'REPORT', 'SPEC', 'README', 'GUIDE'],
          rootDirectoryProtection: true,
          blockedPatterns: [
            'COMPLETION_SUMMARY',
            '^TEMP_',
            '^WORKING_'
          ]
        },
        toneProcessors: {
          defaultPreset: 'technical',
          removeSelfCongratulatory: true,
          simplifyJargon: false,
          focusOnActionable: false
        },
        userPreferences: {
          preferredTone: 'technical',
          allowReports: true,
          consolidateDocuments: false,
          strictMode: false
        }
      },

      'minimalist': {
        name: 'Minimalist',
        description: 'Strict filtering for minimal documentation',
        contentFilters: {
          maxMdFiles: 5,
          allowedDocTypes: ['README', 'CHANGELOG'],
          rootDirectoryProtection: true,
          blockedPatterns: [
            'IMPLEMENTATION_REPORT',
            'COMPLETION_SUMMARY',
            'AGENT_REPORT',
            'PERFORMANCE_ANALYSIS',
            'STATUS_UPDATE',
            'PROGRESS_REPORT',
            '^TEMP_',
            '^WORKING_',
            'GUIDE',
            'TUTORIAL'
          ]
        },
        toneProcessors: {
          defaultPreset: 'concise',
          removeSelfCongratulatory: true,
          simplifyJargon: true,
          focusOnActionable: true
        },
        userPreferences: {
          preferredTone: 'concise',
          allowReports: false,
          consolidateDocuments: true,
          strictMode: true,
          maxDocumentLength: 2000
        }
      }
    };

    Object.entries(defaultProfiles).forEach(([name, profile]) => {
      this.createProfile(name, profile);
    });
  }

  /**
   * Create a new user profile
   */
  createProfile(name, profileConfig) {
    const profile = {
      ...profileConfig,
      created: new Date().toISOString(),
      lastUsed: new Date().toISOString(),
      usageCount: 0,
      isDefault: false
    };

    this.userProfiles.set(name, profile);
    this.filterConfig.setProfile(name, profile);

    return profile;
  }

  /**
   * Update existing profile
   */
  updateProfile(name, updates) {
    const existingProfile = this.userProfiles.get(name);
    if (!existingProfile) {
      throw new Error(`Profile '${name}' not found`);
    }

    const updatedProfile = {
      ...existingProfile,
      ...updates,
      lastModified: new Date().toISOString()
    };

    this.userProfiles.set(name, updatedProfile);
    this.filterConfig.setProfile(name, updatedProfile);

    // Clear cache for this profile
    this.preferencesCache.delete(name);

    return updatedProfile;
  }

  /**
   * Delete profile
   */
  deleteProfile(name) {
    if (!this.userProfiles.has(name)) {
      throw new Error(`Profile '${name}' not found`);
    }

    const profile = this.userProfiles.get(name);
    if (profile.isDefault) {
      throw new Error(`Cannot delete default profile '${name}'`);
    }

    this.userProfiles.delete(name);
    this.preferencesCache.delete(name);

    // Update filter configuration
    const config = this.filterConfig.exportConfig();
    if (config.profiles && config.profiles[name]) {
      delete config.profiles[name];
      this.filterConfig.updateConfig('profiles', config.profiles);
    }

    // Switch to default profile if this was active
    if (this.activeProfile === name) {
      this.activateProfile('developer');
    }

    return true;
  }

  /**
   * Activate a user profile
   */
  activateProfile(name) {
    const profile = this.userProfiles.get(name);
    if (!profile) {
      throw new Error(`Profile '${name}' not found`);
    }

    this.activeProfile = name;

    // Update usage statistics
    profile.lastUsed = new Date().toISOString();
    profile.usageCount = (profile.usageCount || 0) + 1;
    this.userProfiles.set(name, profile);

    // Apply profile to filter configuration
    this.filterConfig.applyProfile(name);

    // Cache active preferences
    this.cacheActivePreferences();

    return profile;
  }

  /**
   * Get active profile preferences
   */
  getActivePreferences() {
    if (!this.activeProfile) {
      this.activateProfile('developer'); // Default profile
    }

    if (this.preferencesCache.has(this.activeProfile)) {
      return this.preferencesCache.get(this.activeProfile);
    }

    const profile = this.userProfiles.get(this.activeProfile);
    const config = this.filterConfig.getConfig({ profileOverrides: profile });

    const preferences = {
      profile: this.activeProfile,
      contentFilters: config.contentFilters,
      toneProcessors: config.toneProcessors,
      userPreferences: config.userPreferences,
      hooks: config.hooks
    };

    this.preferencesCache.set(this.activeProfile, preferences);
    return preferences;
  }

  /**
   * Update preferences for active profile
   */
  updateActivePreferences(section, updates) {
    if (!this.activeProfile) {
      throw new Error('No active profile');
    }

    const profile = this.userProfiles.get(this.activeProfile);
    if (!profile[section]) {
      profile[section] = {};
    }

    profile[section] = { ...profile[section], ...updates };
    this.updateProfile(this.activeProfile, profile);

    return this.getActivePreferences();
  }

  /**
   * Get preference for specific context
   */
  getContextualPreferences(context = {}) {
    const basePreferences = this.getActivePreferences();

    // Apply contextual overrides
    let contextualPrefs = { ...basePreferences };

    // Agent-specific preferences
    if (context.agentType) {
      const agentOverrides = this.getAgentSpecificPreferences(context.agentType);
      contextualPrefs = this.deepMerge(contextualPrefs, agentOverrides);
    }

    // Project-specific preferences
    if (context.projectType) {
      const projectOverrides = this.getProjectSpecificPreferences(context.projectType);
      contextualPrefs = this.deepMerge(contextualPrefs, projectOverrides);
    }

    // Task-specific preferences
    if (context.taskType) {
      const taskOverrides = this.getTaskSpecificPreferences(context.taskType);
      contextualPrefs = this.deepMerge(contextualPrefs, taskOverrides);
    }

    return contextualPrefs;
  }

  /**
   * Get agent-specific preference overrides
   */
  getAgentSpecificPreferences(agentType) {
    const agentPrefs = {
      'researcher': {
        toneProcessors: { defaultPreset: 'technical' },
        userPreferences: { allowReports: true }
      },
      'coder': {
        toneProcessors: { defaultPreset: 'concise' },
        contentFilters: { maxMdFiles: 10 }
      },
      'reviewer': {
        toneProcessors: { defaultPreset: 'professional' },
        userPreferences: { strictMode: true }
      },
      'tester': {
        toneProcessors: { defaultPreset: 'concise' },
        contentFilters: { allowedDocTypes: ['TEST', 'SPEC', 'README'] }
      },
      'documentation': {
        toneProcessors: { defaultPreset: 'friendly' },
        contentFilters: { maxMdFiles: 50 },
        userPreferences: { allowReports: true }
      }
    };

    return agentPrefs[agentType] || {};
  }

  /**
   * Get project-specific preference overrides
   */
  getProjectSpecificPreferences(projectType) {
    const projectPrefs = {
      'library': {
        contentFilters: {
          allowedDocTypes: ['API', 'README', 'CHANGELOG'],
          maxMdFiles: 8
        },
        toneProcessors: { defaultPreset: 'technical' }
      },
      'web-app': {
        contentFilters: {
          allowedDocTypes: ['API', 'README', 'GUIDE'],
          maxMdFiles: 15
        },
        toneProcessors: { defaultPreset: 'professional' }
      },
      'documentation': {
        contentFilters: {
          maxMdFiles: 100,
          rootDirectoryProtection: false
        },
        toneProcessors: { defaultPreset: 'friendly' }
      }
    };

    return projectPrefs[projectType] || {};
  }

  /**
   * Get task-specific preference overrides
   */
  getTaskSpecificPreferences(taskType) {
    const taskPrefs = {
      'debugging': {
        toneProcessors: { defaultPreset: 'concise' },
        userPreferences: { allowReports: false, strictMode: true }
      },
      'feature-development': {
        toneProcessors: { defaultPreset: 'professional' },
        contentFilters: { maxMdFiles: 20 }
      },
      'documentation': {
        toneProcessors: { defaultPreset: 'friendly' },
        contentFilters: { maxMdFiles: 50 },
        userPreferences: { allowReports: true }
      },
      'analysis': {
        toneProcessors: { defaultPreset: 'technical' },
        userPreferences: { allowReports: true }
      }
    };

    return taskPrefs[taskType] || {};
  }

  /**
   * Auto-suggest profile based on usage patterns
   */
  suggestProfile(context = {}) {
    const patterns = this.analyzeUsagePatterns();
    const contextScore = this.calculateContextScore(context);

    let bestMatch = 'developer';
    let bestScore = 0;

    this.userProfiles.forEach((profile, name) => {
      let score = 0;

      // Usage frequency
      score += (profile.usageCount || 0) * 0.1;

      // Recent usage
      const daysSinceLastUsed = (Date.now() - new Date(profile.lastUsed).getTime()) / (1000 * 60 * 60 * 24);
      score += Math.max(0, 10 - daysSinceLastUsed) * 0.05;

      // Context compatibility
      score += this.calculateProfileContextScore(profile, context) * 0.4;

      // Pattern matching
      score += this.matchProfileToPatterns(profile, patterns) * 0.3;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = name;
      }
    });

    return {
      suggested: bestMatch,
      score: bestScore,
      reason: this.explainProfileSuggestion(bestMatch, context),
      alternatives: this.getAlternativeProfiles(bestMatch, 2)
    };
  }

  /**
   * Analyze usage patterns
   */
  analyzeUsagePatterns() {
    // This would analyze actual usage data in a real implementation
    return {
      mostUsedDocTypes: ['README', 'API', 'GUIDE'],
      averageDocLength: 3000,
      preferredTone: 'professional',
      blockedFilesCount: 15,
      consolidationRate: 0.7
    };
  }

  /**
   * Calculate context compatibility score
   */
  calculateProfileContextScore(profile, context) {
    let score = 0;

    if (context.agentType) {
      const agentPrefs = this.getAgentSpecificPreferences(context.agentType);
      score += this.comparePreferences(profile, agentPrefs) * 0.4;
    }

    if (context.projectType) {
      const projectPrefs = this.getProjectSpecificPreferences(context.projectType);
      score += this.comparePreferences(profile, projectPrefs) * 0.6;
    }

    return Math.min(1, score);
  }

  /**
   * Compare preference similarity
   */
  comparePreferences(profile1, profile2) {
    let similarity = 0;
    let comparisons = 0;

    // Compare tone preferences
    if (profile1.toneProcessors?.defaultPreset && profile2.toneProcessors?.defaultPreset) {
      similarity += profile1.toneProcessors.defaultPreset === profile2.toneProcessors.defaultPreset ? 1 : 0;
      comparisons++;
    }

    // Compare document limits
    if (profile1.contentFilters?.maxMdFiles && profile2.contentFilters?.maxMdFiles) {
      const diff = Math.abs(profile1.contentFilters.maxMdFiles - profile2.contentFilters.maxMdFiles);
      similarity += Math.max(0, 1 - diff / 50); // Normalize difference
      comparisons++;
    }

    return comparisons > 0 ? similarity / comparisons : 0;
  }

  /**
   * Setup preference change watcher
   */
  setupPreferenceWatcher() {
    // Watch for configuration changes and update cache
    setInterval(() => {
      this.preferencesCache.clear();
    }, 30000); // Clear cache every 30 seconds
  }

  /**
   * Cache active preferences for performance
   */
  cacheActivePreferences() {
    if (this.activeProfile) {
      // Force refresh of cached preferences
      this.preferencesCache.delete(this.activeProfile);
      this.getActivePreferences(); // This will cache the result
    }
  }

  /**
   * Get all available profiles
   */
  getAllProfiles() {
    return Array.from(this.userProfiles.entries()).map(([name, profile]) => ({
      name,
      ...profile,
      isActive: name === this.activeProfile
    }));
  }

  /**
   * Export user preferences
   */
  exportPreferences() {
    return {
      activeProfile: this.activeProfile,
      profiles: Object.fromEntries(this.userProfiles),
      currentPreferences: this.getActivePreferences(),
      usageStats: this.getUsageStatistics()
    };
  }

  /**
   * Import user preferences
   */
  importPreferences(preferencesData) {
    if (preferencesData.profiles) {
      this.userProfiles.clear();
      Object.entries(preferencesData.profiles).forEach(([name, profile]) => {
        this.userProfiles.set(name, profile);
      });
    }

    if (preferencesData.activeProfile) {
      this.activateProfile(preferencesData.activeProfile);
    }

    // Update filter configuration
    this.userProfiles.forEach((profile, name) => {
      this.filterConfig.setProfile(name, profile);
    });
  }

  /**
   * Get usage statistics
   */
  getUsageStatistics() {
    const stats = {
      totalProfiles: this.userProfiles.size,
      activeProfile: this.activeProfile,
      mostUsedProfile: null,
      totalUsage: 0,
      profileUsage: {}
    };

    let maxUsage = 0;
    this.userProfiles.forEach((profile, name) => {
      const usage = profile.usageCount || 0;
      stats.totalUsage += usage;
      stats.profileUsage[name] = {
        count: usage,
        lastUsed: profile.lastUsed,
        percentage: 0 // Will be calculated below
      };

      if (usage > maxUsage) {
        maxUsage = usage;
        stats.mostUsedProfile = name;
      }
    });

    // Calculate percentages
    if (stats.totalUsage > 0) {
      Object.values(stats.profileUsage).forEach(usage => {
        usage.percentage = (usage.count / stats.totalUsage) * 100;
      });
    }

    return stats;
  }

  // Helper methods

  deepMerge(target, source) {
    const result = { ...target };

    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.deepMerge(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    });

    return result;
  }

  matchProfileToPatterns(profile, patterns) {
    // Match profile characteristics to usage patterns
    let score = 0;

    if (profile.toneProcessors?.defaultPreset === patterns.preferredTone) {
      score += 0.3;
    }

    if (profile.userPreferences?.maxDocumentLength) {
      const lengthDiff = Math.abs(profile.userPreferences.maxDocumentLength - patterns.averageDocLength);
      score += Math.max(0, 0.3 - (lengthDiff / 10000));
    }

    return Math.min(1, score);
  }

  explainProfileSuggestion(profileName, context) {
    const profile = this.userProfiles.get(profileName);
    const reasons = [];

    if (profile.usageCount > 0) {
      reasons.push(`frequently used (${profile.usageCount} times)`);
    }

    if (context.agentType) {
      reasons.push(`optimized for ${context.agentType} workflows`);
    }

    if (context.projectType) {
      reasons.push(`suitable for ${context.projectType} projects`);
    }

    if (reasons.length === 0) {
      reasons.push('best default match');
    }

    return reasons.join(', ');
  }

  getAlternativeProfiles(excludeProfile, count = 2) {
    return Array.from(this.userProfiles.keys())
      .filter(name => name !== excludeProfile)
      .slice(0, count);
  }
}

export default PreferenceManager;
export { PreferenceManager };