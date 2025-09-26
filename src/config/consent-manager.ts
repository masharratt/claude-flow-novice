/**
 * Interactive Consent Manager for Experimental Features
 *
 * Provides user consent dialogs, risk assessment, and consent tracking
 * for experimental and advanced features in Claude Flow.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import { ExperienceLevel, FeatureFlags } from './config-manager';

export interface ConsentRecord {
  feature: string;
  granted: boolean;
  timestamp: Date;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  consentType: 'explicit' | 'implicit' | 'revoked';
  userExperienceLevel: ExperienceLevel;
  consentVersion: string;
  expiresAt?: Date;
}

export interface FeatureRisk {
  level: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  implications: string[];
  mitigation: string[];
  requiresExplicitConsent: boolean;
  minimumExperienceLevel: ExperienceLevel;
}

export interface ConsentDialogOptions {
  feature: string;
  title: string;
  description: string;
  risk: FeatureRisk;
  defaultResponse?: boolean;
  timeout?: number;
  interactive?: boolean;
}

/**
 * Risk assessment database for experimental features
 */
const FEATURE_RISKS: Record<keyof FeatureFlags, FeatureRisk> = {
  neuralNetworks: {
    level: 'medium',
    description: 'Neural network training and inference capabilities',
    implications: [
      'May consume significant system resources',
      'Training data is stored locally',
      'Model performance varies with data quality',
    ],
    mitigation: [
      'Monitor system resources during training',
      'Use sample data for initial experiments',
      'Enable performance limits',
    ],
    requiresExplicitConsent: false,
    minimumExperienceLevel: 'advanced',
  },
  byzantineConsensus: {
    level: 'high',
    description: 'Byzantine fault-tolerant consensus protocols',
    implications: [
      'Complex distributed system behavior',
      'Network partition tolerance required',
      'May affect system stability',
      'Requires deep understanding of consensus algorithms',
    ],
    mitigation: [
      'Start with small agent networks',
      'Monitor network partitions',
      'Enable fallback mechanisms',
      'Review consensus literature',
    ],
    requiresExplicitConsent: true,
    minimumExperienceLevel: 'advanced',
  },
  enterpriseIntegrations: {
    level: 'critical',
    description: 'Enterprise-grade integrations and security features',
    implications: [
      'Requires enterprise credentials',
      'May expose sensitive data',
      'Subject to compliance requirements',
      'Audit logging enabled',
    ],
    mitigation: [
      'Verify enterprise credentials',
      'Review data handling policies',
      'Enable audit trails',
      'Consult security team',
    ],
    requiresExplicitConsent: true,
    minimumExperienceLevel: 'enterprise',
  },
  advancedMonitoring: {
    level: 'low',
    description: 'Advanced performance and system monitoring',
    implications: [
      'Collects detailed system metrics',
      'May impact performance slightly',
      'Stores monitoring data locally',
    ],
    mitigation: [
      'Configure data retention limits',
      'Monitor storage usage',
      'Review collected metrics periodically',
    ],
    requiresExplicitConsent: false,
    minimumExperienceLevel: 'intermediate',
  },
  multiTierStorage: {
    level: 'medium',
    description: 'Multi-tier storage with distributed backends',
    implications: [
      'Data stored across multiple locations',
      'Synchronization delays possible',
      'Increased complexity in data management',
    ],
    mitigation: [
      'Configure backup strategies',
      'Monitor synchronization status',
      'Test recovery procedures',
    ],
    requiresExplicitConsent: false,
    minimumExperienceLevel: 'intermediate',
  },
  teamCollaboration: {
    level: 'medium',
    description: 'Team collaboration and shared workspaces',
    implications: [
      'Shares data with team members',
      'Requires network connectivity',
      'May expose work-in-progress',
    ],
    mitigation: [
      'Configure sharing permissions',
      'Review team member access',
      'Enable privacy controls',
    ],
    requiresExplicitConsent: false,
    minimumExperienceLevel: 'intermediate',
  },
  customWorkflows: {
    level: 'low',
    description: 'Custom workflow creation and automation',
    implications: [
      'Executes user-defined automation',
      'May affect system behavior',
      'Workflow errors can impact productivity',
    ],
    mitigation: [
      'Test workflows in safe environment',
      'Enable workflow validation',
      'Implement error handling',
    ],
    requiresExplicitConsent: false,
    minimumExperienceLevel: 'intermediate',
  },
  performanceAnalytics: {
    level: 'low',
    description: 'Detailed performance analytics and reporting',
    implications: [
      'Collects usage statistics',
      'May identify performance patterns',
      'Analytics data stored locally',
    ],
    mitigation: [
      'Review data collection scope',
      'Configure retention policies',
      'Enable data anonymization',
    ],
    requiresExplicitConsent: false,
    minimumExperienceLevel: 'intermediate',
  },
};

