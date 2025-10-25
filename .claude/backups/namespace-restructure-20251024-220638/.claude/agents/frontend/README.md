# Frontend Agent Team

Specialized agents for modern frontend development with MCP integration.

---

## Agent Overview

### 🎨 UI Designer
**File**: `ui-designer.md`
**Format**: MINIMAL (200-400 lines)
**MCP**: shadcn
**Focus**: Component design, layouts, accessibility

**Format Rationale**:
- UI design is COMPLEX (creative, open-ended, requires design reasoning)
- Minimal format avoids over-constraining design solutions
- Trusts AI to make contextual design decisions
- +31% quality improvement vs Code-Heavy for complex tasks

**Capabilities**:
- React/Vue/Svelte component architecture
- Responsive design with Tailwind CSS
- Accessibility (WCAG 2.1 AA compliance)
- Shadcn UI component integration
- Design system implementation

---

### 🧪 Interaction Tester
**File**: `interaction-tester.md`
**Format**: METADATA (400-700 lines)
**MCP**: Playwright
**Focus**: E2E testing, visual regression, a11y validation

**Format Rationale**:
- E2E testing is MEDIUM complexity (structured workflows with clear steps)
- Metadata format provides test strategy scaffolding
- Balances guidance with flexibility for test scenarios
- Structured YAML for test patterns and requirements

**Capabilities**:
- Playwright E2E test automation
- Visual regression testing with screenshots
- Accessibility validation (axe-core)
- Cross-browser testing (Chrome, Firefox, Safari)
- CI/CD integration for test pipelines

---

### 🏗️ State Architect
**File**: `state-architect.md`
**Format**: MINIMAL (200-400 lines)
**MCP**: Sequential Thinking
**Focus**: State management, data fetching, architecture

**Format Rationale**:
- State architecture is COMPLEX (requires strategic thinking, trade-off analysis)
- Minimal format prevents over-specification of solutions
- Allows context-specific state management decisions
- Sequential Thinking MCP enables deep reasoning

**Capabilities**:
- State management design (Redux, Zustand, Context API, Jotai)
- Data fetching strategies (React Query, SWR, RTK Query)
- Architectural patterns (Flux, CQRS, Event Sourcing)
- Performance optimization (memoization, selectors)
- Integration with backend APIs

---

## Agent Capabilities Matrix

| Capability | UI Designer | Tester | Architect |
|------------|------------|--------|-----------|
| **Component Design** | ✅ Expert | ❌ | 🟡 Review |
| **State Management** | 🟡 Hooks | ❌ | ✅ Expert |
| **E2E Testing** | ❌ | ✅ Expert | 🟡 Strategy |
| **Visual Regression** | 🟡 Validate | ✅ Expert | ❌ |
| **Accessibility** | ✅ Expert | ✅ Validate | 🟡 Standards |
| **Performance Optimization** | 🟡 Implement | 🟡 Validate | ✅ Expert |
| **API Integration** | 🟡 Consume | ✅ Test | ✅ Design |
| **Architecture Design** | ❌ | ❌ | ✅ Expert |
| **CI/CD Integration** | ❌ | ✅ Expert | 🟡 Strategy |

Legend: ✅ Expert | 🟡 Supporting | ❌ Not responsible

---

## Team Coordination Patterns

### 🚨 CRITICAL: ALWAYS Initialize Swarm BEFORE Spawning Agents

**MANDATORY PATTERN:**
```javascript
[Single Message]:
  // Step 1: ALWAYS initialize swarm first
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",          // mesh for 2-7, hierarchical for 8+
    maxAgents: 3,              // match your actual agent count
    strategy: "balanced"       // ensures coordination and consistency
  })

  // Step 2: Spawn ALL agents concurrently
  Task("UI Designer", "Design responsive dashboard using shadcn", "coder")
  Task("Interaction Tester", "Test checkout flow with screenshots", "tester")
  Task("State Architect", "Design cart state with Zustand", "architect")
```

**WHY THIS MATTERS:**
- ✅ Prevents inconsistency: Without swarm, 3 agents fixing the same bug will use 3 different approaches
- ✅ Ensures coordination: Agents share findings via SwarmMemory
- ✅ Byzantine consensus: Final validation ensures all agents agree

---

### Simple Project (2-3 agents)

