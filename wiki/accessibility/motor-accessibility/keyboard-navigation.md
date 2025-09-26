# Keyboard Navigation and Motor Accessibility

This comprehensive guide provides strategies for implementing complete keyboard accessibility and motor accessibility patterns in claude-flow applications, ensuring usability for users with diverse motor abilities and those who rely on alternative input methods.

## 🎯 Overview

Keyboard navigation is essential for users with motor disabilities, vision impairments, and those who prefer or require alternatives to mouse interaction. This guide covers comprehensive keyboard support, focus management, and motor accessibility considerations for claude-flow applications.

## ⌨️ Core Keyboard Navigation Principles

### 1. Universal Keyboard Access
- Every interactive element must be reachable via keyboard
- All functionality available with a mouse must work with keyboard
- Logical tab order that follows visual flow
- Visible focus indicators at all times

### 2. Efficient Navigation
- Skip links for bypassing repetitive content
- Keyboard shortcuts for common actions
- Grouped navigation for related elements
- Contextual navigation patterns

### 3. Predictable Behavior
- Consistent navigation patterns across the application
- Standard keyboard conventions
- Clear feedback for user actions
- Escape routes from all interactions

## 🔧 Implementation Strategies

### Focus Management System

```typescript
// utils/FocusManager.ts
class FocusManager {
  private focusHistory: HTMLElement[] = [];
  private trapStack: HTMLElement[] = [];

  saveFocus(element?: HTMLElement): void {
    const activeElement = element || document.activeElement as HTMLElement;
    if (activeElement && activeElement !== document.body) {
      this.focusHistory.push(activeElement);
    }
  }

  restoreFocus(): boolean {
    const lastFocused = this.focusHistory.pop();
    if (lastFocused && document.contains(lastFocused)) {
      lastFocused.focus();
      return true;
    }
    return false;
  }

  trapFocus(container: HTMLElement): void {
    this.trapStack.push(container);
    this.setupFocusTrap(container);
  }

  releaseFocusTrap(): void {
    const container = this.trapStack.pop();
    if (container) {
      this.removeFocusTrap(container);
    }
  }

  private setupFocusTrap(container: HTMLElement): void {
    const focusableElements = this.getFocusableElements(container);
    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        if (event.shiftKey) {
          // Shift + Tab
          if (document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab
          if (document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
          }
        }
      }

      if (event.key === 'Escape') {
        this.releaseFocusTrap();
        this.restoreFocus();
      }
    };

    container.addEventListener('keydown', handleKeyDown);
    container.setAttribute('data-focus-trap', 'true');

    // Store handler for cleanup
    (container as any).__focusTrapHandler = handleKeyDown;

    // Focus first element
    firstElement.focus();
  }

  private removeFocusTrap(container: HTMLElement): void {
    const handler = (container as any).__focusTrapHandler;
    if (handler) {
      container.removeEventListener('keydown', handler);
      container.removeAttribute('data-focus-trap');
      delete (container as any).__focusTrapHandler;
    }
  }

  getFocusableElements(container: HTMLElement = document.body): HTMLElement[] {
    const selector = [
      'button:not([disabled])',
      '[href]',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      '[tabindex]:not([tabindex="-1"])',
      '[contenteditable="true"]'
    ].join(', ');

    return Array.from(container.querySelectorAll(selector))
      .filter(element => {
        return this.isVisible(element as HTMLElement) &&
               this.isNotInert(element as HTMLElement);
      }) as HTMLElement[];
  }

  private isVisible(element: HTMLElement): boolean {
    const style = getComputedStyle(element);
    return style.display !== 'none' &&
           style.visibility !== 'hidden' &&
           style.opacity !== '0' &&
           element.offsetWidth > 0 &&
           element.offsetHeight > 0;
  }

  private isNotInert(element: HTMLElement): boolean {
    let current: HTMLElement | null = element;
    while (current) {
      if (current.hasAttribute('inert') ||
          current.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      current = current.parentElement;
    }
    return true;
  }

  findNextFocusableElement(direction: 'forward' | 'backward' = 'forward'): HTMLElement | null {
    const focusableElements = this.getFocusableElements();
    const currentIndex = focusableElements.findIndex(el => el === document.activeElement);

    if (currentIndex === -1) {
      return direction === 'forward' ? focusableElements[0] : focusableElements[focusableElements.length - 1];
    }

    const nextIndex = direction === 'forward'
      ? (currentIndex + 1) % focusableElements.length
      : (currentIndex - 1 + focusableElements.length) % focusableElements.length;

    return focusableElements[nextIndex];
  }
}

// React hook for focus management
const useFocusManager = () => {
  const focusManager = useRef(new FocusManager()).current;

  const trapFocus = useCallback((container: HTMLElement) => {
    focusManager.saveFocus();
    focusManager.trapFocus(container);
  }, [focusManager]);

  const releaseFocus = useCallback(() => {
    focusManager.releaseFocusTrap();
    focusManager.restoreFocus();
  }, [focusManager]);

  return {
    trapFocus,
    releaseFocus,
    saveFocus: focusManager.saveFocus.bind(focusManager),
    restoreFocus: focusManager.restoreFocus.bind(focusManager),
    getFocusableElements: focusManager.getFocusableElements.bind(focusManager)
  };
};
```

