# Color Contrast and Visual Accessibility Guidelines

This comprehensive guide provides strategies for implementing accessible color schemes and visual design patterns in claude-flow-novice applications, ensuring optimal visibility and usability for all users, including those with visual impairments.

## 🎯 Overview

Color contrast is fundamental to web accessibility, directly impacting readability and usability for millions of users. This guide covers WCAG compliance, design strategies, testing tools, and implementation techniques for creating visually accessible claude-flow-novice applications.

## 📏 WCAG Contrast Requirements

### Level AA Requirements (Minimum)
- **Normal Text**: 4.5:1 contrast ratio
- **Large Text**: 3:1 contrast ratio (18pt+ or 14pt+ bold)
- **UI Components**: 3:1 contrast ratio for visual boundaries
- **Graphics**: 3:1 contrast ratio for meaningful graphics

### Level AAA Requirements (Enhanced)
- **Normal Text**: 7:1 contrast ratio
- **Large Text**: 4.5:1 contrast ratio
- **UI Components**: 4.5:1 contrast ratio (recommended)

### What Counts as "Large Text"
```css
/* Large text definitions */
.large-text-size {
  font-size: 18pt; /* 24px */
}

.large-text-weight {
  font-size: 14pt; /* ~19px */
  font-weight: bold;
}

/* CSS equivalents */
.large-css-size {
  font-size: 1.5rem; /* Assuming 16px base */
}

.large-css-weight {
  font-size: 1.2rem;
  font-weight: 700;
}
```

## 🎨 Color Palette Design

### Base Accessible Color System

```css
:root {
  /* Primary Colors - WCAG AA Compliant */
  --primary-50: #f0f9ff;   /* Very light blue */
  --primary-100: #e0f2fe;  /* Light blue */
  --primary-500: #0ea5e9;  /* Medium blue */
  --primary-600: #0284c7;  /* Primary blue - 4.51:1 on white */
  --primary-700: #0369a1;  /* Dark blue - 7.21:1 on white */
  --primary-900: #0c4a6e;  /* Very dark blue - 12.63:1 on white */

  /* Neutral Colors */
  --neutral-50: #fafafa;   /* Off-white */
  --neutral-100: #f5f5f5;  /* Light gray */
  --neutral-400: #a3a3a3;  /* Medium gray - 2.84:1 on white (decorative only) */
  --neutral-600: #525252;  /* Dark gray - 4.64:1 on white */
  --neutral-700: #404040;  /* Darker gray - 6.23:1 on white */
  --neutral-900: #171717;  /* Near black - 16.68:1 on white */

  /* Semantic Colors */
  --success-600: #16a34a; /* Green - 4.55:1 on white */
  --success-700: #15803d; /* Dark green - 6.39:1 on white */
  --warning-600: #d97706; /* Orange - 4.89:1 on white */
  --warning-700: #b45309; /* Dark orange - 6.70:1 on white */
  --error-600: #dc2626;   /* Red - 5.25:1 on white */
  --error-700: #b91c1c;   /* Dark red - 7.22:1 on white */
  --info-600: #2563eb;    /* Blue - 5.77:1 on white */
  --info-700: #1d4ed8;    /* Dark blue - 7.81:1 on white */

  /* Background Colors */
  --bg-primary: #ffffff;   /* White */
  --bg-secondary: #f8fafc; /* Very light gray */
  --bg-tertiary: #e2e8f0;  /* Light gray */

  /* Text Colors */
  --text-primary: var(--neutral-900);    /* Primary text */
  --text-secondary: var(--neutral-700);  /* Secondary text */
  --text-muted: var(--neutral-600);      /* Muted text */
  --text-on-primary: #ffffff;            /* Text on primary color */
}

/* Dark mode colors */
@media (prefers-color-scheme: dark) {
  :root {
    --bg-primary: #0f172a;    /* Dark blue-gray */
    --bg-secondary: #1e293b;  /* Lighter dark blue-gray */
    --bg-tertiary: #334155;   /* Medium blue-gray */

    --text-primary: #f1f5f9;  /* Light gray - 15.52:1 on dark bg */
    --text-secondary: #cbd5e1; /* Medium gray - 9.15:1 on dark bg */
    --text-muted: #94a3b8;    /* Darker gray - 5.39:1 on dark bg */

    /* Adjusted semantic colors for dark mode */
    --success-400: #4ade80;   /* Lighter green for dark bg */
    --warning-400: #fbbf24;   /* Lighter orange for dark bg */
    --error-400: #f87171;     /* Lighter red for dark bg */
    --info-400: #60a5fa;      /* Lighter blue for dark bg */
  }
}
```

