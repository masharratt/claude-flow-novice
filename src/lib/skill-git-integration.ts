/**
 * Skill Git Integration
 *
 * Manages version tracking, content hashing, and git metadata for skills
 * Provides atomic updates with rollback capabilities
 *
 * @module skill-git-integration
 * @version 1.0.0
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import { StandardError } from './errors';

const execAsync = promisify(exec);

/**
 * Git commit metadata
 */
export interface GitCommitMetadata {
  hash: string;
  author: string;
  email: string;
  date: string;
  message: string;
}

/**
 * Version history entry
 */
export interface VersionHistoryEntry {
  version: string;
  commit: GitCommitMetadata;
  contentHash: string;
  timestamp: string;
  filePath: string;
}

/**
 * Git operation result
 */
export interface GitOperationResult {
  success: boolean;
  commitHash?: string;
  error?: string;
}

/**
 * Git integration error
 */
export class GitIntegrationError extends StandardError {
  constructor(message: string, public readonly context?: Record<string, unknown>) {
    super('GIT_INTEGRATION_ERROR', message, context);
    this.name = 'GitIntegrationError';
  }
}

/**
 * Calculate SHA256 hash of file content
 *
 * @param content - File content string
 * @returns SHA256 hash in hexadecimal
 */
export function calculateContentHash(content: string): string {
  return createHash('sha256').update(content).digest('hex');
}

/**
 * Calculate SHA256 hash of file
 *
 * @param filePath - Path to file
 * @returns SHA256 hash in hexadecimal
 */
export async function calculateFileHash(filePath: string): Promise<string> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return calculateContentHash(content);
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to calculate file hash for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Check if a path is in a git repository
 *
 * @param filePath - Path to check
 * @returns True if in git repository
 */
export async function isGitRepository(filePath: string): Promise<boolean> {
  try {
    await execAsync('git rev-parse --is-inside-work-tree', {
      cwd: filePath
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get git commit metadata for a file
 *
 * @param filePath - Path to file
 * @param commitRef - Git commit reference (default: HEAD)
 * @returns Commit metadata
 */
export async function getCommitMetadata(
  filePath: string,
  commitRef: string = 'HEAD'
): Promise<GitCommitMetadata> {
  try {
    const { stdout } = await execAsync(
      `git log -1 --format="%H%n%an%n%ae%n%ai%n%s" ${commitRef} -- "${filePath}"`
    );

    const [hash, author, email, date, message] = stdout.trim().split('\n');

    if (!hash) {
      throw new GitIntegrationError('No git history found for file', { filePath });
    }

    return {
      hash,
      author,
      email,
      date,
      message: message || 'No commit message'
    };
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to get git metadata for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Get version history for a skill file
 *
 * @param filePath - Path to SKILL.md file
 * @param limit - Maximum number of entries (default: 10)
 * @returns Array of version history entries
 */
export async function getVersionHistory(
  filePath: string,
  limit: number = 10
): Promise<VersionHistoryEntry[]> {
  try {
    // Get commit history
    const { stdout } = await execAsync(
      `git log -${limit} --format="%H" -- "${filePath}"`
    );

    const commits = stdout.trim().split('\n').filter(Boolean);
    const history: VersionHistoryEntry[] = [];

    for (const commitHash of commits) {
      try {
        // Get file content at this commit
        const { stdout: content } = await execAsync(
          `git show ${commitHash}:"${filePath}"`
        );

        // Get commit metadata
        const metadata = await getCommitMetadata(filePath, commitHash);

        // Calculate content hash
        const contentHash = calculateContentHash(content);

        // Extract version from content (if available in frontmatter)
        const versionMatch = content.match(/version:\s*["']?([0-9.]+)["']?/);
        const version = versionMatch ? versionMatch[1] : 'unknown';

        history.push({
          version,
          commit: metadata,
          contentHash,
          timestamp: metadata.date,
          filePath
        });
      } catch (error) {
        // Skip commits where file doesn't exist
        continue;
      }
    }

    return history;
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to get version history for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Stage and commit a file with atomic operation
 *
 * @param filePath - Path to file to commit
 * @param message - Commit message
 * @returns Git operation result
 */
export async function commitFile(
  filePath: string,
  message: string
): Promise<GitOperationResult> {
  try {
    // Stage file
    await execAsync(`git add "${filePath}"`);

    // Commit
    const { stdout } = await execAsync(`git commit -m "${message}"`);

    // Get commit hash
    const { stdout: hashOutput } = await execAsync('git rev-parse HEAD');
    const commitHash = hashOutput.trim();

    return {
      success: true,
      commitHash
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Rollback file to previous commit
 *
 * @param filePath - Path to file to rollback
 * @param commitRef - Git commit reference to rollback to (default: HEAD~1)
 * @returns Git operation result
 */
export async function rollbackFile(
  filePath: string,
  commitRef: string = 'HEAD~1'
): Promise<GitOperationResult> {
  try {
    // Checkout file from previous commit
    await execAsync(`git checkout ${commitRef} -- "${filePath}"`);

    // Commit the rollback
    const message = `Rollback ${filePath} to ${commitRef}`;
    return await commitFile(filePath, message);
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if file has uncommitted changes
 *
 * @param filePath - Path to file
 * @returns True if file has uncommitted changes
 */
export async function hasUncommittedChanges(filePath: string): Promise<boolean> {
  try {
    const { stdout } = await execAsync(`git status --porcelain "${filePath}"`);
    return stdout.trim().length > 0;
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to check git status for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Get current git branch
 *
 * @returns Current branch name
 */
export async function getCurrentBranch(): Promise<string> {
  try {
    const { stdout } = await execAsync('git rev-parse --abbrev-ref HEAD');
    return stdout.trim();
  } catch (error) {
    throw new GitIntegrationError(
      'Failed to get current branch',
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Get file diff between two commits
 *
 * @param filePath - Path to file
 * @param commitRef1 - First commit reference
 * @param commitRef2 - Second commit reference (default: HEAD)
 * @returns Diff output
 */
export async function getFileDiff(
  filePath: string,
  commitRef1: string,
  commitRef2: string = 'HEAD'
): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git diff ${commitRef1} ${commitRef2} -- "${filePath}"`
    );
    return stdout;
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to get diff for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Verify content integrity using git hash
 *
 * @param filePath - Path to file
 * @param expectedHash - Expected content hash
 * @returns True if content matches expected hash
 */
export async function verifyContentIntegrity(
  filePath: string,
  expectedHash: string
): Promise<boolean> {
  try {
    const actualHash = await calculateFileHash(filePath);
    return actualHash === expectedHash;
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to verify content integrity for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Get file creation date from git history
 *
 * @param filePath - Path to file
 * @returns ISO date string of first commit
 */
export async function getFileCreationDate(filePath: string): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `git log --diff-filter=A --follow --format="%ai" -- "${filePath}" | tail -1`
    );

    if (!stdout.trim()) {
      throw new GitIntegrationError('No creation date found in git history', { filePath });
    }

    return new Date(stdout.trim()).toISOString();
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to get creation date for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Get file last modification date from git history
 *
 * @param filePath - Path to file
 * @returns ISO date string of last commit
 */
export async function getFileModificationDate(filePath: string): Promise<string> {
  try {
    const metadata = await getCommitMetadata(filePath);
    return new Date(metadata.date).toISOString();
  } catch (error) {
    throw new GitIntegrationError(
      `Failed to get modification date for ${filePath}`,
      { error: error instanceof Error ? error.message : String(error) }
    );
  }
}
