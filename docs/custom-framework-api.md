# Custom Framework API Documentation

## Overview

The Custom Framework API allows users to define and add their own validation frameworks to the completion validation system. This enables organizations to implement domain-specific validation logic while maintaining the security and reliability of the Byzantine consensus system.

## Features

- **Custom Truth Component Weights**: Adjust how different validation aspects are weighted
- **Framework-Specific Validation Rules**: Define custom validation logic with safe execution
- **Quality Gates**: Set specific thresholds for completion metrics
- **Security Enforcement**: Built-in malicious code detection and sandboxed execution
- **Byzantine Consensus**: Automatic approval process for framework security
- **Framework Inheritance**: Extend existing frameworks
- **Framework Composition**: Combine multiple frameworks
- **CLI Integration**: User-friendly command-line interface

## Quick Start

### 1. Create a Framework Definition

```json
{
  "id": "my-custom-framework",
  "name": "My Custom Framework",
  "version": "1.0.0",
  "description": "A custom validation framework for my specific needs",
  "validation_config": {
    "truth_threshold": 0.85,
    "truth_component_weights": {
      "agent_reliability": 0.3,
      "cross_validation": 0.25,
      "external_verification": 0.2,
      "factual_consistency": 0.15,
      "logical_coherence": 0.1
    },
    "byzantine_validation_required": true,
    "consensus_threshold": 0.67,
    "security_level": "standard"
  },
  "validation_rules": [
    {
      "name": "accuracy_check",
      "description": "Ensure minimum accuracy requirement",
      "validator": {
        "type": "threshold",
        "config": {
          "field": "completion.accuracy",
          "threshold": 0.8,
          "operator": ">="
        }
      },
      "weight": 1.0,
      "required": true,
      "timeout_ms": 5000
    }
  ],
  "quality_gates": [
    {
      "name": "truth_score_gate",
      "description": "Minimum truth score requirement",
      "metric": "truth_score",
      "threshold": 0.85,
      "operator": ">=",
      "required": true
    }
  ],
  "inheritable": true,
  "composable": true,
  "metadata": {
    "author": "Your Name",
    "license": "MIT",
    "keywords": ["validation", "custom"],
    "created_at": "2025-01-01T00:00:00Z"
  }
}
```

### 2. Add the Framework

```bash
claude-flow-novice validate framework add my-framework.json
```

### 3. Test the Framework

```bash
claude-flow-novice validate framework test my-custom-framework
```

### 4. Validate Completions

```bash
claude-flow-novice validate framework validate completion.json my-custom-framework
```

## API Reference

### Framework Definition Schema

#### Required Fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Unique framework identifier (lowercase, letters, numbers, hyphens, underscores) |
| `name` | string | Human-readable framework name |
| `version` | string | Semantic version (e.g., "1.0.0") |
| `validation_config` | object | Core validation configuration |

#### Validation Configuration

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `truth_threshold` | number | Minimum truth score (0.01-0.99) | Required |
| `truth_component_weights` | object | Custom weights for truth components | Optional |
| `byzantine_validation_required` | boolean | Enable Byzantine consensus | `true` |
| `consensus_threshold` | number | Minimum consensus ratio (0.51-1.0) | `0.67` |
| `security_level` | string | Security validation level | `"standard"` |

#### Truth Component Weights

```json
{
  "truth_component_weights": {
    "agent_reliability": 0.3,
    "cross_validation": 0.25,
    "external_verification": 0.2,
    "factual_consistency": 0.15,
    "logical_coherence": 0.1
  }
}
```

**Note**: Weights should sum to approximately 1.0. If they don't, you'll receive a warning with suggested adjustments.

#### Validation Rules

Validation rules define custom logic for evaluating completions:

```json
{
  "validation_rules": [
    {
      "name": "rule_identifier",
      "description": "Rule description",
      "validator": {
        "type": "threshold|regex|range|exists|custom_safe",
        "config": {
          // Type-specific configuration
        }
      },
      "weight": 1.0,
      "required": true,
      "timeout_ms": 5000
    }
  ]
}
```

##### Validator Types

