/**
 * Validation schemas and utilities for MDAP
 *
 * Extracted from Trigger.dev validation-schemas.ts but simplified
 * to remove Zod dependency and create standalone validation utilities.
 */

// =============================================
// Types
// =============================================

export interface ValidationError {
  path: string;
  message: string;
  value?: any;
}

export interface ValidationResult {
  success: boolean;
  errors: ValidationError[];
  data?: any;
}

// =============================================
// Basic Validation Utilities
// =============================================

/**
 * Validates a string field
 */
function validateString(value: any, fieldName: string, min?: number, max?: number): ValidationError[] {
  const errors: ValidationError[] = [];

  if (typeof value !== 'string') {
    errors.push({
      path: fieldName,
      message: `${fieldName} must be a string`,
      value
    });
    return errors;
  }

  if (min !== undefined && value.length < min) {
    errors.push({
      path: fieldName,
      message: `${fieldName} too short (min ${min} chars)`,
      value
    });
  }

  if (max !== undefined && value.length > max) {
    errors.push({
      path: fieldName,
      message: `${fieldName} too long (max ${max} chars)`,
      value
    });
  }

  // Check for null bytes (possible injection)
  if (value.includes('\0')) {
    errors.push({
      path: fieldName,
      message: `${fieldName} contains null bytes (possible injection)`,
      value
    });
  }

  return errors;
}

/**
 * Validates a work directory path
 */
function validateWorkDir(path: any): ValidationError[] {
  const errors: ValidationError[] = [];

  const stringErrors = validateString(path, 'workDir');
  errors.push(...stringErrors);

  if (stringErrors.length === 0) {
    if (!path.startsWith('/')) {
      errors.push({
        path: 'workDir',
        message: 'Work directory must be an absolute path',
        value: path
      });
    }

    if (path.includes('..')) {
      errors.push({
        path: 'workDir',
        message: 'Work directory cannot contain parent directory references',
        value: path
      });
    }
  }

  return errors;
}

/**
 * Validates decomposer input
 */
export function validateDecomposerInput(input: any): ValidationResult {
  const errors: ValidationError[] = [];

  // Validate taskId
  if (!input || typeof input.taskId !== 'string') {
    errors.push({
      path: 'taskId',
      message: 'Task ID is required and must be a string',
      value: input?.taskId
    });
  } else {
    const taskIdErrors = validateString(input.taskId, 'taskId', 1, 100);
    errors.push(...taskIdErrors);
  }

  // Validate taskDescription
  if (!input || typeof input.taskDescription !== 'string') {
    errors.push({
      path: 'taskDescription',
      message: 'Task description is required and must be a string',
      value: input?.taskDescription
    });
  } else {
    const descErrors = validateString(input.taskDescription, 'taskDescription', 10, 5000);
    errors.push(...descErrors);
  }

  // Validate workDir
  if (!input || !input.workDir) {
    errors.push({
      path: 'workDir',
      message: 'Work directory is required',
      value: input?.workDir
    });
  } else {
    const workDirErrors = validateWorkDir(input.workDir);
    errors.push(...workDirErrors);
  }

  // Validate previousContext (optional)
  if (input && input.previousContext && typeof input.previousContext !== 'object') {
    errors.push({
      path: 'previousContext',
      message: 'Previous context must be an object',
      value: input.previousContext
    });
  }

  return {
    success: errors.length === 0,
    errors,
    data: errors.length === 0 ? input : undefined
  };
}

/**
 * Validates Cerebras API response structure
 */
export function validateCerebrasResponse(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    errors.push({
      path: '',
      message: 'Response must be an object',
      value: data
    });
    return { success: false, errors };
  }

  // Validate choices array
  if (!Array.isArray(data.choices) || data.choices.length === 0) {
    errors.push({
      path: 'choices',
      message: 'Cerebras API returned no choices or invalid choices array',
      value: data.choices
    });
  } else if (data.choices[0] && (!data.choices[0].message || typeof data.choices[0].message.content !== 'string')) {
    errors.push({
      path: 'choices[0].message.content',
      message: 'Invalid message content structure in Cerebras response',
      value: data.choices[0]
    });
  }

  // Validate usage (optional)
  if (data.usage && typeof data.usage !== 'object') {
    errors.push({
      path: 'usage',
      message: 'Usage must be an object',
      value: data.usage
    });
  }

  return {
    success: errors.length === 0,
    errors,
    data: errors.length === 0 ? data : undefined
  };
}

