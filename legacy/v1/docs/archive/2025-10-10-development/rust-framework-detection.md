# Rust Framework Detection System

## Overview

The Rust Framework Detection System is a comprehensive solution for identifying and analyzing Rust projects within the Phase 2 configuration system. It provides intelligent detection of Rust ecosystems, web frameworks, database integrations, workspace configurations, and testing setups with Byzantine consensus validation.

## Key Features

### 🦀 Core Rust Detection
- **Cargo.toml Analysis**: Parse and analyze Cargo configuration files
- **Edition Detection**: Identify Rust edition (2015, 2018, 2021)
- **Workspace Support**: Comprehensive Cargo workspace detection
- **Dependency Analysis**: Deep analysis of Rust crates and dependencies

### 🌐 Web Framework Detection
- **Axum**: Modern async web framework with tokio integration
- **Warp**: Fast web framework with composable filters
- **Actix-web**: High-performance actor-based web framework
- **Rocket**: Type-safe web framework with code generation
- **Hyper**: Low-level HTTP implementation
- **Tide**: Async web framework built on async-std

### 🗄️ Database Framework Detection
- **Diesel**: Safe, extensible ORM and Query Builder
- **SeaORM**: Modern async ORM for Rust
- **SQLx**: Async SQL toolkit with compile-time checked queries

### ⚡ Async Runtime Detection
- **Tokio**: The most popular async runtime
- **async-std**: Async version of Rust standard library

### 🧪 Testing Framework Detection
- **Built-in Testing**: Rust's native `#[test]` framework
- **Criterion**: Statistics-driven benchmarking library
- **PropTest**: Property-based testing framework
- **Quickcheck**: Property-based testing library

### 🛡️ Byzantine Consensus Validation
- **Multi-Validator Consensus**: Uses 4 independent validators
- **Fault Tolerance**: Achieves consensus with 67% agreement
- **Confidence Scoring**: Adjusts confidence based on validation results
- **Hook Integration**: Executes Byzantine validation hooks

## Architecture

### Detection Pipeline

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   File System   │───▶│  Pattern Analysis │───▶│  Framework IDs  │
│   Structure     │    │   & Validation   │    │   & Scoring    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Cargo.toml    │───▶│  Dependency      │───▶│  Confidence     │
│   Analysis      │    │  Mapping         │    │  Calculation    │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                        │                        │
         ▼                        ▼                        ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│  Content        │───▶│  Byzantine       │───▶│  Final Results  │
│  Patterns       │    │  Consensus       │    │  with Metadata  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

### Byzantine Validation Process

```
┌────────────────┐    ┌─────────────────┐    ┌──────────────────┐
│ File Evidence  │───▶│  Validator 1    │───▶│                  │
│ Validation     │    │  (File Check)   │    │                  │
└────────────────┘    └─────────────────┘    │                  │
                                             │   Consensus      │
┌────────────────┐    ┌─────────────────┐    │   Calculator     │
│ Cargo Evidence │───▶│  Validator 2    │───▶│   (≥67% needed)  │
│ Validation     │    │  (Cargo Check)  │    │                  │
└────────────────┘    └─────────────────┘    │                  │
                                             │                  │
┌────────────────┐    ┌─────────────────┐    │                  │
│ Pattern        │───▶│  Validator 3    │───▶│                  │
│ Evidence       │    │  (Pattern Check)│    │                  │
└────────────────┘    └─────────────────┘    └──────────────────┘
                                                       │
┌────────────────┐    ┌─────────────────┐              ▼
│ Framework      │───▶│  Validator 4    │    ┌──────────────────┐
│ Consistency    │    │  (Logic Check)  │    │ Consensus Result │
└────────────────┘    └─────────────────┘    │ + Confidence     │
                                             │ Adjustment       │
                                             └──────────────────┘
```

## Usage

### Basic Detection

```javascript
import { RustFrameworkDetector } from './src/validation/frameworks/rust-detector.js';

const detector = new RustFrameworkDetector({ basePath: '/path/to/rust/project' });

await detector.initialize();
const result = await detector.detectRustFramework();

console.log(`Detected: ${result.detected}`);
console.log(`Confidence: ${result.confidence}`);
console.log(`Byzantine validated: ${result.metadata.byzantineConsensus}`);

await detector.cleanup();
```