### Skip Links Implementation

```typescript
// components/SkipLinks.tsx
interface SkipLinkProps {
  links: Array<{
    href: string;
    label: string;
    description?: string;
  }>;
}

const SkipLinks: React.FC<SkipLinkProps> = ({ links }) => {
  const handleSkipLinkClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const target = event.currentTarget.getAttribute('href');
    if (target?.startsWith('#')) {
      const element = document.querySelector(target);
      if (element) {
        event.preventDefault();

        // Ensure target is focusable
        const originalTabIndex = element.getAttribute('tabindex');
        element.setAttribute('tabindex', '-1');

        (element as HTMLElement).focus();

        // Restore original tabindex after focus
        setTimeout(() => {
          if (originalTabIndex === null) {
            element.removeAttribute('tabindex');
          } else {
            element.setAttribute('tabindex', originalTabIndex);
          }
        }, 100);

        // Smooth scroll to target
        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  };

  return (
    <nav
      aria-label="Skip links"
      className="skip-links"
      role="navigation"
    >
      <ul className="skip-links-list">
        {links.map((link, index) => (
          <li key={index}>
            <a
              href={link.href}
              className="skip-link"
              onClick={handleSkipLinkClick}
              onFocus={(e) => e.target.scrollIntoView()}
            >
              {link.label}
              {link.description && (
                <span className="skip-link-description">
                  {link.description}
                </span>
              )}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

// CSS for skip links
const skipLinkStyles = `
.skip-links {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 9999;
}

.skip-links-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: #000;
  color: #fff;
  padding: 8px 16px;
  text-decoration: none;
  border-radius: 0 0 4px 4px;
  font-weight: bold;
  z-index: 1000;
  transform: translateY(-100%);
  transition: transform 0.2s ease-in-out;
}

.skip-link:focus {
  transform: translateY(0);
}

.skip-link-description {
  display: block;
  font-size: 0.875rem;
  font-weight: normal;
  opacity: 0.8;
}
`;
```

### Advanced Keyboard Navigation Components

