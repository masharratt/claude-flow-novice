/**
 * Accessibility Enhancement Components and Utilities
 * Provides ARIA labels, keyboard navigation, and screen reader support
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  KeyboardEvent,
  FocusEvent,
  MouseEvent,
  ReactNode,
  HTMLAttributes
} from 'react';

// Keyboard navigation utilities
export const useKeyboardNavigation = (
  items: Array<{ id: string; element?: HTMLElement }>,
  onSelect?: (id: string) => void
) => {
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        setFocusedIndex(prev => (prev + 1) % items.length);
        break;

      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        setFocusedIndex(prev => (prev - 1 + items.length) % items.length);
        break;

      case 'Home':
        event.preventDefault();
        setFocusedIndex(0);
        break;

      case 'End':
        event.preventDefault();
        setFocusedIndex(items.length - 1);
        break;

      case 'Enter':
      case ' ':
        event.preventDefault();
        if (focusedIndex >= 0 && onSelect) {
          onSelect(items[focusedIndex].id);
        }
        break;

      case 'Escape':
        event.preventDefault();
        setFocusedIndex(-1);
        containerRef.current?.blur();
        break;
    }
  }, [items, focusedIndex, onSelect]);

  // Focus the currently focused item
  useEffect(() => {
    if (focusedIndex >= 0 && items[focusedIndex]?.element) {
      items[focusedIndex].element?.focus();
    }
  }, [focusedIndex, items]);

  return {
    focusedIndex,
    containerProps: {
      ref: containerRef,
      onKeyDown: handleKeyDown,
      role: 'listbox',
      'aria-activedescendant': focusedIndex >= 0 ? items[focusedIndex]?.id : undefined,
      tabIndex: 0
    }
  };
};

// Focus management utilities
export const useFocusManagement = () => {
  const [focusedElement, setFocusedElement] = useState<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const trapFocus = useCallback((container: HTMLElement) => {
    const focusableElements = container.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    ) as NodeListOf<HTMLElement>;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    const handleTabKey = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      }
    };

    container.addEventListener('keydown', handleTabKey as EventListener);
    firstElement?.focus();

    return () => {
      container.removeEventListener('keydown', handleTabKey as EventListener);
    };
  }, []);

  const saveFocus = useCallback(() => {
    previousFocusRef.current = document.activeElement as HTMLElement;
  }, []);

  const restoreFocus = useCallback(() => {
    if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
      previousFocusRef.current.focus();
    }
  }, []);

  return {
    focusedElement,
    trapFocus,
    saveFocus,
    restoreFocus
  };
};

// Accessible button component
interface AccessibleButtonProps extends Omit<HTMLAttributes<HTMLButtonElement>, 'onPress'> {
  variant?: 'primary' | 'secondary' | 'danger';
  size?: 'small' | 'medium' | 'large';
  isLoading?: boolean;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  onPress?: () => void;
}

export const AccessibleButton = React.forwardRef<HTMLButtonElement, AccessibleButtonProps>(({
  children,
  variant = 'primary',
  size = 'medium',
  isLoading = false,
  icon,
  iconPosition = 'left',
  onPress,
  disabled,
  className = '',
  ...props
}, ref) => {
  const baseClasses = 'accessible-button';
  const variantClasses = `accessible-button--${variant}`;
  const sizeClasses = `accessible-button--${size}`;
  const loadingClasses = isLoading ? 'accessible-button--loading' : '';
  const disabledClasses = disabled ? 'accessible-button--disabled' : '';

  const combinedClasses = [
    baseClasses,
    variantClasses,
    sizeClasses,
    loadingClasses,
    disabledClasses,
    className
  ].filter(Boolean).join(' ');

  const handleClick = useCallback((event: MouseEvent<HTMLButtonElement>) => {
    if (!disabled && !isLoading && onPress) {
      onPress();
    }
  }, [disabled, isLoading, onPress]);

  const handleKeyDown = useCallback((event: KeyboardEvent<HTMLButtonElement>) => {
    if ((event.key === 'Enter' || event.key === ' ') && !disabled && !isLoading && onPress) {
      event.preventDefault();
      onPress();
    }
  }, [disabled, isLoading, onPress]);

  return (
    <button
      ref={ref}
      className={combinedClasses}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      disabled={disabled || isLoading}
      aria-disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...props}
      style={{
        padding: size === 'small' ? '6px 12px' : size === 'large' ? '12px 24px' : '8px 16px',
        borderRadius: '4px',
        border: 'none',
        cursor: disabled || isLoading ? 'not-allowed' : 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        fontSize: size === 'small' ? '12px' : size === 'large' ? '16px' : '14px',
        fontWeight: '500',
        transition: 'all 0.2s ease',
        opacity: disabled ? 0.6 : 1,
        backgroundColor: variant === 'primary' ? '#0984e3' :
                       variant === 'danger' ? '#d63031' : '#636e72',
        color: 'white',
        ...props.style
      }}
    >
      {isLoading && (
        <span
          className="accessible-button__spinner"
          aria-hidden="true"
          style={{
            width: '12px',
            height: '12px',
            border: '2px solid transparent',
            borderTop: '2px solid currentColor',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite'
          }}
        />
      )}

      {icon && iconPosition === 'left' && (
        <span aria-hidden="true">{icon}</span>
      )}

      <span className="accessible-button__content">
        {isLoading ? 'Loading...' : children}
      </span>

      {icon && iconPosition === 'right' && (
        <span aria-hidden="true">{icon}</span>
      )}
    </button>
  );
});

AccessibleButton.displayName = 'AccessibleButton';

// Accessible modal component
interface AccessibleModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
  closeOnEscape?: boolean;
  closeOnOverlay?: boolean;
}

export const AccessibleModal: React.FC<AccessibleModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'medium',
  closeOnEscape = true,
  closeOnOverlay = true
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const { trapFocus, saveFocus, restoreFocus } = useFocusManagement();
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement;
      saveFocus();

      // Trap focus within modal
      if (modalRef.current) {
        const cleanup = trapFocus(modalRef.current);

        // Focus the title
        titleRef.current?.focus();

        return cleanup;
      }
    } else {
      restoreFocus();
    }
  }, [isOpen, trapFocus, saveFocus, restoreFocus]);

  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Prevent body scroll
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, closeOnEscape, onClose]);

  const handleOverlayClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget && closeOnOverlay) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const sizeStyles = {
    small: { maxWidth: '400px' },
    medium: { maxWidth: '600px' },
    large: { maxWidth: '800px' }
  };

  return (
    <div
      className="modal-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
      onClick={handleOverlayClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div
        ref={modalRef}
        className="modal-content"
        style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          padding: '24px',
          maxHeight: '90vh',
          overflow: 'auto',
          ...sizeStyles[size],
          width: '90vw'
        }}
        tabIndex={-1}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2
            ref={titleRef}
            id="modal-title"
            tabIndex={-1}
            style={{ margin: 0, fontSize: '20px', fontWeight: 'bold' }}
          >
            {title}
          </h2>
          <AccessibleButton
            onClick={onClose}
            variant="secondary"
            aria-label="Close modal"
            style={{
              minWidth: '32px',
              height: '32px',
              padding: '0'
            }}
          >
            ×
          </AccessibleButton>
        </div>

        <div className="modal-body">
          {children}
        </div>
      </div>
    </div>
  );
};

// Accessible form field component
interface AccessibleFieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}

export const AccessibleField: React.FC<AccessibleFieldProps> = ({
  label,
  error,
  hint,
  required = false,
  children
}) => {
  const fieldId = useRef(`field-${Math.random().toString(36).substr(2, 9)}`);
  const errorId = `${fieldId.current}-error`;
  const hintId = `${fieldId.current}-hint`;

  return (
    <div className="accessible-field" style={{ marginBottom: '16px' }}>
      <label
        htmlFor={fieldId.current}
        style={{
          display: 'block',
          marginBottom: '4px',
          fontWeight: '500',
          color: error ? '#d63031' : '#2d3436'
        }}
      >
        {label}
        {required && (
          <span style={{ color: '#d63031', marginLeft: '4px' }} aria-label="required">
            *
          </span>
        )}
      </label>

      {hint && (
        <div
          id={hintId}
          className="field-hint"
          style={{
            fontSize: '12px',
            color: '#636e72',
            marginBottom: '4px'
          }}
        >
          {hint}
        </div>
      )}

      {React.cloneElement(children as React.ReactElement, {
        id: fieldId.current,
        'aria-describedby': [
          hint ? hintId : null,
          error ? errorId : null
        ].filter(Boolean).join(' '),
        'aria-invalid': !!error,
        'aria-required': required
      })}

      {error && (
        <div
          id={errorId}
          className="field-error"
          role="alert"
          aria-live="polite"
          style={{
            fontSize: '12px',
            color: '#d63031',
            marginTop: '4px'
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
};

// Screen reader announcer
export const useScreenReaderAnnouncer = () => {
  const announcerRef = useRef<HTMLDivElement>(null);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    if (announcerRef.current) {
      announcerRef.current.setAttribute('aria-live', priority);
      announcerRef.current.textContent = message;

      // Clear after announcement
      setTimeout(() => {
        if (announcerRef.current) {
          announcerRef.current.textContent = '';
        }
      }, 1000);
    }
  }, []);

  return { announce, announcerRef };
};

// Screen reader announcer component
export const ScreenReaderAnnouncer: React.FC = () => {
  const { announcerRef } = useScreenReaderAnnouncer();

  return (
    <div
      ref={announcerRef}
      className="sr-only"
      style={{
        position: 'absolute',
        width: '1px',
        height: '1px',
        padding: 0,
        margin: '-1px',
        overflow: 'hidden',
        clip: 'rect(0, 0, 0, 0)',
        whiteSpace: 'nowrap',
        border: 0
      }}
      aria-live="polite"
      aria-atomic="true"
    />
  );
};

// Skip link component
export const SkipLink: React.FC<{ href: string; children: ReactNode }> = ({
  href,
  children
}) => (
  <a
    href={href}
    className="skip-link"
    style={{
      position: 'absolute',
      top: '-40px',
      left: '6px',
      background: '#0984e3',
      color: 'white',
      padding: '8px',
      textDecoration: 'none',
      borderRadius: '4px',
      zIndex: 1000,
      transition: 'top 0.3s'
    }}
    onFocus={(e) => {
      e.currentTarget.style.top = '6px';
    }}
    onBlur={(e) => {
      e.currentTarget.style.top = '-40px';
    }}
  >
    {children}
  </a>
);

// Accessibility toolbar component
export const AccessibilityToolbar: React.FC = () => {
  const [highContrast, setHighContrast] = useState(false);
  const [largeText, setLargeText] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const { announce } = useScreenReaderAnnouncer();

  useEffect(() => {
    // Check for user preferences
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setReduceMotion(prefersReducedMotion);

    // Apply saved preferences
    const savedHighContrast = localStorage.getItem('a11y-high-contrast') === 'true';
    const savedLargeText = localStorage.getItem('a11y-large-text') === 'true';

    setHighContrast(savedHighContrast);
    setLargeText(savedLargeText);
  }, []);

  const toggleHighContrast = () => {
    const newValue = !highContrast;
    setHighContrast(newValue);
    localStorage.setItem('a11y-high-contrast', String(newValue));
    document.body.classList.toggle('high-contrast', newValue);
    announce(`High contrast ${newValue ? 'enabled' : 'disabled'}`);
  };

  const toggleLargeText = () => {
    const newValue = !largeText;
    setLargeText(newValue);
    localStorage.setItem('a11y-large-text', String(newValue));
    document.body.classList.toggle('large-text', newValue);
    announce(`Large text ${newValue ? 'enabled' : 'disabled'}`);
  };

  const toggleReduceMotion = () => {
    const newValue = !reduceMotion;
    setReduceMotion(newValue);
    localStorage.setItem('a11y-reduce-motion', String(newValue));
    document.body.classList.toggle('reduce-motion', newValue);
    announce(`Reduced motion ${newValue ? 'enabled' : 'disabled'}`);
  };

  return (
    <div
      className="accessibility-toolbar"
      style={{
        position: 'fixed',
        top: '10px',
        left: '10px',
        backgroundColor: 'white',
        border: '1px solid #ddd',
        borderRadius: '4px',
        padding: '8px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        zIndex: 999
      }}
      role="toolbar"
      aria-label="Accessibility options"
    >
      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '8px' }}>
        Accessibility
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <button
          onClick={toggleHighContrast}
          style={{
            padding: '4px 8px',
            border: 'none',
            backgroundColor: highContrast ? '#0984e3' : '#f8f9fa',
            color: highContrast ? 'white' : 'black',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
          aria-pressed={highContrast}
        >
          High Contrast
        </button>

        <button
          onClick={toggleLargeText}
          style={{
            padding: '4px 8px',
            border: 'none',
            backgroundColor: largeText ? '#0984e3' : '#f8f9fa',
            color: largeText ? 'white' : 'black',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
          aria-pressed={largeText}
        >
          Large Text
        </button>

        <button
          onClick={toggleReduceMotion}
          style={{
            padding: '4px 8px',
            border: 'none',
            backgroundColor: reduceMotion ? '#0984e3' : '#f8f9fa',
            color: reduceMotion ? 'white' : 'black',
            borderRadius: '2px',
            cursor: 'pointer',
            fontSize: '11px'
          }}
          aria-pressed={reduceMotion}
        >
          Reduce Motion
        </button>
      </div>
    </div>
  );
};

// ARIA live region hook
export const useAriaLiveRegion = () => {
  const [announcements, setAnnouncements] = useState<Array<{ id: string; message: string; priority: 'polite' | 'assertive' }>>([]);

  const announce = useCallback((message: string, priority: 'polite' | 'assertive' = 'polite') => {
    const id = Date.now().toString();
    setAnnouncements(prev => [...prev, { id, message, priority }]);

    // Remove announcement after it should be read
    setTimeout(() => {
      setAnnouncements(prev => prev.filter(announcement => announcement.id !== id));
    }, 1000);
  }, []);

  return {
    announce,
    announcements
  };
};