### Registry Integration

```javascript
import { CustomFrameworkRegistry } from './src/validation/custom-framework-registry.js';

const registry = new CustomFrameworkRegistry({ basePath: '/path/to/project' });

await registry.initialize();

// Auto-detect and register Rust frameworks
const result = await registry.autoDetectRustFrameworks();

if (result.success) {
    console.log(`Registered framework: ${result.framework.name}`);
    console.log(`Byzantine validated: ${result.framework.rustSpecific.byzantineConsensus}`);
}

await registry.cleanup();
```

### Advanced Filtering

```javascript
// Search for specific Rust framework types
const webFrameworks = await registry.searchRustFrameworks({
    frameworkType: 'web',
    minConfidence: 0.8,
    byzantineValidated: true
});

// Search by Rust edition
const modernProjects = await registry.searchRustFrameworks({
    edition: '2021',
    workspace: true
});
```

## Detection Results Structure

```javascript
{
    detected: 'rust',                    // Main detected language/framework
    confidence: 0.92,                    // Overall confidence score (0-1)
    isRustProject: true,                 // Boolean flag for Rust projects

    scores: {
        rust: 0.92,                      // Base Rust score
        webFrameworks: {                 // Web framework scores
            axum: 0.35,
            warp: 0.0
        },
        databaseFrameworks: {            // Database framework scores
            diesel: 0.30
        },
        asyncRuntimes: {                 // Async runtime scores
            tokio: 0.20
        },
        testingFrameworks: {             // Testing framework scores
            builtin: 0.15,
            criterion: 0.10
        }
    },

    evidence: {
        files: {                         // File-based evidence
            'Cargo.toml': true,
            'Cargo.lock': true,
            rustFileCount: 25
        },
        cargo: {                         // Cargo metadata
            name: 'my-rust-app',
            version: '0.1.0',
            edition: '2021',
            authors: ['author@example.com']
        },
        dependencies: [                  // All dependencies found
            'axum', 'tokio', 'serde', 'diesel'
        ],
        patterns: {                      // Content pattern matches
            rust: [
                {
                    pattern: 'use statements',
                    matches: 45,
                    file: 'main.rs'
                }
            ]
        },
        workspace: {                     // Workspace information
            members: ['web-api', 'core', 'cli'],
            validMembers: 3,
            resolver: '2'
        },
        editions: ['2021']               // Detected Rust editions
    },

    frameworks: {                        // Detected frameworks with details
        web: [
            {
                name: 'axum',
                confidence: 0.9,
                description: 'Modern async web framework built on tokio'
            }
        ],
        database: [
            {
                name: 'diesel',
                confidence: 0.8,
                description: 'Safe, extensible ORM and Query Builder'
            }
        ],
        async: [
            {
                name: 'tokio',
                confidence: 0.8,
                description: 'The most popular async runtime'
            }
        ],
        testing: [
            {
                name: 'builtin',
                confidence: 0.8,
                description: 'Built-in Rust testing framework'
            }
        ]
    },

    metadata: {
        detectionTime: 1250,             // Time taken in milliseconds
        filesAnalyzed: 28,               // Number of files analyzed
        patternsMatched: 15,             // Number of patterns matched
        byzantineConsensus: true         // Byzantine validation result
    }
}
```

## Registry Integration Features

### Auto-Registration

The system can automatically detect Rust projects and register them in the custom framework registry with appropriate configurations:

```javascript
const rustFramework = {
    name: 'Rust Web (axum)',
    description: 'Auto-detected Rust project with 0.92 confidence (Byzantine consensus validated)...',
    filePatterns: [
        'Cargo.toml',
        'Cargo.lock',
        '**/*.rs',
        'src/**/*.rs',
        'tests/**/*.rs'
    ],
    testingFramework: 'unit',
    truthThreshold: 0.82,
    tags: [
        'rust',
        'auto-detected',
        'byzantine-validated',
        'web-axum',
        'async-tokio'
    ],
    rustSpecific: {
        edition: '2021',
        cargoWorkspace: true,
        dependencies: ['axum', 'tokio', 'serde'],
        byzantineConsensus: true,
        confidence: 0.92
    }
}
```