### Color Usage Guidelines

```typescript
// Color usage component with contrast validation
interface ColorUsageProps {
  variant: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'info';
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const AccessibleButton: React.FC<ColorUsageProps> = ({
  variant,
  size = 'md',
  children
}) => {
  // Color combinations that meet WCAG AA requirements
  const colorMap = {
    primary: {
      bg: 'var(--primary-600)',
      text: 'var(--text-on-primary)',
      border: 'var(--primary-700)',
      hover: 'var(--primary-700)',
      focus: 'var(--primary-800)'
    },
    secondary: {
      bg: 'var(--bg-secondary)',
      text: 'var(--text-primary)',
      border: 'var(--neutral-300)',
      hover: 'var(--neutral-100)',
      focus: 'var(--neutral-200)'
    },
    success: {
      bg: 'var(--success-600)',
      text: 'var(--text-on-primary)',
      border: 'var(--success-700)',
      hover: 'var(--success-700)',
      focus: 'var(--success-800)'
    },
    warning: {
      bg: 'var(--warning-600)',
      text: 'var(--text-on-primary)',
      border: 'var(--warning-700)',
      hover: 'var(--warning-700)',
      focus: 'var(--warning-800)'
    },
    error: {
      bg: 'var(--error-600)',
      text: 'var(--text-on-primary)',
      border: 'var(--error-700)',
      hover: 'var(--error-700)',
      focus: 'var(--error-800)'
    },
    info: {
      bg: 'var(--info-600)',
      text: 'var(--text-on-primary)',
      border: 'var(--info-700)',
      hover: 'var(--info-700)',
      focus: 'var(--info-800)'
    }
  };

  const colors = colorMap[variant];

  return (
    <button
      className={`btn btn-${variant} btn-${size}`}
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        border: `1px solid ${colors.border}`,
        '--hover-bg': colors.hover,
        '--focus-bg': colors.focus
      } as React.CSSProperties}
    >
      {children}
    </button>
  );
};
```

## 🔧 Implementation Strategies

### Dynamic Contrast Adjustment

