# CFN Loop Frontend - Visual Iteration Workflow

**Version:** 1.0.0  |  **Date:** 2025-10-28  |  **Status:** Production Ready

---

## Overview

Specialized CFN Loop for frontend development with visual feedback loops, design-first approach, and brand consistency enforcement.

**Key Difference:** Coordinator orchestrates visual iteration - does NOT implement UI code.

---

## Problem with Standard CFN Loop for Frontend

**Anti-Pattern:**
```
/cfn-loop "Build login UI"
  ↓
Coordinator tries to implement React components
  ↓
Context explodes with component code
  ↓
No visual feedback - just code
  ↓
Validators can't assess UI quality without running code
```

**Result:** Poor UI/UX, inconsistent design, context bloat, no visual validation

---

## Frontend CFN Loop Architecture

### Phase 0: Planning (Design-First)

**Step 1: Mockup Creation (Optional but Recommended)**

Use visual design tools to create mockup:

```bash
# Option 1: Use nano banana or similar tool
# Create mockup externally and provide path/URL

# Option 2: Generate from description
# Provide detailed UI description for coordinator to create mockup

MOCKUP_PATH="/path/to/mockup.png"
```

**Step 2: Brand Guidelines**

Either extract from mockup or define upfront:

```json
{
  "brandGuidelines": {
    "colors": {
      "primary": "#3B82F6",
      "secondary": "#8B5CF6",
      "accent": "#F59E0B",
      "background": "#FFFFFF",
      "text": "#1F2937",
      "error": "#EF4444",
      "success": "#10B981"
    },
    "typography": {
      "fontFamily": "Inter, sans-serif",
      "headingScale": "1.25rem, 1.5rem, 2rem, 2.5rem",
      "bodySize": "1rem",
      "lineHeight": "1.5"
    },
    "spacing": {
      "unit": "8px",
      "scale": "0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32"
    },
    "borderRadius": {
      "small": "4px",
      "medium": "8px",
      "large": "16px",
      "full": "9999px"
    },
    "shadows": {
      "small": "0 1px 3px rgba(0,0,0,0.1)",
      "medium": "0 4px 6px rgba(0,0,0,0.1)",
      "large": "0 10px 15px rgba(0,0,0,0.1)"
    }
  }
}
```

**Step 3: Extract Design Tokens from Mockup**

If mockup provided, use image analysis:

```javascript
const mockupAnalysis = mcp__zai-mcp-server__analyze_image({
  image_source: mockupPath,
  prompt: `Extract design tokens from this UI mockup:
  - Color palette (primary, secondary, accent, backgrounds)
  - Typography (font families, sizes, weights)
  - Spacing system (margins, padding, gaps)
  - Border radius values
  - Shadow styles
  - Component patterns (buttons, cards, inputs)

  Return as structured JSON for brand guidelines.`
});
```

### Phase 1: Loop 3 - Implementation

**Agents (Frontend Specialists):**
- `react-frontend-engineer` - Component implementation
- `accessibility-advocate-persona` - WCAG compliance from start
- `mobile-dev` (if responsive/mobile app)

**Critical:** Coordinator provides brand guidelines + mockup to each agent

```javascript
Task("react-frontend-engineer", `
  Implement login UI following mockup and brand guidelines.

  Mockup: ${mockupPath}
  Brand Guidelines: ${JSON.stringify(brandGuidelines)}

  Requirements:
  - Match mockup visual design exactly
  - Use brand color palette
  - Follow typography scale
  - Implement responsive breakpoints
  - Include accessibility attributes

  Deliverables:
  - Login.tsx component
  - CSS/Tailwind styling
  - Component tests
`);
```

**Output:** Each agent implements and reports confidence

### Phase 2: Visual Validation Loop

**Critical Step:** Capture screenshots AND videos, compare to mockup

```bash
# After implementation, capture screenshot + video
playwright test screenshot-capture.spec.ts
playwright test interaction-capture.spec.ts

SCREENSHOT_PATH="tests/screenshots/login-iteration-1.png"
VIDEO_PATH="test-results/interaction-capture/video.webm"
```

**Image Comparison Analysis (Static):**

