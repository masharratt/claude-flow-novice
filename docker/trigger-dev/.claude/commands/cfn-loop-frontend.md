---
description: "Execute frontend CFN Loop with visual iteration, mockup integration, and brand guideline enforcement"
argument-hint: "<task description> [--mockup=path] [--brand-guidelines=path] [--mode=mvp|standard|enterprise] [--spawn-mode=cli|task] [--max-iterations=n]"
allowed-tools: ["Task", "TodoWrite", "Read", "Write", "Edit", "Bash", "Glob", "Grep", "mcp__zai-mcp-server__analyze_image", "mcp__zai-mcp-server__analyze_video"]
---

# CFN Loop Frontend - Visual Iteration Workflow

Execute frontend development with visual validation, mockup integration, brand guidelines, and dual validation (screenshot + video).

🚨 **AUTONOMOUS VISUAL ITERATION PROCESS**

**Task**: $ARGUMENTS

## Frontend CFN Loop Structure

```
Phase 0: Planning & Brand Guidelines
   ↓
Loop 3: Implementation (React/Vue/Angular components)
   ↓
Visual Validation: Screenshot + Video Analysis (≥85% combined score)
   ↓
Loop 2: Functional Validation (code review, accessibility, performance)
   ↓
Loop 4: Product Owner Decision (PROCEED/ITERATE/ABORT)
```

## Command Options

```bash
# CLI Mode (default - cost-optimized, production)
/cfn-loop-frontend "Build login UI" \
  --mockup=/mockups/login.png \
  --brand-guidelines=/design/brand.json \
  --mode=standard

# Task Mode (debugging - full visibility)
/cfn-loop-frontend "Build dashboard" \
  --mockup=/mockups/dashboard.png \
  --spawn-mode=task \
  --mode=enterprise \
  --max-iterations=5
```

**Options:**
- `--mockup=<path>`: Path to UI mockup (PNG/JPG) for visual validation
- `--brand-guidelines=<path>`: Path to brand guidelines JSON (optional, extracted from mockup if not provided)
- `--mode=<mvp|standard|enterprise>`: Quality mode (default: standard)
- `--spawn-mode=<cli|task>`: Agent spawning method (default: cli)
  - **cli**: Cost-optimized (95-98% savings), uses cfn-frontend-coordinator
  - **task**: Full visibility, Main Chat coordinates directly
- `--max-iterations=<n>`: Max visual iteration cycles (default: 5)

## Visual Validation Thresholds

### MVP Mode
- **Visual Threshold**: 80%
- **Consensus Threshold**: 80%
- **Max Iterations**: 3
- **Validators**: 2 (reviewer, interaction-tester)

### Standard Mode (Recommended)
- **Visual Threshold**: 85%
- **Consensus Threshold**: 90%
- **Max Iterations**: 5
- **Validators**: 4 (reviewer, interaction-tester, playwright-tester, accessibility-advocate-persona)

### Enterprise Mode
- **Visual Threshold**: 90%
- **Consensus Threshold**: 95%
- **Max Iterations**: 7
- **Validators**: 5 (all + perf-analyzer)

## Prerequisites

**Required:**
```bash
# Playwright for screenshot/video capture
npm install -D @playwright/test

# Configure Playwright for video recording
# playwright.config.ts:
# use: { video: 'on' }
```

**Optional:**
```bash
# Mockup design tool (for Phase 0)
# - Figma exports
# - nano banana
# - Any PNG/JPG mockup
```

## Execution Pattern

### Step 1: Parse Command Arguments & Determine Mode

```javascript
const params = {
  taskDescription: "$ARGUMENTS",
  mockupPath: extractFlag("--mockup"),
  brandGuidelinesPath: extractFlag("--brand-guidelines"),
  mode: extractFlag("--mode") || "standard",
  spawnMode: extractFlag("--spawn-mode") || "cli",
  maxIterations: parseInt(extractFlag("--max-iterations")) || 5
};

console.log(`Frontend CFN Loop: ${params.mode} mode, ${params.spawnMode} spawning`);

// MODE DETECTION: Inject mode-specific instructions
if (params.spawnMode === 'cli') {
  console.log('━━━ CLI MODE INSTRUCTIONS ━━━');
  console.log('Main Chat spawns ONLY cfn-frontend-coordinator');
  console.log('Coordinator handles all visual iteration internally');
  console.log('CLI agents use Z.ai routing (when enabled)');
  console.log('Background execution with Redis monitoring');
} else {
  console.log('━━━ TASK MODE INSTRUCTIONS ━━━');
  console.log('Main Chat coordinates entire visual iteration workflow');
  console.log('NO coordinator agent spawned');
  console.log('Main Chat spawns all agents via Task()');
  console.log('Full visibility in Main Chat');
}
```

