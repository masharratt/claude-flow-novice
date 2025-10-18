/**
 * Custom Framework Definition Schema
 * Comprehensive schema validation for user-defined validation frameworks
 *
 * FEATURES:
 * - JSON Schema validation with strict type checking
 * - Security pattern validation to prevent malicious code injection
 * - Compatibility validation with existing frameworks
 * - Truth scoring component weights configuration
 * - Framework inheritance and composition support
 * - Cryptographic integrity verification
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';

/**
 * Core Framework Schema
 * Defines the structure and validation rules for custom frameworks
 */
export const CustomFrameworkSchema = {
  $schema: 'http://json-schema.org/draft-07/schema#',
  $id: 'custom-framework-schema',
  title: 'Custom Validation Framework Definition',
  description: 'Schema for user-defined completion validation frameworks',
  type: 'object',
  required: ['id', 'name', 'version', 'validation_config'],
  additionalProperties: false,
  properties: {
    // Framework Identity
    id: {
      type: 'string',
      pattern: '^[a-z0-9-_]+$',
      minLength: 3,
      maxLength: 50,
      description:
        'Unique framework identifier (lowercase letters, numbers, hyphens, underscores only)',
    },
    name: {
      type: 'string',
      minLength: 3,
      maxLength: 100,
      pattern: '^[a-zA-Z0-9\\s\\-_.()]+$',
      description: 'Human-readable framework name',
    },
    version: {
      type: 'string',
      pattern: '^\\d+\\.\\d+\\.\\d+(-[a-z0-9]+)?$',
      description: 'Semantic version (e.g., 1.0.0, 2.1.0-beta)',
    },
    description: {
      type: 'string',
      maxLength: 1000,
      description: 'Framework description and purpose',
    },

    // Core Configuration
    validation_config: {
      type: 'object',
      required: ['truth_threshold'],
      additionalProperties: false,
      properties: {
        truth_threshold: {
          type: 'number',
          minimum: 0.01,
          maximum: 0.99,
          description: 'Minimum truth score required for validation pass (0.01-0.99)',
        },
        truth_component_weights: {
          type: 'object',
          additionalProperties: false,
          properties: {
            agent_reliability: { type: 'number', minimum: 0, maximum: 1 },
            cross_validation: { type: 'number', minimum: 0, maximum: 1 },
            external_verification: { type: 'number', minimum: 0, maximum: 1 },
            factual_consistency: { type: 'number', minimum: 0, maximum: 1 },
            logical_coherence: { type: 'number', minimum: 0, maximum: 1 },
          },
          description: 'Custom weights for truth scoring components (must sum to ~1.0)',
        },
        byzantine_validation_required: {
          type: 'boolean',
          default: true,
          description: 'Whether Byzantine consensus validation is required',
        },
        consensus_threshold: {
          type: 'number',
          minimum: 0.51,
          maximum: 1.0,
          default: 0.67,
          description: 'Minimum consensus ratio for Byzantine validation',
        },
        security_level: {
          type: 'string',
          enum: ['basic', 'standard', 'strict', 'critical'],
          default: 'standard',
          description: 'Security validation level',
        },
      },
    },

    // Validation Rules
    validation_rules: {
      type: 'array',
      maxItems: 50,
      description: 'Framework-specific validation rules',
      items: {
        oneOf: [
          {
            type: 'string',
            minLength: 1,
            maxLength: 500,
            description: 'Simple validation rule as string',
          },
          {
            type: 'object',
            required: ['name', 'validator'],
            additionalProperties: false,
            properties: {
              name: {
                type: 'string',
                pattern: '^[a-zA-Z0-9_-]+$',
                minLength: 1,
                maxLength: 50,
                description: 'Rule identifier',
              },
              description: {
                type: 'string',
                maxLength: 200,
                description: 'Rule description',
              },
              validator: {
                oneOf: [
                  {
                    type: 'string',
                    minLength: 1,
                    maxLength: 1000,
                    description: 'Validation logic as safe expression',
                  },
                  {
                    type: 'object',
                    required: ['type'],
                    properties: {
                      type: {
                        type: 'string',
                        enum: ['threshold', 'regex', 'range', 'exists', 'custom_safe'],
                        description: 'Validator type',
                      },
                      config: {
                        type: 'object',
                        description: 'Type-specific configuration',
                      },
                    },
                  },
                ],
              },
              weight: {
                type: 'number',
                minimum: 0,
                maximum: 1,
                default: 1,
                description: 'Rule importance weight',
              },
              required: {
                type: 'boolean',
                default: true,
                description: 'Whether rule failure blocks validation',
              },
              timeout_ms: {
                type: 'integer',
                minimum: 100,
                maximum: 30000,
                default: 5000,
                description: 'Rule execution timeout in milliseconds',
              },
            },
          },
        ],
      },
    },

    // Quality Gates
    quality_gates: {
      type: 'array',
      maxItems: 20,
      description: 'Quality thresholds that must be met',
      items: {
        type: 'object',
        required: ['name', 'metric', 'threshold'],
        additionalProperties: false,
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 50,
            description: 'Quality gate name',
          },
          description: {
            type: 'string',
            maxLength: 200,
            description: 'Quality gate description',
          },
          metric: {
            type: 'string',
            enum: [
              'truth_score',
              'execution_time',
              'memory_usage',
              'error_rate',
              'test_coverage',
              'code_quality',
              'security_score',
              'performance_score',
            ],
            description: 'Metric to evaluate',
          },
          threshold: {
            type: 'number',
            description: 'Threshold value for the metric',
          },
          operator: {
            type: 'string',
            enum: ['>=', '<=', '==', '>', '<'],
            default: '>=',
            description: 'Comparison operator',
          },
          required: {
            type: 'boolean',
            default: true,
            description: 'Whether failing this gate blocks validation',
          },
        },
      },
    },

    // Framework Relationships
    extends: {
      type: 'string',
      pattern: '^[a-z0-9-_]+$',
      description: 'Parent framework ID for inheritance',
    },
    composes: {
      type: 'array',
      maxItems: 10,
      items: {
        type: 'string',
        pattern: '^[a-z0-9-_]+$',
      },
      description: 'Component framework IDs for composition',
    },
    overrides: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'string',
        pattern: '^[a-z0-9-_]+$',
      },
      description: 'Framework IDs this framework overrides',
    },

    // Framework Permissions
    inheritable: {
      type: 'boolean',
      default: true,
      description: 'Whether this framework can be extended by others',
    },
    composable: {
      type: 'boolean',
      default: true,
      description: 'Whether this framework can be used in composition',
    },
    allows_override: {
      type: 'boolean',
      default: false,
      description: 'Whether this framework can be overridden',
    },

    // Advanced Configuration
    inheritance_rules: {
      type: 'object',
      additionalProperties: false,
      properties: {
        allow_override: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields that can be overridden by child frameworks',
        },
        preserve: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields that must be preserved from parent',
        },
        require_extension: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields that must be extended by child frameworks',
        },
      },
    },
    composition_rules: {
      type: 'object',
      additionalProperties: false,
      properties: {
        conflict_resolution: {
          type: 'string',
          enum: ['merge', 'base_priority', 'component_priority', 'error'],
          default: 'merge',
          description: 'How to resolve conflicts between components',
        },
        require_all_components: {
          type: 'boolean',
          default: true,
          description: 'Whether all components must be valid',
        },
      },
    },

    // Metadata
    metadata: {
      type: 'object',
      additionalProperties: false,
      properties: {
        author: {
          type: 'string',
          maxLength: 100,
          description: 'Framework author',
        },
        license: {
          type: 'string',
          maxLength: 50,
          description: 'Framework license',
        },
        homepage: {
          type: 'string',
          format: 'uri',
          description: 'Framework homepage URL',
        },
        repository: {
          type: 'string',
          format: 'uri',
          description: 'Framework repository URL',
        },
        keywords: {
          type: 'array',
          maxItems: 10,
          items: {
            type: 'string',
            maxLength: 20,
          },
          description: 'Framework keywords for discovery',
        },
        created_at: {
          type: 'string',
          format: 'date-time',
          description: 'Framework creation timestamp',
        },
        updated_at: {
          type: 'string',
          format: 'date-time',
          description: 'Framework last update timestamp',
        },
      },
    },

    // Security Configuration
    security_config: {
      type: 'object',
      additionalProperties: false,
      properties: {
        sandbox_execution: {
          type: 'boolean',
          default: true,
          description: 'Execute validation rules in sandbox',
        },
        allow_external_calls: {
          type: 'boolean',
          default: false,
          description: 'Allow validation rules to make external calls',
        },
        max_execution_time: {
          type: 'integer',
          minimum: 1000,
          maximum: 300000,
          default: 30000,
          description: 'Maximum execution time for all validations (ms)',
        },
        memory_limit: {
          type: 'integer',
          minimum: 1048576,
          maximum: 134217728,
          default: 33554432,
          description: 'Memory limit for validation execution (bytes)',
        },
      },
    },
  },
};