```javascript
const visualAnalysis = mcp__zai-mcp-server__analyze_image({
  image_source: screenshotPath,
  prompt: `Compare this implementation to the mockup at ${mockupPath}.

  Analyze:
  1. Visual fidelity (colors, spacing, typography)
  2. Layout accuracy (component positioning, alignment)
  3. Responsive behavior (if applicable)
  4. Accessibility (contrast ratios, focus states)

  Rate similarity: 0-100%
  Identify specific discrepancies.
  Suggest improvements.`
});
```

**Video Interaction Analysis (Dynamic):**

```javascript
const interactionAnalysis = mcp__zai-mcp-server__analyze_video({
  video_source: videoPath,
  prompt: `Analyze login interaction flow quality:

  Evaluate:
  1. Loading states (spinner appears, smooth transitions)
  2. Animation timing (300ms transitions, no jank)
  3. Error handling (validation messages, error states clear)
  4. Focus management (tab order correct, visible focus)
  5. Form interactions (typing smooth, button responds)

  Rate each aspect 0-100.
  Identify UX issues or interaction bugs.`
});
```

**Combined Validation:**

```javascript
const overallScore = (visualAnalysis.similarity + interactionAnalysis.averageScore) / 2;

if (overallScore < 85) {
  // Combine feedback from both analyses
  visualFeedback = {
    staticIssues: visualAnalysis.discrepancies,
    interactionIssues: interactionAnalysis.issues,
    overallScore
  };
}
```

### Phase 3: Loop 2 - Functional Validation

**Validators (Frontend-Specific):**
- `reviewer` - Code quality, React best practices
- `interaction-tester` - User flows, interactions, edge cases
- `accessibility-advocate-persona` - WCAG AA compliance validation
- `playwright-tester` - E2E tests, visual regression

**Validator Tasks:**

```javascript
// Interaction tester validates user flows
Task("interaction-tester", `
  Test login UI functionality:
  - Form validation (empty fields, invalid email)
  - Submit flow (success/error states)
  - Loading states
  - Error message display
  - Focus management
  - Keyboard navigation

  Mockup: ${mockupPath}
  Screenshot: ${screenshotPath}
`);

// Playwright tester validates visual consistency
Task("playwright-tester", `
  Run visual regression tests:
  - Compare screenshot to baseline (mockup)
  - Test responsive breakpoints (mobile, tablet, desktop)
  - Test interactive states (hover, focus, active, disabled)
  - Generate diff report if visual changes detected
`);
```

### Phase 4: Loop 4 - Product Owner Decision

Product Owner evaluates:
1. Visual fidelity vs mockup (≥85% similarity required)
2. Interaction quality from video analysis (≥85% required)
3. Overall score: (visual + interaction) / 2 ≥ 85%
4. Functional validation consensus (≥0.90)
5. Accessibility compliance (WCAG AA)
6. Brand guidelines adherence

**Decision Logic:**

```
overall_score = (visual_similarity + interaction_quality) / 2

IF overall_score >= 85% AND consensus >= 0.90 AND wcag_compliant:
  PROCEED → git commit + generate component docs
ELSE IF iteration < max_iterations:
  ITERATE → provide combined feedback (static + interaction issues)
ELSE:
  ABORT → escalate to human review
```

---

## Slash Command Usage

```bash
# Task Mode (recommended for frontend - full visibility)
/cfn-loop-frontend "Build login UI" \
  --mockup=/path/to/login-mockup.png \
  --brand-guidelines=/path/to/brand.json \
  --spawn-mode=task \
  --mode=standard

# CLI Mode (production)
/cfn-loop-frontend "Build dashboard" \
  --mockup=/path/to/dashboard.png \
  --mode=enterprise

# Note: Playwright video recording enabled by default
# - Screenshots: tests/screenshots/*.png (static validation)
# - Videos: test-results/**/video.webm (interaction validation)
# - Combined score threshold: ≥85% required for PROCEED
```

---

## Agent Specialization

### Loop 3 (Implementation)

| Task Type | Agents | Count |
|-----------|--------|-------|
| Web UI | react-frontend-engineer, accessibility-advocate-persona | 2 |
| Mobile UI | mobile-dev, accessibility-advocate-persona | 2 |
| Responsive Web | react-frontend-engineer, mobile-dev, accessibility-advocate | 3 |

### Loop 2 (Validation)