```typescript
// components/KeyboardNavigableMenu.tsx
interface MenuProps {
  items: MenuItem[];
  orientation?: 'horizontal' | 'vertical';
  onItemSelect?: (item: MenuItem) => void;
}

const KeyboardNavigableMenu: React.FC<MenuProps> = ({
  items,
  orientation = 'vertical',
  onItemSelect
}) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const menuRef = useRef<HTMLUListElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  const handleKeyDown = (event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
        if (orientation === 'vertical') {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % items.length);
        }
        break;

      case 'ArrowUp':
        if (orientation === 'vertical') {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        }
        break;

      case 'ArrowRight':
        if (orientation === 'horizontal') {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % items.length);
        } else {
          // Expand submenu if available
          const currentItem = items[activeIndex];
          if (currentItem.submenu) {
            // Handle submenu expansion
          }
        }
        break;

      case 'ArrowLeft':
        if (orientation === 'horizontal') {
          event.preventDefault();
          setActiveIndex((prev) => (prev - 1 + items.length) % items.length);
        } else {
          // Collapse submenu or go to parent
          // Handle submenu collapse
        }
        break;

      case 'Home':
        event.preventDefault();
        setActiveIndex(0);
        break;

      case 'End':
        event.preventDefault();
        setActiveIndex(items.length - 1);
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        const selectedItem = items[activeIndex];
        if (selectedItem && onItemSelect) {
          onItemSelect(selectedItem);
        }
        break;

      case 'Escape':
        // Close menu or return to parent
        menuRef.current?.blur();
        break;
    }
  };

  useEffect(() => {
    const activeItem = itemRefs.current[activeIndex];
    if (activeItem) {
      activeItem.focus();
    }
  }, [activeIndex]);

  return (
    <ul
      ref={menuRef}
      role="menu"
      aria-orientation={orientation}
      className={`keyboard-menu keyboard-menu--${orientation}`}
      onKeyDown={handleKeyDown}
    >
      {items.map((item, index) => (
        <li
          key={item.id}
          ref={(el) => itemRefs.current[index] = el}
          role="menuitem"
          tabIndex={index === activeIndex ? 0 : -1}
          aria-current={index === activeIndex ? 'true' : undefined}
          className={`menu-item ${index === activeIndex ? 'active' : ''}`}
          onClick={() => onItemSelect?.(item)}
        >
          {item.label}
          {item.submenu && (
            <span aria-hidden="true" className="submenu-indicator">
              ▶
            </span>
          )}
        </li>
      ))}
    </ul>
  );
};

// Complex form with keyboard navigation
const KeyboardAccessibleForm: React.FC = () => {
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const fieldRefs = useRef<(HTMLElement | null)[]>([]);

  const handleFormKeyDown = (event: KeyboardEvent) => {
    // Custom form navigation
    if (event.ctrlKey) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          focusNextField();
          break;
        case 'ArrowUp':
          event.preventDefault();
          focusPreviousField();
          break;
      }
    }
  };

  const focusNextField = () => {
    const nextIndex = (currentFieldIndex + 1) % fieldRefs.current.length;
    const nextField = fieldRefs.current[nextIndex];
    if (nextField) {
      nextField.focus();
      setCurrentFieldIndex(nextIndex);
    }
  };

  const focusPreviousField = () => {
    const prevIndex = (currentFieldIndex - 1 + fieldRefs.current.length) % fieldRefs.current.length;
    const prevField = fieldRefs.current[prevIndex];
    if (prevField) {
      prevField.focus();
      setCurrentFieldIndex(prevIndex);
    }
  };

  return (
    <form onKeyDown={handleFormKeyDown} className="keyboard-form">
      <fieldset>
        <legend>Personal Information</legend>

        <div className="form-field">
          <label htmlFor="firstName">First Name</label>
          <input
            id="firstName"
            ref={(el) => fieldRefs.current[0] = el}
            type="text"
            onFocus={() => setCurrentFieldIndex(0)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="lastName">Last Name</label>
          <input
            id="lastName"
            ref={(el) => fieldRefs.current[1] = el}
            type="text"
            onFocus={() => setCurrentFieldIndex(1)}
          />
        </div>

        <div className="form-field">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            ref={(el) => fieldRefs.current[2] = el}
            type="email"
            onFocus={() => setCurrentFieldIndex(2)}
          />
        </div>
      </fieldset>

      <div className="keyboard-shortcuts-help">
        <details>
          <summary>Keyboard Shortcuts</summary>
          <ul>
            <li><kbd>Ctrl</kbd> + <kbd>↓</kbd> - Next field</li>
            <li><kbd>Ctrl</kbd> + <kbd>↑</kbd> - Previous field</li>
            <li><kbd>Tab</kbd> - Standard navigation</li>
            <li><kbd>Shift</kbd> + <kbd>Tab</kbd> - Reverse navigation</li>
          </ul>
        </details>
      </div>
    </form>
  );
};
```

