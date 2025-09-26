# Common Issues and Quick Fixes

The most frequently encountered issues when using Claude Flow Novice and their step-by-step solutions.

## 🎯 Quick Diagnostic Command

**Before diving into specific issues, always start with:**
```bash
npx claude-flow@alpha doctor
```
This command identifies and often auto-fixes the most common problems.

---

## 🤖 Agent-Related Issues

### Issue: Agent Stuck or Not Responding

**Symptoms:**
- Agent shows "Working" status for extended periods
- No progress updates or file changes
- Task percentage doesn't increase

**Quick Fix:**
```bash
# Check agent status
npx claude-flow@alpha agents status

# Restart the stuck agent
npx claude-flow@alpha agents restart <agent-id>
```

**Detailed Solution:**
1. **Identify the problematic agent:**
   ```bash
   npx claude-flow@alpha agents status --verbose
   ```

2. **Check agent logs for errors:**
   ```bash
   npx claude-flow@alpha agents logs <agent-id> --level error
   ```

3. **Try gentle restart first:**
   ```bash
   npx claude-flow@alpha agents restart <agent-id>
   ```

4. **If gentle restart fails, force stop:**
   ```bash
   npx claude-flow@alpha agents stop <agent-id> --force
   npx claude-flow@alpha agents spawn <type> "<same-task>"
   ```

5. **Prevent future occurrences:**
   ```bash
   # Increase timeout for complex tasks
   npx claude-flow@alpha config set agents.timeout 600

   # Enable auto-restart on failure
   npx claude-flow@alpha config set agents.autoRestart true
   ```

### Issue: "Failed to Spawn Agent" Error

**Symptoms:**
- Error message when trying to create new agents
- Resource allocation failures
- "Maximum agents exceeded" warnings

**Quick Fix:**
```bash
# Check and stop unnecessary agents
npx claude-flow@alpha agents status
npx claude-flow@alpha agents stop --all
```

**Detailed Solution:**
1. **Check current agent count:**
   ```bash
   npx claude-flow@alpha agents list --active
   ```

2. **Review resource usage:**
   ```bash
   npx claude-flow@alpha doctor --check-resources
   ```

3. **Adjust agent limits:**
   ```bash
   # Increase maximum concurrent agents
   npx claude-flow@alpha config set agents.maxConcurrent 8

   # Or reduce for lower-resource systems
   npx claude-flow@alpha config set agents.maxConcurrent 2
   ```

4. **Clear agent cache:**
   ```bash
   npx claude-flow@alpha agents clear-cache
   ```

5. **Reset agent system if needed:**
   ```bash
   npx claude-flow@alpha agents reset
   ```

### Issue: Agent Gives Inconsistent Results

**Symptoms:**
- Different outputs for similar tasks
- Agent "forgets" previous work
- Contradictory responses

**Quick Fix:**
```bash
# Check and update agent memory
npx claude-flow@alpha memory usage
npx claude-flow@alpha memory cleanup --stale
```

**Detailed Solution:**
1. **Verify agent memory:**
   ```bash
   npx claude-flow@alpha memory get --agent <agent-id>
   ```

2. **Check for memory conflicts:**
   ```bash
   npx claude-flow@alpha memory validate
   ```

3. **Reset agent memory if corrupted:**
   ```bash
   npx claude-flow@alpha memory reset --agent <agent-id> --confirm
   ```

4. **Improve consistency with better prompts:**
   ```bash
   # Be more specific in task descriptions
   npx claude-flow@alpha agents spawn coder \
     --context "Express.js API project" \
     --constraints "use TypeScript, follow REST conventions" \
     "implement user authentication with JWT tokens"
   ```

---

## 🔌 MCP Integration Issues

### Issue: MCP Server Not Responding

**Symptoms:**
- `mcp__claude-flow__*` commands not available in Claude Code
- "Server connection failed" errors
- Timeout when using MCP tools

**Quick Fix:**
```bash
# Restart MCP server
claude mcp restart claude-flow
```

**Detailed Solution:**
1. **Check MCP server status:**
   ```bash
   claude mcp status claude-flow
   ```

2. **View MCP server logs:**
   ```bash
   claude mcp logs claude-flow
   ```

