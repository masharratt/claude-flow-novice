# Screen Reader and Assistive Technology Support

This comprehensive guide provides strategies for optimizing claude-flow applications for screen readers and other assistive technologies, ensuring seamless accessibility for users with visual impairments.

## 🎯 Overview

Screen readers are essential assistive technologies that convert digital text and interface elements into speech or braille output. Supporting screen readers effectively requires understanding how they interact with web content and implementing proper semantic markup and ARIA attributes.

## 📱 Major Screen Readers

### Desktop Screen Readers

#### NVDA (NonVisual Desktop Access)
- **Platform**: Windows (Free, Open Source)
- **Usage**: ~38% of screen reader users
- **Key Features**:
  - Excellent web browsing support
  - Braille display support
  - Extensible with add-ons
  - Regular updates

#### JAWS (Job Access With Speech)
- **Platform**: Windows (Commercial)
- **Usage**: ~36% of screen reader users
- **Key Features**:
  - Powerful web scripting
  - Comprehensive application support
  - Advanced navigation features
  - Corporate/enterprise focused

#### VoiceOver
- **Platform**: macOS/iOS (Built-in)
- **Usage**: ~14% of screen reader users
- **Key Features**:
  - Deep system integration
  - Gesture-based navigation on iOS
  - Rotor navigation control
  - Multi-language support

#### ORCA
- **Platform**: Linux (Free, Open Source)
- **Usage**: ~2% of screen reader users
- **Key Features**:
  - GNOME desktop integration
  - Multiple speech engines
  - Braille support
  - Customizable keybindings

### Mobile Screen Readers

#### TalkBack (Android)
- **Platform**: Android (Built-in)
- **Key Features**:
  - Gesture-based navigation
  - Explore by touch
  - Global gestures
  - Voice commands

#### VoiceOver (iOS)
- **Platform**: iOS (Built-in)
- **Key Features**:
  - Rotor control
  - Gesture navigation
  - Braille support
  - Handwriting mode

## 🔧 Implementation Strategies

### Semantic HTML Foundation

```html
<!-- ✅ Good: Proper semantic structure -->
<!DOCTYPE html>
<html lang="en">
<head>
  <title>Application Dashboard - MyApp</title>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
  <header role="banner">
    <nav role="navigation" aria-label="Main navigation">
      <ul>
        <li><a href="/" aria-current="page">Dashboard</a></li>
        <li><a href="/reports">Reports</a></li>
        <li><a href="/settings">Settings</a></li>
      </ul>
    </nav>
  </header>

  <main role="main">
    <h1>Dashboard</h1>
    <section aria-labelledby="recent-activity">
      <h2 id="recent-activity">Recent Activity</h2>
      <!-- Content -->
    </section>
  </main>

  <aside role="complementary" aria-label="Additional information">
    <!-- Sidebar content -->
  </aside>

  <footer role="contentinfo">
    <!-- Footer content -->
  </footer>
</body>
</html>
```

### ARIA Landmarks and Roles

```typescript
// components/PageLayout.tsx
interface PageLayoutProps {
  children: React.ReactNode;
  pageTitle: string;
  hasAside?: boolean;
}

const PageLayout: React.FC<PageLayoutProps> = ({
  children,
  pageTitle,
  hasAside = false
}) => {
  // Announce page changes to screen readers
  useEffect(() => {
    document.title = `${pageTitle} - MyApp`;

    // Announce page change
    const announcement = document.createElement('div');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.className = 'sr-only';
    announcement.textContent = `Navigated to ${pageTitle}`;

    document.body.appendChild(announcement);

    setTimeout(() => {
      document.body.removeChild(announcement);
    }, 1000);
  }, [pageTitle]);

  return (
    <div className="page-layout">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <header role="banner">
        <Navigation />
      </header>

      <main
        id="main-content"
        role="main"
        aria-labelledby="page-title"
        tabIndex={-1}
      >
        <h1 id="page-title">{pageTitle}</h1>
        {children}
      </main>

      {hasAside && (
        <aside
          role="complementary"
          aria-label="Additional information"
        >
          <Sidebar />
        </aside>
      )}

      <footer role="contentinfo">
        <Footer />
      </footer>
    </div>
  );
};
```