### Modal and Dialog Keyboard Management

```typescript
// components/AccessibleModal.tsx
interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  closeOnEscape?: boolean;
  closeOnBackdropClick?: boolean;
}

const AccessibleModal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  closeOnEscape = true,
  closeOnBackdropClick = true
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const { trapFocus, releaseFocus } = useFocusManager();

  useEffect(() => {
    if (isOpen) {
      // Trap focus within modal
      if (modalRef.current) {
        trapFocus(modalRef.current);
      }

      // Prevent body scroll
      document.body.style.overflow = 'hidden';

      // Announce modal opening
      announceToScreenReader(`${title} dialog opened`, 'assertive');

      return () => {
        // Cleanup
        document.body.style.overflow = '';
        releaseFocus();
        announceToScreenReader(`${title} dialog closed`, 'polite');
      };
    }
  }, [isOpen, title, trapFocus, releaseFocus]);

  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && closeOnEscape) {
      event.preventDefault();
      onClose();
    }
  };

  const handleBackdropClick = (event: React.MouseEvent) => {
    if (event.target === event.currentTarget && closeOnBackdropClick) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="modal-overlay"
      onClick={handleBackdropClick}
      aria-hidden="true"
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="modal"
        onKeyDown={handleKeyDown}
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

        <footer className="modal-footer">
          <div className="modal-actions">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" form="modal-form">
              Save
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
};
```

## 🎮 Motor Accessibility Patterns

### Alternative Input Methods Support

```typescript
// utils/InputMethodDetection.ts
class InputMethodDetection {
  private currentMethod: 'mouse' | 'keyboard' | 'touch' | 'voice' | 'switch' = 'mouse';
  private listeners: ((method: string) => void)[] = [];

  constructor() {
    this.setupDetection();
  }

  private setupDetection(): void {
    // Keyboard detection
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Tab' || event.key.startsWith('Arrow')) {
        this.setInputMethod('keyboard');
      }
    });

    // Mouse detection
    document.addEventListener('mousedown', () => {
      this.setInputMethod('mouse');
    });

    // Touch detection
    document.addEventListener('touchstart', () => {
      this.setInputMethod('touch');
    });

    // Switch navigation detection (specific key patterns)
    document.addEventListener('keydown', (event) => {
      // Detect switch navigation patterns
      if (event.code === 'Space' && event.repeat) {
        this.setInputMethod('switch');
      }
    });

    // Voice recognition detection
    if ('speechSynthesis' in window) {
      // Voice input setup would go here
    }
  }

  private setInputMethod(method: typeof this.currentMethod): void {
    if (this.currentMethod !== method) {
      this.currentMethod = method;
      document.body.setAttribute('data-input-method', method);
      this.listeners.forEach(listener => listener(method));
    }
  }

  onInputMethodChange(callback: (method: string) => void): () => void {
    this.listeners.push(callback);
    return () => {
      const index = this.listeners.indexOf(callback);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  getCurrentMethod(): string {
    return this.currentMethod;
  }
}

// React hook for input method detection
const useInputMethod = () => {
  const [inputMethod, setInputMethod] = useState('mouse');
  const detectionRef = useRef<InputMethodDetection>();

  useEffect(() => {
    if (!detectionRef.current) {
      detectionRef.current = new InputMethodDetection();
    }

    const cleanup = detectionRef.current.onInputMethodChange(setInputMethod);
    setInputMethod(detectionRef.current.getCurrentMethod());

    return cleanup;
  }, []);

  return inputMethod;
};
```