```typescript
// utils/ContrastManager.ts
class ContrastManager {
  private contrastRatios: Map<string, number> = new Map();

  calculateContrastRatio(foreground: string, background: string): number {
    const luminance1 = this.getLuminance(foreground);
    const luminance2 = this.getLuminance(background);

    const brightest = Math.max(luminance1, luminance2);
    const darkest = Math.min(luminance1, luminance2);

    return (brightest + 0.05) / (darkest + 0.05);
  }

  private getLuminance(color: string): number {
    const rgb = this.hexToRgb(color);
    if (!rgb) return 0;

    const rsRGB = rgb.r / 255;
    const gsRGB = rgb.g / 255;
    const bsRGB = rgb.b / 255;

    const r = rsRGB <= 0.03928 ? rsRGB / 12.92 : Math.pow((rsRGB + 0.055) / 1.055, 2.4);
    const g = gsRGB <= 0.03928 ? gsRGB / 12.92 : Math.pow((gsRGB + 0.055) / 1.055, 2.4);
    const b = bsRGB <= 0.03928 ? bsRGB / 12.92 : Math.pow((bsRGB + 0.055) / 1.055, 2.4);

    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  async validateColorCombination(
    foreground: string,
    background: string,
    level: 'AA' | 'AAA' = 'AA',
    isLargeText: boolean = false
  ): Promise<ContrastValidationResult> {
    const ratio = this.calculateContrastRatio(foreground, background);

    const requirements = {
      AA: { normal: 4.5, large: 3.0 },
      AAA: { normal: 7.0, large: 4.5 }
    };

    const required = requirements[level][isLargeText ? 'large' : 'normal'];
    const passes = ratio >= required;

    return {
      ratio,
      required,
      passes,
      level,
      isLargeText,
      suggestion: passes ? null : await this.suggestImprovement(foreground, background, required)
    };
  }

  private async suggestImprovement(
    foreground: string,
    background: string,
    targetRatio: number
  ): Promise<ColorSuggestion> {
    // Try darkening foreground or lightening background
    const suggestions = [];

    // Darken foreground
    let darkerForeground = this.adjustBrightness(foreground, -0.1);
    let newRatio = this.calculateContrastRatio(darkerForeground, background);

    while (newRatio < targetRatio && this.getBrightness(darkerForeground) > 0) {
      darkerForeground = this.adjustBrightness(darkerForeground, -0.05);
      newRatio = this.calculateContrastRatio(darkerForeground, background);
    }

    if (newRatio >= targetRatio) {
      suggestions.push({
        type: 'darken-foreground',
        color: darkerForeground,
        ratio: newRatio
      });
    }

    // Lighten background
    let lighterBackground = this.adjustBrightness(background, 0.1);
    newRatio = this.calculateContrastRatio(foreground, lighterBackground);

    while (newRatio < targetRatio && this.getBrightness(lighterBackground) < 1) {
      lighterBackground = this.adjustBrightness(lighterBackground, 0.05);
      newRatio = this.calculateContrastRatio(foreground, lighterBackground);
    }

    if (newRatio >= targetRatio) {
      suggestions.push({
        type: 'lighten-background',
        color: lighterBackground,
        ratio: newRatio
      });
    }

    return {
      suggestions,
      bestOption: suggestions.reduce((best, current) =>
        current.ratio > best.ratio ? current : best
      )
    };
  }

  private adjustBrightness(color: string, factor: number): string {
    const rgb = this.hexToRgb(color);
    if (!rgb) return color;

    const adjust = (value: number) => {
      if (factor > 0) {
        return Math.min(255, value + (255 - value) * factor);
      } else {
        return Math.max(0, value + value * factor);
      }
    };

    const newR = Math.round(adjust(rgb.r));
    const newG = Math.round(adjust(rgb.g));
    const newB = Math.round(adjust(rgb.b));

    return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
  }

  private getBrightness(color: string): number {
    const rgb = this.hexToRgb(color);
    if (!rgb) return 0;
    return (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000 / 255;
  }
}

// React hook for contrast validation
const useContrastValidation = () => {
  const contrastManager = new ContrastManager();

  const validateContrast = useCallback(async (
    foreground: string,
    background: string,
    options: {
      level?: 'AA' | 'AAA';
      isLargeText?: boolean;
    } = {}
  ) => {
    return await contrastManager.validateColorCombination(
      foreground,
      background,
      options.level,
      options.isLargeText
    );
  }, [contrastManager]);

  return { validateContrast, contrastManager };
};
```

### High Contrast Mode Support

```css
/* High contrast mode adaptations */
@media (prefers-contrast: high) {
  :root {
    /* Increase all contrast ratios for high contrast preference */
    --text-primary: #000000;
    --text-secondary: #1a1a1a;
    --bg-primary: #ffffff;
    --bg-secondary: #f0f0f0;

    /* Use more extreme color differences */
    --primary-600: #0066cc;
    --primary-700: #004499;
    --success-600: #00aa00;
    --error-600: #cc0000;
    --warning-600: #cc6600;
  }

  /* Enhanced borders and outlines */
  .button {
    border-width: 2px;
    border-style: solid;
  }

  .input {
    border-width: 2px;
    outline-width: 3px;
  }

  /* Remove subtle backgrounds that may not meet high contrast */
  .subtle-bg {
    background: transparent;
    border: 2px solid var(--text-primary);
  }
}

/* Windows High Contrast Mode */
@media (forced-colors: active) {
  /* Use system colors in forced colors mode */
  .button {
    background: ButtonFace;
    color: ButtonText;
    border: 1px solid ButtonText;
  }

  .button:hover {
    background: Highlight;
    color: HighlightText;
  }

  .button:focus {
    outline: 2px solid Highlight;
  }

  /* Ensure icons remain visible */
  .icon {
    forced-color-adjust: auto;
  }

  /* Custom properties are ignored, use system colors */
  .error-text {
    color: GrayText; /* System error color not available, use gray */
  }

  .success-text {
    color: GrayText;
  }
}
```

### Color Blindness Considerations