### Truth Threshold Calculation

The system intelligently calculates truth thresholds based on:

- **Base threshold**: 0.80 for Rust projects
- **Confidence adjustment**: Higher confidence → higher threshold
- **Complexity bonus**: More frameworks → higher standards
- **Byzantine bonus**: +0.02 for validated projects
- **Workspace bonus**: +0.03 for multi-crate workspaces
- **Modern edition bonus**: +0.01 for Rust 2021

### Statistics and Analytics

```javascript
const stats = await registry.getRustDetectionStatistics();

console.log(stats);
// {
//     totalRustProjects: 5,
//     byzantineValidated: 4,
//     byzantineValidationRate: 0.8,
//     frameworkDistribution: {
//         web: 3,
//         database: 2,
//         async: 4
//     },
//     averageConfidence: 0.87,
//     editions: {
//         '2021': 4,
//         '2018': 1
//     },
//     workspaceProjects: 2
// }
```

## Testing

### Unit Tests

Run the comprehensive test suite:

```bash
npm test src/validation/frameworks/rust-detector.test.js
```

### Test Coverage

The test suite covers:
- ✅ Basic Rust project detection
- ✅ Web framework detection (Axum, Warp, Actix-web, Rocket)
- ✅ Database framework detection (Diesel, SeaORM, SQLx)
- ✅ Async runtime detection (Tokio, async-std)
- ✅ Testing framework detection (built-in, Criterion, PropTest)
- ✅ Workspace structure analysis
- ✅ Byzantine consensus validation
- ✅ Performance and edge cases
- ✅ Complex project scenarios

### Example Projects

Example test project structures:

```
rust-project/
├── Cargo.toml              # Main project manifest
├── Cargo.lock              # Lock file
├── src/
│   ├── main.rs             # Main entry point
│   ├── lib.rs              # Library root
│   └── models/             # Model modules
├── tests/                  # Integration tests
├── benches/                # Benchmarks
├── examples/               # Example code
└── migrations/             # Database migrations (if using Diesel)
```

```
rust-workspace/
├── Cargo.toml              # Workspace manifest
├── web-api/
│   ├── Cargo.toml
│   └── src/main.rs
├── core/
│   ├── Cargo.toml
│   └── src/lib.rs
└── cli-tool/
    ├── Cargo.toml
    └── src/main.rs
```

## Performance Characteristics

### Detection Speed
- **Single crate projects**: < 500ms
- **Workspace projects**: < 2000ms
- **Large projects (100+ files)**: < 5000ms

### Memory Usage
- **Base memory**: ~50MB
- **Large projects**: ~200MB maximum
- **Memory cleanup**: Automatic after detection

### File Analysis Limits
- **Rust files**: Up to 15 files analyzed for patterns
- **Total files**: Up to 20 files for performance sampling
- **Directory depth**: Maximum 4 levels deep
- **Content patterns**: Efficient regex-based matching

## Byzantine Consensus Details

### Validation Criteria

1. **File Evidence Validator**
   - Requires `Cargo.toml` presence
   - Requires at least 1 Rust file
   - Weight: 25%

2. **Cargo Evidence Validator**
   - Requires valid Cargo metadata
   - Requires project name
   - Requires dependencies list
   - Weight: 25%

3. **Pattern Evidence Validator**
   - Requires at least 3 Rust content patterns
   - Validates pattern strength
   - Weight: 25%

4. **Framework Consistency Validator**
   - Checks framework alignment
   - Validates detection logic
   - Fallback validation for edge cases
   - Weight: 25%

### Consensus Algorithm

```javascript
const consensusRate = validValidators / totalValidators;
const consensusAchieved = consensusRate >= 0.67; // 2/3 majority

if (consensusAchieved) {
    confidence = Math.min(1.0, confidence * 1.05); // Boost confidence
} else {
    confidence = Math.max(0.0, confidence * 0.95); // Reduce confidence
}
```