3. **Test MCP connection:**
   ```bash
   claude mcp test claude-flow
   ```

4. **If connection fails, reinstall:**
   ```bash
   claude mcp remove claude-flow
   claude mcp add claude-flow npx claude-flow@alpha mcp start
   ```

5. **Verify Node.js version:**
   ```bash
   node --version  # Should be 18.0.0 or higher
   ```

6. **Check for port conflicts:**
   ```bash
   # If using custom port
   claude mcp remove claude-flow
   claude mcp add claude-flow npx claude-flow@alpha mcp start --port 3001
   ```

### Issue: MCP Tools Not Available in Claude Code

**Symptoms:**
- `mcp__claude-flow__` prefix commands show "unknown tool"
- Limited or no MCP tools available
- Tools work in CLI but not in Claude Code

**Quick Fix:**
```bash
# Refresh MCP tool list
claude mcp restart claude-flow
claude mcp tools claude-flow
```

**Detailed Solution:**
1. **Verify claude-flow installation:**
   ```bash
   npx claude-flow@alpha --version
   ```

2. **Update to latest version:**
   ```bash
   npm update -g claude-flow-novice
   ```

3. **Re-register MCP server:**
   ```bash
   claude mcp remove claude-flow
   claude mcp add claude-flow npx claude-flow@alpha mcp start
   ```

4. **Check available tools:**
   ```bash
   claude mcp tools claude-flow
   ```

5. **Clear Claude Code cache if needed:**
   ```bash
   # Close Claude Code and restart
   # Tools should refresh automatically
   ```

---

## 🔄 SPARC Workflow Issues

### Issue: SPARC Workflow Gets Stuck

**Symptoms:**
- Workflow stops progressing at a specific phase
- "Phase timeout" or "Agent not responding" during SPARC
- Incomplete deliverables from SPARC phases

**Quick Fix:**
```bash
# Check SPARC status and resume
npx claude-flow@alpha sparc status
npx claude-flow@alpha sparc resume
```

**Detailed Solution:**
1. **Check current SPARC status:**
   ```bash
   npx claude-flow@alpha sparc status --detailed
   ```

2. **Identify stuck phase:**
   ```bash
   npx claude-flow@alpha sparc logs --phase current
   ```

3. **Resume from last successful checkpoint:**
   ```bash
   npx claude-flow@alpha sparc resume --from-checkpoint
   ```

4. **If resume fails, restart the stuck phase:**
   ```bash
   npx claude-flow@alpha sparc restart-phase --phase architecture
   ```

5. **For persistent issues, adjust SPARC configuration:**
   ```bash
   # Increase phase timeouts
   npx claude-flow@alpha config set sparc.phaseTimeout 600

   # Disable parallel execution for debugging
   npx claude-flow@alpha config set sparc.parallelPhases false
   ```

### Issue: SPARC Produces Low-Quality Output

**Symptoms:**
- Generated code has obvious bugs
- Missing important features or requirements
- Poor test coverage

**Quick Fix:**
```bash
# Use more specific task descriptions
npx claude-flow@alpha sparc tdd \
  --detailed-requirements true \
  "detailed description of what you want built"
```

**Detailed Solution:**
1. **Improve task descriptions:**
   ```bash
   # Instead of: "build a todo app"
   # Use: "build a todo app with user authentication, CRUD operations,
   #       task categories, due dates, and responsive design"
   ```

2. **Set quality requirements:**
   ```bash
   npx claude-flow@alpha sparc tdd \
     --coverage 90 \
     --agents coder,reviewer,tester \
     "task with specific quality requirements"
   ```

3. **Use multiple review agents:**
   ```bash
   npx claude-flow@alpha sparc tdd \
     --review-agents security-manager,performance-optimizer,reviewer \
     "task requiring thorough review"
   ```

4. **Enable iterative refinement:**
   ```bash
   npx claude-flow@alpha config set sparc.iterativeRefinement true
   npx claude-flow@alpha config set sparc.reviewCycles 2
   ```

---

## ⚙️ Configuration Issues

### Issue: "Invalid Configuration" Error

**Symptoms:**
- Commands fail with configuration-related errors
- Unexpected behavior after configuration changes
- "Configuration validation failed" messages