### Form Accessibility for Screen Readers

```typescript
// components/AccessibleForm.tsx
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
        {required && (
          <span aria-label="required" className="required">
            <span aria-hidden="true">*</span>
          </span>
        )}
      </label>

      {helpText && (
        <div id={helpId} className="help-text">
          <Icon name="help" aria-hidden="true" />
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
        aria-describedby={[
          helpText ? helpId : '',
          error ? errorId : ''
        ].filter(Boolean).join(' ') || undefined}
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

// Enhanced fieldset for grouped form elements
const FormFieldset: React.FC<{
  legend: string;
  children: React.ReactNode;
  required?: boolean;
}> = ({ legend, children, required }) => (
  <fieldset className="form-fieldset">
    <legend className="form-legend">
      {legend}
      {required && (
        <span aria-label="required" className="required">
          <span aria-hidden="true">*</span>
        </span>
      )}
    </legend>
    {children}
  </fieldset>
);
```

### Dynamic Content and Live Regions

```typescript
// components/LiveRegions.tsx
interface LiveRegionProps {
  message: string;
  priority: 'polite' | 'assertive' | 'off';
  atomic?: boolean;
  relevant?: string;
}

const LiveRegion: React.FC<LiveRegionProps> = ({
  message,
  priority,
  atomic = true,
  relevant = 'all'
}) => {
  const regionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (regionRef.current && message) {
      // Clear and set message to ensure it's announced
      regionRef.current.textContent = '';
      setTimeout(() => {
        if (regionRef.current) {
          regionRef.current.textContent = message;
        }
      }, 100);
    }
  }, [message]);

  return (
    <div
      ref={regionRef}
      aria-live={priority}
      aria-atomic={atomic}
      aria-relevant={relevant}
      className="sr-only"
    />
  );
};

// Status announcements for dynamic changes
const StatusAnnouncer: React.FC = () => {
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState<'polite' | 'assertive'>('polite');

  const announceStatus = useCallback((message: string, urgent = false) => {
    setPriority(urgent ? 'assertive' : 'polite');
    setStatus(message);

    // Clear after announcement
    setTimeout(() => setStatus(''), 2000);
  }, []);

  // Expose announcer globally for other components
  useEffect(() => {
    window.announceStatus = announceStatus;
    return () => {
      delete window.announceStatus;
    };
  }, [announceStatus]);

  return <LiveRegion message={status} priority={priority} />;
};

// Usage in components
const DataTable: React.FC<{ data: any[] }> = ({ data }) => {
  const [sortColumn, setSortColumn] = useState('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (column: string) => {
    const newDirection = sortColumn === column && sortDirection === 'asc' ? 'desc' : 'asc';
    setSortColumn(column);
    setSortDirection(newDirection);

    // Announce sort change to screen readers
    window.announceStatus?.(`Table sorted by ${column}, ${newDirection}ending order`);
  };

  return (
    <div>
      <table role="table" aria-label="Data table">
        <caption>
          Data results ({data.length} items)
          {sortColumn && `, sorted by ${sortColumn} ${sortDirection}ending`}
        </caption>
        <thead>
          <tr>
            <th>
              <button
                onClick={() => handleSort('name')}
                aria-sort={
                  sortColumn === 'name'
                    ? sortDirection === 'asc' ? 'ascending' : 'descending'
                    : 'none'
                }
              >
                Name
                <span aria-hidden="true">
                  {sortColumn === 'name' ? (sortDirection === 'asc' ? ' ↑' : ' ↓') : ''}
                </span>
              </button>
            </th>
            {/* More columns */}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              {/* More cells */}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
```

### Navigation and Focus Management