/**
 * Validates decomposition output structure
 */
export function validateDecompositionOutput(data: any): ValidationResult {
  const errors: ValidationError[] = [];

  if (!data || typeof data !== 'object') {
    errors.push({
      path: '',
      message: 'Decomposition output must be an object',
      value: data
    });
    return { success: false, errors };
  }

  // Validate microTasks array
  if (!Array.isArray(data.microTasks) || data.microTasks.length === 0) {
    errors.push({
      path: 'microTasks',
      message: 'Decomposer returned 0 tasks or invalid tasks array - likely API error or invalid prompt',
      value: data.microTasks
    });
  } else {
    // Validate each microTask
    data.microTasks.forEach((task: any, index: number) => {
      if (!task || typeof task !== 'object') {
        errors.push({
          path: `microTasks[${index}]`,
          message: 'Micro-task must be an object',
          value: task
        });
        return;
      }

      if (!task.id || typeof task.id !== 'string') {
        errors.push({
          path: `microTasks[${index}].id`,
          message: 'Micro-task ID is required and must be a string',
          value: task.id
        });
      }

      if (!task.title || typeof task.title !== 'string') {
        errors.push({
          path: `microTasks[${index}].title`,
          message: 'Micro-task title is required and must be a string',
          value: task.title
        });
      }

      if (!task.description || typeof task.description !== 'string') {
        errors.push({
          path: `microTasks[${index}].description`,
          message: 'Micro-task description is required and must be a string',
          value: task.description
        });
      }

      if (task.priority && !['critical', 'high', 'medium', 'low'].includes(task.priority)) {
        errors.push({
          path: `microTasks[${index}].priority`,
          message: 'Invalid priority level. Must be: critical, high, medium, or low',
          value: task.priority
        });
      }

      if (task.dependencies && !Array.isArray(task.dependencies)) {
        errors.push({
          path: `microTasks[${index}].dependencies`,
          message: 'Dependencies must be an array',
          value: task.dependencies
        });
      }
    });
  }

  return {
    success: errors.length === 0,
    errors,
    data: errors.length === 0 ? data : undefined
  };
}

// =============================================
// JSON Extraction and Parsing Utilities
// =============================================

/**
 * Extracts JSON from AI model response content
 * Handles common response patterns where JSON is embedded in text
 */
export function extractJSONFromResponse(content: string, contextName: string): string {
  // Trim content first
  content = content.trim();

  // If content starts directly with { or [, it's likely pure JSON
  if (content.startsWith('{') || content.startsWith('[')) {
    return content;
  }

  // Look for JSON code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Look for first { or [ that might be JSON start
  const firstBrace = content.indexOf('{');
  const firstBracket = content.indexOf('[');

  if (firstBrace === -1 && firstBracket === -1) {
    throw new Error(
      `[${contextName}] No JSON found in response content. ` +
      `Response must contain a JSON object or array.`
    );
  }

  // Use whichever comes first
  let startIndex = -1;
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    startIndex = firstBrace;
  } else if (firstBracket !== -1) {
    startIndex = firstBracket;
  }

  if (startIndex === -1) {
    throw new Error(
      `[${contextName}] Could not locate JSON start in response content.`
    );
  }

  // Extract from first { or [ to matching end
  if (startIndex === firstBrace) {
    // Find matching }
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '{') {
          depth++;
        }
        if (char === '}') {
          depth--;
          if (depth === 0) {
            return content.substring(startIndex, i + 1);
          }
        }
      }
    }
  } else {
    // Find matching ]
    let depth = 0;
    let inString = false;
    let escape = false;

    for (let i = startIndex; i < content.length; i++) {
      const char = content[i];

      if (escape) {
        escape = false;
        continue;
      }
      if (char === '\\') {
        escape = true;
        continue;
      }
      if (char === '"') {
        inString = !inString;
        continue;
      }
      if (!inString) {
        if (char === '[') {
          depth++;
        }
        if (char === ']') {
          depth--;
          if (depth === 0) {
            return content.substring(startIndex, i + 1);
          }
        }
      }
    }
  }

  // Return from start index to end as fallback
  return content.substring(startIndex).trim();
}

