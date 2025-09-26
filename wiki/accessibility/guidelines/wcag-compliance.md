# WCAG 2.1 AA Compliance Guidelines for Claude-Flow Projects

This comprehensive guide provides a practical framework for achieving WCAG 2.1 AA compliance in claude-flow projects using agent-driven development.

## 🎯 Overview

Web Content Accessibility Guidelines (WCAG) 2.1 provides the international standard for web accessibility. This guide translates WCAG requirements into actionable development practices for claude-flow projects.

## 📋 WCAG 2.1 AA Compliance Checklist

### 1. Perceivable

#### 1.1 Text Alternatives
- [ ] **1.1.1 Non-text Content (A)**: All images have appropriate alt text
  ```html
  <!-- ✅ Good -->
  <img src="chart.png" alt="Sales increased 25% from Q1 to Q2 2024">

  <!-- ❌ Bad -->
  <img src="chart.png" alt="chart">
  ```

#### 1.2 Time-based Media
- [ ] **1.2.1 Audio-only and Video-only (A)**: Provide transcripts
- [ ] **1.2.2 Captions (A)**: All videos have accurate captions
- [ ] **1.2.3 Audio Description or Media Alternative (A)**: Audio descriptions for video content
- [ ] **1.2.4 Captions (Live) (AA)**: Live captions for live audio content
- [ ] **1.2.5 Audio Description (AA)**: Audio descriptions for all video content

#### 1.3 Adaptable
- [ ] **1.3.1 Info and Relationships (A)**: Semantic markup preserves meaning
  ```html
  <!-- ✅ Good: Semantic structure -->
  <h1>Main Heading</h1>
  <h2>Section Heading</h2>
  <ul>
    <li>List item 1</li>
    <li>List item 2</li>
  </ul>

  <!-- ❌ Bad: Visual-only structure -->
  <div class="big-text">Main Heading</div>
  <div class="medium-text">Section Heading</div>
  <div>• List item 1</div>
  <div>• List item 2</div>
  ```

- [ ] **1.3.2 Meaningful Sequence (A)**: Content order makes sense when linearized
- [ ] **1.3.3 Sensory Characteristics (A)**: Instructions don't rely solely on sensory characteristics
- [ ] **1.3.4 Orientation (AA)**: Content works in both portrait and landscape
- [ ] **1.3.5 Identify Input Purpose (AA)**: Input fields have autocomplete attributes

#### 1.4 Distinguishable
- [ ] **1.4.1 Use of Color (A)**: Color is not the only way to convey information
- [ ] **1.4.2 Audio Control (A)**: Auto-playing audio can be controlled
- [ ] **1.4.3 Contrast (Minimum) (AA)**: 4.5:1 for normal text, 3:1 for large text
- [ ] **1.4.4 Resize Text (AA)**: Text can be resized to 200% without loss of functionality
- [ ] **1.4.5 Images of Text (AA)**: Use real text instead of images of text
- [ ] **1.4.10 Reflow (AA)**: Content reflows at 320px width without horizontal scrolling
- [ ] **1.4.11 Non-text Contrast (AA)**: 3:1 contrast for UI components and graphics
- [ ] **1.4.12 Text Spacing (AA)**: Content adapts to increased text spacing
- [ ] **1.4.13 Content on Hover or Focus (AA)**: Hoverable/focusable content is dismissible

### 2. Operable

#### 2.1 Keyboard Accessible
- [ ] **2.1.1 Keyboard (A)**: All functionality available via keyboard
- [ ] **2.1.2 No Keyboard Trap (A)**: Focus can always move away from components
- [ ] **2.1.4 Character Key Shortcuts (A)**: Character shortcuts can be disabled/remapped

#### 2.2 Enough Time
- [ ] **2.2.1 Timing Adjustable (A)**: Users can extend time limits
- [ ] **2.2.2 Pause, Stop, Hide (A)**: Users can pause auto-updating content

#### 2.3 Seizures and Physical Reactions
- [ ] **2.3.1 Three Flashes or Below Threshold (A)**: No content flashes more than 3 times per second

#### 2.4 Navigable
- [ ] **2.4.1 Bypass Blocks (A)**: Skip links or other bypass mechanisms
- [ ] **2.4.2 Page Titled (A)**: Pages have descriptive titles
- [ ] **2.4.3 Focus Order (A)**: Focus order preserves meaning and operability
- [ ] **2.4.4 Link Purpose (A)**: Link purpose is clear from link text or context
- [ ] **2.4.5 Multiple Ways (AA)**: Multiple ways to find pages
- [ ] **2.4.6 Headings and Labels (AA)**: Headings and labels are descriptive
- [ ] **2.4.7 Focus Visible (AA)**: Keyboard focus is clearly visible

#### 2.5 Input Modalities
- [ ] **2.5.1 Pointer Gestures (A)**: Multipoint/path-based gestures have single-pointer alternatives
- [ ] **2.5.2 Pointer Cancellation (A)**: Single-pointer activation can be cancelled
- [ ] **2.5.3 Label in Name (A)**: Accessible name contains visible label text
- [ ] **2.5.4 Motion Actuation (A)**: Motion-triggered functionality can be disabled

### 3. Understandable

#### 3.1 Readable
- [ ] **3.1.1 Language of Page (A)**: Page language is identified
- [ ] **3.1.2 Language of Parts (AA)**: Language changes are identified

#### 3.2 Predictable
- [ ] **3.2.1 On Focus (A)**: Focus doesn't trigger context changes
- [ ] **3.2.2 On Input (A)**: Input doesn't trigger unexpected context changes
- [ ] **3.2.3 Consistent Navigation (AA)**: Navigation is consistent across pages
- [ ] **3.2.4 Consistent Identification (AA)**: Components are identified consistently

