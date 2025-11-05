import React, { useState, useRef, useEffect } from 'react';
import { Button } from '../button/Button';
import { cn } from '@/lib/utils';

export interface FormField {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'email' | 'password' | 'tel' | 'url' | 'textarea' | 'select' | 'checkbox' | 'radio' | 'file';
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  options?: Array<{ value: string; label: string }>;
  validation?: {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
    min?: number;
    max?: number;
    custom?: (value: string) => string | null;
  };
  defaultValue?: string | boolean;
  description?: string;
  autoComplete?: string;
}

export interface FormSection {
  id: string;
  title: string;
  description?: string;
  fields: FormField[];
  collapsed?: boolean;
}

export interface ResponsiveFormProps {
  sections: FormSection[];
  onSubmit: (data: Record<string, any>) => void | Promise<void>;
  onFieldChange?: (fieldName: string, value: any) => void;
  onSectionToggle?: (sectionId: string, isCollapsed: boolean) => void;
  className?: string;
  submitButtonText?: string;
  submitDisabled?: boolean;
  isSubmitting?: boolean;
  validationMode?: 'onChange' | 'onBlur' | 'onSubmit';
  showProgress?: boolean;
  layout?: 'vertical' | 'horizontal' | 'grid';
}

interface FieldError {
  field: string;
  message: string;
}