| Complexity | Validators | Count |
|------------|-----------|-------|
| Simple (single page) | reviewer, interaction-tester, playwright-tester | 3 |
| Standard (multi-page flow) | +accessibility-advocate-persona | 4 |
| Complex (dashboard/SPA) | +perf-benchmarker | 5 |

---

## Visual Iteration Workflow

### Iteration Loop

```
1. Agent implements UI → screenshot + video
   ↓
2a. Image analysis compares to mockup → visual similarity score
2b. Video analysis evaluates interactions → interaction quality score
   ↓
3. Calculate overall_score = (visual + interaction) / 2
   ↓
4. IF overall_score >= 85%:
     PASS → proceed to functional validation
   ELSE:
     ITERATE → provide combined feedback (static + interaction issues)
```

### Visual Feedback Format

```json
{
  "iteration": 2,
  "overallScore": 72,
  "visualSimilarity": 75,
  "interactionQuality": 69,
  "staticDiscrepancies": [
    {
      "area": "Login button",
      "issue": "Background color #4A90E2 should be #3B82F6 (brand primary)",
      "severity": "high",
      "fix": "Update button bg-blue-500 to match brand guidelines"
    },
    {
      "area": "Spacing",
      "issue": "Input fields have 12px margin, mockup shows 16px",
      "severity": "medium",
      "fix": "Change my-3 to my-4 (16px in 8px scale)"
    },
    {
      "area": "Typography",
      "issue": "Heading font-size 18px, mockup shows 24px",
      "severity": "high",
      "fix": "Update text-lg to text-2xl"
    }
  ],
  "interactionIssues": [
    {
      "area": "Loading state",
      "issue": "No spinner shown during form submission",
      "severity": "high",
      "fix": "Add loading state: setIsLoading(true) on submit, show <Spinner />"
    },
    {
      "area": "Error handling",
      "issue": "Validation errors not visible on failed submit",
      "severity": "high",
      "fix": "Display error messages below input fields with text-red-600"
    },
    {
      "area": "Animation timing",
      "issue": "Button transition too slow (500ms), should be 300ms",
      "severity": "medium",
      "fix": "Change transition-all duration-500 to duration-300"
    },
    {
      "area": "Focus management",
      "issue": "Focus not returned to first input on error",
      "severity": "medium",
      "fix": "Add emailInputRef.current.focus() in error handler"
    }
  ],
  "recommendations": [
    "Use brand guideline variables consistently",
    "Double-check spacing scale against design system",
    "Verify color hex codes match brand palette exactly",
    "Add loading states for all async operations",
    "Ensure all form validation errors are visible to users"
  ]
}
```

---

## Brand Guidelines Management

### Extract from Mockup

```javascript
// Coordinator extracts brand guidelines from mockup
const brandGuidelines = mcp__zai-mcp-server__analyze_image({
  image_source: mockupPath,
  prompt: `Analyze this UI mockup and extract brand guidelines.

  Extract:
  1. Color palette (identify primary, secondary, accent, neutral colors)
  2. Typography (font families, sizes, weights, line heights)
  3. Spacing system (identify repeated spacing values)
  4. Border radius patterns
  5. Shadow styles
  6. Button styles (height, padding, font size)
  7. Input field styles
  8. Card/container styles

  Return structured JSON for design system.`
});

// Store in project
Write('.claude/brand-guidelines.json', JSON.stringify(brandGuidelines, null, 2));
```

### Define from Scratch

If no mockup, coordinator guides brand guideline creation:

```javascript
// Coordinator prompts for brand direction
const brandDirection = `
  Project: ${projectName}
  Industry: ${industry}
  Target Audience: ${audience}
  Tone: ${tone} (e.g., professional, playful, minimal)
`;

// Generate initial brand guidelines
const guidelines = generateBrandGuidelines(brandDirection);

// Review with user before implementation
console.log('Proposed Brand Guidelines:', guidelines);
// User approves or adjusts
```

---

## Coordinator Role (Critical)

**What Coordinator DOES:**
- Extracts brand guidelines from mockup
- Spawns frontend agents with mockup + guidelines
- Captures screenshots after implementation
- Analyzes visual similarity via image comparison
- Provides structured visual feedback for iterations
- Spawns validators with visual artifacts
- Orchestrates iteration loop

