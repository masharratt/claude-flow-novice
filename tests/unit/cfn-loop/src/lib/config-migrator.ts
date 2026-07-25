// Stub: config migrator
// Created to satisfy test imports

export interface MigrationResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  changes: string[];
}

export class ConfigMigrator {
  async migrate(config: unknown, toVersion: string): Promise<MigrationResult> {
    // Stub implementation
    return {
      success: true,
      fromVersion: '1.0.0',
      toVersion,
      changes: [],
    };
  }

  async checkMigrationNeeded(config: unknown): Promise<boolean> {
    // Stub implementation
    return false;
  }
}