```typescript
// components/AccessibleNavigation.tsx
const AccessibleNavigation: React.FC = () => {
  const [activeItem, setActiveItem] = useState(0);
  const navItems = useRef<(HTMLAnchorElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent, index: number) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        const nextIndex = (index + 1) % navItems.current.length;
        navItems.current[nextIndex]?.focus();
        setActiveItem(nextIndex);
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        const prevIndex = index === 0 ? navItems.current.length - 1 : index - 1;
        navItems.current[prevIndex]?.focus();
        setActiveItem(prevIndex);
        break;

      case 'Home':
        event.preventDefault();
        navItems.current[0]?.focus();
        setActiveItem(0);
        break;

      case 'End':
        event.preventDefault();
        const lastIndex = navItems.current.length - 1;
        navItems.current[lastIndex]?.focus();
        setActiveItem(lastIndex);
        break;
    }
  };

  return (
    <nav role="navigation" aria-label="Main navigation">
      <ul role="menubar" className="nav-menu">
        {navigationItems.map((item, index) => (
          <li key={item.id} role="none">
            <a
              ref={(el) => navItems.current[index] = el}
              href={item.href}
              role="menuitem"
              aria-current={item.current ? 'page' : undefined}
              tabIndex={index === activeItem ? 0 : -1}
              onKeyDown={(e) => handleKeyDown(e, index)}
              onFocus={() => setActiveItem(index)}
              className={`nav-item ${item.current ? 'current' : ''}`}
            >
              {item.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

// Modal with proper focus management
const AccessibleModal: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}> = ({ isOpen, onClose, title, children }) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      // Save current focus
      previousFocusRef.current = document.activeElement as HTMLElement;

      // Move focus to modal
      const focusableElements = modalRef.current?.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      if (focusableElements && focusableElements.length > 0) {
        (focusableElements[0] as HTMLElement).focus();
      } else {
        modalRef.current?.focus();
      }

      // Announce modal opening
      window.announceStatus?.(`${title} dialog opened`, true);

      const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          onClose();
        }

        // Trap focus within modal
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

        // Announce modal closing
        window.announceStatus?.(`${title} dialog closed`);
      };
    }
  }, [isOpen, onClose, title]);

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      aria-hidden="true"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
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
            aria-label={`Close ${title} dialog`}
            className="modal-close"
          >
            <Icon name="close" aria-hidden="true" />
          </button>
        </header>

        <div className="modal-content">
          {children}
        </div>
      </div>
    </div>
  );
};
```

## 🧪 Testing with Screen Readers

### Manual Testing Procedures

#### NVDA Testing Checklist
```markdown
# NVDA Testing Checklist

## Basic Navigation
- [ ] Page loads and announces page title
- [ ] Heading navigation (H key) works properly
- [ ] Landmark navigation (D key) works
- [ ] Link navigation (K key) functions correctly
- [ ] Form field navigation (F key) works
- [ ] Table navigation (T key) functions

## Content Reading
- [ ] Reading mode (Insert + Space) works smoothly
- [ ] Content is read in logical order
- [ ] Images have appropriate alt text
- [ ] Links have descriptive text
- [ ] Form labels are associated correctly

## Interactive Elements
- [ ] All buttons are operable with Enter/Space
- [ ] Form submission works correctly
- [ ] Error messages are announced
- [ ] Dynamic content changes are announced
- [ ] Modal dialogs are properly announced

## Advanced Features
- [ ] Tables have proper headers
- [ ] Lists are announced correctly
- [ ] ARIA live regions work
- [ ] Complex widgets are operable
- [ ] Keyboard shortcuts work as expected
```

#### VoiceOver Testing Checklist
```markdown
# VoiceOver Testing Checklist

## Rotor Navigation
- [ ] Headings rotor lists all headings correctly
- [ ] Links rotor shows all links
- [ ] Form controls rotor works
- [ ] Landmarks rotor functions
- [ ] Tables rotor lists table elements

## Gesture Navigation (iOS)
- [ ] Swipe right/left navigates elements
- [ ] Two-finger swipe scrolls content
- [ ] Double-tap activates elements
- [ ] Rotor gestures work properly
- [ ] Magic tap performs primary action

## Voice Control
- [ ] "Hey Siri" commands work in context
- [ ] Voice control commands are recognized
- [ ] Custom voice commands function
```

### Automated Screen Reader Testing