**Quick Fix:**
```bash
# Reset configuration to defaults
npx claude-flow@alpha config reset
```

**Detailed Solution:**
1. **Validate current configuration:**
   ```bash
   npx claude-flow@alpha config validate
   ```

2. **View current configuration:**
   ```bash
   npx claude-flow@alpha config show
   ```

3. **Check for syntax errors:**
   ```bash
   # Configuration file location
   cat .claude-flow/config.json | jq .  # Validates JSON syntax
   ```

4. **Reset and reconfigure:**
   ```bash
   npx claude-flow@alpha config reset
   npx claude-flow@alpha config init --interactive
   ```

5. **Restore from backup if available:**
   ```bash
   npx claude-flow@alpha config restore --backup latest
   ```

### Issue: Environment Variables Not Recognized

**Symptoms:**
- API authentication failures
- Missing API keys or tokens
- "Unauthorized" or "Forbidden" errors

**Quick Fix:**
```bash
# Set required environment variables
export CLAUDE_FLOW_API_KEY="your-api-key"
export CLAUDE_FLOW_MODEL="claude-3.5-sonnet"
```

**Detailed Solution:**
1. **Check required environment variables:**
   ```bash
   npx claude-flow@alpha config env-check
   ```

2. **Set environment variables permanently:**
   ```bash
   # Add to ~/.bashrc or ~/.zshrc
   echo 'export CLAUDE_FLOW_API_KEY="your-key"' >> ~/.bashrc
   echo 'export CLAUDE_FLOW_MODEL="claude-3.5-sonnet"' >> ~/.bashrc
   source ~/.bashrc
   ```

3. **Use .env file for project-specific settings:**
   ```bash
   # Create .env file in project root
   cat > .env << EOF
   CLAUDE_FLOW_API_KEY=your-api-key
   CLAUDE_FLOW_MODEL=claude-3.5-sonnet
   CLAUDE_FLOW_MAX_AGENTS=5
   EOF
   ```

4. **Verify environment variables are loaded:**
   ```bash
   npx claude-flow@alpha config show --include-env
   ```

---

## 📊 Performance Issues

### Issue: Slow Agent Response Times

**Symptoms:**
- Agents take much longer than expected to complete tasks
- High system resource usage
- Timeouts during operation

**Quick Fix:**
```bash
# Run performance optimization
npx claude-flow@alpha optimize --auto-tune
```

**Detailed Solution:**
1. **Check system resources:**
   ```bash
   npx claude-flow@alpha doctor --performance
   ```

2. **Monitor resource usage:**
   ```bash
   npx claude-flow@alpha monitor --metrics memory,cpu
   ```

3. **Reduce concurrent operations:**
   ```bash
   npx claude-flow@alpha config set agents.maxConcurrent 2
   npx claude-flow@alpha config set sparc.parallelPhases false
   ```

4. **Clear caches:**
   ```bash
   npx claude-flow@alpha cache clear
   npx claude-flow@alpha memory cleanup --older-than 24h
   ```

5. **Optimize for your system:**
   ```bash
   # For low-memory systems
   npx claude-flow@alpha config set system.memoryLimit 1GB
   npx claude-flow@alpha config set agents.memoryPerAgent 200MB

   # For slower networks
   npx claude-flow@alpha config set network.timeout 60000
   npx claude-flow@alpha config set api.requestDelay 1000
   ```

### Issue: High Memory Usage

**Symptoms:**
- System becomes sluggish during claude-flow operations
- Out of memory errors
- System warns about high memory usage

**Quick Fix:**
```bash
# Clean up memory usage
npx claude-flow@alpha memory cleanup
npx claude-flow@alpha agents stop --idle
```

**Detailed Solution:**
1. **Check memory usage breakdown:**
   ```bash
   npx claude-flow@alpha memory usage --detailed
   ```

2. **Clean up old data:**
   ```bash
   npx claude-flow@alpha memory cleanup --older-than 7d
   npx claude-flow@alpha cache clear
   npx claude-flow@alpha logs cleanup --older-than 3d
   ```

3. **Reduce memory limits:**
   ```bash
   npx claude-flow@alpha config set system.memoryLimit 512MB
   npx claude-flow@alpha config set agents.maxConcurrent 1
   ```

