/**
 * Consent Manager for Experimental Features
 * Checkpoint 1.4 - User Consent and Safety
 */

export class ConsentManager {
  constructor() {
    this.consentRecords = new Map();
    this.pendingConsents = new Map();
    this.consentCallbacks = new Map();
  }

  /**
   * Request consent from user for experimental feature
   */
  async requestConsent(consentRequest) {
    const {
      userId,
      featureName,
      title,
      description,
      stability,
      riskLevel,
      warnings,
      dependencies,
    } = consentRequest;

    // Check if consent already exists
    const existingConsent = this.getConsent(userId, featureName);
    if (existingConsent && existingConsent.granted) {
      return { granted: true, existing: true, timestamp: existingConsent.timestamp };
    }

    // Create consent dialog data
    const consentDialog = {
      id: `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      featureName,
      title,
      description,
      stability,
      riskLevel,
      warnings: warnings || [],
      dependencies: dependencies || [],
      timestamp: new Date().toISOString(),
      sections: this.buildConsentSections(stability, riskLevel, warnings, dependencies),
    };

    // Store pending consent
    this.pendingConsents.set(consentDialog.id, consentDialog);

    try {
      // Show consent dialog (would integrate with UI system)
      const userResponse = await this.showConsentDialog(consentDialog);

      // Record consent decision
      const consentRecord = {
        userId,
        featureName,
        granted: userResponse.granted,
        timestamp: new Date().toISOString(),
        dialogId: consentDialog.id,
        acknowledgedRisks: userResponse.acknowledgedRisks || [],
        acknowledgedWarnings: userResponse.acknowledgedWarnings || [],
        userSignature: userResponse.signature,
        ipAddress: userResponse.ipAddress,
        userAgent: userResponse.userAgent,
      };

      this.recordConsent(consentRecord);
      this.pendingConsents.delete(consentDialog.id);

      return {
        granted: userResponse.granted,
        consentId: consentRecord.timestamp,
        acknowledgedRisks: userResponse.acknowledgedRisks || [],
      };
    } catch (error) {
      this.pendingConsents.delete(consentDialog.id);
      throw new Error(`Consent request failed: ${error.message}`);
    }
  }

  /**
   * Build consent sections based on feature characteristics
   */
  buildConsentSections(stability, riskLevel, warnings, dependencies) {
    const sections = [];

    // Feature Information Section
    sections.push({
      type: 'info',
      title: 'Feature Information',
      content: {
        stability: stability.toUpperCase(),
        riskLevel: riskLevel.toUpperCase(),
        description: `This is an ${stability} feature with ${riskLevel} risk level.`,
      },
    });

    // Risk Assessment Section
    if (riskLevel !== 'none') {
      sections.push({
        type: 'warning',
        title: 'Risk Assessment',
        content: {
          riskLevel,
          description: this.getRiskDescription(riskLevel),
          mitigation: this.getRiskMitigation(riskLevel),
        },
      });
    }

    // Warnings Section
    if (warnings.length > 0) {
      sections.push({
        type: 'caution',
        title: 'Important Warnings',
        content: {
          warnings,
          requiresAcknowledgment: true,
        },
      });
    }

    // Dependencies Section
    if (dependencies.length > 0) {
      sections.push({
        type: 'info',
        title: 'Feature Dependencies',
        content: {
          dependencies,
          description: 'This feature requires the following components to be enabled:',
        },
      });
    }

    // User Responsibilities Section
    sections.push({
      type: 'responsibility',
      title: 'User Responsibilities',
      content: {
        responsibilities: this.getUserResponsibilities(stability, riskLevel),
        requiresAcknowledgment: true,
      },
    });

    // Data Collection and Monitoring
    if (riskLevel !== 'none') {
      sections.push({
        type: 'privacy',
        title: 'Monitoring and Data Collection',
        content: {
          description:
            'Experimental features may collect additional telemetry data for safety and improvement purposes.',
          dataTypes: [
            'Performance metrics',
            'Error logs',
            'Usage patterns',
            'System impact measurements',
          ],
          retention: '90 days or until feature becomes stable',
          optOut: riskLevel === 'low',
        },
      });
    }

    return sections;
  }

  /**
   * Get risk description based on level
   */
  getRiskDescription(riskLevel) {
    const descriptions = {
      low: 'This feature is generally stable but may have minor issues or limited functionality.',
      medium:
        'This feature may cause system instability, performance issues, or unexpected behavior.',
      high: 'This feature is highly experimental and may cause significant system issues, data corruption, or security vulnerabilities.',
    };

    return descriptions[riskLevel] || 'Unknown risk level';
  }

  /**
   * Get risk mitigation strategies
   */
  getRiskMitigation(riskLevel) {
    const mitigations = {
      low: [
        'Regular monitoring enabled',
        'Easy disable option available',
        'Support available during business hours',
      ],
      medium: [
        'Continuous monitoring enabled',
        'Automatic rollback on critical issues',
        'Enhanced logging enabled',
        '24/7 support available',
      ],
      high: [
        'Real-time monitoring with alerts',
        'Immediate automatic rollback',
        'Full system backup recommended',
        'Dedicated support team assigned',
        'Regular safety checks required',
      ],
    };

    return mitigations[riskLevel] || [];
  }

  /**
   * Get user responsibilities based on feature characteristics
   */
  getUserResponsibilities(stability, riskLevel) {
    const responsibilities = [
      'Monitor system behavior after enabling this feature',
      'Report any issues or unexpected behavior immediately',
      'Follow all safety guidelines and warnings',
      'Keep backups of important data',
    ];

    if (riskLevel === 'medium' || riskLevel === 'high') {
      responsibilities.push(
        'Avoid using this feature in production environments without thorough testing',
        'Have a rollback plan ready',
        'Monitor system resources and performance',
      );
    }

    if (riskLevel === 'high') {
      responsibilities.push(
        'Perform full system backup before enabling',
        'Have dedicated support contact available',
        'Schedule regular safety checks',
      );
    }

    return responsibilities;
  }

  /**
   * Show consent dialog to user (mock implementation)
   */
  async showConsentDialog(consentDialog) {
    // This would integrate with the actual UI system
    // For now, this is a mock implementation

    console.log(`[ConsentManager] Showing consent dialog for: ${consentDialog.featureName}`);
    console.log(`Risk Level: ${consentDialog.riskLevel}`);
    console.log(`Warnings: ${consentDialog.warnings.join(', ')}`);

    // Mock user response - in real implementation, this would be user input
    return {
      granted: true, // This would be based on actual user input
      acknowledgedRisks: consentDialog.warnings,
      acknowledgedWarnings: consentDialog.warnings,
      signature: `${consentDialog.userId}_${Date.now()}`,
      ipAddress: '127.0.0.1',
      userAgent: 'MockBrowser/1.0',
    };
  }

  /**
   * Record consent decision
   */
  recordConsent(consentRecord) {
    const key = `${consentRecord.userId}:${consentRecord.featureName}`;
    this.consentRecords.set(key, consentRecord);

    console.log(`[ConsentManager] Recorded consent: ${key} = ${consentRecord.granted}`);
  }

  /**
   * Check if user has granted consent for feature
   */
  hasConsent(userId, featureName) {
    const key = `${userId}:${featureName}`;
    const consent = this.consentRecords.get(key);
    return consent && consent.granted;
  }

  /**
   * Get consent record
   */
  getConsent(userId, featureName) {
    const key = `${userId}:${featureName}`;
    return this.consentRecords.get(key);
  }

  /**
   * Revoke consent for feature
   */
  revokeConsent(userId, featureName, reason = 'User requested') {
    const key = `${userId}:${featureName}`;
    const existingConsent = this.consentRecords.get(key);

    if (existingConsent) {
      const revokedConsent = {
        ...existingConsent,
        granted: false,
        revokedAt: new Date().toISOString(),
        revokedReason: reason,
      };

      this.consentRecords.set(key, revokedConsent);
      console.log(`[ConsentManager] Revoked consent: ${key} - ${reason}`);
      return true;
    }

    return false;
  }

  /**
   * Get all consents for a user
   */
  getUserConsents(userId) {
    const userConsents = [];

    for (const [key, consent] of this.consentRecords.entries()) {
      if (key.startsWith(`${userId}:`)) {
        userConsents.push(consent);
      }
    }

    return userConsents;
  }

  /**
   * Get consent statistics
   */
  getConsentStatistics() {
    const stats = {
      total: this.consentRecords.size,
      granted: 0,
      revoked: 0,
      byFeature: {},
      byRiskLevel: { low: 0, medium: 0, high: 0, none: 0 },
    };

    for (const consent of this.consentRecords.values()) {
      if (consent.granted && !consent.revokedAt) {
        stats.granted++;
      } else if (consent.revokedAt) {
        stats.revoked++;
      }

      // Count by feature
      stats.byFeature[consent.featureName] = (stats.byFeature[consent.featureName] || 0) + 1;
    }

    return stats;
  }

  /**
   * Cleanup expired consents
   */
  cleanupExpiredConsents(maxAgeMs = 90 * 24 * 60 * 60 * 1000) {
    // 90 days default
    const now = Date.now();
    let cleanedUp = 0;

    for (const [key, consent] of this.consentRecords.entries()) {
      const consentAge = now - new Date(consent.timestamp).getTime();

      if (consentAge > maxAgeMs) {
        this.consentRecords.delete(key);
        cleanedUp++;
      }
    }

    console.log(`[ConsentManager] Cleaned up ${cleanedUp} expired consents`);
    return cleanedUp;
  }
}
