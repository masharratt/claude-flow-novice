# Video Tutorial: Installation & Setup

**Duration**: 5 minutes
**Complexity**: 🟢 Beginner
**Prerequisites**: Node.js 18+

Learn how to install and configure claude-flow for development in under 5 minutes.

## 🎥 Video Overview

This tutorial covers the complete setup process from installation to your first agent execution, including MCP server configuration and basic troubleshooting.

### What You'll Learn
- Installing claude-flow CLI
- Setting up MCP servers
- Configuring your development environment
- Running your first agent
- Basic troubleshooting tips

## 📺 Video Sections

### 0:00 - Introduction
Brief overview of claude-flow and what we'll accomplish in this tutorial.

### 0:30 - Prerequisites Check
```bash
# Check Node.js version (18+ required)
node --version

# Check npm version
npm --version

# Verify Claude Code CLI is available
claude --version
```

### 1:00 - Installing Claude Flow
```bash
# Install globally for CLI access
npm install -g claude-flow@alpha

# Or use npx for one-time usage
npx claude-flow@alpha --version

# Verify installation
claude-flow --help
```

### 1:30 - MCP Server Setup
```bash
# Add claude-flow MCP server (required)
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Add optional enhanced coordination server
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Verify MCP servers are running
claude mcp list
```

### 2:30 - Project Initialization
```bash
# Create new project directory
mkdir my-first-claude-flow-project
cd my-first-claude-flow-project

# Initialize claude-flow project
npx claude-flow@alpha init --type basic

# Review generated configuration
cat .claude-flow.json
```

### 3:00 - First Agent Execution
```bash
# Spawn your first agent
npx claude-flow@alpha agent spawn coder \
  --capability "JavaScript development" \
  --task "Create a simple hello world application"

# Check agent status
npx claude-flow@alpha agent list

# View agent output
ls -la
```

### 3:30 - Using Task Tool (Recommended)
```javascript
// Better approach using Claude Code's Task tool
Task("JavaScript Developer",
     "Create a Node.js hello world application with package.json, main script, and README",
     "coder")
```

### 4:00 - Verification & Testing
```bash
# Run the generated application
npm install
npm start

# Check logs
npx claude-flow@alpha logs

# Verify hooks are working
npx claude-flow@alpha hooks status
```

### 4:30 - Common Issues & Solutions
Common setup problems and their solutions covered in the video.

## 🛠️ Setup Commands Reference

### Quick Setup Script
```bash
#!/bin/bash
# quick-setup.sh - Complete claude-flow setup script

echo "🚀 Setting up claude-flow development environment..."

# Check prerequisites
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js 18+ first."
    exit 1
fi

if ! command -v claude &> /dev/null; then
    echo "❌ Claude Code CLI not found. Please install Claude first."
    exit 1
fi

# Install claude-flow
echo "📦 Installing claude-flow..."
npm install -g claude-flow@alpha

# Setup MCP servers
echo "🔧 Setting up MCP servers..."
claude mcp add claude-flow npx claude-flow@alpha mcp start
claude mcp add ruv-swarm npx ruv-swarm mcp start

# Verify installation
echo "✅ Verifying installation..."
claude-flow --version
claude mcp list

echo "🎉 Setup complete! You're ready to use claude-flow."
echo "💡 Try: npx claude-flow@alpha init --type basic"
```

### Environment Configuration
```bash
# .env example for development
NODE_ENV=development
CLAUDE_FLOW_LOG_LEVEL=info
CLAUDE_FLOW_CACHE_TTL=300
CLAUDE_FLOW_MAX_AGENTS=10

# Optional: Flow-Nexus cloud features
FLOW_NEXUS_API_KEY=your-api-key
FLOW_NEXUS_PROJECT_ID=your-project-id
```

### Package.json Scripts
```json
{
  "scripts": {
    "setup": "npx claude-flow@alpha init",
    "dev": "npx claude-flow@alpha dev",
    "test": "npx claude-flow@alpha test",
    "build": "npx claude-flow@alpha build",
    "deploy": "npx claude-flow@alpha deploy",
    "logs": "npx claude-flow@alpha logs --follow",
    "agents": "npx claude-flow@alpha agent list",
    "swarm": "npx claude-flow@alpha swarm status"
  }
}
```

## 🔧 Configuration Options

### Basic Configuration (.claude-flow.json)
```json
{
  "version": "2.0.0",
  "project": {
    "name": "my-project",
    "type": "basic",
    "language": "javascript"
  },
  "agents": {
    "maxConcurrent": 5,
    "defaultType": "coder",
    "coordination": {
      "enabled": true,
      "topology": "mesh"
    }
  },
  "hooks": {
    "enabled": true,
    "autoFormat": true,
    "autoTest": false
  },
  "memory": {
    "ttl": 3600,
    "persistence": "local"
  }
}
```