**What Coordinator DOES NOT DO:**
- ❌ Write React component code
- ❌ Implement CSS/styling
- ❌ Debug frontend issues
- ❌ Run webpack/vite builds
- ❌ ANY implementation work

**Why:** Context management. Coordinator focuses on orchestration, not implementation.

---

## Tools Integration

### Image Analysis (Visual Validation)

```javascript
// Built-in MCP tool for image analysis
mcp__zai-mcp-server__analyze_image({
  image_source: screenshotPath,
  prompt: "Compare to mockup, identify discrepancies"
});
```

### Video Analysis (Interaction Validation)

```javascript
// Built-in MCP tool for video analysis
mcp__zai-mcp-server__analyze_video({
  video_source: 'tests/videos/login-flow.webm',
  prompt: `Analyze this login interaction flow:

  Evaluate:
  1. Loading states (spinner visibility, smooth transitions)
  2. Animation timing and smoothness
  3. Error handling (validation messages, error states)
  4. Focus management (tab order, focus indicators)
  5. Form interactions (typing, clicking, submitting)

  Rate each aspect 0-100.
  Identify interaction issues or UX problems.`
});
```

### Screenshot Capture (Playwright)

```typescript
// tests/screenshot-capture.spec.ts
import { test } from '@playwright/test';

test('capture UI screenshot', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  await page.screenshot({
    path: 'tests/screenshots/login-iteration-1.png',
    fullPage: true
  });
});
```

### Video Recording (Playwright)

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    video: 'on', // Always record videos
    // OR: video: 'retain-on-failure' for failed tests only
  },
  // Videos saved to: test-results/<test-name>/video.webm
});

// tests/interaction-capture.spec.ts
test('capture login interaction flow', async ({ page }) => {
  await page.goto('http://localhost:3000/login');

  // Interact with form
  await page.fill('input[name="email"]', 'test@example.com');
  await page.fill('input[name="password"]', 'password123');
  await page.click('button[type="submit"]');

  // Wait for navigation/response
  await page.waitForURL('**/dashboard');

  // Video automatically saved to test-results/
});
```

### Visual Regression Testing

```javascript
// Use playwright-expect with toMatchSnapshot
await expect(page).toHaveScreenshot('login-baseline.png', {
  threshold: 0.15, // 85% similarity threshold
  maxDiffPixels: 100
});
```

---

## Example: Complete Frontend CFN Loop

### Task Mode Execution

```javascript
// Step 1: Main Chat reads guide
const guideContent = await Read('.claude/commands/cfn/CFN_LOOP_FRONTEND.md');

// Step 2: Extract brand guidelines from mockup
const brandGuidelines = mcp__zai-mcp-server__analyze_image({
  image_source: '/mockups/login.png',
  prompt: 'Extract complete brand guidelines (colors, typography, spacing, etc.)'
});

Write('.claude/brand-guidelines.json', JSON.stringify(brandGuidelines));

// Step 3: Spawn Loop 3 agents (implementation)
let iteration = 1;

do {
  const loop3Results = await Promise.all([
    Task("react-frontend-engineer", `
      Implement login UI.
      Mockup: /mockups/login.png
      Brand Guidelines: ${brandGuidelines}
      Iteration: ${iteration}
      ${iteration > 1 ? `Visual Feedback: ${visualFeedback}` : ''}
    `),
    Task("accessibility-advocate-persona", `
      Ensure WCAG AA compliance from implementation start.
      Review: form labels, focus states, contrast ratios.
    `)
  ]);

  // Step 4: Capture screenshot + video
  Bash('npx playwright test screenshot-capture.spec.ts');
  Bash('npx playwright test interaction-capture.spec.ts');

  const screenshotPath = `tests/screenshots/login-iteration-${iteration}.png`;
  const videoPath = `test-results/interaction-capture/video.webm`;

  // Step 5a: Visual validation (static)
  const visualAnalysis = mcp__zai-mcp-server__analyze_image({
    image_source: screenshotPath,
    prompt: `Compare to mockup /mockups/login.png.
    Rate similarity 0-100, identify discrepancies.`
  });

  // Step 5b: Interaction validation (dynamic)
  const interactionAnalysis = mcp__zai-mcp-server__analyze_video({
    video_source: videoPath,
    prompt: `Analyze login interaction flow:
    - Loading states (spinner, transitions)
    - Error handling (validation messages)
    - Focus management (tab order, focus indicators)
    - Animation timing
    Rate each aspect 0-100, identify UX issues.`
  });

  // Step 5c: Combined score
  const overallScore = (visualAnalysis.similarity + interactionAnalysis.averageScore) / 2;

  if (overallScore >= 85) break;

  visualFeedback = {
    staticIssues: visualAnalysis.discrepancies,
    interactionIssues: interactionAnalysis.issues,
    overallScore
  };
  iteration++;
} while (iteration <= 5);