```javascript
[Single Message]:
  // Initialize swarm topology
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 2,
    strategy: "balanced"
  })

  // Spawn agents concurrently
  Task("UI Designer", `
    Design landing page components using shadcn:
    - Hero section with responsive layout
    - Feature cards with hover states
    - Contact form with validation UI
    - Accessibility: WCAG 2.1 AA
    - Run post-edit hook after each file
  `, "coder")

  Task("Interaction Tester", `
    Test user registration flow:
    - E2E test with Playwright
    - Visual regression screenshots
    - Accessibility validation (axe-core)
    - Cross-browser: Chrome, Firefox
    - Run post-edit hook after test creation
  `, "tester")
```

**Topology Rationale**: Mesh (peer-to-peer) for 2 agents ensures direct coordination

---

### Medium Project (3-5 agents)

```javascript
[Single Message]:
  // Initialize swarm topology
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // Spawn agents concurrently
  Task("State Architect", `
    Design cart state management:
    - Evaluate Zustand vs Redux vs Context API
    - Design cart operations (add, remove, update quantity)
    - Optimistic updates strategy
    - Persistence strategy (localStorage vs server sync)
    - Share design via SwarmMemory
  `, "architect")

  Task("UI Designer", `
    Design product card components:
    - Product grid with responsive layout
    - Product detail modal
    - Add to cart interaction
    - Price display and quantity selector
    - Integrate with cart state from architect
    - Run post-edit hook after each component
  `, "coder")

  Task("Interaction Tester", `
    Test add-to-cart flow:
    - E2E test: browse → select → add → checkout
    - Visual regression for cart UI states
    - Test cart persistence across sessions
    - Performance: measure interaction delays
    - Run post-edit hook after test suite
  `, "tester")
```

**Topology Rationale**: Mesh for 3 agents enables full peer collaboration

---

### Complex Project (6-8 agents)

```javascript
[Single Message]:
  // Initialize hierarchical swarm for 8 agents
  mcp__claude-flow-novice__swarm_init({
    topology: "hierarchical",
    maxAgents: 8,
    strategy: "adaptive"
  })

  // Spawn all agents concurrently
  Task("State Architect", `
    Design full app state architecture:
    - Global state (auth, user profile, notifications)
    - Feature state (dashboard, settings, analytics)
    - Data fetching strategy (React Query vs SWR)
    - Cache invalidation and optimistic updates
    - State synchronization across tabs
    - Share architecture via SwarmMemory
  `, "architect")

  Task("UI Designer - Dashboard", `
    Design dashboard components:
    - Dashboard layout with widget grid
    - Chart components (line, bar, pie)
    - Real-time data display
    - Responsive layout for mobile/tablet
    - Dark mode support
    - Run post-edit hook after each component
  `, "coder")

  Task("UI Designer - Settings", `
    Design settings components:
    - Settings navigation sidebar
    - Form components (profile, preferences, billing)
    - Validation UI with error states
    - Success/error toast notifications
    - Run post-edit hook after each component
  `, "coder")

  Task("Tester - Dashboard Flows", `
    Test dashboard user flows:
    - E2E: login → view dashboard → interact with widgets
    - Visual regression for all dashboard states
    - Performance: measure chart render times
    - Accessibility validation
    - Run post-edit hook after test suite
  `, "tester")

  Task("Tester - Settings Flows", `
    Test settings user flows:
    - E2E: navigate settings → update profile → save
    - Form validation testing
    - Error state handling
    - Cross-browser compatibility
    - Run post-edit hook after test suite
  `, "tester")

  Task("Performance Analyzer", `
    Analyze frontend performance:
    - Bundle size analysis
    - Lighthouse performance audit
    - Core Web Vitals measurement
    - Identify optimization opportunities
    - Share findings via SwarmMemory
  `, "perf-analyzer")

  Task("Security Specialist", `
    Frontend security review:
    - XSS vulnerability analysis
    - CSRF protection validation
    - Dependency security audit
    - Authentication token handling review
    - Share findings via SwarmMemory
  `, "security-specialist")

  Task("Code Reviewer", `
    Comprehensive code review:
    - Review all component implementations
    - Validate state architecture integration
    - Check test coverage completeness
    - Ensure accessibility standards
    - Final Byzantine consensus validation
  `, "reviewer")
```

**Topology Rationale**: Hierarchical for 8 agents enables coordinator-led structure

---

## MCP Configuration

Add to `~/.config/claude/settings.json`:

```json
{
  "mcpServers": {
    "claude-flow-novice": {
      "command": "npx",
      "args": ["claude-flow-novice", "mcp", "start"],
      "type": "stdio"
    },
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
  }
}
```

**MCP Roles**:
- **claude-flow-novice**: Swarm coordination, memory management, Byzantine consensus
- **sequential-thinking**: Deep reasoning for State Architect
- **playwright**: E2E testing automation for Tester
- **shadcn**: Component library integration for UI Designer