### Switch Navigation Support

```typescript
// components/SwitchNavigableInterface.tsx
interface SwitchNavigationProps {
  children: React.ReactNode;
  scanRate?: number; // milliseconds
  enableScanning?: boolean;
}

const SwitchNavigableInterface: React.FC<SwitchNavigationProps> = ({
  children,
  scanRate = 1000,
  enableScanning = false
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [currentElement, setCurrentElement] = useState<HTMLElement | null>(null);
  const scanIntervalRef = useRef<NodeJS.Timeout>();
  const inputMethod = useInputMethod();

  const startScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
    }

    const focusableElements = Array.from(
      document.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ) as HTMLElement[];

    let currentIndex = 0;

    const scan = () => {
      // Remove previous highlight
      if (currentElement) {
        currentElement.classList.remove('switch-scanning');
      }

      // Highlight current element
      const element = focusableElements[currentIndex];
      if (element) {
        element.classList.add('switch-scanning');
        setCurrentElement(element);

        // Announce element to screen reader
        announceToScreenReader(
          `Scanning: ${element.getAttribute('aria-label') || element.textContent || element.tagName}`,
          'polite'
        );
      }

      currentIndex = (currentIndex + 1) % focusableElements.length;
    };

    scanIntervalRef.current = setInterval(scan, scanRate);
    setIsScanning(true);
    scan(); // Start immediately
  }, [scanRate, currentElement]);

  const stopScanning = useCallback(() => {
    if (scanIntervalRef.current) {
      clearInterval(scanIntervalRef.current);
      scanIntervalRef.current = undefined;
    }

    setIsScanning(false);

    // Remove scanning highlights
    document.querySelectorAll('.switch-scanning').forEach(el => {
      el.classList.remove('switch-scanning');
    });
  }, []);

  const activateCurrentElement = useCallback(() => {
    if (currentElement) {
      stopScanning();
      currentElement.click();
      currentElement.focus();
    }
  }, [currentElement, stopScanning]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Switch activation patterns
      if (event.code === 'Space' || event.code === 'Enter') {
        if (inputMethod === 'switch') {
          event.preventDefault();

          if (isScanning) {
            activateCurrentElement();
          } else if (enableScanning) {
            startScanning();
          }
        }
      }

      // Emergency stop
      if (event.key === 'Escape') {
        stopScanning();
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      stopScanning();
    };
  }, [inputMethod, isScanning, activateCurrentElement, startScanning, stopScanning, enableScanning]);

  return (
    <div className={`switch-interface ${isScanning ? 'scanning' : ''}`}>
      {enableScanning && (
        <div className="switch-controls" role="region" aria-label="Switch navigation controls">
          <button
            type="button"
            onClick={isScanning ? stopScanning : startScanning}
            aria-pressed={isScanning}
          >
            {isScanning ? 'Stop Scanning' : 'Start Scanning'}
          </button>

          {isScanning && (
            <div className="scanning-status" aria-live="polite">
              Scanning active - Press space to select
            </div>
          )}
        </div>
      )}

      {children}
    </div>
  );
};
```

### Large Click Targets and Motor Considerations