4. **Enable memory optimization:**
   ```bash
   npx claude-flow@alpha config set memory.optimization aggressive
   npx claude-flow@alpha config set memory.autoCleanup true
   ```

---

## 🔧 Installation and System Issues

### Issue: "Command Not Found" Error

**Symptoms:**
- `claude-flow` or `npx claude-flow@alpha` commands not recognized
- "No such file or directory" errors
- Commands work in some terminals but not others

**Quick Fix:**
```bash
# Use npx instead of global installation
npx claude-flow@alpha --version
```

**Detailed Solution:**
1. **Check if Node.js is installed:**
   ```bash
   node --version
   npm --version
   ```

2. **Install or update Node.js if needed:**
   ```bash
   # Download from nodejs.org or use package manager
   # For macOS with Homebrew:
   brew install node

   # For Ubuntu/Debian:
   curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```

3. **Try global installation:**
   ```bash
   npm install -g claude-flow-novice
   claude-flow --version
   ```

4. **Fix PATH issues (if global install doesn't work):**
   ```bash
   # Check npm global path
   npm config get prefix

   # Add to PATH (add to ~/.bashrc or ~/.zshrc)
   export PATH="$(npm config get prefix)/bin:$PATH"
   ```

5. **Use npx as fallback:**
   ```bash
   # npx always works without global installation
   npx claude-flow@alpha --version
   ```

### Issue: Permission Denied Errors

**Symptoms:**
- "Permission denied" when installing or running commands
- "EACCES" errors during npm operations
- Commands require sudo but shouldn't

**Quick Fix:**
```bash
# Fix npm permissions (macOS/Linux)
sudo chown -R $(whoami) ~/.npm
```

**Detailed Solution:**
1. **Fix npm global directory permissions:**
   ```bash
   # Create npm global directory with correct permissions
   mkdir ~/.npm-global
   npm config set prefix '~/.npm-global'

   # Add to PATH
   echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
   source ~/.bashrc
   ```

2. **For macOS users:**
   ```bash
   # Fix Homebrew permissions
   sudo chown -R $(whoami) /usr/local/lib/node_modules
   ```

3. **For Windows users:**
   ```cmd
   # Run Command Prompt as Administrator
   npm install -g claude-flow-novice
   ```

4. **Alternative: Use npx to avoid permissions:**
   ```bash
   # No installation required
   npx claude-flow@alpha init
   ```

---

## 🔍 When to Seek Further Help

### Try Self-Diagnosis First
1. Run `npx claude-flow@alpha doctor`
2. Check the specific error in [Error Codes](../error-codes/README.md)
3. Review [Performance Guide](../performance/README.md) for performance issues

### Escalate to Advanced Troubleshooting
If basic fixes don't work:
- **Performance issues**: See [Performance Troubleshooting](../performance/README.md)
- **Complex configuration**: See [Debugging Guide](../debugging/README.md)
- **System integration**: Check [API Reference](../../api-reference/README.md)

### Community Support
For issues not covered here:
- **[Community Discussions](../../community/discussions/README.md)** - Ask the community
- **[GitHub Issues](https://github.com/ruvnet/claude-flow/issues)** - Report bugs
- **[Discord/Slack](../../community/README.md)** - Real-time help

---

## 📋 Prevention Tips

### Regular Maintenance
```bash
# Weekly maintenance routine
npx claude-flow@alpha doctor
npx claude-flow@alpha memory cleanup --older-than 7d
npx claude-flow@alpha cache clear
npx claude-flow@alpha config validate
```

### Best Practices
1. **Use descriptive task descriptions** for better agent performance
2. **Monitor resource usage** regularly with `npx claude-flow@alpha monitor`
3. **Keep configuration simple** and well-documented
4. **Update regularly** with `npm update -g claude-flow-novice`
5. **Backup important configurations** and memory data

### Early Warning Signs
Watch for these indicators of potential issues:
- Gradually increasing response times
- Growing memory usage over time
- Inconsistent agent behavior
- Configuration drift from defaults

---

**Remember:** Most issues have simple solutions. Start with `npx claude-flow@alpha doctor` and work through the suggested fixes before trying complex solutions.