**Threshold Validator**
```json
{
  "type": "threshold",
  "config": {
    "field": "completion.accuracy",
    "threshold": 0.8,
    "operator": ">=" // >=, >, <=, <, ==
  }
}
```

**Range Validator**
```json
{
  "type": "range",
  "config": {
    "field": "completion.execution_time",
    "min": 100,
    "max": 30000
  }
}
```

**Exists Validator**
```json
{
  "type": "exists",
  "config": {
    "field": "completion.test_results"
  }
}
```

**Regex Validator**
```json
{
  "type": "regex",
  "config": {
    "field": "completion.description",
    "pattern": "^[A-Za-z0-9\\s]+$",
    "flags": "i"
  }
}
```

**Custom Safe Validator**
```json
{
  "type": "custom_safe",
  "config": {
    "expression": "completion.accuracy > 0.8 && completion.confidence > 0.7"
  }
}
```

#### Quality Gates

Quality gates enforce specific thresholds on completion metrics:

```json
{
  "quality_gates": [
    {
      "name": "execution_time_limit",
      "description": "Maximum execution time allowed",
      "metric": "execution_time",
      "threshold": 30000,
      "operator": "<=",
      "required": true
    }
  ]
}
```

##### Available Metrics

| Metric | Description | Typical Range |
|--------|-------------|---------------|
| `truth_score` | Overall truth score | 0-1 |
| `execution_time` | Execution time in milliseconds | 0+ |
| `memory_usage` | Memory usage in bytes | 0+ |
| `error_rate` | Error rate ratio | 0-1 |
| `test_coverage` | Test coverage ratio | 0-1 |
| `code_quality` | Code quality score | 0-10 |
| `security_score` | Security score | 0-1 |
| `performance_score` | Performance score | 0-1 |

### Framework Relationships

#### Inheritance

Extend existing frameworks:

```json
{
  "id": "enhanced-framework",
  "name": "Enhanced Framework",
  "version": "1.0.0",
  "extends": "parent-framework-id",
  "validation_config": {
    "truth_threshold": 0.9
  },
  "validation_rules": [
    {
      "name": "additional_rule",
      "validator": {
        "type": "threshold",
        "config": {
          "field": "completion.additional_metric",
          "threshold": 0.5,
          "operator": ">="
        }
      }
    }
  ]
}
```

#### Composition

Combine multiple frameworks:

```json
{
  "id": "composite-framework",
  "name": "Composite Framework",
  "version": "1.0.0",
  "composes": ["framework-a", "framework-b"],
  "composition_rules": {
    "conflict_resolution": "merge",
    "require_all_components": true
  }
}
```

### Security Configuration

Control security aspects of framework execution:

```json
{
  "security_config": {
    "sandbox_execution": true,
    "allow_external_calls": false,
    "max_execution_time": 30000,
    "memory_limit": 33554432
  }
}
```

## CLI Commands

### Add Framework

```bash
claude-flow-novice validate framework add <framework-file>

# Options:
#   --interactive     Enable interactive mode (default: true)
#   --auto-fix       Automatically fix common issues (default: false)
#   --verbose        Show detailed validation output (default: false)
```

### Interactive Framework Wizard

```bash
claude-flow-novice validate framework wizard
```

Creates a framework through an interactive step-by-step process.

### Test Framework

```bash
claude-flow-novice validate framework test <framework-id>
```

Tests a framework with mock completion data.

### List Frameworks

```bash
claude-flow-novice validate framework list
```

Shows all registered custom frameworks in a table format.

### Export Framework

```bash
claude-flow-novice validate framework export <framework-id> [output-file]
```

Exports a framework definition to a JSON file.

### Validate Completion

```bash
claude-flow-novice validate framework validate <completion-file> <framework-id>
```

Validates a completion using a specific custom framework.

### Remove Framework

```bash
claude-flow-novice validate framework remove <framework-id>
```

Removes a custom framework from the system.

## Programmatic API

### EnhancedCustomFrameworkValidator

```javascript
import EnhancedCustomFrameworkValidator from './src/validation/custom-framework-validator.js';

const validator = new EnhancedCustomFrameworkValidator({
  enableByzantineValidation: true,
  enableSecuritySandbox: true
});

await validator.initialize();

// Add a framework
const result = await validator.validateAndAddFramework(frameworkDefinition);

// Validate completion
const completionResult = await validator.validateCompletionWithCustomFramework(
  completion,
  frameworkId
);

await validator.shutdown();
```

