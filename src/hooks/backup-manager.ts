/**
 * Backup Manager - File lifecycle backup creation and restoration
 * Manages pre-edit backups with metadata, hash generation, and cleanup
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { fileURLToPath } from 'url';

interface BackupConfig {
  retentionHours: number;
  maxBackups: number;
  backupDir: string;
}

interface BackupMetadata {
  timestamp: string;
  agentId: string;
  originalFile: string;
  fileHash: string;
  backupPath: string;
  createdAt: string;
  fileSize: number;
  lineCount: number;
}

interface BackupResult {
  backupPath: string;
  timestamp: string;
  fileHash: string;
  originalPath: string;
  metadata: BackupMetadata;
}

export class BackupManager {
  private config: BackupConfig;
  private projectRoot: string;

  constructor(projectRoot: string = process.cwd(), config?: Partial<BackupConfig>) {
    this.projectRoot = projectRoot;
    this.config = {
      retentionHours: config?.retentionHours ?? 24,
      maxBackups: config?.maxBackups ?? 10,
      backupDir: config?.backupDir ?? '.backups',
    };
  }

  /**
   * Generate SHA256 hash of file content (8 char truncated)
   */
  private async generateFileHash(filePath: string): Promise<string> {
    try {
      const content = await fs.readFile(filePath);
      const hash = crypto.createHash('sha256').update(content).digest('hex');
      return hash.substring(0, 8);
    } catch (error) {
      throw new Error(`Failed to generate hash for ${filePath}: ${error}`);
    }
  }

  /**
   * Count lines in a file
   */
  private async countLines(filePath: string): Promise<number> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return content.split('\n').length - 1; // Subtract 1 for trailing newline
    } catch {
      return 0;
    }
  }

  /**
   * Get file size in bytes
   */
  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stat = await fs.stat(filePath);
      return stat.size;
    } catch {
      return 0;
    }
  }

  /**
   * Create a backup of a file before editing
   */
  async createBackup(filePath: string, agentId: string): Promise<BackupResult> {
    // Validate inputs
    if (!filePath) {
      throw new Error('File path is required');
    }

    if (!agentId) {
      throw new Error('Agent ID is required');
    }

    // Check if file exists
    try {
      await fs.stat(filePath);
    } catch {
      throw new Error(`File does not exist: ${filePath}`);
    }

    try {
      // Generate timestamp and hash
      const timestamp = new Date().toISOString();
      const fileHash = await this.generateFileHash(filePath);
      const unixTimestamp = Date.now();

      // Create backup directory structure: .backups/agent-id/timestamp_hash/
      const backupBaseDir = path.join(this.projectRoot, this.config.backupDir, agentId);
      const backupName = `${unixTimestamp}_${fileHash}`;
      const fullBackupPath = path.join(backupBaseDir, backupName);

      // Create backup directory
      await fs.mkdir(fullBackupPath, { recursive: true });

      // Copy original file to backup location
      const originalFileName = path.basename(filePath);
      const backupFilePath = path.join(fullBackupPath, originalFileName);
      await fs.copyFile(filePath, backupFilePath);

      // Gather metadata
      const fileSize = await this.getFileSize(filePath);
      const lineCount = await this.countLines(filePath);

      // Create metadata file
      const metadata: BackupMetadata = {
        timestamp,
        agentId,
        originalFile: filePath,
        fileHash,
        backupPath: fullBackupPath,
        createdAt: new Date().toISOString(),
        fileSize,
        lineCount,
      };

      const metadataPath = path.join(fullBackupPath, 'metadata.json');
      await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));

      // Create revert script
      const revertScriptPath = path.join(fullBackupPath, 'revert.sh');
      const revertScript = `#!/bin/bash
# Auto-generated revert script for ${filePath}
set -euo pipefail

echo "Reverting: ${filePath}"
cp "${backupFilePath}" "${filePath}"
echo "✅ File reverted successfully"
`;
      await fs.writeFile(revertScriptPath, revertScript, { mode: 0o755 });

      // Clean up old backups
      await this.cleanOldBackups(agentId);

      return {
        backupPath: fullBackupPath,
        timestamp: new Date().toISOString(),
        fileHash,
        originalPath: filePath,
        metadata,
      };
    } catch (error) {
      throw new Error(`Backup creation failed for ${filePath}: ${error}`);
    }
  }

  /**
   * Revert a file from its backup
   */
  async revertFile(filePath: string, agentId: string): Promise<void> {
    try {
      // Find the most recent backup for this file
      const backups = await this.listBackups(filePath);
      if (backups.length === 0) {
        throw new Error(`No backups found for ${filePath}`);
      }

      // Get the most recent backup
      const mostRecentBackup = backups[0];
      const backupedFile = path.join(
        mostRecentBackup.metadata.backupPath,
        path.basename(filePath)
      );

      // Verify backup file exists
      await fs.stat(backupedFile);

      // Restore file
      await fs.copyFile(backupedFile, filePath);
    } catch (error) {
      throw new Error(`Failed to revert ${filePath}: ${error}`);
    }
  }

  /**
   * List all backups for a given file
   */
  async listBackups(filePath: string): Promise<BackupResult[]> {
    try {
      const backupBaseDir = path.join(this.projectRoot, this.config.backupDir);
      const fileName = path.basename(filePath);

      // Recursively search for backups
      const backups: BackupResult[] = [];
      const searchDir = async (dir: string) => {
        try {
          const entries = await fs.readdir(dir, { withFileTypes: true });

          for (const entry of entries) {
            const fullPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
              // Try to read metadata.json
              const metadataPath = path.join(fullPath, 'metadata.json');
              try {
                const metadataContent = await fs.readFile(metadataPath, 'utf-8');
                const metadata: BackupMetadata = JSON.parse(metadataContent);

                // Check if this backup is for our file
                if (metadata.originalFile === filePath) {
                  backups.push({
                    backupPath: fullPath,
                    timestamp: metadata.timestamp,
                    fileHash: metadata.fileHash,
                    originalPath: metadata.originalFile,
                    metadata,
                  });
                }
              } catch {
                // Not a backup directory, recurse
                await searchDir(fullPath);
              }
            }
          }
        } catch (error) {
          // Directory doesn't exist or other read error
          return;
        }
      };

      await searchDir(backupBaseDir);

      // Sort by timestamp descending (most recent first)
      return backups.sort(
        (a, b) =>
          new Date(b.metadata.createdAt).getTime() -
          new Date(a.metadata.createdAt).getTime()
      );
    } catch {
      return [];
    }
  }

  /**
   * Clean up old backups for an agent
   */
  async cleanOldBackups(agentId: string): Promise<number> {
    try {
      const backupDir = path.join(this.projectRoot, this.config.backupDir, agentId);
      const retentionMs = this.config.retentionHours * 60 * 60 * 1000;
      const cutoffTime = Date.now() - retentionMs;
      let deletedCount = 0;

      // Read agent backup directory
      let entries: string[] = [];
      try {
        entries = await fs.readdir(backupDir);
      } catch {
        // Directory doesn't exist
        return 0;
      }

      // Get backup metadata and timestamps
      const backupTimestamps: Array<{ name: string; timestamp: number }> = [];

      for (const entry of entries) {
        const fullPath = path.join(backupDir, entry);
        const metadataPath = path.join(fullPath, 'metadata.json');

        try {
          const metadataContent = await fs.readFile(metadataPath, 'utf-8');
          const metadata: BackupMetadata = JSON.parse(metadataContent);
          const timestamp = new Date(metadata.createdAt).getTime();

          backupTimestamps.push({ name: entry, timestamp });
        } catch {
          // Skip invalid backup directories
        }
      }

      // Sort by timestamp descending
      backupTimestamps.sort((a, b) => b.timestamp - a.timestamp);

      // Remove old backups (either too old or exceed max count)
      for (let i = 0; i < backupTimestamps.length; i++) {
        const { name, timestamp } = backupTimestamps[i];

        // Remove if older than retention or if exceeds max count
        if (timestamp < cutoffTime || i >= this.config.maxBackups) {
          const fullPath = path.join(backupDir, name);
          try {
            await fs.rm(fullPath, { recursive: true, force: true });
            deletedCount++;
          } catch {
            // Continue with next backup
          }
        }
      }

      return deletedCount;
    } catch {
      return 0;
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupPath: string): Promise<boolean> {
    try {
      const metadataPath = path.join(backupPath, 'metadata.json');
      const metadata: BackupMetadata = JSON.parse(
        await fs.readFile(metadataPath, 'utf-8')
      );

      // Check backup file exists
      const fileName = path.basename(metadata.originalFile);
      const backupFilePath = path.join(backupPath, fileName);
      const stat = await fs.stat(backupFilePath);

      // Verify size matches metadata
      if (stat.size !== metadata.fileSize) {
        return false;
      }

      // Verify hash matches
      const actualHash = await this.generateFileHash(backupFilePath);
      return actualHash === metadata.fileHash;
    } catch {
      return false;
    }
  }
}
