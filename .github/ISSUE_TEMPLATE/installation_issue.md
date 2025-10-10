---
name: Installation Issue
about: Report problems installing or setting up claude-flow-novice
title: '[INSTALL] '
labels: installation
assignees: ''
---

## Installation Problem

**Describe the installation issue:**


## Installation Method

**How are you trying to install?**

- [ ] NPM global install (`npm install -g claude-flow-novice`)
- [ ] NPM local install (`npm install claude-flow-novice`)
- [ ] NPX execution (`npx claude-flow-novice`)
- [ ] From source (cloned repository)
- [ ] Other (please specify):

## Environment Information

**Critical - Please provide all details:**

- **Node.js Version:** (run `node --version`)
- **NPM Version:** (run `npm --version`)
- **Operating System:** (e.g., Windows 11, macOS 14, Ubuntu 22.04)
- **Platform Architecture:** (run `node -p "process.arch"`)
- **Shell/Terminal:** (e.g., bash, zsh, PowerShell, cmd)
- **User Permissions:** (admin/root or standard user?)

## System Requirements

**Have you verified system requirements?**

- [ ] Node.js >=20.0.0
- [ ] NPM >=9.0.0
- [ ] Sufficient disk space (>500MB)
- [ ] Internet connectivity for dependencies

## Installation Command

**Exact command you ran:**

```bash
# Paste command here
```

## Error Output

**Complete error output:**

```
Paste full error output here (including stack trace if available)
```

## NPM Debug Log

**If installation failed, include NPM debug log:**

```
Location of npm-debug.log (usually in project root or ~/.npm/_logs/)
Paste relevant portions here
```

## Network Configuration

**Are you behind a proxy or firewall?**

- [ ] Yes (provide proxy configuration if possible)
- [ ] No
- [ ] Unsure

**NPM Registry:**

- [ ] Default (https://registry.npmjs.org/)
- [ ] Custom registry (please specify):

## Dependencies

**Have you tried installing dependencies separately?**

```bash
# Try these commands and report results:
npm install @anthropic-ai/claude-agent-sdk
npm install @modelcontextprotocol/sdk
npm install redis
```

**Results:**


## Previous Attempts

**What have you already tried?**

- [ ] Cleared NPM cache (`npm cache clean --force`)
- [ ] Updated Node.js to latest LTS
- [ ] Updated NPM (`npm install -g npm@latest`)
- [ ] Tried different installation method
- [ ] Checked firewall/antivirus settings
- [ ] Installed with `--force` flag
- [ ] Installed with `--legacy-peer-deps`

## Build Tools

**For Windows users - do you have build tools installed?**

- [ ] Visual Studio Build Tools installed
- [ ] Python installed (required for some native modules)
- [ ] Not applicable (non-Windows)

**For Linux/Mac users:**

- [ ] GCC/Clang installed
- [ ] Make installed
- [ ] Python installed

## Specific Error Categories

**Check the type of error you're experiencing:**

- [ ] Network/timeout errors
- [ ] Permission/EACCES errors
- [ ] Build/compilation errors
- [ ] Dependency resolution errors
- [ ] Post-install script errors
- [ ] Other (describe):

## Redis Installation

**Is Redis installed and running?**

- [ ] Yes, Redis is installed
- [ ] No, need help installing Redis
- [ ] Redis installed but not running
- [ ] Don't know how to check

**Redis version (if installed):** (run `redis-cli --version`)

## Additional Files

**If available, please attach:**

- [ ] Complete installation log
- [ ] NPM debug log
- [ ] Package-lock.json (if local install)
- [ ] Screenshots of error messages

## Workarounds Attempted

**Describe any workarounds you've tried:**


## System Diagnostics

**Output of diagnostic commands:**

```bash
# Run these and paste output:
node --version
npm --version
npm config list
npm config get registry
which node  # or 'where node' on Windows
which npm   # or 'where npm' on Windows
```

**Output:**

```
Paste diagnostic output here
```

## Timeline

**When did this start happening?**

- [ ] First time installing
- [ ] Was working before, broke after update
- [ ] Was working before, broke after system change
- [ ] Other:

## Impact

**How is this blocking you?**

- [ ] Cannot use package at all
- [ ] Can use some features
- [ ] Workaround exists but inconvenient
- [ ] Testing/evaluation only

## Additional Context

**Any other relevant information:**


## Checklist

- [ ] I have provided all required environment information
- [ ] I have included complete error output
- [ ] I have verified system requirements
- [ ] I have searched existing issues
- [ ] I have tried basic troubleshooting steps
