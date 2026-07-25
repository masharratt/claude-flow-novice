# Hook Pipeline Skill

## Quick Start
The Hook Pipeline skill provides multi-language post-edit validation for code changes, ensuring type safety and consistent code quality across different programming languages.

## Dependencies

### Required
- **Node.js (>=18)**: JavaScript runtime
  - Install: `curl -fsSL https://deb.nodesource.com/setup_18.x | bash - && apt-get install -y nodejs`
  - Verify: `node --version`

- **jq**: JSON processing tool
  - Install: `sudo apt-get install jq`
  - Verify: `jq --version`

- **TypeScript Compiler (tsc)**: TypeScript type checking
  - Install: `npm install -g typescript`
  - Verify: `tsc --version`

### Optional (Language-Specific Tools)
- **Python**:
  - **pylint**: Python code analysis
    - Install: `pip install pylint`
    - Verify: `pylint --version`
  - **black**: Python code formatter
    - Install: `pip install black`
    - Verify: `black --version`

- **Rust**:
  - **cargo**: Rust package manager
    - Install: `curl https://sh.rustup.rs -sSf | sh`
    - Verify: `cargo --version`
  - **clippy**: Rust linter
    - Install: `rustup component add clippy`
    - Verify: `cargo clippy --version`
  - **rustfmt**: Rust code formatter
    - Install: `rustup component add rustfmt`
    - Verify: `rustfmt --version`

- **Go**:
  - **gofmt**: Go code formatter
    - Install: Comes with Go installation
    - Verify: `gofmt --help`
  - **go vet**: Go static analyzer
    - Install: Comes with Go
    - Verify: `go version`

- **Java**:
  - **google-java-format**: Java code formatter
    - Install: `brew install google-java-format` (macOS) or download JAR
    - Verify: Check Google Java Format documentation

- **C/C++**:
  - **clang-format**: Code formatter
    - Install: `sudo apt-get install clang-format`
    - Verify: `clang-format --version`
  - **cppcheck**: Static analysis tool
    - Install: `sudo apt-get install cppcheck`
    - Verify: `cppcheck --version`

## Platform-Specific Notes
- **Linux/WSL**: Default installation works perfectly
- **macOS**: Use Homebrew for most installations
- **Windows**: Use WSL2 or Windows Subsystem for Linux

## Installation Verification
```bash
# Run this script to check all dependencies
./.claude/skills/hook-pipeline/check-dependencies.sh
```

## Usage
See [SKILL.md](./SKILL.md) for complete usage guide.