# Inclusive Design Patterns for Claude-Flow Projects

This guide provides proven inclusive design patterns that work well with claude-flow's agent-driven development approach, ensuring accessibility is built into every component from the start.

## 🎯 Core Principles

### 1. Inclusive by Default
Design for the extremes to benefit everyone. Solutions that work for users with disabilities often improve the experience for all users.

### 2. Progressive Enhancement
Start with a solid, accessible foundation and enhance with advanced features that don't break the base experience.

### 3. Multiple Modalities
Provide multiple ways to access and interact with content (visual, auditory, tactile, cognitive).

## 🧩 Component Patterns

### Navigation Patterns

#### Accessible Navigation Menu
```typescript
// AccessibleNavigation.tsx
interface NavigationProps {
  items: NavigationItem[];
  currentPath: string;
  level?: number;
}

const AccessibleNavigation: React.FC<NavigationProps> = ({
  items,
  currentPath,
  level = 1
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLElement>(null);

  // Enhanced keyboard navigation
  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        focusNextItem();
        break;
      case 'ArrowUp':
        focusPreviousItem();
        break;
    }
  };

  return (
    <nav
      role="navigation"
      aria-label={level === 1 ? "Main navigation" : "Submenu"}
      ref={menuRef}
    >
      <button
        aria-expanded={isOpen}
        aria-controls="navigation-menu"
        aria-haspopup="true"
        onClick={() => setIsOpen(!isOpen)}
        className="nav-toggle"
      >
        Menu
        <span className="sr-only">
          {isOpen ? 'Close' : 'Open'} navigation menu
        </span>
      </button>

      <ul
        id="navigation-menu"
        role="menubar"
        aria-hidden={!isOpen}
        onKeyDown={handleKeyDown}
      >
        {items.map((item, index) => (
          <NavigationItem
            key={item.id}
            item={item}
            isActive={currentPath === item.path}
            index={index}
          />
        ))}
      </ul>
    </nav>
  );
};

// Agent integration for testing
export const navigationAccessibilityTests = {
  keyboardNavigation: true,
  screenReaderSupport: true,
  focusManagement: true,
  ariaCompliance: true
};
```

#### Skip Links Pattern
```typescript
// SkipLinks.tsx
const SkipLinks: React.FC = () => {
  const skipLinks = [
    { href: '#main-content', text: 'Skip to main content' },
    { href: '#navigation', text: 'Skip to navigation' },
    { href: '#footer', text: 'Skip to footer' }
  ];

  return (
    <div className="skip-links">
      {skipLinks.map((link) => (
        <a
          key={link.href}
          href={link.href}
          className="skip-link"
          onFocus={(e) => e.target.scrollIntoView()}
        >
          {link.text}
        </a>
      ))}
    </div>
  );
};

// CSS for skip links
const skipLinkStyles = `
.skip-links {
  position: absolute;
  top: -40px;
  left: 6px;
  z-index: 1000;
}

.skip-link {
  position: absolute;
  left: -10000px;
  top: auto;
  width: 1px;
  height: 1px;
  overflow: hidden;
}

.skip-link:focus {
  position: static;
  width: auto;
  height: auto;
  background: #000;
  color: #fff;
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 4px;
}
`;
```

### Form Patterns