## Integration with SPARC Methodology

The Rust detection system integrates seamlessly with SPARC development workflows:

### Specification Phase
- Identifies Rust project structure and capabilities
- Maps framework dependencies to architectural requirements

### Pseudocode Phase
- Understands async/await patterns for algorithm design
- Recognizes testing framework capabilities

### Architecture Phase
- Maps web frameworks to architectural patterns
- Identifies database integration approaches
- Analyzes workspace structure for microservices

### Refinement Phase
- Enables appropriate TDD configuration for Rust
- Configures testing frameworks and benchmarking

### Completion Phase
- Validates against Rust-specific quality gates
- Ensures Byzantine consensus for reliability

## Best Practices

### For Rust Projects

1. **Use clear project structure**
   ```
   src/
   ├── main.rs or lib.rs
   ├── models/
   ├── handlers/
   └── utils/
   ```

2. **Maintain updated Cargo.toml**
   ```toml
   [package]
   name = "my-project"
   version = "0.1.0"
   edition = "2021"
   authors = ["Your Name <email@example.com>"]
   description = "A brief description"
   ```

3. **Use consistent dependencies**
   ```toml
   [dependencies]
   axum = "0.6"
   tokio = { version = "1.0", features = ["full"] }
   serde = { version = "1.0", features = ["derive"] }
   ```

### For Detection Accuracy

1. **Include comprehensive tests**
   ```rust
   #[cfg(test)]
   mod tests {
       use super::*;

       #[test]
       fn test_functionality() {
           assert_eq!(function(), expected_result);
       }
   }
   ```

2. **Use modern Rust patterns**
   ```rust
   use std::collections::HashMap;
   use serde::{Deserialize, Serialize};

   #[derive(Debug, Serialize, Deserialize)]
   pub struct MyStruct {
       field: String,
   }
   ```

3. **Document dependencies clearly**
   ```toml
   [dependencies]
   # Web framework
   axum = "0.6"
   # Async runtime
   tokio = { version = "1.0", features = ["full"] }
   # Database ORM
   diesel = { version = "2.0", features = ["postgres"] }
   ```

## Troubleshooting

### Common Issues

**Low Confidence Detection**
- Ensure `Cargo.toml` exists and is valid
- Add more Rust files to the project
- Include dependencies in `Cargo.toml`

**Byzantine Consensus Failure**
- Check file permissions
- Ensure project structure is complete
- Verify `Cargo.toml` parsing succeeds

**Framework Not Detected**
- Add framework to `Cargo.toml` dependencies
- Include framework-specific code patterns
- Check framework version compatibility

**Performance Issues**
- Reduce project size for testing
- Check file system permissions
- Monitor memory usage during detection

### Debug Mode

Enable detailed logging:

```javascript
import { logger } from './src/core/logger.js';

// Set log level to debug
logger.level = 'debug';

// Detection will now provide detailed logging
const result = await detector.detectRustFramework();
```

## Future Enhancements

### Planned Features
- 🔄 **Incremental Detection**: Cache and update detection results
- 📊 **Advanced Analytics**: Project complexity metrics
- 🌍 **Community Frameworks**: Extended framework support
- 🚀 **Performance Optimization**: Faster detection algorithms
- 🧪 **ML Integration**: Machine learning-enhanced detection

### Framework Roadmap
- **Tauri**: Desktop application framework
- **Bevy**: Game engine framework
- **Yew**: WebAssembly web framework
- **Poem**: Modern web framework
- **Salvo**: Powerful web server framework

## Conclusion

The Rust Framework Detection System provides comprehensive, reliable, and Byzantine fault-tolerant detection of Rust projects and their associated frameworks. With support for all major Rust web frameworks, database integrations, async runtimes, and testing tools, it enables intelligent configuration management and validation within the Phase 2 system.

The integration with the Custom Framework Registry allows for automatic registration and management of detected Rust projects, complete with appropriate truth thresholds and testing configurations optimized for the Rust ecosystem.