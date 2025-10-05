/**
 * XSS Protection - Cross-site scripting prevention utilities
 * Provides HTML sanitization and input validation for frontend security
 */

import { createHash } from 'crypto';

// Simple HTML sanitizer implementation (DOMPurify alternative)
export class XSSProtection {
  private static readonly ALLOWED_TAGS = [
    // Basic formatting
    'p', 'br', 'strong', 'em', 'u', 'i', 'b', 's', 'sub', 'sup',
    // Headings
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    // Lists
    'ul', 'ol', 'li', 'dl', 'dt', 'dd',
    // Tables
    'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption',
    // Other safe elements
    'blockquote', 'code', 'pre', 'hr', 'small',
    // Semantic
    'div', 'span', 'section', 'article', 'header', 'footer',
    'nav', 'main', 'aside', 'figure', 'figcaption',
    // Media
    'img', 'audio', 'video', 'source', 'track'
  ];

  private static readonly ALLOWED_ATTRIBUTES = {
    '*': ['class', 'id', 'title', 'lang', 'dir', 'style'],
    'a': ['href', 'target', 'rel', 'download'],
    'img': ['src', 'alt', 'width', 'height', 'loading'],
    'audio': ['src', 'controls', 'autoplay', 'loop', 'muted'],
    'video': ['src', 'controls', 'autoplay', 'loop', 'muted', 'poster', 'width', 'height'],
    'source': ['src', 'type'],
    'track': ['src', 'kind', 'srclang', 'label'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan', 'scope'],
    'ol': ['start', 'type', 'reversed'],
    'li': ['value'],
    'blockquote': ['cite'],
    'q': ['cite'],
    'time': ['datetime'],
    'data': ['value'],
  };

  private static readonly DANGEROUS_TAGS = [
    'script', 'iframe', 'object', 'embed', 'form', 'input', 'textarea',
    'select', 'option', 'button', 'link', 'meta', 'style', 'base',
    'applet', 'param', 'marquee', 'blink', 'plaintext', 'xmp'
  ];

  private static readonly DANGEROUS_ATTRIBUTES = [
    'onload', 'onerror', 'onclick', 'onmouseover', 'onmouseout',
    'onfocus', 'onblur', 'onchange', 'onsubmit', 'onreset',
    'onkeydown', 'onkeyup', 'onkeypress', 'onmousedown',
    'onmouseup', 'onmousemove', 'javascript:', 'vbscript:',
    'data:', 'srcset', 'formaction', 'action', 'method',
    'enctype', 'autocomplete', 'autofocus', 'target'
  ];

  /**
   * Sanitize HTML string to prevent XSS attacks
   */
  static sanitizeHTML(html: string, options: {
    allowedTags?: string[];
    allowedAttributes?: Record<string, string[]>;
    stripEmpty?: boolean;
  } = {}): string {
    if (!html || typeof html !== 'string') {
      return '';
    }

    const config = {
      allowedTags: options.allowedTags || this.ALLOWED_TAGS,
      allowedAttributes: options.allowedAttributes || this.ALLOWED_ATTRIBUTES,
      stripEmpty: options.stripEmpty !== false,
    };

    try {
      // Remove dangerous tags completely
      let sanitized = this.removeDangerousTags(html);

      // Parse and sanitize HTML
      sanitized = this.parseAndSanitize(sanitized, config);

      // Remove any remaining script content or dangerous attributes
      sanitized = this.removeDangerousAttributes(sanitized);

      // Remove empty elements if requested
      if (config.stripEmpty) {
        sanitized = this.removeEmptyElements(sanitized);
      }

      return sanitized.trim();
    } catch (error) {
      console.error('HTML sanitization error:', error);
      return '';
    }
  }

  /**
   * Sanitize text content for display
   */
  static sanitizeText(text: string): string {
    if (!text || typeof text !== 'string') {
      return '';
    }

    return text
      .replace(/[&<>"']/g, (match) => {
        const entityMap: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
        };
        return entityMap[match];
      })
      .trim();
  }

  /**
   * Validate URL is safe
   */
  static sanitizeURL(url: string): string {
    if (!url || typeof url !== 'string') {
      return '';
    }

    try {
      const parsed = new URL(url, window.location.href);

      // Only allow safe protocols
      const allowedProtocols = ['http:', 'https:', 'mailto:', 'tel:', 'ftp:'];
      if (!allowedProtocols.includes(parsed.protocol)) {
        return '';
      }

      // Prevent data: and javascript: URLs
      if (url.startsWith('data:') || url.startsWith('javascript:') || url.startsWith('vbscript:')) {
        return '';
      }

      return parsed.toString();
    } catch {
      return '';
    }
  }

  /**
   * Generate content hash for integrity checking
   */
  static generateContentHash(content: string): string {
    return createHash('sha256').update(content).digest('base64');
  }

