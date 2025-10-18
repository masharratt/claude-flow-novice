# Frontend Agent Team

Specialized agents for modern frontend development with MCP integrations.

## Agents

### 🎨 UI Designer
**Capabilities:**
- Component design using shadcn/ui specs
- Responsive layout generation
- Accessibility validation (WCAG AA/AAA)
- Design token systems

**MCP Integration:**
- `mcp__shadcn__getComponents` - List available components
- `mcp__shadcn__getComponent` - Get component specifications

**Usage:**
```typescript
import { UIDesigner } from './ui-designer';

const designer = new UIDesigner({
  framework: 'react',
  designSystem: 'shadcn',
  accessibilityLevel: 'wcag-aa'
});

const component = await designer.designComponent('dialog', requirements);
```

### 🧪 Interaction Tester
**Capabilities:**
- Browser automation with Playwright
- User flow testing
- Visual regression testing
- Accessibility testing

**MCP Integration:**
- `mcp__playwright__browser_navigate` - Navigate to URLs
- `mcp__playwright__browser_click` - Click elements
- `mcp__playwright__browser_snapshot` - Capture accessibility snapshots
- `mcp__playwright__browser_take_screenshot` - Visual testing

**Usage:**
```typescript
import { InteractionTester } from './interaction-tester';

const tester = new InteractionTester({
  browsers: ['chromium', 'firefox'],
  screenshotOnFailure: true
});

const results = await tester.testUserFlow('checkout', steps);
```

### 🏗️ State Architect
**Capabilities:**
- State management architecture (Zustand, Redux, etc.)
- Data fetching strategies (React Query, SWR)
- Sequential planning with MCP
- State synchronization design

**MCP Integration:**
- `mcp__sequential-thinking` - Step-by-step state planning

**Usage:**
```typescript
import { StateArchitect } from './state-architect';

const architect = new StateArchitect({
  stateLibrary: 'zustand',
  dataFetchingLibrary: 'react-query'
});

const stateDesign = await architect.designStateArchitecture(requirements);
```

## Team Coordination

### Spawning Pattern (via Claude Code Task tool)

**Simple Project (2 agents):**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 2,
  strategy: "balanced"
})

Task("UI Designer", "Design landing page components using shadcn", "coder")
Task("Interaction Tester", "Test user registration flow", "tester")
```

**Medium Project (3 agents):**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "mesh",
  maxAgents: 3,
  strategy: "balanced"
})

Task("State Architect", "Design cart state management with Zustand", "architect")
Task("UI Designer", "Create product card components with shadcn", "coder")
Task("Interaction Tester", "Test add-to-cart flow with Playwright", "tester")
```

**Complex Project (5+ agents):**
```javascript
mcp__claude-flow-novice__swarm_init({
  topology: "hierarchical",
  maxAgents: 5,
  strategy: "adaptive"
})

Task("State Architect", "Design full app state architecture", "architect")
Task("UI Designer 1", "Dashboard components", "coder")
Task("UI Designer 2", "Settings page components", "coder")
Task("Tester 1", "Dashboard user flows", "tester")
Task("Tester 2", "Settings and profile flows", "tester")
```

## MCP Server Configuration

Add to `.claude/settings.json`:
```json
{
  "mcpServers": {
    "sequential-thinking": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-sequential-thinking@latest"],
      "type": "stdio"
    },
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@latest"],
      "type": "stdio"
    },
    "shadcn": {
      "command": "npx",
      "args": ["@shadcn/mcp@latest"],
      "type": "stdio"
    }
  },
  "permissions": {
    "autoApprove": {
      "mcp__sequential-thinking": ["*"],
      "mcp__playwright": ["*"],
      "mcp__shadcn": ["*"]
    }
  }
}
```

## Agent Capabilities Matrix

| Agent | MCP Tools | Expertise | Best For |
|-------|-----------|-----------|----------|
| **UI Designer** | shadcn | React, Tailwind, a11y | Component design, layouts |
| **Interaction Tester** | Playwright | E2E testing, visual testing | User flows, regressions |
| **State Architect** | Sequential Thinking | Zustand, React Query | State planning, data flow |

## Integration Examples

### Full Feature Implementation
```typescript
import { FrontendTeam } from './index';

const pattern = FrontendTeam.getSpawnPattern('medium');
// Returns: { agents: [...], topology: 'mesh', maxAgents: 3 }

const coordination = await FrontendTeam.coordinateImplementation({
  feature: 'shopping-cart',
  requirements: { /* ... */ }
});
```

### Sequential Coordination
1. **State Architect** designs state management
2. **UI Designer** creates components with state hooks
3. **Interaction Tester** validates user flows

All agents coordinate via SwarmMemory and MCP tools.
