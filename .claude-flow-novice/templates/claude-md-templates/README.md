# Claude.md Language Templates

This directory contains language-specific CLAUDE.md template files for different programming ecosystems. Each template is based on the main CLAUDE.md structure but customized for specific languages, frameworks, and toolchains.

## Available Templates

### 📦 CLAUDE-RUST.md
**For Rust projects with Cargo, Clippy, and testing**
- Cargo build system integration
- Rust-specific agent coordination patterns
- Clippy linting and rustfmt formatting
- Comprehensive testing with `cargo test`
- Memory safety and ownership patterns
- Performance optimization techniques
- Crate development and publishing

### 🟨 CLAUDE-JAVASCRIPT.md
**For JavaScript/Node.js projects with npm and modern tooling**
- NPM package management and scripts
- ES6+ modern JavaScript patterns
- Jest/Mocha testing frameworks
- ESLint and Prettier configuration
- Express/Fastify backend development
- Frontend framework integration
- Async/await error handling

### 🔷 CLAUDE-TYPESCRIPT.md
**For TypeScript projects with strong typing and build tools**
- TypeScript compiler configuration
- Strict type checking and safety
- Advanced type patterns and generics
- Jest with TypeScript testing
- Build pipelines (Webpack, Vite, TSC)
- TSDoc documentation standards
- Type-safe agent coordination

### 🐍 CLAUDE-PYTHON.md
**For Python projects with pip, pytest, and quality tools**
- Virtual environment management
- Modern Python packaging (pyproject.toml)
- Comprehensive pytest testing strategies
- Type hints and mypy checking
- PEP 8 compliance and formatting
- Sphinx documentation generation
- Data science and ML patterns

## Template Structure

Each template follows the same core structure but with language-specific customizations:

### 🚨 Universal Rules (All Languages)
1. **Concurrent execution** - All operations in single messages
2. **Proper file organization** - Never save to root folder
3. **Claude Code Task tool** - Primary agent execution method
4. **Batch operations** - TodoWrite, file ops, bash commands together

### 🎯 Language-Specific Sections

#### Build Commands
- Language-specific build tools and commands
- Package management (Cargo, npm, pip, etc.)
- Testing framework integration
- Linting and formatting tools

#### Agent Coordination
- Language-specific agent types
- Ecosystem-aware coordination patterns
- Framework specialists (React, Django, etc.)
- Tool experts (webpack, mypy, clippy, etc.)

#### Configuration Files
- Language build configuration templates
- Testing framework setup
- Linting and formatting rules
- CI/CD pipeline configurations

#### Best Practices
- Language idioms and patterns
- Performance optimization techniques
- Error handling strategies
- Documentation standards

## Usage Instructions

### 1. Choose Your Template
Select the appropriate template for your project's primary language:

```bash
# For Rust projects
cp claude-md-templates/CLAUDE-RUST.md ./CLAUDE.md

# For JavaScript projects
cp claude-md-templates/CLAUDE-JAVASCRIPT.md ./CLAUDE.md

# For TypeScript projects
cp claude-md-templates/CLAUDE-TYPESCRIPT.md ./CLAUDE.md

# For Python projects
cp claude-md-templates/CLAUDE-PYTHON.md ./CLAUDE.md
```

### 2. Customize for Your Project
After copying, customize the template:

- Update project name and description
- Modify dependency lists
- Adjust build commands for your setup
- Add project-specific agent types
- Configure tool versions and settings

### 3. Initialize Language Environment
Each template includes setup commands:

```bash
# Rust
cargo init
cargo add [dependencies]

# JavaScript/Node.js
npm init
npm install [dependencies]

# TypeScript
npm init
npm install typescript @types/node

# Python
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows
pip install -r requirements.txt
```

## Agent Coordination Patterns

### Language-Specific Agents
Each template includes specialized agents:

#### Rust Agents
- `rust-coder`, `cargo-expert`, `clippy-specialist`
- `async-rust-dev`, `unsafe-rust-auditor`
- `memory-safety-auditor`, `benchmark-engineer`

