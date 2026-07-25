/**
 * Deliverable Verifier
 * Verifies expected deliverables exist (prevents "consensus on vapor")
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface VerificationResult {
  verified: boolean;
  files: string[];
  missing: string[];
  found: string[];
  typeErrors?: string[];
  gitChanges?: number;
  requiresChanges?: boolean;
  reason?: string;
}

const IMPLEMENTATION_KEYWORDS = [
  'create', 'build', 'implement', 'add', 'generate'
];

/**
 * Verifies expected deliverables exist
 * @param params Verification parameters
 * @returns VerificationResult with detailed verification status
 */
export function verifyDeliverables(params: {
  files: string[];
  expectedTypes?: string[];
  requireGitChanges?: boolean;
  taskType?: string;
}): VerificationResult {
  const found: string[] = [];
  const missing: string[] = [];
  const typeErrors: string[] = [];

  // Check each file
  for (const file of params.files) {
    if (fs.existsSync(file)) {
      found.push(file);

      // Type validation if expected types specified
      if (params.expectedTypes && params.expectedTypes.length > 0) {
        const ext = path.extname(file);
        if (!params.expectedTypes.includes(ext)) {
          typeErrors.push(file);
        }
      }
    } else {
      missing.push(file);
    }
  }

  // Git change detection
  let gitChanges = 0;
  if (params.requireGitChanges !== undefined) {
    try {
      const gitStatus = execSync('git status --short', {
        encoding: 'utf-8',
        timeout: 10000, // 10 second timeout
        maxBuffer: 1024 * 1024 // 1MB buffer
      });
      gitChanges = gitStatus.trim().split('\n').filter(line => line.length > 0).length;
    } catch (error) {
      // Git not available, not a git repo, or timeout
      gitChanges = -1;
    }
  }

  // Detect if task requires changes (implementation keywords)
  const requiresChanges = params.taskType
    ? IMPLEMENTATION_KEYWORDS.some(keyword =>
        params.taskType!.toLowerCase().includes(keyword)
      )
    : false;

  // Check for "consensus on vapor"
  let verified = missing.length === 0 && typeErrors.length === 0;
  let reason: string | undefined;

  if (requiresChanges && params.requireGitChanges && gitChanges === 0 && params.files.length === 0) {
    verified = false;
    reason = 'Implementation task detected but no deliverables created (consensus on vapor)';
  }

  const result: VerificationResult = {
    verified,
    files: params.files,
    missing,
    found,
    gitChanges,
    requiresChanges
  };

  // Add optional properties only if they have values
  if (typeErrors.length > 0) {
    result.typeErrors = typeErrors;
  }
  if (reason !== undefined) {
    result.reason = reason;
  }

  return result;
}