#### Accessible Form with Error Handling
```typescript
// AccessibleForm.tsx
interface FormFieldProps {
  label: string;
  type: string;
  required?: boolean;
  error?: string;
  helpText?: string;
  value: string;
  onChange: (value: string) => void;
}

const AccessibleFormField: React.FC<FormFieldProps> = ({
  label,
  type,
  required = false,
  error,
  helpText,
  value,
  onChange
}) => {
  const fieldId = useId();
  const errorId = `${fieldId}-error`;
  const helpId = `${fieldId}-help`;

  return (
    <div className={`form-field ${error ? 'has-error' : ''}`}>
      <label htmlFor={fieldId} className="form-label">
        {label}
        {required && <span aria-label="required" className="required">*</span>}
      </label>

      {helpText && (
        <div id={helpId} className="help-text">
          {helpText}
        </div>
      )}

      <input
        id={fieldId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-required={required}
        aria-invalid={!!error}
        aria-describedby={`
          ${helpText ? helpId : ''}
          ${error ? errorId : ''}
        `.trim()}
        className="form-input"
      />

      {error && (
        <div
          id={errorId}
          role="alert"
          className="error-message"
          aria-live="polite"
        >
          <Icon name="error" aria-hidden="true" />
          {error}
        </div>
      )}
    </div>
  );
};

// Live validation with announcements
const useAccessibleValidation = (value: string, validator: Function) => {
  const [error, setError] = useState<string>('');
  const announceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const validationError = validator(value);
    setError(validationError);

    // Announce validation errors to screen readers
    if (validationError && announceRef.current) {
      announceRef.current.textContent = `Error: ${validationError}`;
    }
  }, [value, validator]);

  return {
    error,
    announcement: <div ref={announceRef} aria-live="polite" className="sr-only" />
  };
};
```

#### Multi-Step Form Pattern
```typescript
// AccessibleMultiStepForm.tsx
const AccessibleMultiStepForm: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(0);
  const totalSteps = 4;

  return (
    <div className="multi-step-form">
      {/* Progress indicator */}
      <div role="progressbar"
           aria-valuenow={currentStep + 1}
           aria-valuemin={1}
           aria-valuemax={totalSteps}
           aria-label={`Step ${currentStep + 1} of ${totalSteps}`}>
        <div className="progress-visual">
          {Array.from({ length: totalSteps }, (_, index) => (
            <div
              key={index}
              className={`step ${index <= currentStep ? 'completed' : ''}`}
              aria-current={index === currentStep ? 'step' : undefined}
            >
              <span className="sr-only">
                {index < currentStep ? 'Completed: ' :
                 index === currentStep ? 'Current: ' : ''}
                Step {index + 1}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Step content with proper headings */}
      <main role="main">
        <h1>Registration Form</h1>
        <h2>Step {currentStep + 1}: {stepTitles[currentStep]}</h2>

        <StepContent step={currentStep} />

        <div className="form-navigation">
          {currentStep > 0 && (
            <button type="button" onClick={() => setCurrentStep(currentStep - 1)}>
              Previous Step
            </button>
          )}

          <button
            type={currentStep === totalSteps - 1 ? 'submit' : 'button'}
            onClick={() => currentStep < totalSteps - 1 && setCurrentStep(currentStep + 1)}
          >
            {currentStep === totalSteps - 1 ? 'Submit' : 'Next Step'}
          </button>
        </div>
      </main>
    </div>
  );
};
```

### Interactive Patterns

#### Accessible Modal Dialog
```typescript
// AccessibleModal.tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

const AccessibleModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Move focus to modal
      modalRef.current?.focus();

      // Trap focus within modal
      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }

        if (e.key === 'Tab') {
          trapFocus(e, modalRef.current);
        }
      };

      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleKeyDown);
        document.body.style.overflow = '';
        // Restore focus
        previousFocusRef.current?.focus();
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" aria-hidden="true">
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal"
        tabIndex={-1}
      >
        <header className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="modal-close"
          >
            ×
          </button>
        </header>

        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};

// Focus trap utility
const trapFocus = (event: KeyboardEvent, container: HTMLElement | null) => {
  if (!container) return;

  const focusableElements = container.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  const firstElement = focusableElements[0] as HTMLElement;
  const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

  if (event.shiftKey) {
    if (document.activeElement === firstElement) {
      lastElement.focus();
      event.preventDefault();
    }
  } else {
    if (document.activeElement === lastElement) {
      firstElement.focus();
      event.preventDefault();
    }
  }
};
```

