/**
 * Input Validation and Sanitization Utilities
 * Provides comprehensive input validation and XSS protection
 */

import React from 'react';

// Basic sanitization function (will be enhanced with DOMPurify when available)
export const sanitizeInput = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove JavaScript event handlers
    .replace(/on\w+\s*=/gi, '')
    // Remove javascript: URLs
    .replace(/javascript:/gi, '')
    // Remove data: URLs that could execute scripts
    .replace(/data:(?!image\/)/gi, '')
    // Remove potentially dangerous characters
    .replace(/[\x00-\x1F\x7F]/g, '')
    // Limit length
    .substring(0, 10000)
    .trim();
};

// Validate email format
export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

// Validate URL format
export const validateUrl = (url: string): boolean => {
  try {
    const urlObj = new URL(url);
    return ['http:', 'https:'].includes(urlObj.protocol);
  } catch {
    return false;
  }
};

// Validate numeric input
export const validateNumeric = (input: string): boolean => {
  const numericRegex = /^[0-9]*\.?[0-9]+$/;
  return numericRegex.test(input);
};

// Validate alphanumeric input
export const validateAlphanumeric = (input: string): boolean => {
  const alphanumericRegex = /^[a-zA-Z0-9]+$/;
  return alphanumericRegex.test(input);
};

// Validate input length
export const validateLength = (
  input: string,
  minLength: number,
  maxLength: number
): boolean => {
  return input.length >= minLength && input.length <= maxLength;
};

// Comprehensive input validator
export interface ValidationRule {
  type: 'required' | 'email' | 'url' | 'numeric' | 'alphanumeric' | 'length' | 'custom';
  value?: any;
  message: string;
  validator?: (value: string) => boolean;
}

export const validateInput = (
  input: string,
  rules: ValidationRule[]
): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  for (const rule of rules) {
    switch (rule.type) {
      case 'required':
        if (!input || input.trim().length === 0) {
          errors.push(rule.message);
        }
        break;

      case 'email':
        if (input && !validateEmail(input)) {
          errors.push(rule.message);
        }
        break;

      case 'url':
        if (input && !validateUrl(input)) {
          errors.push(rule.message);
        }
        break;

      case 'numeric':
        if (input && !validateNumeric(input)) {
          errors.push(rule.message);
        }
        break;

      case 'alphanumeric':
        if (input && !validateAlphanumeric(input)) {
          errors.push(rule.message);
        }
        break;

      case 'length':
        const { minLength, maxLength } = rule.value;
        if (input && !validateLength(input, minLength, maxLength)) {
          errors.push(rule.message);
        }
        break;

      case 'custom':
        if (rule.validator && input && !rule.validator(input)) {
          errors.push(rule.message);
        }
        break;
    }
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

// XSS Protection utilities
export const preventXSS = {
  // Sanitize HTML content
  sanitizeHtml: (html: string): string => {
    return sanitizeInput(html);
  },

  // Escape HTML entities
  escapeHtml: (text: string): string => {
    const map: { [key: string]: string } = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };

    return text.replace(/[&<>"']/g, (m) => map[m]);
  },

  // Check for potential XSS patterns
  containsXSS: (input: string): boolean => {
    const xssPatterns = [
      /<script/i,
      /javascript:/i,
      /on\w+\s*=/i,
      /<iframe/i,
      /<object/i,
      /<embed/i,
      /data:(?!image\/)/i
    ];

    return xssPatterns.some(pattern => pattern.test(input));
  }
};

// Form validation hook (React compatible)
export const useFormValidation = (initialValues: { [key: string]: string }) => {
  const [values, setValues] = React.useState(initialValues);
  const [errors, setErrors] = React.useState<{ [key: string]: string[] }>({});
  const [touched, setTouched] = React.useState<{ [key: string]: boolean }>({});

  const setValue = (name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
  };

  const setError = (name: string, errorMessages: string[]) => {
    setErrors(prev => ({ ...prev, [name]: errorMessages }));
  };

  const setTouched = (name: string, isTouched: boolean = true) => {
    setTouched(prev => ({ ...prev, [name]: isTouched }));
  };

  const validateField = (name: string, value: string, rules: ValidationRule[]) => {
    const result = validateInput(value, rules);
    setError(name, result.errors);
    return result.isValid;
  };

  const validateForm = (formRules: { [key: string]: ValidationRule[] }) => {
    let isValid = true;
    const newErrors: { [key: string]: string[] } = {};

    Object.keys(formRules).forEach(fieldName => {
      const result = validateInput(values[fieldName] || '', formRules[fieldName]);
      if (!result.isValid) {
        newErrors[fieldName] = result.errors;
        isValid = false;
      }
    });

    setErrors(newErrors);
    return isValid;
  };

  const resetForm = () => {
    setValues(initialValues);
    setErrors({});
    setTouched({});
  };

  return {
    values,
    errors,
    touched,
    setValue,
    setError,
    setTouched,
    validateField,
    validateForm,
    resetForm
  };
};

// Security constants
export const SECURITY_LIMITS = {
  MAX_INPUT_LENGTH: 10000,
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_UPLOAD_COUNT: 10,
  ALLOWED_FILE_TYPES: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'text/plain',
    'application/json'
  ]
};

// File validation utilities
export const validateFile = (file: File): { isValid: boolean; errors: string[] } => {
  const errors: string[] = [];

  // Check file size
  if (file.size > SECURITY_LIMITS.MAX_FILE_SIZE) {
    errors.push(`File size exceeds maximum allowed size of ${SECURITY_LIMITS.MAX_FILE_SIZE / 1024 / 1024}MB`);
  }

  // Check file type
  if (!SECURITY_LIMITS.ALLOWED_FILE_TYPES.includes(file.type)) {
    errors.push(`File type ${file.type} is not allowed`);
  }

  // Check file name for suspicious patterns
  if (preventXSS.containsXSS(file.name)) {
    errors.push('File name contains potentially dangerous content');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};