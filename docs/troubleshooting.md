# Troubleshooting Guide

Common issues and solutions for Claude Flow Novice.

## Installation Issues

### "Command not found: claude-flow-novice"

**Problem:** After installing, the command isn't available.

**Solution:**
```bash
# Try reinstalling globally
npm uninstall -g claude-flow-novice
npm install -g claude-flow-novice

# Check if it's in your PATH
npm list -g claude-flow-novice

# On Windows, you might need to restart your terminal
```

### Permission Errors on Installation

**Problem:** Getting permission errors when installing globally.

**Solution:**
```bash
# On macOS/Linux - use sudo
sudo npm install -g claude-flow-novice

# Or configure npm to use a different directory
mkdir ~/.npm-global
npm config set prefix '~/.npm-global'
export PATH=~/.npm-global/bin:$PATH
npm install -g claude-flow-novice
```

## Project Issues

### "No project found" Error

**Problem:** Commands fail with "No project found in current directory".

**Solution:**
```bash
# Make sure you're in a project directory
claude-flow-novice status

# If no project exists, initialize one
claude-flow-novice init my-project
cd my-project

# Check for the project file
ls -la  # Look for claude-flow-novice.json
```

### Project Directory Seems Empty

**Problem:** The project directory doesn't show expected files.

**Solution:**
This is normal! Claude Flow Novice uses configuration files that might not be visible:

```bash
# Check project status
claude-flow-novice status

# List agents (even if directory looks empty)
claude-flow-novice agent list

# The project file might be hidden
ls -la | grep claude-flow
```

## Agent Issues

### Agents Stuck in "Running" State

**Problem:** Agents show as "running" but never complete.

**Solution:**
```bash
# Check agent status
claude-flow-novice agent list

# Try running specific agent
claude-flow-novice run <agent-id>

# If stuck, remove and recreate
claude-flow-novice agent remove <agent-id>
claude-flow-novice agent create <type> "<new-task>"
```

### "Invalid agent type" Error

**Problem:** Error when creating an agent with an invalid type.

**Solution:**
Claude Flow Novice only supports 4 agent types:
```bash
# Correct agent types
claude-flow-novice agent create researcher "your task"
claude-flow-novice agent create coder "your task"
claude-flow-novice agent create reviewer "your task"
claude-flow-novice agent create planner "your task"

# Check spelling and use lowercase
```

### Poor Agent Results

**Problem:** Agents produce low-quality or irrelevant results.

**Solution:**
```bash
# Be more specific in your task descriptions
# ❌ Bad: "research stuff"
# ✅ Good: "research the top 5 JavaScript testing frameworks and compare their features"

# Break complex tasks into smaller ones
# Instead of: "build a complete website"
# Try: "plan the website structure" then "create the homepage HTML"

# Provide context
# "review this React component for performance issues" (after creating the component first)
```

## Command Issues

### Commands Not Working

**Problem:** Commands fail or don't respond.

**Solution:**
```bash
# Check if you're using the right command name
claude-flow-novice --help

# Make sure you're in the right directory
pwd
claude-flow-novice status

# Try with verbose output
claude-flow-novice agent list --verbose
```

### "ENOENT" or File Not Found Errors

**Problem:** Getting file system errors.

**Solution:**
```bash
# Check directory permissions
ls -la

# Make sure you have write permissions
# On Windows, try running as administrator
# On macOS/Linux, check folder ownership

# Try in a different directory
cd ~
mkdir test-project
cd test-project
claude-flow-novice init test
```

## Configuration Issues

### Settings Not Saving

**Problem:** Agent configurations or project settings don't persist.

**Solution:**
```bash
# Check if config file exists and is writable
ls -la claude-flow-novice.json

# Verify file permissions
# On macOS/Linux:
chmod 644 claude-flow-novice.json

# Try reinitializing the project
rm claude-flow-novice.json
claude-flow-novice init project-name
```

## Performance Issues

### Agents Taking Too Long

**Problem:** Agents run for a very long time without completing.

**Solution:**
```bash
# Break down complex tasks into smaller ones
# Instead of: "research everything about AI"
# Try: "research the basics of machine learning"

# Check if task is too broad
# Specific tasks complete faster than vague ones

# Try a simpler task first to test
claude-flow-novice agent create researcher "research the definition of JavaScript"
claude-flow-novice run
```

### High Memory Usage

**Problem:** The application uses too much memory.

**Solution:**
```bash
# Remove old agents you don't need
claude-flow-novice agent list
claude-flow-novice agent remove <old-agent-id>

# Start fresh if needed
rm claude-flow-novice.json
claude-flow-novice init new-project
```

## Environment Issues

### Node.js Version Problems

**Problem:** Getting Node.js version errors.

**Solution:**
```bash
# Check your Node.js version
node --version

# Claude Flow Novice requires Node.js 18+
# Update Node.js if needed:
# Via Node.js website: https://nodejs.org
# Via nvm: nvm install 18 && nvm use 18
```

### npm Issues

**Problem:** npm-related errors during installation or usage.

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Update npm
npm install -g npm@latest

# Try with yarn instead
yarn global add claude-flow-novice
```

## Getting More Help

### Enable Debug Mode

For detailed error information:
```bash
# Run commands with more verbose output
NODE_ENV=development claude-flow-novice agent list

# Check for detailed error messages
claude-flow-novice --help
```

### Reporting Issues

If you can't solve the problem:

1. **Check existing issues:** [GitHub Issues](https://github.com/masharratt/claude-flow-novice/issues)
2. **Create a new issue** with:
   - Your operating system
   - Node.js version (`node --version`)
   - npm version (`npm --version`)
   - Exact error message
   - Steps to reproduce

### Common Solutions Checklist

Before reporting an issue, try:

- [ ] Restart your terminal
- [ ] Run `npm install -g claude-flow-novice` again
- [ ] Check Node.js version (18+ required)
- [ ] Try in a new directory
- [ ] Check file permissions
- [ ] Clear npm cache: `npm cache clean --force`

## FAQ

**Q: Can I use Claude Flow Novice offline?**
A: No, Claude Flow Novice requires an internet connection to function.

**Q: How do I upgrade to the full Claude Flow?**
A: Install the full version with `npm install -g claude-flow` and follow their documentation.

**Q: Can I use multiple projects at the same time?**
A: Yes! Each directory can have its own project. Just navigate to different directories.

**Q: How do I delete a project?**
A: Simply delete the project directory. All agent data is stored locally in the project folder.

**Q: Are my agent results saved?**
A: Yes, results are saved in the project configuration file until you remove the agents or delete the project.