#### Accessible Accordion
```typescript
// AccessibleAccordion.tsx
interface AccordionItem {
  id: string;
  title: string;
  content: React.ReactNode;
}

const AccessibleAccordion: React.FC<{ items: AccordionItem[] }> = ({ items }) => {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());

  const toggleItem = (id: string) => {
    const newOpenItems = new Set(openItems);
    if (newOpenItems.has(id)) {
      newOpenItems.delete(id);
    } else {
      newOpenItems.add(id);
    }
    setOpenItems(newOpenItems);
  };

  const handleKeyDown = (event: KeyboardEvent, id: string) => {
    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        toggleItem(id);
        break;
    }
  };

  return (
    <div className="accordion">
      {items.map((item) => (
        <div key={item.id} className="accordion-item">
          <h3>
            <button
              type="button"
              aria-expanded={openItems.has(item.id)}
              aria-controls={`panel-${item.id}`}
              id={`button-${item.id}`}
              className="accordion-button"
              onClick={() => toggleItem(item.id)}
              onKeyDown={(e) => handleKeyDown(e, item.id)}
            >
              {item.title}
              <span aria-hidden="true" className="accordion-icon">
                {openItems.has(item.id) ? '−' : '+'}
              </span>
            </button>
          </h3>

          <div
            id={`panel-${item.id}`}
            role="region"
            aria-labelledby={`button-${item.id}`}
            className={`accordion-panel ${openItems.has(item.id) ? 'open' : ''}`}
          >
            <div className="accordion-content">
              {item.content}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
```

## 🤖 Claude-Flow Agent Integration

### Pattern Validation Agent
```bash
# Validate inclusive design patterns
npx claude-flow sparc run inclusive-design-review "Review all components for inclusive design patterns"

# Generate accessible component variations
npx claude-flow sparc run accessibility-generator "Generate WCAG AA compliant versions of UI components"

# Test pattern compliance
npx claude-flow sparc run pattern-validator "Validate all patterns meet inclusive design criteria"
```

### Automated Pattern Testing
```typescript
// agents/InclusiveDesignAgent.ts
export class InclusiveDesignAgent {
  async validatePattern(componentPath: string): Promise<PatternValidation> {
    const component = await this.loadComponent(componentPath);

    const validations = await Promise.all([
      this.checkKeyboardAccess(component),
      this.checkScreenReaderSupport(component),
      this.checkColorContrast(component),
      this.checkFocusManagement(component),
      this.checkSemanticMarkup(component)
    ]);

    return {
      component: componentPath,
      score: this.calculateScore(validations),
      issues: this.extractIssues(validations),
      recommendations: this.generateRecommendations(validations)
    };
  }

  async generateAccessibleVariant(component: string): Promise<string> {
    const analysis = await this.analyzeAccessibility(component);
    return this.generateCode(analysis);
  }
}
```

## 📱 Responsive and Mobile Patterns

### Touch-Friendly Interactive Elements
```css
/* Minimum touch target sizes */
.touch-target {
  min-height: 44px;
  min-width: 44px;
  padding: 12px;
  margin: 4px;
}

/* Adequate spacing between interactive elements */
.interactive-group > * + * {
  margin-top: 8px;
}

/* Visual feedback for touch */
.button:active {
  transform: translateY(1px);
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
```

### Zoom and Reflow Support
```css
/* Support 200% zoom without horizontal scrolling */
.container {
  max-width: 100%;
  overflow-x: hidden;
}

/* Flexible layouts that reflow */
.flex-container {
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
}

.flex-item {
  flex: 1 1 300px;
  min-width: 0;
}

/* Text spacing adaptability */
* {
  line-height: 1.5 !important;
  letter-spacing: 0.12em !important;
  word-spacing: 0.16em !important;
}
```

## 🎨 Visual Design Patterns

