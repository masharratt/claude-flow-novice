# Configuration Guide 🔧

**Setting Up and Customizing Claude Flow Novice**

This guide helps you configure Claude Flow Novice for your specific needs. From basic setup to advanced customization, everything is explained in simple terms for beginners.

---

## 🚀 Quick Configuration

### The Basics (Most Users Need Only This)

For most users, Claude Flow Novice works out of the box! But if you want to customize:

```bash
# Create a basic config file
claude-flow-novice init my-project
cd my-project

# View current configuration
claude-flow-novice config show

# Change a simple setting
claude-flow-novice config set maxAgents 5
```

That's it! 🎉 You're configured and ready to go.

---

## 📁 Configuration Files

### Main Configuration File
**File:** `claude-flow.config.json` in your project root

This is the main configuration file that controls how Claude Flow Novice works.

### Basic Configuration Structure
```json
{
  "name": "my-project",
  "version": "1.0.0",
  "claude-flow": {
    "maxAgents": 10,
    "defaultStrategy": "development",
    "redis": {
      "host": "localhost",
      "port": 6379
    }
  }
}
```

### Environment Variables File
**File:** `.env.local` in your project root

Store sensitive information like API keys here. **Never commit this file to Git!**

```bash
# API Keys (keep these secret!)
ANTHROPIC_API_KEY=your-secret-key-here
REDIS_PASSWORD=your-redis-password

# Development settings
DEBUG=true
LOG_LEVEL=info
```

---

## ⚙️ Basic Configuration Options

### Project Settings

#### Project Name and Version
```json
{
  "name": "my-awesome-project",
  "version": "1.0.0",
  "description": "A project built with Claude Flow Novice"
}
```

#### Agent Configuration
```json
{
  "claude-flow": {
    "maxAgents": 10,           // Maximum number of AI agents
    "defaultStrategy": "development",  // How agents work together
    "defaultMode": "mesh",     // Agent coordination pattern
    "timeout": 3600           // Maximum time in seconds
  }
}
```

**Agent Limits:**
- `maxAgents`: 1-20 (start with 5-10 for beginners)
- Larger numbers = more work but slower performance

---

## 🔧 Redis Configuration

### Why Redis?
Redis saves your work between sessions. If your computer restarts or the tool crashes, you can continue where you left off.

### Basic Redis Setup
```json
{
  "claude-flow": {
    "redis": {
      "host": "localhost",
      "port": 6379,
      "db": 0,
      "password": null,
      "timeout": 5000
    }
  }
}
```

### Redis Options

| Option | Description | Default | Good For |
|--------|-------------|---------|----------|
| `host` | Redis server address | `localhost` | Local development |
| `port` | Redis server port | `6379` | Standard Redis |
| `db` | Database number | `0` | Separate projects |
| `password` | Redis password | `null` | Secured Redis |
| `timeout` | Connection timeout | `5000` | Slow connections |

### Redis Setup Options

#### Option 1: Local Redis (Easiest)
```bash
# Install Redis locally
# macOS: brew install redis
# Ubuntu: sudo apt install redis-server
# Windows: Download from redis.io

# Start Redis
redis-server

# Your config is ready!
```

#### Option 2: Docker Redis (Recommended)
```bash
# Run Redis with Docker
docker run -d -p 6379:6379 --name redis redis:latest

# Redis is running and ready!
```

#### Option 3: No Redis (Beginner Mode)
```bash
# Run without persistence (work lost on restart)
claude-flow-novice swarm "Build my app" --no-persistence
```

### Redis Troubleshooting

#### Redis Not Running?
```bash
# Check if Redis is running
redis-cli ping
# Should return: PONG

# If not running, start it:
redis-server
```

#### Redis Connection Issues?
```json
{
  "claude-flow": {
    "redis": {
      "host": "localhost",
      "port": 6379,
      "connectTimeout": 10000,
      "retryDelayOnFailover": 100
    }
  }
}
```

---

## 🤖 Agent Configuration

### Understanding Agent Types

Different agents have different skills:

| Agent Type | What They Do | When to Use |
|------------|--------------|-------------|
| `backend-dev` | Builds APIs, databases | Backend projects |
| `frontend-dev` | Creates user interfaces | Web/mobile apps |
| `tester` | Tests code quality | All projects |
| `security-specialist` | Adds security features | Apps with user data |
| `api-docs` | Writes documentation | API projects |
| `researcher` | Gathers information | Research tasks |
| `designer` | Creates UI/UX design | Visual projects |

