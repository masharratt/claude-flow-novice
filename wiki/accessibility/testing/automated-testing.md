# Automated Accessibility Testing with Claude-Flow Agents

This guide provides comprehensive automated accessibility testing strategies using claude-flow agents to ensure continuous WCAG compliance and inclusive design validation.

## 🎯 Overview

Automated accessibility testing forms the foundation of an inclusive development workflow. By integrating accessibility testing directly into the development process using claude-flow agents, teams can catch and fix issues early while maintaining high development velocity.

## 🤖 Agent-Driven Testing Architecture

### Core Testing Agents

#### 1. Accessibility Scanner Agent
```typescript
// agents/AccessibilityScanner.ts
export class AccessibilityScannerAgent {
  private axeCore: AxeCore;
  private pa11y: Pa11y;
  private lighthouseCI: LighthouseCI;

  async scanComponent(componentPath: string): Promise<AccessibilityReport> {
    const results = await Promise.all([
      this.runAxeCore(componentPath),
      this.runPa11y(componentPath),
      this.runLighthouse(componentPath)
    ]);

    return this.consolidateResults(results);
  }

  async runAxeCore(target: string): Promise<AxeResults> {
    const config = {
      rules: {
        'color-contrast': { enabled: true },
        'keyboard-navigation': { enabled: true },
        'landmark-one-main': { enabled: true },
        'page-has-heading-one': { enabled: true }
      },
      tags: ['wcag2a', 'wcag2aa', 'wcag21aa']
    };

    return await this.axeCore.run(target, config);
  }

  async runPa11y(url: string): Promise<Pa11yResults> {
    return await this.pa11y(url, {
      standard: 'WCAG2AA',
      reporter: 'json',
      includeNotices: true,
      includeWarnings: true
    });
  }

  private consolidateResults(results: any[]): AccessibilityReport {
    return {
      score: this.calculateScore(results),
      violations: this.extractViolations(results),
      warnings: this.extractWarnings(results),
      recommendations: this.generateRecommendations(results),
      timestamp: new Date().toISOString()
    };
  }
}
```

#### 2. Keyboard Navigation Validator
```typescript
// agents/KeyboardNavigationValidator.ts
export class KeyboardNavigationValidator {
  async validateKeyboardAccess(page: Page): Promise<KeyboardTestResults> {
    const results = {
      focusableElements: [],
      keyboardTraps: [],
      missingFocusIndicators: [],
      tabOrder: [],
      skipLinks: []
    };

    // Test tab navigation
    await this.testTabNavigation(page, results);

    // Test keyboard shortcuts
    await this.testKeyboardShortcuts(page, results);

    // Test escape key functionality
    await this.testEscapeKey(page, results);

    // Test arrow key navigation
    await this.testArrowNavigation(page, results);

    return results;
  }

  private async testTabNavigation(page: Page, results: any) {
    const focusableElements = await page.$$eval(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      elements => elements.map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        ariaLabel: el.getAttribute('aria-label'),
        tabIndex: el.tabIndex
      }))
    );

    // Test each focusable element
    for (let i = 0; i < focusableElements.length; i++) {
      await page.keyboard.press('Tab');

      const activeElement = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          tagName: el?.tagName,
          id: el?.id,
          hasFocusIndicator: window.getComputedStyle(el as Element).outline !== 'none'
        };
      });

      if (!activeElement.hasFocusIndicator) {
        results.missingFocusIndicators.push({
          element: activeElement,
          index: i
        });
      }

      results.tabOrder.push(activeElement);
    }
  }

  private async testKeyboardShortcuts(page: Page, results: any) {
    const shortcuts = [
      { key: 'Escape', description: 'Close modal/dropdown' },
      { key: 'Enter', description: 'Activate button/link' },
      { key: 'Space', description: 'Activate button/checkbox' },
      { key: 'ArrowDown', description: 'Navigate menu/list' },
      { key: 'ArrowUp', description: 'Navigate menu/list' }
    ];

    for (const shortcut of shortcuts) {
      await page.keyboard.press(shortcut.key);
      // Validate expected behavior
      const response = await this.validateShortcutResponse(page, shortcut);
      results.shortcuts = results.shortcuts || [];
      results.shortcuts.push(response);
    }
  }
}
```