export const ResponsiveForm: React.FC<ResponsiveFormProps> = ({
  sections,
  onSubmit,
  onFieldChange,
  onSectionToggle,
  className,
  submitButtonText = 'Submit',
  submitDisabled = false,
  isSubmitting = false,
  validationMode = 'onBlur',
  showProgress = true,
  layout = 'vertical'
}) => {
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Initialize form data and collapsed sections
  useEffect(() => {
    const initialData: Record<string, any> = {};
    const initialCollapsed: Record<string, boolean> = {};

    sections.forEach(section => {
      initialCollapsed[section.id] = section.collapsed || false;
      section.fields.forEach(field => {
        if (field.defaultValue !== undefined) {
          initialData[field.name] = field.defaultValue;
        }
      });
    });

    setFormData(initialData);
    setCollapsedSections(initialCollapsed);
  }, [sections]);

  // Validate a single field
  const validateField = (field: FormField, value: any): string | null => {
    if (field.required && (!value || (typeof value === 'string' && value.trim() === ''))) {
      return `${field.label} is required`;
    }

    if (!value) return null;

    const stringValue = String(value);

    if (field.validation) {
      const { minLength, maxLength, pattern, custom } = field.validation;

      if (minLength && stringValue.length < minLength) {
        return `${field.label} must be at least ${minLength} characters`;
      }

      if (maxLength && stringValue.length > maxLength) {
        return `${field.label} must not exceed ${maxLength} characters`;
      }

      if (pattern && !new RegExp(pattern).test(stringValue)) {
        return `${field.label} format is invalid`;
      }

      if (custom) {
        const customError = custom(stringValue);
        if (customError) return customError;
      }
    }

    // Type-specific validation
    switch (field.type) {
      case 'email':
        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(stringValue)) {
          return 'Please enter a valid email address';
        }
        break;
      case 'tel':
        const telPattern = /^[\d\s\-\+\(\)]+$/;
        if (!telPattern.test(stringValue)) {
          return 'Please enter a valid phone number';
        }
        break;
      case 'url':
        try {
          new URL(stringValue);
        } catch {
          return 'Please enter a valid URL';
        }
        break;
    }

    return null;
  };

  // Handle field value change
  const handleFieldChange = (fieldName: string, value: any) => {
    const newFormData = { ...formData, [fieldName]: value };
    setFormData(newFormData);
    onFieldChange?.(fieldName, value);

    // Validate if in onChange mode or field has been touched
    if (validationMode === 'onChange' || touched[fieldName]) {
      const field = sections.flatMap(s => s.fields).find(f => f.name === fieldName);
      if (field) {
        const error = validateField(field, value);
        setErrors(prev => ({
          ...prev,
          [fieldName]: error || ''
        }));
      }
    }
  };

  // Handle field blur
  const handleFieldBlur = (fieldName: string) => {
    setTouched(prev => ({ ...prev, [fieldName]: true }));

    if (validationMode === 'onBlur') {
      const field = sections.flatMap(s => s.fields).find(f => f.name === fieldName);
      if (field) {
        const error = validateField(field, formData[fieldName]);
        setErrors(prev => ({
          ...prev,
          [fieldName]: error || ''
        }));
      }
    }
  };

  // Toggle section collapse
  const toggleSection = (sectionId: string) => {
    const newCollapsed = { ...collapsedSections, [sectionId]: !collapsedSections[sectionId] };
    setCollapsedSections(newCollapsed);
    onSectionToggle?.(sectionId, newCollapsed[sectionId]);
  };

  // Validate all fields
  const validateForm = (): FieldError[] => {
    const formErrors: FieldError[] = [];

    sections.forEach(section => {
      section.fields.forEach(field => {
        const error = validateField(field, formData[field.name]);
        if (error) {
          formErrors.push({ field: field.name, message: error });
        }
      });
    });

    return formErrors;
  };

  // Handle form submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (validationMode === 'onSubmit') {
      const formErrors = validateForm();
      if (formErrors.length > 0) {
        const errorsMap: Record<string, string> = {};
        formErrors.forEach(err => {
          errorsMap[err.field] = err.message;
        });
        setErrors(errorsMap);

        // Focus first error field
        const firstErrorField = formErrors[0].field;
        const errorElement = formRef.current?.querySelector(`[name="${firstErrorField}"]`) as HTMLElement;
        errorElement?.focus();

        return;
      }
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.error('Form submission error:', error);
    }
  };

  // Calculate progress
  const calculateProgress = () => {
    const totalFields = sections.reduce((acc, section) => acc + section.fields.length, 0);
    const filledFields = sections.reduce((acc, section) => {
      return acc + section.fields.filter(field => {
        const value = formData[field.name];
        return value !== undefined && value !== null && value !== '';
      }).length;
    }, 0);

    return totalFields > 0 ? (filledFields / totalFields) * 100 : 0;
  };

  const progress = calculateProgress();
  const hasErrors = Object.values(errors).some(error => error);

  // Render form field
  const renderField = (field: FormField) => {
    const error = errors[field.name];
    const isTouched = touched[field.name];
    const value = formData[field.name] ?? '';
    const hasError = error && isTouched;

    const baseInputClasses = cn(
      'w-full px-3 py-2 border rounded-md transition-colors',
      'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
      'disabled:bg-gray-100 disabled:cursor-not-allowed',
      hasError ? 'border-red-500' : 'border-gray-300'
    );

    const fieldId = `field-${field.name}`;
    const errorId = `error-${field.name}`;

    return (
      <div key={field.id} className="space-y-1">
        {field.type !== 'checkbox' && (
          <label
            htmlFor={fieldId}
            className="block text-sm font-medium text-gray-700"
          >
            {field.label}
            {field.required && <span className="text-red-500 ml-1">*</span>}
          </label>
        )}

        <div className="relative">
          {field.type === 'textarea' ? (
            <textarea
              id={fieldId}
              name={field.name}
              value={value}
              placeholder={field.placeholder}
              disabled={field.disabled}
              required={field.required}
              rows={4}
              className={baseInputClasses}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              onBlur={() => handleFieldBlur(field.name)}
              onFocus={() => setFocusedField(field.name)}
              aria-describedby={hasError ? errorId : field.description ? `desc-${fieldId}` : undefined}
              aria-invalid={hasError}
            />
          ) : field.type === 'select' ? (
            <select
              id={fieldId}
              name={field.name}
              value={value}
              disabled={field.disabled}
              required={field.required}
              className={baseInputClasses}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              onBlur={() => handleFieldBlur(field.name)}
              onFocus={() => setFocusedField(field.name)}
              aria-describedby={hasError ? errorId : field.description ? `desc-${fieldId}` : undefined}
              aria-invalid={hasError}
            >
              <option value="">{field.placeholder || `Select ${field.label}`}</option>
              {field.options?.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : field.type === 'checkbox' ? (
            <div className="flex items-center space-x-2">
              <input
                id={fieldId}
                name={field.name}
                type="checkbox"
                checked={Boolean(value)}
                disabled={field.disabled}
                required={field.required}
                className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                onChange={(e) => handleFieldChange(field.name, e.target.checked)}
                onBlur={() => handleFieldBlur(field.name)}
                onFocus={() => setFocusedField(field.name)}
                aria-describedby={hasError ? errorId : field.description ? `desc-${fieldId}` : undefined}
                aria-invalid={hasError}
              />
              <label
                htmlFor={fieldId}
                className="text-sm font-medium text-gray-700"
              >
                {field.label}
                {field.required && <span className="text-red-500 ml-1">*</span>}
              </label>
            </div>
          ) : field.type === 'radio' ? (
            <div className="space-y-2">
              {field.options?.map(option => (
                <div key={option.value} className="flex items-center space-x-2">
                  <input
                    id={`${fieldId}-${option.value}`}
                    name={field.name}
                    type="radio"
                    value={option.value}
                    checked={value === option.value}
                    disabled={field.disabled}
                    required={field.required}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300"
                    onChange={(e) => handleFieldChange(field.name, e.target.value)}
                    onBlur={() => handleFieldBlur(field.name)}
                    onFocus={() => setFocusedField(field.name)}
                    aria-describedby={hasError ? errorId : undefined}
                    aria-invalid={hasError}
                  />
                  <label
                    htmlFor={`${fieldId}-${option.value}`}
                    className="text-sm text-gray-700"
                  >
                    {option.label}
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <input
              id={fieldId}
              name={field.name}
              type={field.type}
              value={value}
              placeholder={field.placeholder}
              disabled={field.disabled}
              required={field.required}
              autoComplete={field.autoComplete}
              className={baseInputClasses}
              onChange={(e) => handleFieldChange(field.name, e.target.value)}
              onBlur={() => handleFieldBlur(field.name)}
              onFocus={() => setFocusedField(field.name)}
              aria-describedby={hasError ? errorId : field.description ? `desc-${fieldId}` : undefined}
              aria-invalid={hasError}
            />
          )}
        </div>

        {field.description && (
          <p id={`desc-${fieldId}`} className="text-sm text-gray-500">
            {field.description}
          </p>
        )}

        {hasError && (
          <p id={errorId} className="text-sm text-red-600" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  };

  // Layout classes
  const layoutClasses = {
    vertical: 'space-y-6',
    horizontal: 'grid grid-cols-1 md:grid-cols-2 gap-6',
    grid: 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6'
  };

  return (
    <div className={cn('responsive-form w-full max-w-4xl mx-auto', className)}>
      {/* Progress Bar */}
      {showProgress && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-gray-600">Form Progress</span>
            <span className="text-sm text-gray-600">{Math.round(progress)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={Math.round(progress)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      <form
        ref={formRef}
        onSubmit={handleSubmit}
        noValidate={validationMode !== 'onSubmit'}
        className={layoutClasses[layout]}
      >
        {sections.map((section) => (
          <div
            key={section.id}
            className={cn(
              'form-section bg-white rounded-lg border border-gray-200',
              collapsedSections[section.id] ? 'opacity-75' : ''
            )}
          >
            {/* Section Header */}
            <div
              className="flex items-center justify-between p-4 border-b border-gray-200 cursor-pointer hover:bg-gray-50"
              onClick={() => toggleSection(section.id)}
              role="button"
              aria-expanded={!collapsedSections[section.id]}
              aria-controls={`section-content-${section.id}`}
            >
              <div>
                <h3 className="text-lg font-medium text-gray-900">
                  {section.title}
                </h3>
                {section.description && (
                  <p className="text-sm text-gray-600 mt-1">
                    {section.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label={collapsedSections[section.id] ? 'Expand section' : 'Collapse section'}
              >
                <svg
                  className={cn(
                    'w-5 h-5 transition-transform',
                    collapsedSections[section.id] ? 'rotate-0' : 'rotate-180'
                  )}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 9l-7 7-7-7"
                  />
                </svg>
              </button>
            </div>

            {/* Section Content */}
            <div
              id={`section-content-${section.id}`}
              className={cn(
                'p-4 space-y-4',
                collapsedSections[section.id] ? 'hidden' : 'block'
              )}
            >
              {section.fields.map(renderField)}
            </div>
          </div>
        ))}

        {/* Submit Button */}
        <div className="col-span-full flex justify-end space-x-3 pt-6 border-t border-gray-200">
          <Button
            type="submit"
            disabled={submitDisabled || isSubmitting || hasErrors}
            className="min-w-32"
          >
            {isSubmitting ? (
              <div className="flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>Submitting...</span>
              </div>
            ) : (
              submitButtonText
            )}
          </Button>
        </div>
      </form>

      {/* Error Summary */}
      {hasErrors && (
        <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-md" role="alert">
          <h4 className="text-sm font-medium text-red-800 mb-2">
            Please correct the following errors:
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            {Object.entries(errors)
              .filter(([, error]) => error)
              .map(([field, error]) => (
                <li key={field} className="flex items-center space-x-2">
                  <span className="text-red-500">•</span>
                  <span>{error}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default ResponsiveForm;