/**
 * Secret Filter Utility
 * Redacts sensitive information from logs and output strings
 * Prevents accidental secret exposure in console output and log files
 */

/**
 * Sensitive pattern matchers that should be redacted
 * Patterns are designed to avoid false positives while catching common secret formats
 */
const SECRET_PATTERNS: Array<{
  name: string;
  pattern: RegExp;
}> = [
  // API Keys and Tokens
  {
    name: 'ANTHROPIC_API_KEY',
    pattern: /(ANTHROPIC_API_KEY)[\s:=]+([^\s\n"']+)/gi
  },
  {
    name: 'CFN_API_KEY',
    pattern: /(CFN_API_KEY)[\s:=]+([^\s\n"']+)/gi
  },
  {
    name: 'GITHUB_TOKEN',
    pattern: /(github_token|GITHUB_TOKEN)[\s:=]+([^\s\n"']+)/gi
  },
  {
    name: 'OpenAI_API_KEY',
    pattern: /(OPENAI_API_KEY)[\s:=]+([^\s\n"']+)/gi
  },
  // Database Passwords and Redis Auth
  {
    name: 'REDIS_PASSWORD',
    pattern: /(CFN_REDIS_PASSWORD|REDIS_PASSWORD)[\s:=]+([^\s\n"']+)/gi
  },
  {
    name: 'DATABASE_PASSWORD',
    pattern: /(password)[\s:=]+([^\s\n"']+)/gi
  },
  // Bearer Tokens
  {
    name: 'BEARER_TOKEN',
    pattern: /(Bearer|bearer)\s+([A-Za-z0-9._\-]+)/g
  },
  // SSH Keys (partial - full keys are multi-line)
  {
    name: 'SSH_KEY_EXPORT',
    pattern: /(ssh-rsa|ssh-ed25519|-----BEGIN)\s+([^\s\n]+)/g
  },
  // AWS/Cloud Credentials
  {
    name: 'AWS_ACCESS_KEY',
    pattern: /(AKIA[0-9A-Z]{16})/g
  },
  // Basic Auth
  {
    name: 'BASIC_AUTH',
    pattern: /([A-Za-z0-9_-]+:[A-Za-z0-9_-]+)@/g
  }
];

/**
 * Redacts sensitive information from text
 * @param text The text that may contain sensitive information
 * @param strict If true, uses aggressive redaction (default: false)
 * @returns The text with sensitive information redacted
 */
export function filterSecrets(text: string, strict: boolean = false): string {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let filtered = text;

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(filtered)) {
      filtered = filtered.replace(pattern, (match) => {
        // Try to preserve structure for debugging
        const parts = match.split(/[\s:=]+/);
        if (parts.length >= 2) {
          // Return "KEY=***REDACTED***" format
          return `${parts[0]}=***${name}_REDACTED***`;
        }
        return `***${name}_REDACTED***`;
      });
    }
  }

  return filtered;
}

/**
 * Redacts secrets from an object (typically config or env vars)
 * @param obj The object to redact
 * @returns A new object with secrets redacted
 */
export function filterSecretsFromObject(
  obj: Record<string, any>
): Record<string, any> {
  const redacted: Record<string, any> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Check if key itself indicates a secret
      const isSensitiveKey = /secret|password|key|token|auth|credential|api/i.test(key);
      if (isSensitiveKey) {
        redacted[key] = '***REDACTED***';
      } else {
        // Still filter the value for embedded secrets
        redacted[key] = filterSecrets(value);
      }
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively filter nested objects
      redacted[key] = filterSecretsFromObject(value as Record<string, any>);
    } else if (Array.isArray(value)) {
      // Filter array elements that are strings
      redacted[key] = value.map(item =>
        typeof item === 'string' ? filterSecrets(item) : item
      );
    } else {
      redacted[key] = value;
    }
  }

  return redacted;
}

/**
 * Creates a safe JSON string from an object with secrets redacted
 * @param obj The object to stringify
 * @param space Optional spacing for pretty-printing
 * @returns JSON string with secrets redacted
 */
export function safeStringify(
  obj: any,
  space?: string | number
): string {
  const redacted = filterSecretsFromObject(obj);
  return JSON.stringify(redacted, null, space);
}

/**
 * Creates a wrapped console.log that automatically redacts secrets
 * @returns A safe logging function
 */
export function createSafeLogger(prefix: string = '') {
  return (...args: any[]) => {
    const filteredArgs = args.map(arg => {
      if (typeof arg === 'string') {
        return filterSecrets(arg);
      } else if (typeof arg === 'object' && arg !== null) {
        return filterSecretsFromObject(arg);
      }
      return arg;
    });

    if (prefix) {
      console.log(`[${prefix}]`, ...filteredArgs);
    } else {
      console.log(...filteredArgs);
    }
  };
}

export default {
  filterSecrets,
  filterSecretsFromObject,
  safeStringify,
  createSafeLogger
};