### Color and Contrast
```css
/* High contrast color scheme */
:root {
  --primary: #0066cc;
  --primary-dark: #004499;
  --text-primary: #212121;
  --text-secondary: #757575;
  --background: #ffffff;
  --error: #d32f2f;
  --success: #388e3c;
  --warning: #f57c00;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  :root {
    --primary: #4dabf7;
    --text-primary: #ffffff;
    --text-secondary: #b0b0b0;
    --background: #121212;
  }
}

/* Focus indicators */
.focusable:focus {
  outline: 3px solid var(--primary);
  outline-offset: 2px;
}
```

### Typography Patterns
```css
/* Accessible typography scale */
.text-xs { font-size: 0.75rem; line-height: 1.5; }
.text-sm { font-size: 0.875rem; line-height: 1.5; }
.text-base { font-size: 1rem; line-height: 1.5; }
.text-lg { font-size: 1.125rem; line-height: 1.5; }
.text-xl { font-size: 1.25rem; line-height: 1.4; }
.text-2xl { font-size: 1.5rem; line-height: 1.3; }

/* Reading-friendly fonts */
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-feature-settings: 'calt' 1, 'kern' 1;
}

/* Dyslexia-friendly options */
.dyslexia-friendly {
  font-family: 'OpenDyslexic', 'Comic Sans MS', cursive;
  letter-spacing: 0.05em;
  word-spacing: 0.1em;
}
```

## 🧠 Cognitive Accessibility Patterns

### Clear Information Architecture
```typescript
// Clear navigation hierarchy
const InformationArchitecture = {
  maxDepth: 3, // Limit navigation depth
  breadcrumbs: true, // Always show user location
  contextualHelp: true, // Provide help when needed
  consistentLayout: true // Keep layouts predictable
};

// Progress indicators for complex tasks
const ProgressPattern = ({steps, currentStep}) => (
  <div className="progress-container">
    <div className="progress-text">
      Step {currentStep} of {steps.length}: {steps[currentStep - 1].title}
    </div>
    <div className="progress-bar" role="progressbar"
         aria-valuenow={currentStep}
         aria-valuemax={steps.length}>
      <div className="progress-fill"
           style={{width: `${(currentStep / steps.length) * 100}%`}} />
    </div>
  </div>
);
```

### Error Prevention and Recovery
```typescript
// Confirmation patterns for destructive actions
const DestructiveActionConfirm = ({ action, onConfirm, onCancel }) => (
  <div role="alertdialog" aria-labelledby="confirm-title">
    <h2 id="confirm-title">Confirm {action}</h2>
    <p>This action cannot be undone. Are you sure you want to continue?</p>
    <div className="button-group">
      <button onClick={onCancel} className="button-secondary">
        Cancel
      </button>
      <button onClick={onConfirm} className="button-danger">
        Yes, {action}
      </button>
    </div>
  </div>
);

// Auto-save with user feedback
const AutoSaveIndicator = ({ status }) => (
  <div className="save-status" role="status" aria-live="polite">
    {status === 'saving' && 'Saving...'}
    {status === 'saved' && 'All changes saved'}
    {status === 'error' && 'Error saving changes. Trying again...'}
  </div>
);
```

## 📊 Pattern Testing Checklist

For each pattern, verify:

- [ ] **Keyboard Navigation**: All functionality accessible via keyboard
- [ ] **Screen Reader**: Content announced logically and completely
- [ ] **Focus Management**: Focus moves appropriately and visibly
- [ ] **Color Independence**: Information not conveyed by color alone
- [ ] **Contrast Compliance**: Meets WCAG AA contrast ratios
- [ ] **Responsive Design**: Works at 320px width and 200% zoom
- [ ] **Touch Accessibility**: Adequate touch targets (44px minimum)
- [ ] **Cognitive Load**: Clear, simple, and predictable interactions

## 🔄 Continuous Improvement

1. **User Testing**: Regular testing with users with disabilities
2. **Automated Monitoring**: Continuous accessibility scanning
3. **Pattern Evolution**: Update patterns based on user feedback
4. **Team Training**: Regular accessibility training and updates

These patterns form the foundation of inclusive design in claude-flow projects, ensuring that accessibility is not an afterthought but a core aspect of every component.