```typescript
// utils/ScreenReaderTesting.ts
export class ScreenReaderTestingAgent {
  async testScreenReaderCompatibility(page: Page): Promise<ScreenReaderReport> {
    const tests = await Promise.all([
      this.testAriaAttributes(page),
      this.testSemanticStructure(page),
      this.testKeyboardNavigation(page),
      this.testLiveRegions(page),
      this.testFocusManagement(page)
    ]);

    return this.generateReport(tests);
  }

  private async testAriaAttributes(page: Page): Promise<AriaTestResults> {
    // Test for proper ARIA labeling
    const elementsWithoutLabels = await page.$$eval(
      'button:not([aria-label]):not([aria-labelledby]), input:not([aria-label]):not([aria-labelledby])',
      elements => elements.filter(el => !el.textContent?.trim())
    );

    // Test for proper ARIA roles
    const elementsWithCustomRoles = await page.$$eval(
      '[role]',
      elements => elements.map(el => ({
        role: el.getAttribute('role'),
        tagName: el.tagName,
        hasProperImplementation: this.validateRoleImplementation(el)
      }))
    );

    return {
      unlabeledElements: elementsWithoutLabels.length,
      customRoles: elementsWithCustomRoles,
      score: this.calculateAriaScore(elementsWithoutLabels, elementsWithCustomRoles)
    };
  }

  private async testLiveRegions(page: Page): Promise<LiveRegionTestResults> {
    // Inject testing script for live regions
    await page.evaluate(() => {
      window.liveRegionLog = [];

      // Monitor live region announcements
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          const target = mutation.target as Element;
          if (target.getAttribute('aria-live')) {
            window.liveRegionLog.push({
              type: target.getAttribute('aria-live'),
              content: target.textContent,
              timestamp: Date.now()
            });
          }
        });
      });

      // Observe all live regions
      document.querySelectorAll('[aria-live]').forEach(element => {
        observer.observe(element, { childList: true, subtree: true });
      });
    });

    // Trigger dynamic content changes and monitor announcements
    await this.triggerDynamicChanges(page);

    const liveRegionLog = await page.evaluate(() => window.liveRegionLog);

    return {
      totalLiveRegions: liveRegionLog.length,
      announcements: liveRegionLog,
      score: this.calculateLiveRegionScore(liveRegionLog)
    };
  }
}
```

## 🎯 Claude-Flow Agent Integration

### Screen Reader Testing Agent
```bash
# Comprehensive screen reader testing
npx claude-flow sparc run screen-reader-test "Test complete application with NVDA, JAWS, and VoiceOver simulation"

# ARIA compliance validation
npx claude-flow sparc run aria-validator "Validate all ARIA attributes and roles for screen reader compatibility"

# Semantic structure analysis
npx claude-flow sparc run semantic-analyzer "Analyze semantic HTML structure for screen reader navigation"

# Focus management testing
npx claude-flow sparc run focus-test "Test focus management in dynamic content and modals"
```

### Automated Testing Pipeline
```typescript
// agents/ScreenReaderTestAgent.ts
export class ScreenReaderTestAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<ScreenReaderTestReport> {
    const { component, testType } = context;

    const results = await Promise.all([
      this.testNVDACompatibility(component),
      this.testJAWSCompatibility(component),
      this.testVoiceOverCompatibility(component),
      this.testGeneralScreenReaderFeatures(component)
    ]);

    return this.consolidateResults(results);
  }

  private async testNVDACompatibility(component: string): Promise<NVDATestResults> {
    // Simulate NVDA navigation patterns
    return {
      headingNavigation: await this.testHeadingNavigation(component),
      formNavigation: await this.testFormNavigation(component),
      tableNavigation: await this.testTableNavigation(component),
      linkNavigation: await this.testLinkNavigation(component),
      landmarkNavigation: await this.testLandmarkNavigation(component)
    };
  }

  private async testGeneralScreenReaderFeatures(component: string): Promise<GeneralTestResults> {
    return {
      alternativeText: await this.validateAlternativeText(component),
      keyboardAccess: await this.validateKeyboardAccess(component),
      liveRegions: await this.validateLiveRegions(component),
      focusManagement: await this.validateFocusManagement(component),
      semanticMarkup: await this.validateSemanticMarkup(component)
    };
  }
}
```