### Step 2: Execute Based on Mode

#### CLI Mode (Default) - Spawn Frontend Coordinator

```javascript
Task("cfn-frontend-coordinator", `
  FRONTEND CFN LOOP EXECUTION - STRUCTURED PARAMETERS

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COST OPTIMIZATION - CUSTOM ROUTING (CRITICAL)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ⚠️  IMPORTANT: Enable custom routing for maximum cost savings!

  1. Enable routing (one-time setup):
     /custom-routing-activate

  2. Verify status:
     /switch-api status

  Cost Breakdown (per iteration):
  ┌─────────────────────────────┬──────────────┬────────────┐
  │ Component                   │ Provider     │ Cost/Call  │
  ├─────────────────────────────┼──────────────┼────────────┤
  │ Main Chat                   │ Anthropic    │ $0.015     │
  │ Frontend Coordinator (Task) │ Anthropic    │ $0.015     │
  │ Frontend Agents (CLI)       │ Z.ai         │ $0.003 ea  │
  │ Validators (CLI)            │ Z.ai         │ $0.003 ea  │
  │ Product Owner (CLI)         │ Z.ai         │ $0.003     │
  └─────────────────────────────┴──────────────┴────────────┘

  Expected Savings:
  • WITH custom routing:    ~64% cost reduction
  • WITHOUT custom routing: Full Anthropic pricing
  • Combined with CLI:      95-98% vs all-Task-tool

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  TASK SPECIFICATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Task Description: ${params.taskDescription}
  Component Name: (extract from task description, e.g., "LoginForm", "Dashboard")
  Task ID: cfn-frontend-$(date +%s)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  VISUAL ITERATION CONFIGURATION
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mockup Path: ${params.mockupPath || "Not provided - proceeding without visual validation"}
  Brand Guidelines: ${params.brandGuidelinesPath || "Extract from mockup"}
  Visual Threshold: ${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}%
  Max Iterations: ${params.maxIterations}

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  SUCCESS CRITERIA (FRONTEND-SPECIFIC)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Visual Validation:
  - [ ] Screenshot matches mockup (${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}% similarity)
  - [ ] Video shows smooth interactions (${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}% quality)
  - [ ] Combined visual + interaction score ≥${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}%

  Functional Validation:
  - [ ] Component implements core functionality
  - [ ] WCAG AA accessibility compliance
  - [ ] Brand guidelines followed (exact color matching)
  - [ ] Responsive breakpoints working
  - [ ] All tests pass with >80% coverage

  Quality Gates (${params.mode.toUpperCase()} MODE):
  - Visual + Interaction Threshold: ${params.mode === 'enterprise' ? 0.90 : params.mode === 'standard' ? 0.85 : 0.80}
  - Loop 2 Consensus Threshold: ${params.mode === 'enterprise' ? 0.95 : params.mode === 'standard' ? 0.90 : 0.80}
  - Max Visual Iterations: ${params.maxIterations}

  Definition of Done:
  - Visual + interaction score ≥${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}%
  - Consensus ≥${params.mode === 'enterprise' ? 0.95 : params.mode === 'standard' ? 0.90 : 0.80} achieved
  - All acceptance criteria met
  - Product Owner approval received

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  ORCHESTRATION CONFIGURATION (FRONTEND)
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Mode: ${params.mode.toUpperCase()}

  Loop 3 Agents (Frontend Implementation):
  - react-frontend-engineer (component implementation)
  - accessibility-advocate-persona (WCAG AA compliance from start)
  ${params.taskDescription.match(/mobile|responsive|react native/i) ? '- mobile-dev (responsive/mobile implementation)' : ''}

  Loop 2 Agents (Validation):
  - reviewer (code review, React best practices)
  - interaction-tester (user flows, form validation, error states)
  - playwright-tester (visual regression, E2E tests)
  - accessibility-advocate-persona (WCAG AA validation)
  ${params.mode === 'enterprise' ? '- perf-analyzer (performance optimization)' : ''}

  Loop 4 Agent (Product Owner):
  - product-owner (PROCEED/ITERATE/ABORT decision with visual artifacts)

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  OUTPUT EXPECTATIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  Return structured JSON result with visual metrics:
  {
    "status": "complete|failed|aborted",
    "component": "component-name",
    "visualScore": 92,
    "interactionScore": 88,
    "overallScore": 90,
    "consensus": 0.93,
    "iterations": 3,
    "decision": "PROCEED",
    "deliverables": ["src/components/Component.tsx", "..."],
    "artifacts": {
      "mockup": "/mockups/component.png",
      "screenshot": "tests/screenshots/component-iteration-3.png",
      "video": "test-results/interaction-capture/video.webm",
      "brandGuidelines": ".claude/brand-guidelines.json"
    }
  }

  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  COORDINATOR INSTRUCTIONS
  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Extract brand guidelines from mockup (if not provided)
  2. Store context in Redis for agent retrieval
  3. Invoke orchestrator with visual validation flag
  4. Coordinate visual iteration loop (screenshot + video analysis)
  5. Ensure agents receive mockup + brand guidelines
  6. Return structured result with visual metrics

  CRITICAL: You orchestrate only. Do NOT implement React/CSS code.