### Basic Agent Setup
```json
{
  "claude-flow": {
    "agents": {
      "backend-dev": {
        "enabled": true,
        "maxInstances": 3
      },
      "frontend-dev": {
        "enabled": true,
        "maxInstances": 2
      },
      "tester": {
        "enabled": true,
        "maxInstances": 1
      }
    }
  }
}
```

### Project-Specific Agent Configurations

#### Web Application
```json
{
  "claude-flow": {
    "agents": {
      "backend-dev": { "enabled": true, "maxInstances": 2 },
      "frontend-dev": { "enabled": true, "maxInstances": 2 },
      "tester": { "enabled": true, "maxInstances": 1 },
      "security-specialist": { "enabled": true, "maxInstances": 1 }
    }
  }
}
```

#### API Only
```json
{
  "claude-flow": {
    "agents": {
      "backend-dev": { "enabled": true, "maxInstances": 3 },
      "api-docs": { "enabled": true, "maxInstances": 1 },
      "tester": { "enabled": true, "maxInstances": 1 },
      "security-specialist": { "enabled": true, "maxInstances": 1 }
    }
  }
}
```

#### Research Project
```json
{
  "claude-flow": {
    "agents": {
      "researcher": { "enabled": true, "maxInstances": 2 },
      "backend-dev": { "enabled": false },
      "frontend-dev": { "enabled": false }
    }
  }
}
```

### Agent Capabilities
You can specify what skills each agent should have:

```json
{
  "claude-flow": {
    "agents": {
      "backend-dev": {
        "enabled": true,
        "maxInstances": 2,
        "capabilities": ["api", "database", "authentication"],
        "preferences": {
          "framework": "express",
          "database": "postgresql"
        }
      }
    }
  }
}
```

---

## 📊 Strategy Configuration

### Understanding Strategies

Strategies determine how agents work together:

| Strategy | Best For | Description |
|----------|----------|-------------|
| `development` | Building applications | Standard development workflow |
| `research` | Research projects | Information gathering and analysis |
| `testing` | Quality assurance | Testing and validation |
| `optimization` | Performance | Improving existing code |
| `refactoring` | Code cleanup | Restructuring code |

### Strategy Configuration
```json
{
  "claude-flow": {
    "defaultStrategy": "development",
    "strategies": {
      "development": {
        "phases": ["planning", "implementation", "testing", "validation"],
        "agents": ["backend-dev", "frontend-dev", "tester"]
      },
      "research": {
        "phases": ["investigation", "analysis", "reporting"],
        "agents": ["researcher"]
      }
    }
  }
}
```

### Mode Configuration

Modes define how agents coordinate:

| Mode | Description | When to Use |
|------|-------------|-------------|
| `mesh` | All agents coordinate equally | Small teams (2-7 agents) |
| `hierarchical` | Coordinator with teams | Large teams (8+ agents) |
| `sequential` | Agents work one after another | Simple workflows |
| `parallel` | Agents work independently | Independent tasks |

```json
{
  "claude-flow": {
    "defaultMode": "mesh",
    "modes": {
      "mesh": {
        "maxAgents": 7,
        "coordination": "peer-to-peer"
      },
      "hierarchical": {
        "maxAgents": 50,
        "coordination": "coordinator-led"
      }
    }
  }
}
```

---

## 🔌 Monitoring Configuration

### Basic Monitoring Setup
```json
{
  "claude-flow": {
    "monitoring": {
      "enabled": true,
      "port": 3001,
      "refreshInterval": 2000,
      "detailedMetrics": false
    }
  }
}
```

### Advanced Monitoring
```json
{
  "claude-flow": {
    "monitoring": {
      "enabled": true,
      "port": 3001,
      "refreshInterval": 1000,
      "detailedMetrics": true,
      "alerts": {
        "enabled": true,
        "email": "admin@example.com",
        "thresholds": {
          "errorRate": 0.1,
          "responseTime": 5000
        }
      },
      "persistence": {
        "enabled": true,
        "retentionDays": 30
      }
    }
  }
}
```

---

## 🌍 Environment Configuration

### Development Environment
```json
{
  "claude-flow": {
    "environment": "development",
    "debug": true,
    "hotReload": true,
    "verboseLogging": true
  }
}
```

### Production Environment
```json
{
  "claude-flow": {
    "environment": "production",
    "debug": false,
    "hotReload": false,
    "verboseLogging": false,
    "performance": {
      "enabled": true,
      "minify": true,
      "compress": true
    }
  }
}
```