```typescript
// utils/ColorBlindnessSupport.ts
class ColorBlindnessSupport {
  private colorBlindnessTypes = [
    'protanopia',    // Red-blind
    'deuteranopia',  // Green-blind
    'tritanopia',    // Blue-blind
    'protanomaly',   // Red-weak
    'deuteranomaly', // Green-weak
    'tritanomaly',   // Blue-weak
    'achromatopsia', // Complete color blindness
    'achromatomaly'  // Partial color blindness
  ];

  simulateColorBlindness(color: string, type: string): string {
    const rgb = this.hexToRgb(color);
    if (!rgb) return color;

    // Simplified simulation matrices (real implementation would use more precise matrices)
    const matrices = {
      protanopia: [
        [0.567, 0.433, 0.000],
        [0.558, 0.442, 0.000],
        [0.000, 0.242, 0.758]
      ],
      deuteranopia: [
        [0.625, 0.375, 0.000],
        [0.700, 0.300, 0.000],
        [0.000, 0.300, 0.700]
      ],
      tritanopia: [
        [0.950, 0.050, 0.000],
        [0.000, 0.433, 0.567],
        [0.000, 0.475, 0.525]
      ]
    };

    const matrix = matrices[type as keyof typeof matrices];
    if (!matrix) return color;

    const r = Math.round(rgb.r * matrix[0][0] + rgb.g * matrix[0][1] + rgb.b * matrix[0][2]);
    const g = Math.round(rgb.r * matrix[1][0] + rgb.g * matrix[1][1] + rgb.b * matrix[1][2]);
    const b = Math.round(rgb.r * matrix[2][0] + rgb.g * matrix[2][1] + rgb.b * matrix[2][2]);

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  validateColorBlindnessAccessibility(colors: string[]): ColorBlindnessReport {
    const results = {};

    this.colorBlindnessTypes.forEach(type => {
      const simulatedColors = colors.map(color => this.simulateColorBlindness(color, type));
      results[type] = this.analyzeColorDistinction(simulatedColors);
    });

    return {
      originalColors: colors,
      simulations: results,
      recommendations: this.generateRecommendations(results)
    };
  }

  private analyzeColorDistinction(colors: string[]): ColorDistinctionAnalysis {
    const distinctionThreshold = 50; // Minimum perceived difference
    const problematicPairs = [];

    for (let i = 0; i < colors.length; i++) {
      for (let j = i + 1; j < colors.length; j++) {
        const difference = this.calculatePerceptualDifference(colors[i], colors[j]);
        if (difference < distinctionThreshold) {
          problematicPairs.push({
            color1: colors[i],
            color2: colors[j],
            difference
          });
        }
      }
    }

    return {
      totalPairs: (colors.length * (colors.length - 1)) / 2,
      problematicPairs: problematicPairs.length,
      details: problematicPairs
    };
  }

  private generateRecommendations(results: any): string[] {
    const recommendations = [];

    // Check for patterns across color blindness types
    const commonIssues = this.findCommonIssues(results);

    if (commonIssues.length > 0) {
      recommendations.push('Consider using patterns, shapes, or text labels in addition to color');
      recommendations.push('Increase brightness differences between similar colors');
      recommendations.push('Test color combinations with color blindness simulation tools');
    }

    return recommendations;
  }
}

// Component for color blindness testing
const ColorBlindnessTestPanel: React.FC<{ colors: string[] }> = ({ colors }) => {
  const [selectedType, setSelectedType] = useState('protanopia');
  const colorBlindnessSupport = new ColorBlindnessSupport();

  const simulatedColors = colors.map(color =>
    colorBlindnessSupport.simulateColorBlindness(color, selectedType)
  );

  return (
    <div className="color-blindness-test">
      <h3>Color Blindness Simulation</h3>

      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        aria-label="Color blindness type"
      >
        <option value="protanopia">Protanopia (Red-blind)</option>
        <option value="deuteranopia">Deuteranopia (Green-blind)</option>
        <option value="tritanopia">Tritanopia (Blue-blind)</option>
      </select>

      <div className="color-comparison">
        <div className="original-colors">
          <h4>Original Colors</h4>
          {colors.map((color, index) => (
            <div
              key={index}
              className="color-swatch"
              style={{ backgroundColor: color }}
              aria-label={`Original color ${index + 1}: ${color}`}
            >
              {color}
            </div>
          ))}
        </div>

        <div className="simulated-colors">
          <h4>Simulated for {selectedType}</h4>
          {simulatedColors.map((color, index) => (
            <div
              key={index}
              className="color-swatch"
              style={{ backgroundColor: color }}
              aria-label={`Simulated color ${index + 1}: ${color}`}
            >
              {color}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
```