#### 3. Screen Reader Compatibility Agent
```typescript
// agents/ScreenReaderCompatibilityAgent.ts
export class ScreenReaderCompatibilityAgent {
  async testScreenReaderCompatibility(page: Page): Promise<ScreenReaderResults> {
    const results = {
      ariaLabels: [],
      landmarks: [],
      headingStructure: [],
      liveRegions: [],
      descriptions: []
    };

    // Test ARIA labels and descriptions
    await this.testAriaAttributes(page, results);

    // Test landmark roles
    await this.testLandmarks(page, results);

    // Test heading hierarchy
    await this.testHeadingStructure(page, results);

    // Test live regions
    await this.testLiveRegions(page, results);

    return results;
  }

  private async testAriaAttributes(page: Page, results: any) {
    const elementsWithAria = await page.$$eval('[aria-label], [aria-labelledby], [aria-describedby]',
      elements => elements.map(el => ({
        tagName: el.tagName,
        ariaLabel: el.getAttribute('aria-label'),
        ariaLabelledby: el.getAttribute('aria-labelledby'),
        ariaDescribedby: el.getAttribute('aria-describedby'),
        textContent: el.textContent?.trim()
      }))
    );

    for (const element of elementsWithAria) {
      if (!element.ariaLabel && !element.ariaLabelledby && !element.textContent) {
        results.ariaLabels.push({
          element,
          issue: 'Missing accessible name',
          severity: 'error'
        });
      }
    }
  }

  private async testHeadingStructure(page: Page, results: any) {
    const headings = await page.$$eval('h1, h2, h3, h4, h5, h6',
      elements => elements.map(el => ({
        level: parseInt(el.tagName.charAt(1)),
        text: el.textContent?.trim(),
        id: el.id
      }))
    );

    // Validate heading hierarchy
    for (let i = 0; i < headings.length - 1; i++) {
      const current = headings[i];
      const next = headings[i + 1];

      if (next.level > current.level + 1) {
        results.headingStructure.push({
          issue: 'Heading level skipped',
          from: current,
          to: next,
          severity: 'warning'
        });
      }
    }

    // Check for missing h1
    if (!headings.some(h => h.level === 1)) {
      results.headingStructure.push({
        issue: 'Missing h1 element',
        severity: 'error'
      });
    }
  }
}
```

## 🔧 Testing Configuration

### Jest Configuration for Accessibility Testing
```javascript
// jest.config.accessibility.js
module.exports = {
  displayName: 'Accessibility Tests',
  testMatch: ['**/*.a11y.test.{js,ts,tsx}'],
  setupFilesAfterEnv: [
    '<rootDir>/src/testing/setupAccessibilityTests.js'
  ],
  testEnvironment: 'jsdom',
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.test.json'
    }
  }
};
```

### Setup File for Accessibility Testing
```javascript
// src/testing/setupAccessibilityTests.js
import 'jest-axe/extend-expect';
import { configureAxe } from 'jest-axe';

// Configure axe for consistent testing
const axe = configureAxe({
  rules: {
    // Disable problematic rules for testing environment
    'color-contrast': { enabled: false }, // Will be tested separately
    'landmark-one-main': { enabled: true },
    'page-has-heading-one': { enabled: true }
  }
});

global.axe = axe;

// Mock IntersectionObserver for testing
global.IntersectionObserver = class IntersectionObserver {
  constructor() {}
  disconnect() {}
  observe() {}
  unobserve() {}
};

// Add custom matchers
expect.extend({
  toBeAccessible: async (received) => {
    const results = await axe(received);
    const pass = results.violations.length === 0;

    return {
      pass,
      message: () => pass
        ? 'Expected element to have accessibility violations'
        : `Expected element to be accessible but found ${results.violations.length} violations:\n${
            results.violations.map(v => `- ${v.description}`).join('\n')
          }`
    };
  }
});
```

## 🧪 Test Suites

### Component Accessibility Tests
```javascript
// components/Button/Button.a11y.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import Button from './Button';

describe('Button Accessibility', () => {
  it('should be accessible with axe', async () => {
    const { container } = render(<Button>Click me</Button>);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should be keyboard accessible', async () => {
    const handleClick = jest.fn();
    render(<Button onClick={handleClick}>Click me</Button>);

    const button = screen.getByRole('button', { name: 'Click me' });

    // Test Tab navigation
    await userEvent.tab();
    expect(button).toHaveFocus();

    // Test Enter key activation
    await userEvent.keyboard('{Enter}');
    expect(handleClick).toHaveBeenCalledTimes(1);

    // Test Space key activation
    await userEvent.keyboard(' ');
    expect(handleClick).toHaveBeenCalledTimes(2);
  });

  it('should have proper ARIA attributes', () => {
    render(<Button disabled aria-describedby="help-text">Submit</Button>);

    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAttribute('aria-describedby', 'help-text');
  });

  it('should maintain focus visibility', () => {
    render(<Button>Focus me</Button>);
    const button = screen.getByRole('button');

    button.focus();

    // Check for focus indicator (this would need actual CSS testing)
    expect(button).toHaveFocus();
    expect(button).toHaveClass('focus-visible'); // Assuming focus-visible class
  });
});
```