```css
/* Motor accessibility CSS patterns */

/* Large click targets */
.motor-friendly-button {
  min-height: 44px;
  min-width: 44px;
  padding: 12px 16px;
  margin: 4px;

  /* Easier clicking with tremor */
  border: 2px solid transparent;
  border-radius: 8px;
}

.motor-friendly-button:hover,
.motor-friendly-button:focus {
  /* Larger target area on hover/focus */
  transform: scale(1.05);
  transition: transform 0.1s ease;
}

/* Sticky hover states for motor difficulties */
.motor-friendly-button:hover {
  /* Maintain hover state longer */
  transition-delay: 0.5s;
}

/* Grouped interactive elements */
.motor-button-group {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.motor-button-group > * {
  flex: 1 1 auto;
  min-width: 120px;
}

/* Switch scanning visual feedback */
.switch-scanning {
  outline: 4px solid #0066cc !important;
  outline-offset: 2px;
  background-color: #e6f3ff !important;
  box-shadow: 0 0 0 8px rgba(0, 102, 204, 0.2) !important;
  animation: switch-pulse 1s infinite;
}

@keyframes switch-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

/* Voice control optimizations */
.voice-control-ready {
  /* Clear labels for voice recognition */
}

.voice-control-ready::after {
  content: attr(aria-label);
  position: absolute;
  left: -9999px;
  /* Hidden but available for voice control parsing */
}

/* Tremor-friendly inputs */
.tremor-friendly-input {
  font-size: 18px;
  padding: 12px;
  border: 2px solid #ccc;
  border-radius: 4px;

  /* Debounce rapid inputs */
  transition: border-color 0.3s ease;
}

.tremor-friendly-input:focus {
  border-color: #0066cc;
  outline: 2px solid #0066cc;
  outline-offset: 2px;
}

/* Drag and drop adaptations */
.motor-drag-handle {
  min-height: 48px;
  min-width: 48px;
  cursor: grab;
  padding: 8px;
  border: 2px dashed #ccc;
  border-radius: 4px;
}

.motor-drag-handle:active {
  cursor: grabbing;
}

.motor-drag-handle:hover,
.motor-drag-handle:focus {
  border-color: #0066cc;
  background-color: #f0f8ff;
}

/* Responsive design for motor accessibility */
@media (pointer: coarse) {
  /* Touch devices - larger targets */
  .interactive-element {
    min-height: 48px;
    min-width: 48px;
  }
}

@media (hover: none) {
  /* Devices without hover capability */
  .hover-only-feature {
    display: none;
  }

  .touch-alternative {
    display: block;
  }
}
```

## 🧪 Testing Keyboard Navigation

### Automated Keyboard Testing

```typescript
// test/keyboard-navigation.test.ts
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KeyboardNavigableMenu } from '../components/KeyboardNavigableMenu';

describe('Keyboard Navigation', () => {
  const mockItems = [
    { id: '1', label: 'Home' },
    { id: '2', label: 'About' },
    { id: '3', label: 'Contact' }
  ];

  it('should navigate menu items with arrow keys', async () => {
    const user = userEvent.setup();
    render(<KeyboardNavigableMenu items={mockItems} />);

    const menu = screen.getByRole('menu');
    const firstItem = screen.getByRole('menuitem', { name: 'Home' });

    // Focus first item
    firstItem.focus();
    expect(firstItem).toHaveFocus();

    // Navigate down
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'About' })).toHaveFocus();

    // Navigate down again
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Contact' })).toHaveFocus();

    // Wrap around to first item
    await user.keyboard('{ArrowDown}');
    expect(firstItem).toHaveFocus();
  });

  it('should handle Home and End keys', async () => {
    const user = userEvent.setup();
    render(<KeyboardNavigableMenu items={mockItems} />);

    const firstItem = screen.getByRole('menuitem', { name: 'Home' });
    const lastItem = screen.getByRole('menuitem', { name: 'Contact' });

    firstItem.focus();

    // Jump to end
    await user.keyboard('{End}');
    expect(lastItem).toHaveFocus();

    // Jump to beginning
    await user.keyboard('{Home}');
    expect(firstItem).toHaveFocus();
  });

  it('should close on Escape key', async () => {
    const user = userEvent.setup();
    const onClose = jest.fn();

    render(
      <AccessibleModal isOpen={true} onClose={onClose} title="Test Modal">
        <p>Modal content</p>
      </AccessibleModal>
    );

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalled();
  });

  it('should trap focus within modal', async () => {
    const user = userEvent.setup();
    render(
      <div>
        <button>Outside Button</button>
        <AccessibleModal isOpen={true} onClose={() => {}} title="Test Modal">
          <button>Modal Button 1</button>
          <button>Modal Button 2</button>
        </AccessibleModal>
      </div>
    );

    const modalButton1 = screen.getByText('Modal Button 1');
    const modalButton2 = screen.getByText('Modal Button 2');
    const outsideButton = screen.getByText('Outside Button');

    // Focus should be trapped within modal
    expect(modalButton1).toHaveFocus(); // Auto-focus first element

    // Tab to next element in modal
    await user.tab();
    expect(modalButton2).toHaveFocus();

    // Tab should wrap to first element, not escape modal
    await user.tab();
    expect(modalButton1).toHaveFocus();

    // Outside button should not be focusable
    outsideButton.focus();
    expect(outsideButton).not.toHaveFocus();
  });
});

// Integration test for complete keyboard flow
describe('Keyboard Navigation Integration', () => {
  it('should complete full application keyboard flow', async () => {
    const user = userEvent.setup();
    render(<CompleteApplication />);

    // Start with skip links
    await user.tab();
    expect(screen.getByText('Skip to main content')).toHaveFocus();

    // Navigate to main content
    await user.keyboard('{Enter}');
    expect(screen.getByRole('main')).toHaveFocus();

    // Navigate through form
    await user.tab();
    expect(screen.getByLabelText('Name')).toHaveFocus();

    await user.tab();
    expect(screen.getByLabelText('Email')).toHaveFocus();

    // Submit form
    await user.tab();
    const submitButton = screen.getByRole('button', { name: 'Submit' });
    expect(submitButton).toHaveFocus();

    await user.keyboard('{Enter}');
    // Verify form submission
  });
});
```

