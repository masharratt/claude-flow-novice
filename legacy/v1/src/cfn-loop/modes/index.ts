/**
 * CFN Loop Mode Registry and Selector
 *
 * Central registry for CFN Loop modes with auto-detection from epic metadata.
 *
 * Features:
 * - Mode registration (MVP, Enterprise, Standard)
 * - Auto-detection from filename patterns
 * - Metadata parsing from epic config
 * - Explicit mode selection via CLI flags
 *
 * @module cfn-loop/modes
 */

import type {
  CFNLoopMode,
  CFNLoopModeName,
  ModeDetectionMetadata,
  ModeSelectionResult,
} from './types.js';
import { mvpMode } from './mvp-mode.js';
import { enterpriseMode } from './enterprise-mode.js';
import { standardMode } from './standard-mode.js';

// ===== MODE REGISTRY =====

/**
 * Registry of all available CFN Loop modes
 */
const MODE_REGISTRY: Record<CFNLoopModeName, CFNLoopMode> = {
  mvp: mvpMode,
  enterprise: enterpriseMode,
  standard: standardMode,
};

/**
 * Default mode when no explicit selection
 */
const DEFAULT_MODE: CFNLoopModeName = 'standard';

// ===== MODE SELECTION =====

/**
 * Select CFN Loop mode with auto-detection
 *
 * Selection priority:
 * 1. Explicit mode parameter
 * 2. Filename pattern (e.g., "project-mvp.json")
 * 3. Metadata fields (cfnMode, mode, quality)
 * 4. Default to standard mode
 *
 * @param options - Mode selection options
 * @returns Selected mode with detection source
 *
 * @example
 * ```typescript
 * // Explicit selection
 * const result = selectMode({ mode: 'mvp' });
 *
 * // Auto-detection from filename
 * const result = selectMode({
 *   filename: 'my-project-mvp.json',
 *   auto: true
 * });
 *
 * // Auto-detection from metadata
 * const result = selectMode({
 *   metadata: { cfnMode: 'enterprise' },
 *   auto: true
 * });
 * ```
 */
export function selectMode(options: {
  mode?: CFNLoopModeName;
  filename?: string;
  metadata?: ModeDetectionMetadata;
  auto?: boolean;
}): ModeSelectionResult {
  // 1. Explicit mode parameter
  if (options.mode && options.mode in MODE_REGISTRY) {
    return {
      mode: MODE_REGISTRY[options.mode],
      source: 'explicit',
    };
  }

  // 2. Auto-detection enabled
  if (options.auto) {
    // Try filename detection
    if (options.filename) {
      const filenameMode = detectModeFromFilename(options.filename);
      if (filenameMode) {
        return {
          mode: MODE_REGISTRY[filenameMode],
          source: 'filename',
          detectedFrom: options.filename,
        };
      }
    }

    // Try metadata detection
    if (options.metadata) {
      const metadataMode = detectModeFromMetadata(options.metadata);
      if (metadataMode) {
        return {
          mode: MODE_REGISTRY[metadataMode],
          source: 'metadata',
          detectedFrom: 'epic metadata',
        };
      }
    }
  }

  // 3. Default to standard mode
  return {
    mode: MODE_REGISTRY[DEFAULT_MODE],
    source: 'default',
  };
}

/**
 * Get mode by name
 *
 * @param name - Mode name (mvp, enterprise, standard)
 * @returns Mode configuration or undefined
 */
export function getMode(name: CFNLoopModeName): CFNLoopMode | undefined {
  return MODE_REGISTRY[name];
}

/**
 * Get all registered modes
 *
 * @returns Array of all mode configurations
 */
export function getAllModes(): CFNLoopMode[] {
  return Object.values(MODE_REGISTRY);
}

/**
 * Register custom mode (for testing or extensions)
 *
 * @param mode - Custom mode configuration
 */
export function registerMode(mode: CFNLoopMode): void {
  MODE_REGISTRY[mode.name] = mode;
}

// ===== MODE DETECTION =====

/**
 * Detect mode from filename patterns
 *
 * Patterns:
 * - "project-mvp.json" → mvp
 * - "project_mvp.json" → mvp
 * - "project.mvp.json" → mvp
 * - "project-enterprise.json" → enterprise
 * - "project_enterprise.json" → enterprise
 * - "project.enterprise.json" → enterprise
 *
 * @param filename - Epic configuration filename
 * @returns Detected mode or undefined
 */
export function detectModeFromFilename(filename: string): CFNLoopModeName | undefined {
  const lowerFilename = filename.toLowerCase();

  // Check for MVP patterns
  if (
    lowerFilename.includes('-mvp') ||
    lowerFilename.includes('_mvp') ||
    lowerFilename.includes('.mvp')
  ) {
    return 'mvp';
  }

  // Check for Enterprise patterns
  if (
    lowerFilename.includes('-enterprise') ||
    lowerFilename.includes('_enterprise') ||
    lowerFilename.includes('.enterprise')
  ) {
    return 'enterprise';
  }

  // No pattern matched
  return undefined;
}

/**
 * Detect mode from epic metadata
 *
 * Checks metadata fields in order:
 * 1. cfnMode (explicit)
 * 2. mode (general)
 * 3. quality (mapped to mode)
 *
 * @param metadata - Epic configuration metadata
 * @returns Detected mode or undefined
 */
export function detectModeFromMetadata(
  metadata: ModeDetectionMetadata
): CFNLoopModeName | undefined {
  // Check explicit cfnMode field
  if (metadata.cfnMode && metadata.cfnMode in MODE_REGISTRY) {
    return metadata.cfnMode;
  }

  // Check general mode field
  if (metadata.mode && metadata.mode in MODE_REGISTRY) {
    return metadata.mode;
  }

  // Check quality field (mapped to mode)
  if (metadata.quality) {
    switch (metadata.quality) {
      case 'mvp':
        return 'mvp';
      case 'enterprise':
        return 'enterprise';
      case 'standard':
        return 'standard';
    }
  }

  return undefined;
}

// ===== EXPORTS =====

export * from './types.js';
export { mvpMode } from './mvp-mode.js';
export { enterpriseMode } from './enterprise-mode.js';
export { standardMode } from './standard-mode.js';

export default {
  selectMode,
  getMode,
  getAllModes,
  registerMode,
  detectModeFromFilename,
  detectModeFromMetadata,
  MODE_REGISTRY,
  DEFAULT_MODE,
};