// Step 6: Spawn Loop 2 validators
const loop2Results = await Promise.all([
  Task("reviewer", "Review code quality, React best practices"),
  Task("interaction-tester", "Test user flows, form validation, error states"),
  Task("playwright-tester", "Run visual regression tests"),
  Task("accessibility-advocate-persona", "Validate WCAG AA compliance")
]);

const consensus = average(loop2Results.map(r => r.confidence));

// Step 7: Product Owner decision
if (consensus >= 0.90 && overallScore >= 85) {
  Bash("git add . && git commit -m 'feat(ui): login component' && git push");
  Write('docs/LOGIN_COMPONENT.md', generateComponentDocs());
  console.log(`✅ Login UI complete
    - Visual fidelity: ${visualAnalysis.similarity}%
    - Interaction quality: ${interactionAnalysis.averageScore}%
    - Overall score: ${overallScore}%`);
}
```

---

## Best Practices

### 1. Mockup-First Development
Always start with visual mockup when possible. Reduces iteration cycles.

### 2. Brand Guidelines as Single Source of Truth
Store in `.claude/brand-guidelines.json` and reference in every implementation task.

### 3. Capture Every Iteration (Screenshot + Video)
Maintain visual history:
- Screenshots: `login-iteration-1.png`, `login-iteration-2.png`
- Videos: `test-results/interaction-capture-iteration-1/video.webm`

### 4. Dual Validation (Static + Dynamic)
- Screenshot: Visual fidelity (colors, spacing, typography)
- Video: Interaction quality (loading states, animations, error handling)
- Combined score ≥85% required

### 5. Strict Quality Threshold
≥85% overall score required. Lower threshold = poor user experience.

### 6. Accessibility from Start
Include `accessibility-advocate-persona` in Loop 3, not just validation.

### 7. Coordinator Orchestrates Only
If coordinator starts writing React code → STOP. Respawn agents.

---

## Troubleshooting

### Issue: Low Visual Similarity (<70%)

**Solution:** Provide more explicit brand guidelines and annotated mockup.

```javascript
const enhancedMockup = mcp__zai-mcp-server__analyze_image({
  image_source: mockupPath,
  prompt: `Annotate this mockup with detailed specifications:
  - Exact hex codes for each color
  - Font sizes in px/rem
  - Spacing values in px
  - Component dimensions
  - Border radius values
  Return annotated description for implementation.`
});
```

### Issue: Coordinator Implementing Code

**Solution:** Update coordinator instructions, remove implementation tools.

```javascript
// WRONG
Task("coordinator", "Implement login component");

// RIGHT
Task("coordinator", "Coordinate login component implementation:
1. Extract brand guidelines
2. Spawn react-frontend-engineer
3. Capture screenshot
4. Analyze similarity
5. Iterate if needed");
```

### Issue: No Visual Feedback on Iteration

**Solution:** Ensure image analysis provides actionable feedback.

```javascript
prompt: `Compare and provide ACTIONABLE feedback:
- Specific CSS changes needed
- Exact color hex codes to use
- Component props to adjust
- Layout changes required
Not generic advice - specific fixes only.`
```

---

## Related Documentation

- **Task Mode Guide**: `.claude/commands/CFN_LOOP_TASK_MODE.md`
- **Standard CFN Loop**: `.claude/commands/cfn/cfn-loop.md`
- **Coordinator Parameters**: `.claude/commands/cfn/CFN_COORDINATOR_PARAMETERS.md`

---

**Version:** 1.0.0 (2025-10-28) - Frontend CFN Loop with visual iteration, mockup integration, brand guidelines, image analysis