  /**
   * Validate input against XSS patterns
   */
  static containsXSS(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const xssPatterns = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /on\w+\s*=/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi,
      /<applet/gi,
      /<meta/gi,
      /<link/gi,
      /<style/gi,
      /expression\s*\(/gi,
      /@import/gi,
      /behavior\s*:/gi,
      /binding\s*:/gi,
      /include-source/gi,
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Remove dangerous tags completely
   */
  private static removeDangerousTags(html: string): string {
    this.DANGEROUS_TAGS.forEach(tag => {
      const regex = new RegExp(`<${tag}[^>]*>.*?</${tag}>`, 'gis');
      html = html.replace(regex, '');
      // Also remove self-closing tags
      const selfClosingRegex = new RegExp(`<${tag}[^>]*\/>`, 'gis');
      html = html.replace(selfClosingRegex, '');
    });
    return html;
  }

  /**
   * Remove dangerous attributes
   */
  private static removeDangerousAttributes(html: string): string {
    this.DANGEROUS_ATTRIBUTES.forEach(attr => {
      const regex = new RegExp(`\\s${attr}\\s*=\\s*["'][^"']*["']`, 'gis');
      html = html.replace(regex, '');
    });
    return html;
  }

  /**
   * Parse and sanitize HTML with allowed tags and attributes
   */
  private static parseAndSanitize(html: string, config: {
    allowedTags: string[];
    allowedAttributes: Record<string, string[]>;
  }): string {
    // Simple regex-based parser (in production, use a proper HTML parser)
    let result = html;

    // Remove disallowed tags
    const tagRegex = /<(\w+)([^>]*)>(.*?)<\/\1>/gis;
    result = result.replace(tagRegex, (match, tagName, attrs, content) => {
      if (config.allowedTags.includes(tagName.toLowerCase())) {
        const sanitizedAttrs = this.sanitizeAttributes(tagName.toLowerCase(), attrs, config.allowedAttributes);
        return `<${tagName}${sanitizedAttrs}>${content}</${tagName}>`;
      }
      return content; // Remove tag but keep content
    });

    // Handle self-closing tags
    const selfClosingRegex = /<(\w+)([^>]*)\/>/gis;
    result = result.replace(selfClosingRegex, (match, tagName, attrs) => {
      if (config.allowedTags.includes(tagName.toLowerCase())) {
        const sanitizedAttrs = this.sanitizeAttributes(tagName.toLowerCase(), attrs, config.allowedAttributes);
        return `<${tagName}${sanitizedAttrs}/>`;
      }
      return '';
    });

    return result;
  }

  /**
   * Sanitize attributes for a tag
   */
  private static sanitizeAttributes(tagName: string, attrString: string, allowedAttributes: Record<string, string[]>): string {
    if (!attrString.trim()) return '';

    const attrs = attrString.match(/(\w+)=["']([^"']*)["']/g) || [];
    const sanitized: string[] = [];

    attrs.forEach(attr => {
      const match = attr.match(/(\w+)=["']([^"']*)["']/);
      if (match) {
        const [, attrName, attrValue] = match;
        const allowedForTag = allowedAttributes[tagName] || allowedAttributes['*'] || [];
        const allowedForAll = allowedAttributes['*'] || [];

        if (allowedForTag.includes(attrName) || allowedForAll.includes(attrName)) {
          // Special handling for certain attributes
          if (attrName === 'href') {
            const safeURL = this.sanitizeURL(attrValue);
            if (safeURL) {
              sanitized.push(`${attrName}="${safeURL}"`);
            }
          } else if (attrName === 'src') {
            const safeURL = this.sanitizeURL(attrValue);
            if (safeURL) {
              sanitized.push(`${attrName}="${safeURL}"`);
            }
          } else {
            sanitized.push(`${attrName}="${this.sanitizeText(attrValue)}"`);
          }
        }
      }
    });

    return sanitized.length > 0 ? ' ' + sanitized.join(' ') : '';
  }

  /**
   * Remove empty elements
   */
  private static removeEmptyElements(html: string): string {
    return html.replace(/<(\w+)([^>]*)>\s*<\/\1>/gis, '');
  }
}

/**
 * React component for safe HTML rendering
 */
export interface SafeHTMLProps {
  html: string;
  className?: string;
  style?: React.CSSProperties;
  as?: keyof JSX.IntrinsicElements;
}

export const SafeHTML: React.FC<SafeHTMLProps> = ({
  html,
  className,
  style,
  as: Component = 'div',
}) => {
  const sanitizedHTML = XSSProtection.sanitizeHTML(html);

  return (
    <Component
      className={className}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizedHTML }}
    />
  );
};

/**
 * Input validation utilities
 */
export class InputValidator {
  /**
   * Validate email format
   */
  static isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): {
    isValid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }

    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate API key format
   */
  static isValidApiKey(key: string): boolean {
    // API keys should be alphanumeric, 20-64 characters
    const apiKeyRegex = /^[a-zA-Z0-9]{20,64}$/;
    return apiKeyRegex.test(key);
  }

  /**
   * Validate session ID format
   */
  static isValidSessionId(sessionId: string): boolean {
    // Session IDs should be alphanumeric with some special chars, 20-128 characters
    const sessionIdRegex = /^[a-zA-Z0-9\-_]{20,128}$/;
    return sessionIdRegex.test(sessionId);
  }

  /**
   * Sanitize and validate user input
   */
  static sanitizeInput(input: any, options: {
    maxLength?: number;
    allowHTML?: boolean;
    trim?: boolean;
  } = {}): string {
    if (input === null || input === undefined) {
      return '';
    }

    const str = String(input);
    let result = str;

    if (options.trim !== false) {
      result = result.trim();
    }

    if (options.maxLength) {
      result = result.substring(0, options.maxLength);
    }

    if (options.allowHTML) {
      result = XSSProtection.sanitizeHTML(result);
    } else {
      result = XSSProtection.sanitizeText(result);
    }

    return result;
  }
}

export default XSSProtection;