### CustomFrameworkValidator (Schema Only)

```javascript
import { CustomFrameworkValidator } from './src/schemas/custom-framework-schema.js';

const schemaValidator = new CustomFrameworkValidator();
const validationResult = await schemaValidator.validate(framework);
```

### CustomFrameworkRegistry

```javascript
import { CustomFrameworkRegistry } from './src/configuration/custom-framework-registry.js';

const registry = new CustomFrameworkRegistry();
await registry.initialize();

const framework = registry.getFramework('framework-id');
const frameworks = registry.getAllFrameworks();

await registry.shutdown();
```

## Examples

### Basic Accuracy Framework

```json
{
  "id": "accuracy-framework",
  "name": "Accuracy Framework",
  "version": "1.0.0",
  "description": "Simple accuracy-based validation",
  "validation_config": {
    "truth_threshold": 0.8
  },
  "validation_rules": [
    {
      "name": "minimum_accuracy",
      "validator": {
        "type": "threshold",
        "config": {
          "field": "completion.accuracy",
          "threshold": 0.85,
          "operator": ">="
        }
      },
      "required": true
    }
  ],
  "quality_gates": [
    {
      "name": "truth_score_check",
      "metric": "truth_score",
      "threshold": 0.8,
      "operator": ">=",
      "required": true
    }
  ]
}
```

### Performance Framework

```json
{
  "id": "performance-framework",
  "name": "Performance Framework",
  "version": "1.0.0",
  "description": "Performance-focused validation framework",
  "validation_config": {
    "truth_threshold": 0.75,
    "truth_component_weights": {
      "agent_reliability": 0.4,
      "cross_validation": 0.3,
      "external_verification": 0.1,
      "factual_consistency": 0.1,
      "logical_coherence": 0.1
    }
  },
  "validation_rules": [
    {
      "name": "execution_time_limit",
      "validator": {
        "type": "threshold",
        "config": {
          "field": "completion.execution_time",
          "threshold": 10000,
          "operator": "<="
        }
      },
      "weight": 1.0,
      "required": true
    },
    {
      "name": "memory_efficiency",
      "validator": {
        "type": "threshold",
        "config": {
          "field": "completion.memory_usage",
          "threshold": 1073741824,
          "operator": "<="
        }
      },
      "weight": 0.8,
      "required": false
    }
  ],
  "quality_gates": [
    {
      "name": "performance_score",
      "metric": "performance_score",
      "threshold": 0.8,
      "operator": ">=",
      "required": true
    },
    {
      "name": "execution_time_gate",
      "metric": "execution_time",
      "threshold": 10000,
      "operator": "<=",
      "required": true
    }
  ]
}
```

### Security Framework

```json
{
  "id": "security-framework",
  "name": "Security Framework",
  "version": "1.0.0",
  "description": "Security-focused validation framework",
  "validation_config": {
    "truth_threshold": 0.9,
    "security_level": "strict"
  },
  "validation_rules": [
    {
      "name": "security_scan_passed",
      "validator": {
        "type": "exists",
        "config": {
          "field": "completion.security_scan_results"
        }
      },
      "required": true
    },
    {
      "name": "vulnerability_count",
      "validator": {
        "type": "threshold",
        "config": {
          "field": "completion.vulnerability_count",
          "threshold": 0,
          "operator": "=="
        }
      },
      "required": true
    }
  ],
  "quality_gates": [
    {
      "name": "security_score_gate",
      "metric": "security_score",
      "threshold": 0.95,
      "operator": ">=",
      "required": true
    }
  ],
  "security_config": {
    "sandbox_execution": true,
    "allow_external_calls": false,
    "max_execution_time": 15000
  }
}
```

### Composite Framework

