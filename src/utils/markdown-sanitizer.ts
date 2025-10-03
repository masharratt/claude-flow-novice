import DOMPurify from 'isomorphic-dompurify';

export class MarkdownSanitizer {
  private static readonly MAX_LENGTH = 100000; // 100KB max
  private static readonly MAX_SPRINT_DESC_LENGTH = 10000; // 10KB for sprint descriptions

  /**
   * Sanitizes markdown content to prevent XSS and injection attacks
   * Addresses CVE-2025-006
   */
  static sanitize(markdown: string, options: SanitizeOptions = {}): string {
    const maxLength = options.maxLength || this.MAX_LENGTH;

    // Length validation
    if (markdown.length > maxLength) {
      throw new Error(
        `Markdown exceeds max length: ${markdown.length} > ${maxLength}\n` +
        `This prevents DoS attacks and excessive memory usage`
      );
    }

    // Remove dangerous patterns before HTML sanitization
    let cleaned = markdown
      // Remove script tags and content
      .replace(/<script[^>]*>.*?<\/script>/gis, '')
      // Remove javascript: protocol
      .replace(/javascript:/gi, '')
      // Remove data: protocol (can contain JS)
      .replace(/data:text\/html[^"']*/gi, '')
      // Remove vbscript: protocol
      .replace(/vbscript:/gi, '')
      // Remove event handlers
      .replace(/\son\w+\s*=/gi, ' ')
      // Remove <iframe> tags
      .replace(/<iframe[^>]*>.*?<\/iframe>/gis, '')
      // Remove <object> and <embed> tags
      .replace(/<(object|embed)[^>]*>.*?<\/\1>/gis, '');

    // Sanitize HTML with DOMPurify
    cleaned = DOMPurify.sanitize(cleaned, {
      ALLOWED_TAGS: [
        'p', 'br', 'strong', 'em', 'u', 'code', 'pre',
        'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'blockquote', 'a', 'img',
        'table', 'thead', 'tbody', 'tr', 'th', 'td',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class'],
      ALLOW_DATA_ATTR: false,
      ALLOW_UNKNOWN_PROTOCOLS: false,
      ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|ftp):)/i, // Only safe protocols
    });

    return cleaned;
  }

  /**
   * Sanitize sprint descriptions with additional validation
   */
  static sanitizeSprintDescription(description: string): string {
    // Apply base sanitization
    const sanitized = this.sanitize(description, {
      maxLength: this.MAX_SPRINT_DESC_LENGTH,
    });

    // Check for prompt injection patterns
    const suspiciousPatterns = [
      /ignore\s+(previous|all|above)\s+instructions/i,
      /system\s+prompt/i,
      /admin\s+mode/i,
      /execute\s+command/i,
      /\[SYSTEM\]/i,
      /\[ADMIN\]/i,
      /override\s+security/i,
      /bypass\s+validation/i,
      /\$\{.*\}/g, // Template injection
      /\{\{.*\}\}/g, // Handlebars injection
    ];

    for (const pattern of suspiciousPatterns) {
      if (pattern.test(sanitized)) {
        throw new Error(
          `Potentially malicious content detected in sprint description:\n` +
          `  - Pattern matched: ${pattern.source}\n` +
          `This prevents prompt injection attacks (CVE-2025-006)`
        );
      }
    }

    return sanitized;
  }

  /**
   * Sanitize phase file paths to prevent path traversal
   */
  static sanitizeFilePath(filePath: string): string {
    // Remove null bytes
    const cleaned = filePath.replace(/\x00/g, '');

    // Check for path traversal patterns
    const dangerousPatterns = [
      /\.\./,           // Parent directory
      /\/\//,           // Double slashes
      /^\/etc/i,        // System directories
      /^\/sys/i,
      /^\/proc/i,
      /^\/dev/i,
      /^~\//,           // Home directory expansion
      /\$\{/,           // Variable expansion
      /\$\(/,           // Command substitution
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(cleaned)) {
        throw new Error(
          `Dangerous file path detected: ${filePath}\n` +
          `  - Pattern matched: ${pattern.source}\n` +
          `This prevents path traversal attacks`
        );
      }
    }

    // Ensure path doesn't exceed reasonable length
    if (cleaned.length > 500) {
      throw new Error(`File path exceeds max length: ${cleaned.length}`);
    }

    return cleaned;
  }

  /**
   * Sanitize epic/phase/sprint IDs
   */
  static sanitizeId(id: string, type: 'epic' | 'phase' | 'sprint'): string {
    // Strict alphanumeric + hyphens/underscores only
    const allowedPattern = /^[a-zA-Z0-9\-_]+$/;

    if (!allowedPattern.test(id)) {
      throw new Error(
        `Invalid ${type} ID: ${id}\n` +
        `Only alphanumeric characters, hyphens, and underscores allowed`
      );
    }

    if (id.length > 50) {
      throw new Error(`${type} ID exceeds max length: ${id.length} > 50`);
    }

    return id;
  }

  /**
   * Validate and sanitize URLs
   */
  static sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);

      // Only allow safe protocols
      const allowedProtocols = ['http:', 'https:', 'mailto:', 'ftp:'];
      if (!allowedProtocols.includes(parsed.protocol)) {
        throw new Error(`Unsafe protocol: ${parsed.protocol}`);
      }

      // Prevent SSRF to localhost/internal IPs
      const hostname = parsed.hostname.toLowerCase();
      const blockedHosts = [
        'localhost',
        '127.0.0.1',
        '0.0.0.0',
        '::1',
        '169.254.169.254', // AWS metadata service
      ];

      if (blockedHosts.includes(hostname)) {
        throw new Error(`Blocked hostname: ${hostname}`);
      }

      // Check for private IP ranges
      if (/^(10|172\.(1[6-9]|2\d|3[01])|192\.168)\./.test(hostname)) {
        throw new Error(`Private IP address not allowed: ${hostname}`);
      }

      return parsed.href;
    } catch (err) {
      throw new Error(`Invalid URL: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Comprehensive sanitization for epic configuration
   */
  static sanitizeEpicConfig(config: any): any {
    return {
      epicId: this.sanitizeId(config.epicId, 'epic'),
      name: this.sanitize(config.name, { maxLength: 200 }),
      description: config.description
        ? this.sanitize(config.description, { maxLength: 10000 })
        : undefined,
      phases: config.phases?.map((phase: any) => ({
        phaseId: this.sanitizeId(phase.phaseId, 'phase'),
        name: this.sanitize(phase.name, { maxLength: 200 }),
        file: this.sanitizeFilePath(phase.file),
        description: phase.description
          ? this.sanitize(phase.description, { maxLength: 5000 })
          : undefined,
        sprints: phase.sprints?.map((sprint: any) => ({
          sprintId: this.sanitizeId(sprint.sprintId, 'sprint'),
          name: this.sanitize(sprint.name, { maxLength: 200 }),
          description: this.sanitizeSprintDescription(sprint.description),
          taskType: sprint.taskType, // Validated by JSON schema
          maxIterations: sprint.maxIterations,
          dependencies: sprint.dependencies,
        })),
        dependencies: phase.dependencies,
      })),
      metadata: config.metadata,
    };
  }
}

interface SanitizeOptions {
  maxLength?: number;
}