### Form Accessibility Tests
```javascript
// components/Form/Form.a11y.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import ContactForm from './ContactForm';

describe('ContactForm Accessibility', () => {
  it('should be accessible', async () => {
    const { container } = render(<ContactForm />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have proper labels', () => {
    render(<ContactForm />);

    expect(screen.getByLabelText('Name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Message')).toBeInTheDocument();
  });

  it('should announce validation errors', async () => {
    render(<ContactForm />);

    const submitButton = screen.getByRole('button', { name: 'Submit' });
    await userEvent.click(submitButton);

    // Check for error messages
    expect(screen.getByRole('alert')).toHaveTextContent('Name is required');

    // Check aria-invalid is set
    const nameInput = screen.getByLabelText('Name');
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
  });

  it('should support keyboard navigation', async () => {
    render(<ContactForm />);

    // Tab through form fields
    await userEvent.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByLabelText('Email')).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByLabelText('Message')).toHaveFocus();

    await userEvent.tab();
    expect(screen.getByRole('button', { name: 'Submit' })).toHaveFocus();
  });
});
```

### Navigation Accessibility Tests
```javascript
// components/Navigation/Navigation.a11y.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import Navigation from './Navigation';

describe('Navigation Accessibility', () => {
  const mockItems = [
    { id: '1', label: 'Home', href: '/' },
    { id: '2', label: 'About', href: '/about' },
    { id: '3', label: 'Contact', href: '/contact' }
  ];

  it('should be accessible', async () => {
    const { container } = render(<Navigation items={mockItems} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('should have proper landmark roles', () => {
    render(<Navigation items={mockItems} />);

    expect(screen.getByRole('navigation')).toBeInTheDocument();
    expect(screen.getByRole('navigation')).toHaveAttribute('aria-label', 'Main navigation');
  });

  it('should support keyboard navigation', async () => {
    render(<Navigation items={mockItems} />);

    // Test arrow key navigation
    const firstLink = screen.getByRole('link', { name: 'Home' });
    firstLink.focus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'About' })).toHaveFocus();

    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Contact' })).toHaveFocus();

    // Test wrap-around
    await userEvent.keyboard('{ArrowDown}');
    expect(screen.getByRole('link', { name: 'Home' })).toHaveFocus();
  });

  it('should have skip links', () => {
    render(<Navigation items={mockItems} />);

    const skipLink = screen.getByText('Skip to main content');
    expect(skipLink).toBeInTheDocument();
    expect(skipLink).toHaveAttribute('href', '#main-content');
  });
});
```

## 🚀 Continuous Integration Integration

### GitHub Actions Workflow
```yaml
# .github/workflows/accessibility-tests.yml
name: Accessibility Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  accessibility:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v3

    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
        cache: 'npm'

    - name: Install dependencies
      run: npm ci

    - name: Run accessibility tests
      run: |
        npm run test:a11y
        npm run test:a11y:lighthouse
        npm run test:a11y:pa11y

    - name: Generate accessibility report
      run: npm run generate:a11y-report

    - name: Upload accessibility report
      uses: actions/upload-artifact@v3
      with:
        name: accessibility-report
        path: reports/accessibility/

    - name: Comment PR with accessibility results
      if: github.event_name == 'pull_request'
      uses: actions/github-script@v6
      with:
        script: |
          const fs = require('fs');
          const report = JSON.parse(fs.readFileSync('reports/accessibility/summary.json'));

          const comment = `## Accessibility Test Results

          - **Score**: ${report.score}/100
          - **Violations**: ${report.violations}
          - **Warnings**: ${report.warnings}

          ${report.score < 90 ? '⚠️ Accessibility score below threshold' : '✅ All accessibility tests passed'}

          [View full report](${report.reportUrl})`;

          github.rest.issues.createComment({
            issue_number: context.issue.number,
            owner: context.repo.owner,
            repo: context.repo.repo,
            body: comment
          });
```