```json
{
  "id": "comprehensive-framework",
  "name": "Comprehensive Framework",
  "version": "1.0.0",
  "description": "Combines accuracy, performance, and security frameworks",
  "composes": [
    "accuracy-framework",
    "performance-framework",
    "security-framework"
  ],
  "composition_rules": {
    "conflict_resolution": "merge",
    "require_all_components": true
  },
  "validation_config": {
    "truth_threshold": 0.85
  },
  "quality_gates": [
    {
      "name": "overall_quality",
      "metric": "truth_score",
      "threshold": 0.85,
      "operator": ">=",
      "required": true
    }
  ]
}
```

## Best Practices

### Security

1. **Never use `eval()` or `Function()` constructors** in validation rules
2. **Avoid file system access** in validation logic
3. **Use built-in validator types** when possible instead of custom expressions
4. **Keep validation rules simple** and focused
5. **Test frameworks thoroughly** before production use

### Performance

1. **Set reasonable timeouts** for validation rules (5-30 seconds)
2. **Avoid complex computations** in validation logic
3. **Use appropriate weight values** for non-critical rules
4. **Limit the number of validation rules** (typically < 20)
5. **Cache validation results** when possible

### Maintainability

1. **Use descriptive names** for frameworks and rules
2. **Document the purpose** of each validation rule
3. **Version frameworks properly** using semantic versioning
4. **Keep frameworks focused** on specific validation aspects
5. **Use inheritance and composition** to reduce duplication

### Error Handling

1. **Provide helpful error messages** in custom validators
2. **Handle edge cases gracefully** (null values, missing fields)
3. **Use appropriate validation rule weights** for non-critical checks
4. **Test with various completion formats** before deployment
5. **Monitor framework performance** and adjust as needed

## Troubleshooting

### Common Issues

#### Schema Validation Errors

```bash
# Error: Missing required field 'id'
# Solution: Add the required id field to your framework definition
{
  "id": "my-framework-id",
  // ... rest of framework
}
```

#### Security Violations

```bash
# Error: Code injection detected
# Solution: Remove dangerous patterns from validation rules
# Instead of: "eval('dangerous code')"
# Use: { "type": "threshold", "config": { ... } }
```

#### Truth Component Weights

```bash
# Warning: Truth component weights sum to 1.2 instead of 1.0
# Solution: Adjust weights to sum to 1.0
{
  "truth_component_weights": {
    "agent_reliability": 0.25,
    "cross_validation": 0.25,
    "external_verification": 0.25,
    "factual_consistency": 0.15,
    "logical_coherence": 0.1
  }
}
```

#### Byzantine Consensus Rejection

```bash
# Error: Byzantine consensus rejection
# Possible causes:
# 1. Security violations in framework
# 2. Overly permissive validation rules
# 3. Suspicious metadata or configuration
# Solution: Review and fix security issues, test with stricter rules
```

### Debug Mode

Enable verbose logging for detailed validation information:

```bash
claude-flow-novice validate framework add my-framework.json --verbose
```

### Validation Logs

Check validation logs for detailed error information:

```bash
# View recent validation logs
tail -f .claude-flow-novice/logs/validation.log
```

## Migration Guide

### From Version 1.x to 2.x

If you have existing custom frameworks from version 1.x, you may need to update them:

1. **Add required version field**:
   ```json
   {
     "version": "1.0.0"
   }
   ```

2. **Update validator structure**:
   ```json
   // Old format
   "validator": "completion.accuracy >= 0.8"

   // New format
   "validator": {
     "type": "threshold",
     "config": {
       "field": "completion.accuracy",
       "threshold": 0.8,
       "operator": ">="
     }
   }
   ```

3. **Add security configuration** if using custom expressions:
   ```json
   {
     "security_config": {
       "sandbox_execution": true
     }
   }
   ```

## Support

For issues, questions, or feature requests:

- **Documentation**: Check this guide and API references
- **CLI Help**: Use `claude-flow-novice validate framework --help`
- **Testing**: Use the test command to validate your frameworks
- **Examples**: See the examples directory for more framework samples

## Changelog

### Version 2.0.0
- Added comprehensive security validation
- Introduced Byzantine consensus for framework approval
- Enhanced validator types with structured configuration
- Added framework inheritance and composition
- Improved CLI with interactive wizard
- Added comprehensive testing suite

### Version 1.0.0
- Initial custom framework support
- Basic validation rules and quality gates
- Simple CLI commands
- Truth scorer integration