## 📱 Mobile Screen Reader Support

### TalkBack Optimization (Android)
```typescript
// Mobile-specific accessibility enhancements
const MobileAccessibleComponent: React.FC = () => {
  return (
    <div className="mobile-optimized">
      {/* Larger touch targets for mobile */}
      <button
        className="mobile-button"
        style={{ minHeight: '48px', minWidth: '48px' }}
        aria-label="Add new item"
      >
        <Icon name="plus" aria-hidden="true" />
      </button>

      {/* Swipe actions with proper announcements */}
      <div
        role="listitem"
        aria-label="Swipe right to delete, swipe left for options"
        className="swipeable-item"
      >
        <span>Item content</span>
      </div>

      {/* Touch-friendly form controls */}
      <input
        type="range"
        min="0"
        max="100"
        aria-label="Volume control"
        aria-valuetext={`${value}% volume`}
        className="mobile-slider"
      />
    </div>
  );
};
```

### VoiceOver Optimization (iOS)
```typescript
// iOS-specific optimizations
const IOSAccessibleComponent: React.FC = () => {
  return (
    <div>
      {/* Custom rotor content */}
      <div role="group" aria-label="Actions">
        <button aria-label="Save document">Save</button>
        <button aria-label="Print document">Print</button>
        <button aria-label="Share document">Share</button>
      </div>

      {/* Proper gesture support */}
      <div
        role="button"
        aria-label="Double-tap to expand, or use rotor to navigate options"
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onClick={handleClick}
        className="expandable-section"
      >
        Section header
      </div>
    </div>
  );
};
```

## 🚨 Common Issues and Solutions

### Issue 1: Missing or Poor Alt Text
```typescript
// ❌ Bad
<img src="chart.png" alt="chart" />

// ✅ Good
<img src="chart.png" alt="Bar chart showing 25% increase in sales from Q1 to Q2 2024" />

// ✅ Decorative images
<img src="decoration.png" alt="" role="presentation" />

// ✅ Complex images with long descriptions
<img
  src="complex-chart.png"
  alt="Quarterly sales data by region"
  aria-describedby="chart-description"
/>
<div id="chart-description">
  Detailed breakdown of sales data showing North region at 45%,
  South at 30%, East at 15%, and West at 10% of total quarterly sales.
</div>
```

### Issue 2: Poor Form Labeling
```typescript
// ❌ Bad
<input type="email" placeholder="Enter your email" />

// ✅ Good
<label htmlFor="email">
  Email Address
  <input
    id="email"
    type="email"
    aria-required="true"
    aria-describedby="email-help"
  />
</label>
<div id="email-help">We'll use this to send you important updates</div>
```

### Issue 3: Insufficient Focus Management
```typescript
// ❌ Bad - Focus lost when content changes
const BadModal = () => {
  const [isOpen, setIsOpen] = useState(false);

  return isOpen ? <div>Modal content</div> : null;
};

// ✅ Good - Proper focus management
const GoodModal = () => {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      modalRef.current?.focus();
    } else {
      triggerRef.current?.focus();
    }
  }, [isOpen]);

  return (
    <>
      <button ref={triggerRef} onClick={() => setIsOpen(true)}>
        Open Modal
      </button>
      {isOpen && (
        <div ref={modalRef} role="dialog" tabIndex={-1}>
          Modal content
        </div>
      )}
    </>
  );
};
```

## 📊 Performance Metrics

Track these key metrics for screen reader support:

1. **Semantic Completeness**: Percentage of elements with proper semantic markup
2. **ARIA Compliance**: Percentage of interactive elements with proper ARIA attributes
3. **Navigation Efficiency**: Average time to complete tasks with screen readers
4. **Error Recovery**: Success rate of error correction with screen readers
5. **User Satisfaction**: Feedback scores from screen reader users

By implementing these strategies and continuously testing with actual screen readers, claude-flow applications can provide excellent support for users who rely on assistive technologies.