export class ConsentManager extends EventEmitter {
  private static instance: ConsentManager;
  private consentRecords: Map<string, ConsentRecord> = new Map();
  private consentStorePath: string;
  private readonly CONSENT_VERSION = '1.0.0';

  private constructor() {
    super();
    this.consentStorePath = path.join(os.homedir(), '.claude-flow', 'consent-records.json');
  }

  static getInstance(): ConsentManager {
    if (!ConsentManager.instance) {
      ConsentManager.instance = new ConsentManager();
    }
    return ConsentManager.instance;
  }

  /**
   * Initialize consent manager and load existing records
   */
  async init(): Promise<void> {
    try {
      await this.loadConsentRecords();
      this.emit('consentManagerInitialized', { timestamp: new Date() });
    } catch (error) {
      // No existing consent records, start fresh
      await this.saveConsentRecords();
    }
  }

  /**
   * Request consent for a specific feature
   */
  async requestConsent(
    feature: keyof FeatureFlags,
    userExperienceLevel: ExperienceLevel,
    options: Partial<ConsentDialogOptions> = {},
  ): Promise<boolean> {
    const risk = FEATURE_RISKS[feature];

    // Check if user's experience level meets minimum requirement
    if (!this.isExperienceLevelSufficient(userExperienceLevel, risk.minimumExperienceLevel)) {
      this.emit('consentDeniedInsufficientExperience', {
        feature,
        userLevel: userExperienceLevel,
        requiredLevel: risk.minimumExperienceLevel,
        timestamp: new Date(),
      });
      return false;
    }

    // Check existing consent
    const existingConsent = this.getConsentRecord(feature);
    if (existingConsent && !this.isConsentExpired(existingConsent)) {
      return existingConsent.granted;
    }

    // Show consent dialog
    const dialogOptions: ConsentDialogOptions = {
      feature,
      title: `Enable ${feature} Feature`,
      description: risk.description,
      risk,
      interactive: true,
      ...options,
    };

    const granted = await this.showConsentDialog(dialogOptions);

    // Record the consent decision
    const consentRecord: ConsentRecord = {
      feature,
      granted,
      timestamp: new Date(),
      riskLevel: risk.level,
      consentType: granted ? 'explicit' : 'revoked',
      userExperienceLevel,
      consentVersion: this.CONSENT_VERSION,
      expiresAt: this.calculateExpirationDate(risk.level),
    };

    this.consentRecords.set(feature, consentRecord);
    await this.saveConsentRecords();

    this.emit('consentRecorded', { ...consentRecord, timestamp: new Date() });

    return granted;
  }