/**
 * Sanitizes JSON string to fix common issues
 */
function sanitizeJSON(jsonStr: string): string {
  // Remove single-line comments (// ...)
  jsonStr = jsonStr.replace(/\/\/.*$/gm, '');

  // Remove multi-line comments (/* ... */)
  jsonStr = jsonStr.replace(/\/\*[\s\S]*?\*\//g, '');

  // Fix trailing commas
  jsonStr = jsonStr.replace(/,(\s*[}\]])/g, '$1');

  // Fix unquoted property names
  jsonStr = jsonStr.replace(/(\s*)(\w+)(\s*):/g, '$1"$2"$3:');

  return jsonStr;
}

/**
 * Extracts microTasks array from response if full JSON parsing fails
 */
function extractMicroTasksArray(content: string, contextName: string): any {
  // Look for microTasks array specifically
  const microTasksMatch = content.match(/["']?microTasks["']?\s*:\s*(\[[\s\S]*?\])/);
  if (microTasksMatch) {
    try {
      return { microTasks: JSON.parse(microTasksMatch[1]) };
    } catch (e) {
      // Try sanitizing
      try {
        const sanitized = sanitizeJSON(microTasksMatch[1]);
        return { microTasks: JSON.parse(sanitized) };
      } catch (e2) {
        // Give up
      }
    }
  }

  return null;
}

/**
 * Parses JSON from AI response with multiple recovery strategies
 */
export function parseJSONFromResponse<T = any>(content: string, contextName: string): T {
  const extracted = extractJSONFromResponse(content, contextName);

  // Strategy 1: Direct parse
  try {
    return JSON.parse(extracted) as T;
  } catch (directParseError) {
    // Strategy 2: Sanitize and retry
    try {
      const sanitized = sanitizeJSON(extracted);
      return JSON.parse(sanitized) as T;
    } catch (sanitizedParseError) {
      // Strategy 3: Extract just microTasks array (common pattern for decomposers)
      const microTasksResult = extractMicroTasksArray(content, contextName);
      if (microTasksResult) {
        return microTasksResult as T;
      }

      // All strategies failed
      throw new Error(
        `[${contextName}] Failed to parse JSON content after sanitization: ${(sanitizedParseError as Error).message}\n` +
        `Extracted content (first 300 chars): ${extracted.substring(0, 300)}\n` +
        `Original content (first 200 chars): ${content.substring(0, 200)}\n` +
        `This indicates severely malformed JSON from the AI model. ` +
        `Common issues: trailing commas, unquoted property names, embedded comments, mixed quote styles.`
      );
    }
  }
}

// =============================================
// Common Validation Patterns
// =============================================

/**
 * Validates that a value is a non-empty string
 */
export function validateNonEmptyString(value: any, fieldName: string): ValidationResult {
  const errors = validateString(value, fieldName, 1);
  return {
    success: errors.length === 0,
    errors,
    data: errors.length === 0 ? value : undefined
  };
}

/**
 * Validates that a value is an array
 */
export function validateArray(value: any, fieldName: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!Array.isArray(value)) {
    errors.push({
      path: fieldName,
      message: `${fieldName} must be an array`,
      value
    });
  }

  return {
    success: errors.length === 0,
    errors,
    data: errors.length === 0 ? value : undefined
  };
}

/**
 * Validates that a value is an object
 */
export function validateObject(value: any, fieldName: string): ValidationResult {
  const errors: ValidationError[] = [];

  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    errors.push({
      path: fieldName,
      message: `${fieldName} must be an object`,
      value
    });
  }

  return {
    success: errors.length === 0,
    errors,
    data: errors.length === 0 ? value : undefined
  };
}