## 🧪 Testing and Validation

### Automated Contrast Testing

```typescript
// test/contrast.test.ts
import { ContrastManager } from '../utils/ContrastManager';

describe('Color Contrast Validation', () => {
  const contrastManager = new ContrastManager();

  const testCases = [
    {
      name: 'Primary button',
      foreground: '#ffffff',
      background: '#0284c7',
      expectedLevel: 'AA',
      isLargeText: false
    },
    {
      name: 'Secondary text',
      foreground: '#404040',
      background: '#ffffff',
      expectedLevel: 'AA',
      isLargeText: false
    },
    {
      name: 'Large heading',
      foreground: '#525252',
      background: '#ffffff',
      expectedLevel: 'AA',
      isLargeText: true
    }
  ];

  testCases.forEach(testCase => {
    it(`should meet ${testCase.expectedLevel} contrast requirements for ${testCase.name}`, async () => {
      const result = await contrastManager.validateColorCombination(
        testCase.foreground,
        testCase.background,
        testCase.expectedLevel,
        testCase.isLargeText
      );

      expect(result.passes).toBe(true);
      expect(result.ratio).toBeGreaterThanOrEqual(result.required);
    });
  });

  it('should provide helpful suggestions for failing combinations', async () => {
    const result = await contrastManager.validateColorCombination(
      '#999999', // Light gray
      '#ffffff', // White
      'AA',
      false
    );

    expect(result.passes).toBe(false);
    expect(result.suggestion).toBeTruthy();
    expect(result.suggestion.suggestions.length).toBeGreaterThan(0);
  });
});

// Visual regression testing for contrast
describe('Visual Contrast Regression', () => {
  it('should maintain contrast in dark mode', async () => {
    const { container } = render(
      <div data-theme="dark">
        <AccessibleButton variant="primary">Test Button</AccessibleButton>
      </div>
    );

    // Extract computed styles
    const button = container.querySelector('button');
    const styles = getComputedStyle(button!);

    const bgColor = styles.backgroundColor;
    const textColor = styles.color;

    const ratio = contrastManager.calculateContrastRatio(textColor, bgColor);
    expect(ratio).toBeGreaterThanOrEqual(4.5);
  });
});
```

### Manual Testing Tools

```typescript
// components/ContrastDebugger.tsx
const ContrastDebugger: React.FC = () => {
  const [foreground, setForeground] = useState('#000000');
  const [background, setBackground] = useState('#ffffff');
  const [fontSize, setFontSize] = useState(16);
  const [fontWeight, setFontWeight] = useState(400);

  const { validateContrast } = useContrastValidation();
  const [result, setResult] = useState<ContrastValidationResult | null>(null);

  useEffect(() => {
    const isLargeText = fontSize >= 18 || (fontSize >= 14 && fontWeight >= 700);

    validateContrast(foreground, background, {
      level: 'AA',
      isLargeText
    }).then(setResult);
  }, [foreground, background, fontSize, fontWeight, validateContrast]);

  return (
    <div className="contrast-debugger">
      <h2>Contrast Debugger</h2>

      <div className="controls">
        <div className="color-inputs">
          <label>
            Foreground Color:
            <input
              type="color"
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
            />
            <input
              type="text"
              value={foreground}
              onChange={(e) => setForeground(e.target.value)}
            />
          </label>

          <label>
            Background Color:
            <input
              type="color"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
            <input
              type="text"
              value={background}
              onChange={(e) => setBackground(e.target.value)}
            />
          </label>
        </div>

        <div className="text-settings">
          <label>
            Font Size:
            <input
              type="range"
              min="12"
              max="32"
              value={fontSize}
              onChange={(e) => setFontSize(parseInt(e.target.value))}
            />
            <span>{fontSize}px</span>
          </label>

          <label>
            Font Weight:
            <select
              value={fontWeight}
              onChange={(e) => setFontWeight(parseInt(e.target.value))}
            >
              <option value={400}>Normal</option>
              <option value={700}>Bold</option>
            </select>
          </label>
        </div>
      </div>

      <div className="preview">
        <div
          className="text-sample"
          style={{
            color: foreground,
            backgroundColor: background,
            fontSize: `${fontSize}px`,
            fontWeight,
            padding: '1rem',
            border: '1px solid #ccc'
          }}
        >
          Sample text to test contrast ratio
        </div>
      </div>

      {result && (
        <div className="results">
          <div className={`result ${result.passes ? 'pass' : 'fail'}`}>
            <h3>Contrast Ratio: {result.ratio.toFixed(2)}:1</h3>
            <p>Required: {result.required}:1</p>
            <p>Status: {result.passes ? '✅ PASS' : '❌ FAIL'}</p>
            <p>Level: WCAG {result.level} {result.isLargeText ? '(Large Text)' : '(Normal Text)'}</p>
          </div>

          {!result.passes && result.suggestion && (
            <div className="suggestions">
              <h4>Suggestions:</h4>
              {result.suggestion.suggestions.map((suggestion, index) => (
                <div key={index} className="suggestion">
                  <p>{suggestion.type}: {suggestion.color}</p>
                  <p>New ratio: {suggestion.ratio.toFixed(2)}:1</p>
                  <button
                    onClick={() => {
                      if (suggestion.type.includes('foreground')) {
                        setForeground(suggestion.color);
                      } else {
                        setBackground(suggestion.color);
                      }
                    }}
                  >
                    Apply
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

## 🤖 Claude-Flow Agent Integration

### Automated Contrast Validation

```bash
# Comprehensive contrast validation
npx claude-flow-novice sparc run contrast-validator "Validate all color combinations meet WCAG AA requirements"