  /**
   * Show interactive consent dialog
   */
  private async showConsentDialog(options: ConsentDialogOptions): Promise<boolean> {
    if (!options.interactive) {
      return options.defaultResponse || false;
    }

    console.log('\n' + '='.repeat(80));
    console.log(`🔒 FEATURE CONSENT REQUEST: ${options.title}`);
    console.log('='.repeat(80));
    console.log(`\nDescription: ${options.description}`);
    console.log(`\nRisk Level: ${this.getRiskLevelDisplay(options.risk.level)}`);

    console.log('\n📋 What this means:');
    options.risk.implications.forEach((implication, i) => {
      console.log(`   ${i + 1}. ${implication}`);
    });

    console.log('\n🛡️  Recommended precautions:');
    options.risk.mitigation.forEach((mitigation, i) => {
      console.log(`   ${i + 1}. ${mitigation}`);
    });

    console.log('\n⚠️  Required Experience Level:', options.risk.minimumExperienceLevel);

    if (options.risk.requiresExplicitConsent) {
      console.log('\n🚨 This feature requires explicit consent due to its high risk level.');
    }

    const readline = await import('readline');
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      const question = options.risk.requiresExplicitConsent
        ? '\nDo you explicitly consent to enable this feature? (type "I CONSENT" to agree, anything else to decline): '
        : '\nEnable this feature? (y/N): ';

      rl.question(question, (answer) => {
        rl.close();

        if (options.risk.requiresExplicitConsent) {
          resolve(answer.trim() === 'I CONSENT');
        } else {
          resolve(answer.trim().toLowerCase().startsWith('y'));
        }
      });

      // Handle timeout
      if (options.timeout) {
        setTimeout(() => {
          rl.close();
          resolve(false);
        }, options.timeout);
      }
    });
  }

  /**
   * Get consent record for a feature
   */
  getConsentRecord(feature: string): ConsentRecord | undefined {
    return this.consentRecords.get(feature);
  }

  /**
   * Check if user has consented to a feature
   */
  hasConsent(feature: keyof FeatureFlags): boolean {
    const record = this.getConsentRecord(feature);
    return record ? record.granted && !this.isConsentExpired(record) : false;
  }

  /**
   * Revoke consent for a feature
   */
  async revokeConsent(feature: keyof FeatureFlags): Promise<void> {
    const existingRecord = this.getConsentRecord(feature);

    const revokedRecord: ConsentRecord = {
      feature,
      granted: false,
      timestamp: new Date(),
      riskLevel: existingRecord?.riskLevel || 'medium',
      consentType: 'revoked',
      userExperienceLevel: existingRecord?.userExperienceLevel || 'novice',
      consentVersion: this.CONSENT_VERSION,
    };

    this.consentRecords.set(feature, revokedRecord);
    await this.saveConsentRecords();

    this.emit('consentRevoked', { feature, timestamp: new Date() });
  }

  /**
   * Get all consent records
   */
  getAllConsentRecords(): ConsentRecord[] {
    return Array.from(this.consentRecords.values());
  }

  /**
   * Get consent records by risk level
   */
  getConsentRecordsByRiskLevel(riskLevel: FeatureRisk['level']): ConsentRecord[] {
    return this.getAllConsentRecords().filter((record) => record.riskLevel === riskLevel);
  }

  /**
   * Clean up expired consent records
   */
  async cleanupExpiredConsent(): Promise<number> {
    let cleanedCount = 0;
    const now = new Date();

    for (const [feature, record] of this.consentRecords.entries()) {
      if (this.isConsentExpired(record)) {
        this.consentRecords.delete(feature);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      await this.saveConsentRecords();
      this.emit('expiredConsentCleaned', { count: cleanedCount, timestamp: now });
    }

    return cleanedCount;
  }

  /**
   * Export consent records for audit or backup
   */
  exportConsentRecords(): {
    records: ConsentRecord[];
    exportDate: Date;
    version: string;
  } {
    return {
      records: this.getAllConsentRecords(),
      exportDate: new Date(),
      version: this.CONSENT_VERSION,
    };
  }

  /**
   * Get consent summary for user dashboard
   */
  getConsentSummary(): {
    totalFeatures: number;
    grantedConsents: number;
    revokedConsents: number;
    expiredConsents: number;
    byRiskLevel: Record<FeatureRisk['level'], number>;
  } {
    const records = this.getAllConsentRecords();
    const now = new Date();

    const summary = {
      totalFeatures: records.length,
      grantedConsents: 0,
      revokedConsents: 0,
      expiredConsents: 0,
      byRiskLevel: { low: 0, medium: 0, high: 0, critical: 0 } as Record<
        FeatureRisk['level'],
        number
      >,
    };

    for (const record of records) {
      if (this.isConsentExpired(record)) {
        summary.expiredConsents++;
      } else if (record.granted) {
        summary.grantedConsents++;
      } else {
        summary.revokedConsents++;
      }

      summary.byRiskLevel[record.riskLevel]++;
    }

    return summary;
  }

  // Private helper methods

  private async loadConsentRecords(): Promise<void> {
    const data = await fs.readFile(this.consentStorePath, 'utf8');
    const parsed = JSON.parse(data);

    this.consentRecords.clear();
    for (const record of parsed.records || []) {
      // Convert timestamp and expiry strings back to Date objects
      record.timestamp = new Date(record.timestamp);
      if (record.expiresAt) {
        record.expiresAt = new Date(record.expiresAt);
      }
      this.consentRecords.set(record.feature, record);
    }
  }

  private async saveConsentRecords(): Promise<void> {
    await fs.mkdir(path.dirname(this.consentStorePath), { recursive: true });

    const data = {
      version: this.CONSENT_VERSION,
      records: this.getAllConsentRecords(),
      lastModified: new Date(),
    };

    await fs.writeFile(this.consentStorePath, JSON.stringify(data, null, 2), 'utf8');
  }

  private isConsentExpired(record: ConsentRecord): boolean {
    if (!record.expiresAt) return false;
    return new Date() > record.expiresAt;
  }

  private calculateExpirationDate(riskLevel: FeatureRisk['level']): Date | undefined {
    const now = new Date();

    switch (riskLevel) {
      case 'critical':
        return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000); // 30 days
      case 'high':
        return new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000); // 90 days
      case 'medium':
        return new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // 1 year
      case 'low':
        return undefined; // No expiration
      default:
        return undefined;
    }
  }

  private isExperienceLevelSufficient(
    userLevel: ExperienceLevel,
    requiredLevel: ExperienceLevel,
  ): boolean {
    const levels = ['novice', 'intermediate', 'advanced', 'enterprise'];
    return levels.indexOf(userLevel) >= levels.indexOf(requiredLevel);
  }

  private getRiskLevelDisplay(level: FeatureRisk['level']): string {
    const displays = {
      low: '🟢 LOW - Minimal impact',
      medium: '🟡 MEDIUM - Moderate considerations',
      high: '🟠 HIGH - Significant implications',
      critical: '🔴 CRITICAL - Requires careful evaluation',
    };
    return displays[level];
  }
}

export const consentManager = ConsentManager.getInstance();
