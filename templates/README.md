# Claude Flow Novice Templates

Pre-configured project templates for common use cases.

## Available Templates

### 1. Basic Swarm (`basic-swarm/`)

**Purpose**: Standard swarm coordination setup

**Includes**:
- CLAUDE.md with swarm configuration
- coordination.md for agent coordination
- memory-bank.md for memory management
- .claude/settings.json with basic settings
- package.json with dependencies

**Use When**:
- Starting a new swarm coordination project
- Learning swarm basics
- Small to medium agent teams (2-7 agents)

**Quick Start**:
```bash
npx claude-flow-novice init --template basic-swarm
```

---

### 2. Fleet Manager (`fleet-manager/`)

**Purpose**: Enterprise-scale fleet management (1000+ agents)

**Includes**:
- Fleet-optimized CLAUDE.md
- Autoscaling configuration
- Multi-region deployment settings
- Performance monitoring setup
- Dashboard integration

**Use When**:
- Managing 1000+ agents
- Enterprise deployments
- Multi-region operations
- Requiring 99.9% availability

**Quick Start**:
```bash
npx claude-flow-novice init --template fleet-manager
cd my-project
npm run fleet:init
```

---

### 3. Event Bus (`event-bus/`)

**Purpose**: High-throughput event-driven systems (10,000+ events/sec)

**Includes**:
- Event bus configuration
- Event handler templates
- Pub/sub setup
- High-performance settings
- Monitoring configuration

**Use When**:
- Building event-driven architectures
- Processing high-volume events
- Real-time systems
- Microservices coordination

**Quick Start**:
```bash
npx claude-flow-novice init --template event-bus
cd my-project
npm run eventbus:init
```

---

### 4. Custom Agent (`custom-agent/`)

**Purpose**: Develop specialized custom agents

**Includes**:
- Agent definition templates
- Custom tool structure
- Agent configuration examples
- Testing utilities
- Integration guides

**Use When**:
- Creating domain-specific agents
- Extending framework capabilities
- Building reusable agent modules
- Specialized workflows

**Quick Start**:
```bash
npx claude-flow-novice init --template custom-agent
cd my-project
npm run create-agent
```

---

## Template Structure

Each template follows this structure:

```
template-name/
├── CLAUDE.md              # Template-specific configuration
├── package.json           # Dependencies and scripts
├── .claude/
│   └── settings.json      # Framework settings
├── coordination.md        # (optional) Coordination guidelines
└── memory-bank.md         # (optional) Memory management
```

## Using Templates

### Option 1: Interactive Init

```bash
npx claude-flow-novice init
# Follow prompts to select template
```

### Option 2: Direct Template Selection

```bash
npx claude-flow-novice init --template basic-swarm
npx claude-flow-novice init --template fleet-manager
npx claude-flow-novice init --template event-bus
npx claude-flow-novice init --template custom-agent
```

### Option 3: Copy Template Manually

```bash
cp -r node_modules/claude-flow-novice/templates/basic-swarm/* ./my-project/
cd my-project
npm install
```

## Customizing Templates

After initializing from a template:

1. **Update CLAUDE.md**: Adjust swarm configuration for your needs
2. **Modify package.json**: Add project-specific dependencies
3. **Configure settings.json**: Fine-tune framework settings
4. **Add custom agents**: Create specialized agents in `.claude/agents/`

## Template Development

To create your own template:

1. Create directory in `templates/`
2. Add required files (CLAUDE.md, package.json, .claude/settings.json)
3. Test with `npx claude-flow-novice init --template your-template`
4. Submit PR to share with community

## Support

- Documentation: See main README.md
- Examples: Check `examples/` directory
- Issues: https://github.com/masharratt/claude-flow-novice/issues