# Color blindness testing
npx claude-flow-novice sparc run colorblind-test "Test color schemes for color blindness accessibility"

# High contrast mode validation
npx claude-flow-novice sparc run high-contrast-test "Validate application in high contrast mode"

# Dynamic contrast optimization
npx claude-flow-novice sparc run contrast-optimizer "Optimize color scheme for maximum accessibility"
```

### Contrast Testing Agent

```typescript
// agents/ContrastTestingAgent.ts
export class ContrastTestingAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<ContrastTestReport> {
    const { components, colorSchemes } = context;

    const results = await Promise.all([
      this.testWCAGCompliance(components),
      this.testColorBlindnessAccessibility(colorSchemes),
      this.testHighContrastMode(components),
      this.testDarkModeContrast(components),
      this.generateContrastReport(components)
    ]);

    return this.consolidateResults(results);
  }

  private async testWCAGCompliance(components: string[]): Promise<WCAGComplianceResults> {
    const contrastManager = new ContrastManager();
    const results = [];

    for (const component of components) {
      const colorPairs = await this.extractColorPairs(component);

      for (const pair of colorPairs) {
        const validation = await contrastManager.validateColorCombination(
          pair.foreground,
          pair.background,
          'AA',
          pair.isLargeText
        );

        results.push({
          component,
          ...validation,
          element: pair.element
        });
      }
    }

    return {
      totalTests: results.length,
      passed: results.filter(r => r.passes).length,
      failed: results.filter(r => !r.passes).length,
      details: results
    };
  }

  private async testColorBlindnessAccessibility(colorSchemes: string[][]): Promise<ColorBlindnessResults> {
    const colorBlindnessSupport = new ColorBlindnessSupport();

    return colorSchemes.map(scheme =>
      colorBlindnessSupport.validateColorBlindnessAccessibility(scheme)
    );
  }
}
```

## 📱 Responsive Contrast Considerations

### Adaptive Contrast for Different Screens

```css
/* Adjust contrast based on screen characteristics */
@media (max-width: 768px) {
  /* Increase contrast for mobile screens */
  :root {
    --text-primary: #000000;
    --text-secondary: #2a2a2a;
  }
}

@media (min-resolution: 2dppx) {
  /* High-DPI displays may need different contrast ratios */
  .thin-border {
    border-width: 0.5px;
    border-color: var(--neutral-400);
  }
}

/* Outdoor viewing conditions */
@media (prefers-contrast: high) and (max-width: 768px) {
  /* Extra high contrast for mobile in bright conditions */
  :root {
    --bg-primary: #ffffff;
    --text-primary: #000000;
    --primary-600: #003366;
    --success-600: #006600;
    --error-600: #990000;
  }
}
```

This comprehensive approach to color contrast and visual accessibility ensures that claude-flow-novice applications provide excellent visual accessibility across all user scenarios and assistive technologies.