`);
```

#### Task Mode - Main Chat Coordinates Directly

**If `--spawn-mode=task` detected:**

```javascript
// Step 1: Read Frontend Loop Guide
const frontendGuide = await Read('.claude/commands/cfn/CFN_LOOP_FRONTEND.md');

console.log('Task Mode: Main Chat coordinating frontend CFN Loop directly');

// Step 2: Phase 0 - Extract Brand Guidelines
let brandGuidelines;

if (params.brandGuidelinesPath) {
  brandGuidelines = JSON.parse(await Read(params.brandGuidelinesPath));
} else if (params.mockupPath) {
  console.log('Extracting brand guidelines from mockup...');

  brandGuidelines = await mcp__zai-mcp-server__analyze_image({
    image_source: params.mockupPath,
    prompt: `Extract complete brand guidelines from this UI mockup:

    Extract:
    1. Color palette (primary, secondary, accent, neutral colors with exact hex codes)
    2. Typography (font families, sizes in px/rem, weights, line heights)
    3. Spacing system (identify repeated spacing values, determine base unit)
    4. Border radius patterns (small, medium, large values)
    5. Shadow styles (identify shadow layers and values)
    6. Component patterns (buttons, inputs, cards - heights, padding, font sizes)

    Return as structured JSON with exact values for design system implementation.`
  });

  // Store for reference
  await Write('.claude/brand-guidelines.json', JSON.stringify(brandGuidelines, null, 2));
} else {
  console.warn('⚠️  No mockup or brand guidelines provided - using project defaults');
  brandGuidelines = {}; // Use project defaults
}

// Step 3: Visual Iteration Loop
let iteration = 1;
let overallScore = 0;
let visualFeedback = null;

do {
  console.log(`\n━━━ Iteration ${iteration}/${params.maxIterations} ━━━`);

  // Loop 3: Spawn Implementation Agents
  const loop3Agents = [
    'react-frontend-engineer',
    'accessibility-advocate-persona'
  ];

  if (params.taskDescription.match(/mobile|responsive|react native/i)) {
    loop3Agents.push('mobile-dev');
  }

  const loop3Results = await Promise.all(
    loop3Agents.map(agent =>
      Task(agent, `
        Implement UI following mockup and brand guidelines.

        Mockup: ${params.mockupPath}
        Brand Guidelines: ${JSON.stringify(brandGuidelines)}
        Iteration: ${iteration}
        ${visualFeedback ? `\nVisual Feedback:\n${JSON.stringify(visualFeedback, null, 2)}` : ''}

        Requirements:
        - Match mockup visual design exactly
        - Use brand color palette (exact hex codes)
        - Follow typography scale
        - Implement responsive breakpoints
        - Include accessibility attributes (WCAG AA)

        Deliverables:
        - Component implementation (${componentName}.tsx)
        - Styling (CSS/Tailwind)
        - Component tests
      `)
    )
  );

  // Visual Validation: Screenshot + Video
  console.log('Capturing screenshot and video...');
  await Bash('npm test -- screenshot-capture.spec.ts');
  await Bash('npm test -- interaction-capture.spec.ts');

  const screenshotPath = `tests/screenshots/${componentName}-iteration-${iteration}.png`;
  const videoPath = `test-results/interaction-capture-${componentName}/video.webm`;

  // Visual Analysis (Static)
  const visualAnalysis = await mcp__zai-mcp-server__analyze_image({
    image_source: screenshotPath,
    prompt: `Compare this implementation to the mockup at ${params.mockupPath}.

    Analyze in detail:
    1. Color accuracy (exact hex code matching)
    2. Spacing precision (margins, padding match mockup)
    3. Typography accuracy (font sizes, weights, line heights)
    4. Layout positioning (component alignment, flex/grid usage)
    5. Border radius and shadows
    6. Responsive behavior (if applicable)
    7. Accessibility (contrast ratios, focus states)

    Rate similarity: 0-100%

    For each discrepancy, provide:
    - Area: Specific component or element
    - Issue: What doesn't match (with exact values)
    - Severity: high|medium|low
    - Fix: Exact CSS/Tailwind change needed (be specific)`
  });

  // Interaction Analysis (Dynamic)
  const interactionAnalysis = await mcp__zai-mcp-server__analyze_video({
    video_source: videoPath,
    prompt: `Analyze this interaction flow for quality and UX issues:

    Evaluate each aspect (rate 0-100):
    1. Loading states (spinner appears, smooth transitions, no FOUC)
    2. Animation timing (300ms default, no jank, smooth 60fps)
    3. Error handling (validation messages visible, error states clear, helpful text)
    4. Focus management (tab order logical, focus indicators visible, no focus traps)
    5. Form interactions (typing smooth, button responds immediately, disabled states clear)

    For each issue, provide:
    - Area: Specific interaction or component
    - Issue: What's wrong with the interaction
    - Severity: high|medium|low
    - Fix: Specific code change (state management, event handlers, CSS transitions)`
  });

  // Combined Score
  overallScore = (visualAnalysis.similarity + interactionAnalysis.averageScore) / 2;

  console.log(`Visual similarity: ${visualAnalysis.similarity}%`);
  console.log(`Interaction quality: ${interactionAnalysis.averageScore}%`);
  console.log(`Overall score: ${overallScore}%`);

  if (overallScore >= (params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80)) {
    console.log('✅ Visual validation passed, proceeding to Loop 2');
    break;
  } else {
    console.log(`⚠️  Visual validation failed (${overallScore}%), preparing feedback`);

    visualFeedback = {
      iteration: iteration,
      overallScore: overallScore,
      visualSimilarity: visualAnalysis.similarity,
      interactionQuality: interactionAnalysis.averageScore,
      staticDiscrepancies: visualAnalysis.discrepancies,
      interactionIssues: interactionAnalysis.issues,
      recommendations: [
        ...visualAnalysis.recommendations,
        ...interactionAnalysis.recommendations
      ]
    };

    iteration++;
  }
} while (iteration <= params.maxIterations);

// Loop 2: Spawn Validators
const loop2Agents = [
  'reviewer',
  'interaction-tester',
  'playwright-tester',
  'accessibility-advocate-persona'
];

if (params.mode === 'enterprise') {
  loop2Agents.push('perf-analyzer');
}

const loop2Results = await Promise.all(
  loop2Agents.map(validator =>
    Task(validator, `
      Validate ${componentName} implementation.

      Implementation files: ${deliverableFiles}
      Mockup: ${params.mockupPath}
      Screenshot: ${screenshotPath}
      Video: ${videoPath}
      Visual score: ${overallScore}%

      Focus on:
      - Code quality and React best practices
      - User flows and interaction testing
      - Visual regression validation
      - WCAG AA accessibility compliance
      ${params.mode === 'enterprise' ? '- Performance optimization' : ''}
    `)
  )
);

const consensus = average(loop2Results.map(r => r.confidence));
console.log(`Loop 2 consensus: ${consensus}`);

// Loop 4: Product Owner Decision
const poOutput = await Task("product-owner", `
  Make PROCEED/ITERATE/ABORT decision for frontend implementation.

  Component: ${componentName}
  Visual score: ${overallScore}% (threshold: ${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}%)
  Validator consensus: ${consensus} (threshold: ${params.mode === 'enterprise' ? 0.95 : params.mode === 'standard' ? 0.90 : 0.80})
  Iterations completed: ${iteration}/${params.maxIterations}

  Deliverables:
  $(git diff --name-only HEAD | grep -E '\\.(tsx?|jsx?|css)$')

  DECISION CRITERIA:
  - Visual + interaction score ≥${params.mode === 'enterprise' ? 90 : params.mode === 'standard' ? 85 : 80}%
  - Validator consensus ≥${params.mode === 'enterprise' ? 0.95 : params.mode === 'standard' ? 0.90 : 0.80}
  - Deliverables exist (git diff shows changes)
  - WCAG AA compliance verified
  - Brand guidelines followed

  OUTPUT FORMAT (Required):
  DECISION: PROCEED|ITERATE|ABORT
  REASONING: [why]