#### 3.3 Input Assistance
- [ ] **3.3.1 Error Identification (A)**: Input errors are identified and described
- [ ] **3.3.2 Labels or Instructions (A)**: Input fields have labels or instructions
- [ ] **3.3.3 Error Suggestion (AA)**: Error corrections are suggested when possible
- [ ] **3.3.4 Error Prevention (AA)**: Error prevention for legal/financial/data submission

### 4. Robust

#### 4.1 Compatible
- [ ] **4.1.1 Parsing (A)**: Markup is valid (deprecated in WCAG 2.2)
- [ ] **4.1.2 Name, Role, Value (A)**: UI components have accessible name and role
- [ ] **4.1.3 Status Messages (AA)**: Status messages are programmatically determinable

## 🤖 Claude-Flow Accessibility Agents

### Automated WCAG Compliance Checking

```bash
# Run comprehensive WCAG audit
npx claude-flow sparc run accessibility-audit "Audit entire application for WCAG 2.1 AA compliance"

# Check specific criterion
npx claude-flow sparc run contrast-checker "Validate color contrast meets WCAG AA requirements"

# Keyboard navigation testing
npx claude-flow sparc run keyboard-tester "Test complete keyboard navigation flow"
```

### Agent-Driven Compliance Workflow

1. **Automated Scanning Agent**
   ```typescript
   // Example: Automated accessibility scanner
   class AccessibilityScanner {
     async scanForWCAG(component: string): Promise<WCAGReport> {
       const violations = await this.runAxeCore(component);
       const manualChecks = await this.identifyManualChecks(component);
       return {
         violations,
         manualChecks,
         complianceScore: this.calculateScore(violations),
         recommendations: this.generateRecommendations(violations)
       };
     }
   }
   ```

2. **Code Review Agent**
   ```typescript
   // Agent for reviewing code for accessibility patterns
   class AccessibilityReviewAgent {
     async reviewCode(files: string[]): Promise<AccessibilityReview> {
       const issues = [];
       for (const file of files) {
         issues.push(...await this.scanFile(file));
       }
       return {
         issues,
         suggestions: this.generateSuggestions(issues),
         complianceLevel: this.assessCompliance(issues)
       };
     }
   }
   ```

## 📊 Implementation Strategy

### Phase 1: Foundation (Weeks 1-2)
1. Set up automated testing tools (axe-core, Pa11y)
2. Implement basic semantic HTML structure
3. Add proper heading hierarchy
4. Ensure keyboard navigation works

### Phase 2: Core Compliance (Weeks 3-4)
1. Fix color contrast issues
2. Add ARIA labels and descriptions
3. Implement skip links
4. Add form labels and error handling

### Phase 3: Advanced Features (Weeks 5-6)
1. Add audio descriptions for video
2. Implement focus management for SPAs
3. Add live regions for dynamic content
4. Test with actual assistive technologies

### Phase 4: Validation (Weeks 7-8)
1. Comprehensive manual testing
2. User testing with assistive technology users
3. Third-party accessibility audit
4. Documentation and training

## 🔧 Development Tools

### Automated Testing Tools
```json
{
  "devDependencies": {
    "@axe-core/react": "^4.7.0",
    "jest-axe": "^8.0.0",
    "pa11y": "^6.2.3",
    "lighthouse": "^10.0.0"
  }
}
```

### Testing Configuration
```javascript
// jest.config.js
module.exports = {
  setupFilesAfterEnv: ['<rootDir>/src/setupTests.js'],
  testEnvironment: 'jsdom'
};

// setupTests.js
import 'jest-axe/extend-expect';
```

### Example Accessibility Test
```javascript
import { render } from '@testing-library/react';
import { axe, toHaveNoViolations } from 'jest-axe';
import Navigation from './Navigation';

expect.extend(toHaveNoViolations);

test('Navigation should be accessible', async () => {
  const { container } = render(<Navigation />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## 📝 Documentation Requirements

### Component Documentation Template
```markdown
## Accessibility Features
- **ARIA Labels**: All interactive elements have descriptive labels
- **Keyboard Support**: Full keyboard navigation with visible focus
- **Screen Reader**: Optimized for NVDA, JAWS, and VoiceOver
- **Color Contrast**: Meets WCAG AA requirements (4.5:1)
- **Responsive**: Works at 320px width and 200% zoom

## Testing
- Automated: Passes axe-core accessibility audit
- Manual: Tested with keyboard-only navigation
- AT Testing: Verified with NVDA and VoiceOver
```

## 🚨 Common Pitfalls

1. **Missing Alt Text**: Every image needs appropriate alternative text
2. **Poor Color Contrast**: Use tools to verify 4.5:1 ratio
3. **Keyboard Traps**: Ensure focus can always escape components
4. **Missing Labels**: All form inputs need accessible labels
5. **Semantic HTML**: Use proper HTML elements for their intended purpose

## 📚 Resources

### WCAG Quick Reference
- [WCAG 2.1 Quick Reference](https://www.w3.org/WAI/WCAG21/quickref/)
- [How to Meet WCAG](https://www.w3.org/WAI/WCAG21/quickref/)

### Testing Tools
- [axe DevTools](https://www.deque.com/axe/devtools/)
- [WAVE Browser Extension](https://wave.webaim.org/extension/)
- [Lighthouse Accessibility Audit](https://developers.google.com/web/tools/lighthouse)

### Assistive Technology Testing
- [NVDA Screen Reader](https://www.nvaccess.org/download/)
- [VoiceOver Guide](https://webaim.org/articles/voiceover/)
- [Keyboard Testing Guide](https://webaim.org/articles/keyboard/)

This framework ensures your claude-flow projects meet WCAG 2.1 AA compliance while leveraging automation to reduce manual testing burden.