---

## Workflow Examples

### Feature Implementation Flow (3 agents)

```javascript
[Single Message]:
  // 1. Initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  // 2. Spawn agents sequentially by dependency
  Task("State Architect", `
    Design shopping cart state management:
    - Choose state library (Zustand recommended)
    - Define cart operations and selectors
    - Design persistence strategy
    - Share design document via SwarmMemory: "frontend/cart/design"
  `, "architect")

  Task("UI Designer", `
    Create cart components with state hooks:
    - Retrieve design from SwarmMemory: "frontend/cart/design"
    - Implement CartButton, CartDrawer, CartItem components
    - Integrate Zustand hooks from architect's design
    - Responsive layout and dark mode support
    - Run post-edit hook after each component file
  `, "coder")

  Task("Interaction Tester", `
    Validate cart user flows:
    - E2E tests for add/remove/update cart operations
    - Test cart persistence across page reloads
    - Visual regression for cart drawer states
    - Accessibility validation
    - Run post-edit hook after test file
  `, "tester")
```

**Execution Flow**:
1. State Architect designs → stores in SwarmMemory
2. UI Designer retrieves design → implements → runs post-edit hooks
3. Tester validates implementation → runs post-edit hooks
4. Byzantine consensus validation ensures all agents agree

---

### Bug Fix Flow (2 agents)

```javascript
[Single Message]:
  // 1. Initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 2,
    strategy: "balanced"
  })

  // 2. Spawn agents concurrently
  Task("Interaction Tester", `
    Reproduce cart quantity bug:
    - Create failing E2E test demonstrating the issue
    - Visual regression to capture incorrect state
    - Store test case in SwarmMemory: "frontend/bug/cart-quantity"
    - Run post-edit hook after test file
  `, "tester")

  Task("UI Designer", `
    Fix cart quantity component:
    - Review bug test from SwarmMemory: "frontend/bug/cart-quantity"
    - Fix quantity increment/decrement logic
    - Update component with proper state handling
    - Run post-edit hook after fix
    - Coordinate with tester for regression test
  `, "coder")

  // 3. Tester validates fix (sequential dependency)
  Task("Interaction Tester", `
    Verify cart quantity fix:
    - Run regression test to confirm fix
    - Visual regression to validate correct state
    - Add edge case tests (min/max quantity)
    - Run post-edit hook after test updates
  `, "tester")
```

**Execution Flow**:
1. Tester reproduces bug → stores in SwarmMemory
2. UI Designer fixes bug → runs post-edit hook
3. Tester validates fix → runs post-edit hook
4. Byzantine consensus confirms fix quality

---

### Performance Optimization Flow (4 agents)

```javascript
[Single Message]:
  // 1. Initialize swarm
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 4,
    strategy: "adaptive"
  })

  // 2. Spawn all agents concurrently
  Task("Performance Analyzer", `
    Analyze dashboard performance:
    - Lighthouse audit for performance score
    - Measure Core Web Vitals (LCP, FID, CLS)
    - Profile component render times
    - Identify optimization opportunities
    - Store findings in SwarmMemory: "frontend/perf/analysis"
  `, "perf-analyzer")

  Task("State Architect", `
    Optimize data fetching:
    - Review perf analysis from SwarmMemory: "frontend/perf/analysis"
    - Design lazy loading strategy for dashboard widgets
    - Implement memoization for expensive selectors
    - Optimize React Query cache configuration
    - Run post-edit hook after changes
  `, "architect")

  Task("UI Designer", `
    Implement lazy loading:
    - Review perf analysis from SwarmMemory: "frontend/perf/analysis"
    - Implement code splitting for dashboard routes
    - Add React.lazy() for heavy components
    - Optimize image loading with next/image
    - Run post-edit hook after each file
  `, "coder")

  Task("Interaction Tester", `
    Validate performance improvements:
    - E2E tests measuring page load times
    - Visual regression to ensure no UI breakage
    - Lighthouse CI integration for performance gates
    - Compare before/after metrics
    - Run post-edit hook after test updates
  `, "tester")
```

**Execution Flow**:
1. Performance Analyzer identifies issues → SwarmMemory
2. State Architect + UI Designer implement optimizations in parallel → post-edit hooks
3. Tester validates improvements → post-edit hook
4. Byzantine consensus validates performance gains

---

## Post-Edit Hook Requirements

**MANDATORY**: After EVERY file edit, agents MUST run:

```bash
npx enhanced-hooks post-edit [FILE_PATH] --memory-key "frontend/[agent]/[step]" --structured
```