### Environment Variables

#### Required Variables
```bash
# Basic setup
NODE_ENV=development
LOG_LEVEL=info

# Redis (optional but recommended)
REDIS_URL=redis://localhost:6379
```

#### Optional Variables
```bash
# Performance
NODE_OPTIONS="--max-old-space-size=4096"
MAX_AGENTS=10

# API Keys (if using external services)
ANTHROPIC_API_KEY=your-key
OPENAI_API_KEY=your-key

# Development
DEBUG=claude-flow:*
VERBOSE=true
```

---

## 🎯 Performance Configuration

### Basic Performance Settings
```json
{
  "claude-flow": {
    "performance": {
      "maxMemory": "2GB",
      "maxCpu": 80,
      "timeout": 3600,
      "retryAttempts": 3
    }
  }
}
```

### High Performance Configuration
```json
{
  "claude-flow": {
    "performance": {
      "maxMemory": "4GB",
      "maxCpu": 90,
      "timeout": 7200,
      "retryAttempts": 5,
      "caching": {
        "enabled": true,
        "ttl": 3600
      },
      "parallelism": {
        "enabled": true,
        "maxConcurrent": 10
      }
    }
  }
}
```

### Memory Management
```json
{
  "claude-flow": {
    "memory": {
      "limit": "2GB",
      "cleanup": true,
      "interval": 300000,
      "threshold": 0.8
    }
  }
}
```

---

## 🔒 Security Configuration

### Basic Security Setup
```json
{
  "claude-flow": {
    "security": {
      "enabled": true,
      "validateInputs": true,
      "sanitizeOutput": true,
      "rateLimit": {
        "enabled": true,
        "max": 100,
        "window": 3600000
      }
    }
  }
}
```

### Advanced Security
```json
{
  "claude-flow": {
    "security": {
      "enabled": true,
      "validateInputs": true,
      "sanitizeOutput": true,
      "encryption": {
        "enabled": true,
        "algorithm": "AES-256"
      },
      "authentication": {
        "enabled": true,
        "method": "jwt",
        "secret": "your-secret-key"
      },
      "rateLimit": {
        "enabled": true,
        "max": 100,
        "window": 3600000,
        "blockDuration": 900000
      }
    }
  }
}
```

---

## 📁 Project Templates

### Creating Custom Templates

#### Save Current Configuration
```bash
# Save as template
claude-flow-novice config save --name my-web-template

# Save with description
claude-flow-novice config save --name api-template --description "API project setup"
```

#### Using Templates
```bash
# List available templates
claude-flow-novice config list-templates

# Use template for new project
claude-flow-novice init new-project --template my-web-template

# Load template into existing project
claude-flow-novice config load --name my-web-template
```

### Predefined Templates

#### Web Application Template
```json
{
  "name": "web-app-template",
  "claude-flow": {
    "maxAgents": 8,
    "defaultStrategy": "development",
    "defaultMode": "mesh",
    "agents": {
      "backend-dev": { "enabled": true, "maxInstances": 3 },
      "frontend-dev": { "enabled": true, "maxInstances": 3 },
      "tester": { "enabled": true, "maxInstances": 1 },
      "security-specialist": { "enabled": true, "maxInstances": 1 }
    },
    "features": ["authentication", "api", "database", "ui"]
  }
}
```

#### API Template
```json
{
  "name": "api-template",
  "claude-flow": {
    "maxAgents": 6,
    "defaultStrategy": "development",
    "agents": {
      "backend-dev": { "enabled": true, "maxInstances": 3 },
      "api-docs": { "enabled": true, "maxInstances": 1 },
      "tester": { "enabled": true, "maxInstances": 1 },
      "security-specialist": { "enabled": true, "maxInstances": 1 }
    },
    "features": ["authentication", "api", "database", "documentation"]
  }
}
```

---

## 🛠️ Configuration Commands

### Viewing Configuration
```bash
# Show all configuration
claude-flow-novice config show

# Show specific section
claude-flow-novice config show --section agents

# Show as JSON
claude-flow-novice config show --format json
```

### Setting Configuration
```bash
# Set simple values
claude-flow-novice config set maxAgents 5
claude-flow-novice config set defaultStrategy development

# Set nested values
claude-flow-novice config set redis.host localhost
claude-flow-novice config set agents.backend-dev.maxInstances 3
```

### Getting Configuration
```bash
# Get specific value
claude-flow-novice config get maxAgents

# Get nested value
claude-flow-novice config get redis.host
```