### Advanced Configuration
```json
{
  "version": "2.0.0",
  "project": {
    "name": "advanced-project",
    "type": "enterprise",
    "language": "typescript"
  },
  "agents": {
    "maxConcurrent": 10,
    "defaultType": "coder",
    "coordination": {
      "enabled": true,
      "topology": "hierarchical",
      "memory": "distributed"
    },
    "specializations": {
      "frontend": ["react", "vue", "angular"],
      "backend": ["node", "python", "rust"],
      "database": ["postgresql", "mongodb", "redis"]
    }
  },
  "integrations": {
    "github": {
      "enabled": true,
      "autoCommit": true,
      "prCreation": true
    },
    "testing": {
      "framework": "jest",
      "coverage": 80,
      "autoRun": true
    },
    "deployment": {
      "platform": "kubernetes",
      "autoScale": true
    }
  },
  "performance": {
    "caching": true,
    "parallelization": "auto",
    "optimization": "balanced"
  }
}
```

## 🚨 Troubleshooting Guide

### Common Issues

#### 1. Installation Fails
```bash
# Clear npm cache
npm cache clean --force

# Try alternative installation
curl -fsSL https://get.claude-flow.com | sh

# Manual installation
git clone https://github.com/ruvnet/claude-flow-novice
cd claude-flow-novice
npm install
npm link
```

#### 2. MCP Server Won't Start
```bash
# Check Claude CLI
claude --version

# Reset MCP servers
claude mcp remove claude-flow
claude mcp add claude-flow npx claude-flow@alpha mcp start

# Check server logs
claude mcp logs claude-flow
```

#### 3. Agent Spawning Fails
```bash
# Check project configuration
npx claude-flow@alpha config validate

# Reset hooks
npx claude-flow@alpha hooks reset

# Check memory status
npx claude-flow@alpha memory status
```

#### 4. Permission Errors
```bash
# Fix npm permissions (Unix/macOS)
sudo chown -R $(whoami) $(npm config get prefix)/{lib/node_modules,bin,share}

# Or use nvm (recommended)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install node
```

#### 5. Windows-Specific Issues
```powershell
# Run as Administrator
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Install using Chocolatey
choco install nodejs
choco install claude-flow

# Or use Scoop
scoop install nodejs
scoop install claude-flow
```

## 🔍 Verification Checklist

After setup, verify everything works:

- [ ] `claude-flow --version` shows version number
- [ ] `claude mcp list` shows claude-flow server
- [ ] `npx claude-flow@alpha init` creates project
- [ ] Agent spawning works without errors
- [ ] Hooks are enabled and functional
- [ ] Memory system is accessible
- [ ] Task tool integration works

## 📱 Platform-Specific Notes

### macOS
- Use Homebrew for Node.js: `brew install node`
- Claude CLI via: `brew install claude`
- May need Xcode command line tools

### Linux
- Use package manager: `apt install nodejs npm` or `yum install nodejs npm`
- Ensure PATH includes npm global bins
- May need build tools: `apt install build-essential`

### Windows
- Use official Node.js installer
- Install Claude via Windows installer
- Use PowerShell or WSL2 for best experience
- Consider using Windows Terminal

## 🎯 Next Steps

After completing setup:

1. **[Your First Swarm](./02-first-swarm.md)** - Learn multi-agent coordination
2. **[File Operations](./03-file-ops.md)** - Understand file management
3. **[GitHub Integration](./04-github.md)** - Connect with repositories

## 📚 Additional Resources

- **Installation Documentation**: [Setup Guide](../../learning/beginner/01-setup/README.md)
- **Configuration Reference**: [Config Docs](../../utilities/configs/README.md)
- **Troubleshooting**: [Common Issues](../../utilities/troubleshooting/README.md)
- **Community Support**: [Discord](https://discord.gg/claude-flow)

## 💬 Video Comments & Discussion

**Common Questions from Video:**

**Q: Can I use claude-flow without Claude Code CLI?**
A: Yes, but Claude Code's Task tool provides the best integration. You can use MCP tools directly with other LLM interfaces.

**Q: How much does it cost to run claude-flow?**
A: Claude-flow itself is free. You pay for the underlying LLM usage (Claude, OpenAI, etc.) based on your chosen provider.

**Q: Can I use this in production?**
A: Yes! Many teams use claude-flow for production development. Start with development/staging environments first.

**Q: Does this work with other LLMs besides Claude?**
A: Primary focus is Claude integration, but MCP servers can work with other LLM platforms.

**Q: How do I get help if I'm stuck?**
A: Join our Discord community, check GitHub issues, or review the troubleshooting guide.

---

**Video Transcript Available**: [Full transcript](./transcripts/01-setup-transcript.md)
**Closed Captions**: Available in multiple languages
**Download**: [Video file](./downloads/01-setup.mp4) (for offline viewing)

## 🎬 Related Videos

- **[02. Your First Swarm](./02-first-swarm.md)** - Next tutorial in series
- **[Advanced Setup](./advanced-01-enterprise-setup.md)** - Enterprise configuration
- **[Troubleshooting Guide](./troubleshooting-common-issues.md)** - Problem solving

---

**Ready to continue?** Move on to **[Your First Swarm](./02-first-swarm.md)** to learn multi-agent coordination!