## 🤖 Claude-Flow Agent Integration

### Keyboard Navigation Testing

```bash
# Comprehensive keyboard navigation testing
npx claude-flow sparc run keyboard-nav-test "Test complete keyboard navigation flow"

# Focus management validation
npx claude-flow sparc run focus-manager-test "Validate focus management in modals and complex widgets"

# Motor accessibility audit
npx claude-flow sparc run motor-a11y-audit "Audit application for motor accessibility patterns"

# Switch navigation testing
npx claude-flow sparc run switch-nav-test "Test switch navigation compatibility"
```

### Automated Testing Agent

```typescript
// agents/KeyboardNavigationAgent.ts
export class KeyboardNavigationAgent extends BaseAgent {
  async execute(context: AgentContext): Promise<KeyboardNavReport> {
    const { components, interactionFlows } = context;

    const results = await Promise.all([
      this.testTabNavigation(components),
      this.testArrowKeyNavigation(components),
      this.testKeyboardShortcuts(components),
      this.testFocusManagement(components),
      this.testMotorAccessibility(components)
    ]);

    return this.consolidateResults(results);
  }

  private async testTabNavigation(components: string[]): Promise<TabNavigationResults> {
    const results = [];

    for (const component of components) {
      const tabOrder = await this.getTabOrder(component);
      const logicalOrder = await this.getLogicalOrder(component);

      results.push({
        component,
        tabOrder,
        logicalOrder,
        matches: this.compareOrders(tabOrder, logicalOrder),
        issues: this.identifyTabOrderIssues(tabOrder)
      });
    }

    return { results, score: this.calculateTabScore(results) };
  }

  private async testMotorAccessibility(components: string[]): Promise<MotorAccessibilityResults> {
    return {
      clickTargetSizes: await this.validateClickTargetSizes(components),
      dragAndDropSupport: await this.testDragAndDropAccessibility(components),
      hoverAlternatives: await this.validateHoverAlternatives(components),
      switchCompatibility: await this.testSwitchNavigation(components)
    };
  }
}
```

This comprehensive keyboard navigation and motor accessibility framework ensures that claude-flow applications are fully accessible to users with diverse motor abilities and interaction preferences.