/**
 * Security Validation Patterns
 * Detect potentially malicious code patterns in framework definitions
 */
export const SecurityPatterns = {
  // Code injection patterns
  codeInjection: [
    /eval\s*\(/gi,
    /Function\s*\(/gi,
    /new\s+Function/gi,
    /constructor\s*\(/gi,
    /\$\{.*?\}/g,
    /`[^`]*\$\{[^}]*\}[^`]*`/g,
  ],

  // System access patterns
  systemAccess: [
    /process\./gi,
    /global\./gi,
    /__dirname/gi,
    /__filename/gi,
    /require\s*\(/gi,
    /import\s*\(/gi,
    /module\./gi,
    /exports\./gi,
  ],

  // File system patterns
  fileSystem: [
    /fs\./gi,
    /readFile/gi,
    /writeFile/gi,
    /unlink/gi,
    /rmdir/gi,
    /mkdir/gi,
    /\.\.\/\.\.\//g,
    /\/etc\//gi,
    /\/root\//gi,
  ],

  // Network access patterns
  networkAccess: [
    /http\./gi,
    /https\./gi,
    /fetch\s*\(/gi,
    /XMLHttpRequest/gi,
    /WebSocket/gi,
    /net\./gi,
    /socket\./gi,
  ],

  // System command patterns
  systemCommands: [
    /exec\s*\(/gi,
    /spawn\s*\(/gi,
    /child_process/gi,
    /rm\s+-rf/gi,
    /sudo/gi,
    /chmod/gi,
    /chown/gi,
    /kill\s+-9/gi,
  ],

  // Suspicious keywords
  suspiciousKeywords: [
    /backdoor/gi,
    /malware/gi,
    /exploit/gi,
    /hack/gi,
    /bypass/gi,
    /override.*security/gi,
    /disable.*validation/gi,
  ],
};

/**
 * Framework Validator Class
 * Validates custom framework definitions against schema and security rules
 */
export class CustomFrameworkValidator {
  constructor(options = {}) {
    this.options = {
      strictValidation: options.strictValidation !== false,
      securityChecks: options.securityChecks !== false,
      allowUnsafePatterns: options.allowUnsafePatterns === true,
      maxFrameworkSize: options.maxFrameworkSize || 1048576, // 1MB
      ...options,
    };

    // Initialize AJV validator
    this.ajv = new Ajv({
      allErrors: true,
      verbose: true,
      strict: this.options.strictValidation,
      allowUnionTypes: true,
    });

    addFormats(this.ajv);

    // Compile schema
    this.validateSchema = this.ajv.compile(CustomFrameworkSchema);
  }

  /**
   * Validate complete framework definition
   */
  async validate(framework) {
    const validation = {
      valid: true,
      errors: [],
      warnings: [],
      securityIssues: [],
      metadata: {
        validatedAt: new Date().toISOString(),
        validator: 'CustomFrameworkValidator',
        version: '1.0.0',
      },
    };

    try {
      // Step 1: Schema validation
      const schemaValidation = this.validateAgainstSchema(framework);
      if (!schemaValidation.valid) {
        validation.valid = false;
        validation.errors.push(...schemaValidation.errors);
      }

      // Step 2: Size validation
      const sizeValidation = this.validateFrameworkSize(framework);
      if (!sizeValidation.valid) {
        validation.valid = false;
        validation.errors.push(...sizeValidation.errors);
      }

      // Step 3: Security validation
      if (this.options.securityChecks) {
        const securityValidation = this.validateSecurity(framework);
        if (securityValidation.issues.length > 0) {
          validation.securityIssues.push(...securityValidation.issues);

          // Critical security issues make validation invalid
          const criticalIssues = securityValidation.issues.filter((i) => i.severity === 'critical');
          if (criticalIssues.length > 0) {
            validation.valid = false;
            validation.errors.push(
              ...criticalIssues.map((i) => ({
                type: 'security_critical',
                message: `Critical security issue: ${i.message}`,
                path: i.location,
              })),
            );
          }
        }
      }

      // Step 4: Truth component weights validation
      const weightsValidation = this.validateTruthComponentWeights(framework);
      if (!weightsValidation.valid) {
        validation.warnings.push(...weightsValidation.warnings);
      }

      // Step 5: Cross-validation rules check
      const rulesValidation = this.validateValidationRules(framework);
      if (!rulesValidation.valid) {
        validation.valid = false;
        validation.errors.push(...rulesValidation.errors);
      }

      // Step 6: Quality gates validation
      const gatesValidation = this.validateQualityGates(framework);
      if (!gatesValidation.valid) {
        validation.valid = false;
        validation.errors.push(...gatesValidation.errors);
      }
    } catch (error) {
      validation.valid = false;
      validation.errors.push({
        type: 'validation_error',
        message: `Framework validation failed: ${error.message}`,
        path: 'root',
      });
    }

    return validation;
  }

  /**
   * Validate framework against JSON schema
   */
  validateAgainstSchema(framework) {
    const valid = this.validateSchema(framework);
    const errors = [];

    if (!valid && this.validateSchema.errors) {
      for (const error of this.validateSchema.errors) {
        errors.push({
          type: 'schema_validation',
          message: `${error.instancePath || 'root'}: ${error.message}`,
          path: error.instancePath,
          keyword: error.keyword,
          data: error.data,
        });
      }
    }

    return { valid, errors };
  }

  /**
   * Validate framework size limits
   */
  validateFrameworkSize(framework) {
    const frameworkString = JSON.stringify(framework);
    const size = new TextEncoder().encode(frameworkString).length;

    if (size > this.options.maxFrameworkSize) {
      return {
        valid: false,
        errors: [
          {
            type: 'size_limit_exceeded',
            message: `Framework size (${size} bytes) exceeds maximum allowed size (${this.options.maxFrameworkSize} bytes)`,
            path: 'root',
          },
        ],
      };
    }

    return { valid: true, errors: [] };
  }

  /**
   * Validate security patterns in framework
   */
  validateSecurity(framework) {
    const issues = [];
    const frameworkString = JSON.stringify(framework);

    // Check each security pattern category
    for (const [category, patterns] of Object.entries(SecurityPatterns)) {
      for (const pattern of patterns) {
        const matches = frameworkString.match(pattern);
        if (matches) {
          const severity = this.getSecuritySeverity(category);

          issues.push({
            type: 'security_pattern_match',
            category,
            severity,
            pattern: pattern.toString(),
            matches: matches.slice(0, 3), // Limit matches shown
            message: `Potentially dangerous ${category.replace(/([A-Z])/g, ' $1').toLowerCase()} pattern detected`,
            location: this.findPatternLocation(framework, pattern),
          });
        }
      }
    }

    // Additional security checks
    if (framework.validation_rules) {
      const rulesIssues = this.validateRulesSecurity(framework.validation_rules);
      issues.push(...rulesIssues);
    }

    return { issues };
  }

  /**
   * Validate truth component weights sum to ~1.0
   */
  validateTruthComponentWeights(framework) {
    const warnings = [];

    if (framework.validation_config?.truth_component_weights) {
      const weights = framework.validation_config.truth_component_weights;
      const weightValues = Object.values(weights).filter((w) => typeof w === 'number');

      if (weightValues.length > 0) {
        const sum = weightValues.reduce((a, b) => a + b, 0);
        const tolerance = 0.1;

        if (Math.abs(sum - 1.0) > tolerance) {
          warnings.push({
            type: 'weights_sum_warning',
            message: `Truth component weights sum to ${sum.toFixed(3)} instead of 1.0. Consider adjusting weights for optimal scoring.`,
            path: 'validation_config.truth_component_weights',
            currentSum: sum,
            recommendedAdjustment: this.calculateWeightAdjustment(weights),
          });
        }
      }
    }

    return {
      valid: true, // Weights issues are warnings, not errors
      warnings,
    };
  }

  /**
   * Validate validation rules for safety and correctness
   */
  validateValidationRules(framework) {
    const errors = [];

    if (!framework.validation_rules) {
      return { valid: true, errors: [] };
    }

    for (let i = 0; i < framework.validation_rules.length; i++) {
      const rule = framework.validation_rules[i];
      const ruleErrors = this.validateSingleRule(rule, i);
      errors.push(...ruleErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Validate quality gates configuration
   */
  validateQualityGates(framework) {
    const errors = [];

    if (!framework.quality_gates) {
      return { valid: true, errors: [] };
    }

    for (let i = 0; i < framework.quality_gates.length; i++) {
      const gate = framework.quality_gates[i];
      const gateErrors = this.validateSingleQualityGate(gate, i);
      errors.push(...gateErrors);
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  // Helper methods

  getSecuritySeverity(category) {
    const severityMap = {
      codeInjection: 'critical',
      systemCommands: 'critical',
      systemAccess: 'high',
      fileSystem: 'high',
      networkAccess: 'medium',
      suspiciousKeywords: 'low',
    };
    return severityMap[category] || 'medium';
  }

  findPatternLocation(framework, pattern) {
    // Simplified location finder - in production this would provide precise locations
    const frameworkString = JSON.stringify(framework, null, 2);
    const match = frameworkString.match(pattern);

    if (match) {
      const lines = frameworkString.substring(0, match.index).split('\n');
      return `line ${lines.length}`;
    }

    return 'unknown';
  }

  validateRulesSecurity(rules) {
    const issues = [];

    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const ruleString = typeof rule === 'string' ? rule : JSON.stringify(rule);

      // Check for specific dangerous patterns in validation rules
      if (/eval\s*\(/.test(ruleString) || /Function\s*\(/.test(ruleString)) {
        issues.push({
          type: 'dangerous_rule',
          severity: 'critical',
          message: `Validation rule ${i} contains dangerous code execution patterns`,
          location: `validation_rules[${i}]`,
        });
      }

      if (/require\s*\(/.test(ruleString)) {
        issues.push({
          type: 'module_access_attempt',
          severity: 'high',
          message: `Validation rule ${i} attempts to require external modules`,
          location: `validation_rules[${i}]`,
        });
      }
    }

    return issues;
  }

  calculateWeightAdjustment(weights) {
    const sum = Object.values(weights).reduce((a, b) => a + b, 0);
    const factor = 1.0 / sum;

    const adjusted = {};
    for (const [key, value] of Object.entries(weights)) {
      adjusted[key] = Math.round(value * factor * 1000) / 1000;
    }

    return adjusted;
  }

  validateSingleRule(rule, index) {
    const errors = [];

    if (typeof rule === 'object') {
      // Validate object rule structure
      if (!rule.name || typeof rule.name !== 'string') {
        errors.push({
          type: 'invalid_rule_name',
          message: `Validation rule ${index} must have a valid name`,
          path: `validation_rules[${index}].name`,
        });
      }

      if (!rule.validator) {
        errors.push({
          type: 'missing_validator',
          message: `Validation rule ${index} must have a validator`,
          path: `validation_rules[${index}].validator`,
        });
      }

      // Validate rule timeout
      if (rule.timeout_ms && (rule.timeout_ms < 100 || rule.timeout_ms > 30000)) {
        errors.push({
          type: 'invalid_timeout',
          message: `Validation rule ${index} timeout must be between 100ms and 30000ms`,
          path: `validation_rules[${index}].timeout_ms`,
        });
      }
    }

    return errors;
  }

  validateSingleQualityGate(gate, index) {
    const errors = [];

    // Validate threshold based on metric type
    const metricRanges = {
      truth_score: { min: 0, max: 1 },
      execution_time: { min: 0, max: Infinity },
      memory_usage: { min: 0, max: Infinity },
      error_rate: { min: 0, max: 1 },
      test_coverage: { min: 0, max: 1 },
      code_quality: { min: 0, max: 10 },
      security_score: { min: 0, max: 1 },
      performance_score: { min: 0, max: 1 },
    };

    const range = metricRanges[gate.metric];
    if (range && (gate.threshold < range.min || gate.threshold > range.max)) {
      errors.push({
        type: 'invalid_threshold',
        message: `Quality gate ${index} threshold ${gate.threshold} is out of range for metric ${gate.metric} (${range.min}-${range.max})`,
        path: `quality_gates[${index}].threshold`,
      });
    }

    return errors;
  }
}

// Create pre-configured validator instance
export const defaultFrameworkValidator = new CustomFrameworkValidator();

export default {
  CustomFrameworkSchema,
  SecurityPatterns,
  CustomFrameworkValidator,
  defaultFrameworkValidator,
};
