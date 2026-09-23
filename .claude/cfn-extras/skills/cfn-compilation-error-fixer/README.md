# CFN Compilation Error Fixer

A powerful tool for automatically fixing compilation errors in Rust and TypeScript projects using LLM assistance with gated validation.

## Quick Start

```bash
# Install dependencies
npm install

# Fix Rust compilation errors
npm run fix:rust

# Fix TypeScript compilation errors
npm run fix:ts

# Run with dry-run to see what would be fixed
npm run fix:rust -- --dry-run

# Run with verbose output
npm run fix:ts -- --verbose
```

## Alternative Usage Methods

### Using the executable script
```bash
# After npm install, the script is executable
./bin/fix-errors.sh rust
./bin/fix-errors.sh typescript --dry-run
./bin/fix-errors.sh ts --verbose
```

### Using Node.js directly
```bash
node index.js rust
node index.js typescript --dry-run
```

## Features

- **Multi-language support**: Rust and TypeScript
- **Gated validation**: Multiple layers of safety checks
- **Dry-run mode**: Preview fixes before applying
- **Verbose logging**: Detailed output for debugging
- **Fallback mode**: Works even without LLM SDK installed
- **Parallel processing**: Fixes multiple errors simultaneously

## Configuration

### Environment Variables

- `CEREBRAS_API_KEY`: Your Cerebras API key (for LLM processing)
- `CFN_ALLOW_FALLBACK=true`: Allow running without Cerebras SDK (read-only mode)

### Project Paths

The fixer looks for projects in:
- Rust: `/mnt/c/Users/masha/Documents/ourstories-v2/services/rust-services`
- TypeScript: Current working directory (configurable)

## Installation

### Prerequisites
- Node.js >= 18.0.0
- npm or yarn

### Install dependencies
```bash
npm install
```

### Optional: Install Cerebras SDK for LLM fixes
```bash
npm install @cerebras/cerebras_cloud_sdk
```

## Usage Examples

### Rust Error Fixing
```bash
# Fix all Rust errors with default settings
npm run fix:rust

# Dry run to see potential fixes
npm run fix:rust -- --dry-run

# Verbose output with detailed logging
npm run fix:rust -- --verbose

# Disable Layer 3 validation
npm run fix:rust -- --no-layer3

# Disable clippy checks
npm run fix:rust -- --no-clippy
```

### TypeScript Error Fixing
```bash
# Fix all TypeScript errors
npm run fix:ts

# Dry run mode
npm run fix:ts -- --dry-run

# Verbose mode
npm run fix:ts -- --verbose
```

## Command Line Options

- `--dry-run`: Show what would be fixed without making changes
- `--verbose`: Enable detailed logging output
- `--no-layer3`: Skip Layer 3 validation (Rust only)
- `--no-clippy`: Skip clippy checks (Rust only)
- `--help, -h`: Show help message

## Architecture

The fixer uses a multi-layered approach:

1. **Layer 1**: LLM-powered error analysis and initial fixes
2. **Layer 2**: Gated validation with semantic checks
3. **Layer 3**: Review and validation of applied fixes

### Rust Fixer Gates (A-K)
- **Gate A**: Original compilation error resolved
- **Gate B**: No new compilation errors
- **Gate C**: No duplicate impl blocks
- **Gate D**: No duplicate method definitions
- **Gate E**: All required traits implemented
- **Gate F**: No unused imports
- **Gate G**: Import path validity
- **Gate H**: No duplicate patterns
- **Gate I**: Impl location appropriateness
- **Gate J**: Type cast safety
- **Gate K**: Macro expansion validity

## Testing

```bash
# Run all tests
npm test

# Test Rust fixer
npm run test:rust

# Test TypeScript fixer
npm run test:typescript
```

## Troubleshooting

### Common Issues

1. **"tsx is not installed"**
   ```bash
   npm install -g tsx
   # Or use local version
   npx tsx [file]
   ```

2. **"Cerebras SDK not found"**
   - Install the SDK: `npm install @cerebras/cerebras_cloud_sdk`
   - Or use fallback mode: `CFN_ALLOW_FALLBACK=true npm run fix:rust`

3. **Permission denied on fix-errors.sh**
   ```bash
   chmod +x bin/fix-errors.sh
   ```

4. **"Module not found" errors**
   ```bash
   npm install
   ```

### Debug Mode

Enable verbose logging to see detailed processing:
```bash
npm run fix:rust -- --verbose
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

For issues and questions:
1. Check the troubleshooting section
2. Review test scripts for usage examples
3. Enable verbose logging for debugging
4. Check the gate validation logs for specific failures