`);

// Parse decision
const decision = await Bash(`./.claude/skills/cfn-product-owner-decision/parse-decision.sh --output "${poOutput}"`);

if (decision === "PROCEED") {
  console.log('✅ Product Owner approved - committing changes');

  await Bash(`git add . && git commit -m "feat(ui): ${componentName}

Deliverables:
$(git diff --name-only HEAD | sed 's/^/- /')

Validation:
- Visual similarity: ${visualAnalysis.similarity}%
- Interaction quality: ${interactionAnalysis.averageScore}%
- Overall score: ${overallScore}%
- Consensus: ${consensus}
- Iterations: ${iteration}

🤖 Generated with [Claude Code](https://claude.com/claude-code)
Co-Authored-By: Claude <noreply@anthropic.com>" && git push origin main`);

  console.log('✅ Frontend CFN Loop complete');
}
```

## Prerequisites Checklist

Before running frontend CFN Loop:

- [ ] Playwright installed: `npm install -D @playwright/test`
- [ ] Playwright configured for video: `use: { video: 'on' }`
- [ ] Mockup available (PNG/JPG) OR brand guidelines JSON
- [ ] Component name clear from task description
- [ ] Test files exist: `screenshot-capture.spec.ts`, `interaction-capture.spec.ts`

## Visual Artifacts

**Generated during execution:**
- Screenshots: `tests/screenshots/${component}-iteration-${n}.png`
- Videos: `test-results/interaction-capture-${component}/video.webm`
- Brand guidelines: `.claude/brand-guidelines.json`
- Component docs: `docs/${component}_IMPLEMENTATION.md`

## Best Practices

1. **Mockup-First**: Always provide mockup for best results
2. **Brand Guidelines**: Extract from mockup or define upfront
3. **Iteration History**: Maintain visual artifacts for each iteration
4. **Dual Validation**: Screenshot (static) + Video (interaction) = complete validation
5. **Accessibility**: Include `accessibility-advocate-persona` in Loop 3 (not just validation)
6. **Coordinator Boundary**: Coordinator orchestrates, never implements code

## Troubleshooting

**Missing mockup:**
- Frontend loop runs without visual validation
- Falls back to standard CFN Loop workflow

**Playwright not installed:**
- Error message with installation instructions
- Loop cannot proceed without Playwright

**Low visual score (<50%):**
- Check brand guidelines accuracy
- Verify mockup path is correct
- Review agent implementation quality

**Max iterations reached:**
- Product Owner makes ABORT decision
- Review feedback patterns for recurring issues

## Related Documentation

- Guide: `.claude/commands/cfn/CFN_LOOP_FRONTEND.md` (742 lines, complete workflow)
- Coordinator: `.claude/agents/cfn-dev-team/coordinators/cfn-frontend-coordinator.md`
- Task Mode: `.claude/commands/CFN_LOOP_TASK_MODE.md`
- Standard CFN Loop: `.claude/commands/cfn/cfn-loop.md`

---

**Cost Optimization Note:**
CLI mode with custom routing saves 95-98% vs Task-only approach. Enable with `/custom-routing-activate`.