### Resetting Configuration
```bash
# Reset all configuration
claude-flow-novice config reset

# Reset specific section
claude-flow-novice config reset agents

# Reset to defaults
claude-flow-novice config reset --defaults
```

---

## 🔧 Advanced Configuration

### Custom Agent Types
```json
{
  "claude-flow": {
    "customAgents": {
      "mobile-dev": {
        "capabilities": ["react-native", "flutter", "ios", "android"],
        "tools": ["xcode", "android-studio", "simulator"],
        "preferences": {
          "framework": "react-native",
          "platform": "both"
        }
      },
      "data-scientist": {
        "capabilities": ["python", "machine-learning", "data-analysis"],
        "tools": ["jupyter", "pandas", "scikit-learn"],
        "preferences": {
          "language": "python",
          "framework": "tensorflow"
        }
      }
    }
  }
}
```

### Custom Strategies
```json
{
  "claude-flow": {
    "customStrategies": {
      "mobile-development": {
        "phases": ["planning", "ui-design", "development", "testing", "deployment"],
        "agents": ["mobile-dev", "designer", "tester"],
        "checkpoints": ["design-approved", "core-features", "testing-complete"]
      }
    }
  }
}
```

### Plugin Configuration
```json
{
  "claude-flow": {
    "plugins": {
      "enabled": ["code-quality", "security-scan", "performance-monitor"],
      "config": {
        "code-quality": {
          "threshold": 8.0,
          "rules": ["complexity", "maintainability", "coverage"]
        },
        "security-scan": {
          "level": "standard",
          "exclude": ["test-files"]
        }
      }
    }
  }
}
```

---

## 📊 Configuration Validation

### Validate Your Configuration
```bash
# Check configuration validity
claude-flow-novice config validate

# Validate specific section
claude-flow-novice config validate --section agents

# Detailed validation report
claude-flow-novice config validate --detailed
```

### Common Validation Issues

#### Invalid Agent Configuration
```json
// ❌ Wrong
{
  "agents": {
    "backend-dev": "enabled"
  }
}

// ✅ Correct
{
  "agents": {
    "backend-dev": {
      "enabled": true,
      "maxInstances": 2
    }
  }
}
```

#### Invalid Redis Configuration
```json
// ❌ Wrong
{
  "redis": {
    "port": "6379"  // Should be number, not string
  }
}

// ✅ Correct
{
  "redis": {
    "port": 6379
  }
}
```

---

## 💡 Configuration Best Practices

### 1. Start Simple
Begin with basic configuration and add complexity as needed:
```json
{
  "claude-flow": {
    "maxAgents": 5,
    "defaultStrategy": "development"
  }
}
```

### 2. Use Environment Variables for Secrets
Never put API keys in your main config file:
```bash
# ❌ Bad - in config.json
{
  "apiKey": "sk-1234567890"
}

# ✅ Good - in .env.local
ANTHROPIC_API_KEY=sk-1234567890
```

### 3. Save Working Configurations
When you find a configuration that works well, save it:
```bash
claude-flow-novice config save --name working-setup
```

### 4. Test Configuration Changes
Always validate after making changes:
```bash
claude-flow-novice config validate
claude-flow-novice doctor
```

### 5. Use Appropriate Agent Limits
Start with fewer agents and increase as needed:
- Small projects: 3-5 agents
- Medium projects: 5-10 agents
- Large projects: 10+ agents

---

## 🆘 Troubleshooting Configuration

### Common Issues

#### Configuration Not Found
```bash
Error: Configuration file not found
Solution: Run 'claude-flow-novice init' or create claude-flow.config.json
```

#### Invalid Configuration
```bash
Error: Invalid configuration format
Solution: Run 'claude-flow-novice config validate' to check for issues
```

#### Redis Connection Failed
```bash
Error: Redis connection failed
Solution: Check Redis is running and connection settings are correct
```

#### Agent Not Found
```bash
Error: Unknown agent type 'custom-agent'
Solution: Define custom agents in configuration or use built-in agent types
```

### Getting Help
```bash
# Get help with configuration
claude-flow-novice config --help

# Check system health
claude-flow-novice doctor

# Show current configuration
claude-flow-novice config show
```

---

<div align="center">

**Configuration complete! 🎉**

[← API Reference](./API.md) • [Troubleshooting →](./TROUBLESHOOTING.md) • [Examples ←](./EXAMPLES.md)

</div>