### NPM Scripts for Testing
```json
{
  "scripts": {
    "test:a11y": "jest --config=jest.config.accessibility.js",
    "test:a11y:watch": "jest --config=jest.config.accessibility.js --watch",
    "test:a11y:lighthouse": "lighthouse-ci autorun",
    "test:a11y:pa11y": "pa11y-ci --sitemap http://localhost:3000/sitemap.xml",
    "test:a11y:axe": "axe http://localhost:3000 --tags wcag2a,wcag2aa",
    "generate:a11y-report": "node scripts/generate-accessibility-report.js"
  }
}
```

## 🎯 Claude-Flow Agent Commands

### Comprehensive Accessibility Testing
```bash
# Run full accessibility audit
npx claude-flow sparc run accessibility-audit "Comprehensive WCAG 2.1 AA audit of entire application"

# Test specific components
npx claude-flow sparc run component-a11y-test "Test Button, Form, and Navigation components for accessibility"

# Keyboard navigation testing
npx claude-flow sparc run keyboard-test "Validate complete keyboard navigation flow"

# Screen reader compatibility
npx claude-flow sparc run screen-reader-test "Test with NVDA, JAWS, and VoiceOver compatibility"

# Color contrast validation
npx claude-flow sparc run contrast-test "Validate all color combinations meet WCAG AA requirements"
```

### Batch Testing with Agents
```bash
# Run multiple accessibility tests in parallel
npx claude-flow sparc batch "accessibility-audit,keyboard-test,screen-reader-test" "Complete accessibility validation"

# Continuous monitoring
npx claude-flow sparc concurrent accessibility-monitor "Monitor accessibility in real-time during development"
```

## 📊 Reporting and Metrics

### Accessibility Dashboard
```typescript
// utils/AccessibilityDashboard.ts
export class AccessibilityDashboard {
  async generateReport(): Promise<AccessibilityDashboard> {
    const metrics = await this.collectMetrics();

    return {
      overallScore: metrics.overallScore,
      wcagCompliance: {
        level_A: metrics.wcag.levelA,
        level_AA: metrics.wcag.levelAA
      },
      componentScores: metrics.componentScores,
      trends: metrics.trends,
      recommendations: this.generateRecommendations(metrics)
    };
  }

  private async collectMetrics() {
    return {
      overallScore: await this.calculateOverallScore(),
      wcag: await this.getWCAGCompliance(),
      componentScores: await this.getComponentScores(),
      trends: await this.getTrends()
    };
  }
}
```

### Custom Accessibility Metrics
```javascript
// Custom Jest reporter for accessibility metrics
class AccessibilityReporter {
  onRunComplete(contexts, results) {
    const accessibilityResults = results.testResults
      .filter(result => result.testFilePath.includes('.a11y.test.'))
      .map(result => ({
        file: result.testFilePath,
        passed: result.numPassingTests,
        failed: result.numFailingTests,
        score: (result.numPassingTests / (result.numPassingTests + result.numFailingTests)) * 100
      }));

    const overallScore = accessibilityResults.reduce((acc, curr) => acc + curr.score, 0) / accessibilityResults.length;

    console.log('\n🎯 Accessibility Test Results:');
    console.log(`Overall Score: ${overallScore.toFixed(1)}%`);
    console.log(`Components Tested: ${accessibilityResults.length}`);

    accessibilityResults.forEach(result => {
      const status = result.score === 100 ? '✅' : result.score >= 80 ? '⚠️' : '❌';
      console.log(`${status} ${result.file}: ${result.score.toFixed(1)}%`);
    });
  }
}

module.exports = AccessibilityReporter;
```

## 🔄 Best Practices

### 1. Test Early and Often
- Run accessibility tests on every commit
- Include accessibility tests in code reviews
- Test with real assistive technologies

### 2. Comprehensive Coverage
- Test all user flows, not just individual components
- Include edge cases and error states
- Test across different devices and screen sizes

### 3. Real User Testing
- Supplement automated testing with manual testing
- Include users with disabilities in testing process
- Test with actual assistive technologies

### 4. Continuous Monitoring
- Monitor accessibility metrics over time
- Set up alerts for accessibility regressions
- Regular accessibility audits by experts

This automated testing framework ensures that accessibility is continuously validated throughout the development process, making it easier to maintain WCAG compliance and create truly inclusive applications.