#### JavaScript Agents
- `js-coder`, `node-developer`, `frontend-dev`
- `express-dev`, `react-dev`, `vue-dev`
- `jest-expert`, `webpack-expert`

#### TypeScript Agents
- `ts-coder`, `type-designer`, `interface-designer`
- `generic-specialist`, `tsc-expert`
- `jest-ts-expert`, `webpack-ts-config`

#### Python Agents
- `python-coder`, `pytest-expert`, `pep8-expert`
- `django-dev`, `fastapi-dev`, `data-scientist`
- `mypy-expert`, `sphinx-documenter`

### Coordination Protocol
All templates follow the same coordination protocol:

```bash
# Before work
npx claude-flow@alpha hooks pre-task --description "[task]"

# During work
[language-specific-lint-check]
npx claude-flow@alpha hooks post-edit --file "[file]"

# After work
[language-specific-test-command]
npx claude-flow@alpha hooks post-task --task-id "[task]"
```

## Framework Extensions

### Web Frameworks
- **React/Vue/Angular** - Extended TypeScript/JavaScript templates
- **Django/Flask/FastAPI** - Extended Python templates
- **Actix/Rocket/Warp** - Extended Rust templates
- **Express/Fastify/Koa** - Extended JavaScript templates

### Testing Frameworks
- **Jest/Vitest/Mocha** - JavaScript/TypeScript testing
- **Pytest/Unittest** - Python testing
- **Cargo test/Proptest** - Rust testing
- **Cypress/Playwright** - E2E testing across languages

### Build Tools
- **Webpack/Vite/Rollup** - JavaScript/TypeScript bundling
- **Cargo** - Rust build system
- **Poetry/Pip** - Python package management
- **Docker** - Containerization across all languages

## Quality Assurance

### Linting and Formatting
Each template includes appropriate tools:

- **Rust**: `clippy`, `rustfmt`
- **JavaScript**: `eslint`, `prettier`
- **TypeScript**: `@typescript-eslint`, `prettier`
- **Python**: `flake8`, `black`, `isort`, `mypy`

### Testing Standards
- **Unit tests**: 80%+ coverage requirement
- **Integration tests**: API and system testing
- **Type testing**: Static analysis and type safety
- **Property testing**: Hypothesis/QuickCheck patterns

### Documentation
- **API docs**: Language-specific documentation tools
- **Type annotations**: Comprehensive type documentation
- **Examples**: Working code examples in docs
- **Architecture**: System design documentation

## Migration Guide

### From Generic CLAUDE.md
1. Backup existing `CLAUDE.md`
2. Copy appropriate language template
3. Migrate custom configurations
4. Update agent spawn patterns
5. Test coordination with language tools

### Between Language Templates
1. Extract language-agnostic configurations
2. Copy to new language template
3. Update language-specific sections
4. Migrate build and test commands
5. Update agent coordination patterns

## Contributing

### Adding New Language Templates
1. Follow existing template structure
2. Include comprehensive language ecosystem
3. Add specialized agent types
4. Provide complete configuration examples
5. Document language-specific best practices

### Template Improvements
1. Test with real projects
2. Gather community feedback
3. Update based on ecosystem changes
4. Maintain compatibility with SPARC methodology
5. Ensure agent coordination consistency

## Support and Resources

### General Support
- **Main Documentation**: `/CLAUDE.md`
- **SPARC Methodology**: Project root documentation
- **Agent Coordination**: MCP and Claude Flow docs

### Language-Specific Resources
- **Rust**: https://doc.rust-lang.org/
- **JavaScript**: https://developer.mozilla.org/en-US/docs/Web/JavaScript
- **TypeScript**: https://www.typescriptlang.org/docs/
- **Python**: https://docs.python.org/3/

---

**Remember**: Choose the right template for your language, customize for your project, and let Claude Flow coordinate while Claude Code creates!