**Enhanced Hook Validation**:
- 🧪 **TDD Compliance**: Validates test-first development
- 🔒 **Security Analysis**: Detects XSS, eval(), hardcoded credentials
- 🎨 **Formatting**: Prettier analysis with diff preview
- 📊 **Coverage Analysis**: Test coverage with 80% default threshold
- 🤖 **Actionable Recommendations**: Specific improvement steps
- 💾 **Memory Coordination**: Stores results for cross-agent collaboration

**Example Usage**:
```bash
# After UI Designer edits Button.tsx
npx enhanced-hooks post-edit src/components/Button.tsx \
  --memory-key "frontend/ui-designer/button" \
  --structured

# After Tester creates E2E test
npx enhanced-hooks post-edit tests/e2e/cart.spec.ts \
  --memory-key "frontend/tester/cart-e2e" \
  --minimum-coverage 90 \
  --structured

# After State Architect updates store
npx enhanced-hooks post-edit src/store/cart.ts \
  --memory-key "frontend/architect/cart-store" \
  --structured
```

---

## Success Metrics

### Per-Agent Metrics

**UI Designer**:
- [ ] All components have TypeScript types
- [ ] Accessibility score ≥95 (Lighthouse)
- [ ] Responsive design (mobile, tablet, desktop)
- [ ] Post-edit hooks pass for all files

**Interaction Tester**:
- [ ] E2E test coverage ≥70% of user flows
- [ ] Visual regression baseline established
- [ ] Accessibility validation integrated
- [ ] Post-edit hooks pass for all test files

**State Architect**:
- [ ] State architecture documented in ADRs
- [ ] Performance benchmarks established
- [ ] Data fetching strategy implemented
- [ ] Post-edit hooks pass for state files

### Team Metrics

- [ ] Byzantine consensus ≥90% agreement
- [ ] All agents coordinated via SwarmMemory
- [ ] Swarm initialized before agent spawning
- [ ] All file edits followed by post-edit hooks
- [ ] No solo work on multi-step tasks

---

## Common Pitfalls to Avoid

### ❌ DON'T: Skip Swarm Initialization

```javascript
// BAD - Agents work independently
Task("Agent 1", "Fix issue", "coder")
Task("Agent 2", "Fix issue", "coder")
Task("Agent 3", "Fix issue", "coder")

// Result: 3 different solutions, no coordination
```

### ✅ DO: Always Initialize Swarm First

```javascript
// GOOD - Agents coordinate
[Single Message]:
  mcp__claude-flow-novice__swarm_init({
    topology: "mesh",
    maxAgents: 3,
    strategy: "balanced"
  })

  Task("Agent 1", "Fix issue", "coder")
  Task("Agent 2", "Fix issue", "coder")
  Task("Agent 3", "Fix issue", "coder")

// Result: Coordinated solution, consistent approach
```

---

### ❌ DON'T: Spawn Agents Across Multiple Messages

```javascript
// BAD - Sequential spawning across messages
[Message 1]: Task("Agent 1", "...", "coder")
[Message 2]: Task("Agent 2", "...", "tester")
[Message 3]: Task("Agent 3", "...", "reviewer")
```

### ✅ DO: Spawn All Agents in Single Message

```javascript
// GOOD - All agents spawned concurrently
[Single Message]:
  mcp__claude-flow-novice__swarm_init({...})
  Task("Agent 1", "...", "coder")
  Task("Agent 2", "...", "tester")
  Task("Agent 3", "...", "reviewer")
```

---

### ❌ DON'T: Skip Post-Edit Hooks

```javascript
// BAD - No validation after edits
Task("UI Designer", "Create Button component", "coder")
// No post-edit hook = no validation
```

### ✅ DO: Include Post-Edit Hook Instructions

```javascript
// GOOD - Hook execution mandated
Task("UI Designer", `
  Create Button component:
  - Implement with TypeScript
  - Add accessibility attributes
  - Run post-edit hook: npx enhanced-hooks post-edit src/components/Button.tsx
`, "coder")
```

---

## Next Steps

After deploying frontend agents:

1. **✅ Validate setup**: Ensure MCP servers configured correctly
2. **📊 Monitor metrics**: Track agent coordination and quality scores
3. **🔍 Review results**: Check Byzantine consensus approval rates
4. **💡 Iterate**: Refine agent instructions based on outcomes
5. **📈 Scale**: Add specialized agents as needed (mobile-dev, animation-specialist)

---

**Document Version**: 2.0.0
**Last Updated**: 2025-10-01
**Maintained By**: Claude Flow Frontend Team
