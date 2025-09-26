# Configuration UI Mockups and Visual Design System

## Overview

This document presents the visual design system and UI mockups for the configuration system, showcasing progressive disclosure patterns and responsive design across all user modes.

## Design System Foundation

### Color Palette

```css
:root {
  /* Primary Colors */
  --primary-50: #f0f9ff;
  --primary-100: #e0f2fe;
  --primary-500: #0891b2;
  --primary-600: #0e7490;
  --primary-900: #164e63;

  /* Success Colors */
  --success-50: #f0fdf4;
  --success-500: #22c55e;
  --success-600: #16a34a;

  /* Warning Colors */
  --warning-50: #fffbeb;
  --warning-500: #f59e0b;
  --warning-600: #d97706;

  /* Error Colors */
  --error-50: #fef2f2;
  --error-500: #ef4444;
  --error-600: #dc2626;

  /* Neutral Colors */
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-400: #9ca3af;
  --gray-500: #6b7280;
  --gray-600: #4b5563;
  --gray-700: #374151;
  --gray-800: #1f2937;
  --gray-900: #111827;

  /* Semantic Colors */
  --background: #ffffff;
  --surface: var(--gray-50);
  --surface-elevated: #ffffff;
  --text-primary: var(--gray-900);
  --text-secondary: var(--gray-600);
  --text-disabled: var(--gray-400);
  --border: var(--gray-200);
  --border-focus: var(--primary-500);
}
```

### Typography Scale

```css
/* Typography System */
.text-xs { font-size: 0.75rem; line-height: 1rem; }      /* 12px */
.text-sm { font-size: 0.875rem; line-height: 1.25rem; }  /* 14px */
.text-base { font-size: 1rem; line-height: 1.5rem; }     /* 16px */
.text-lg { font-size: 1.125rem; line-height: 1.75rem; }  /* 18px */
.text-xl { font-size: 1.25rem; line-height: 1.75rem; }   /* 20px */
.text-2xl { font-size: 1.5rem; line-height: 2rem; }      /* 24px */
.text-3xl { font-size: 1.875rem; line-height: 2.25rem; } /* 30px */

/* Font Weights */
.font-normal { font-weight: 400; }
.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }
```

### Spacing System

```css
/* Spacing Scale (based on 4px grid) */
:root {
  --space-1: 0.25rem;  /* 4px */
  --space-2: 0.5rem;   /* 8px */
  --space-3: 0.75rem;  /* 12px */
  --space-4: 1rem;     /* 16px */
  --space-5: 1.25rem;  /* 20px */
  --space-6: 1.5rem;   /* 24px */
  --space-8: 2rem;     /* 32px */
  --space-10: 2.5rem;  /* 40px */
  --space-12: 3rem;    /* 48px */
  --space-16: 4rem;    /* 64px */
}
```

## Component Library

### 1. Progressive Disclosure Button

```
┌─────────────────────────────────────────────┐
│ 🔧 Advanced Settings                  [▼]  │
│ Configure advanced deployment options       │
└─────────────────────────────────────────────┘

Expanded State:
┌─────────────────────────────────────────────┐
│ 🔧 Advanced Settings                  [▲]  │
│ Configure advanced deployment options       │
├─────────────────────────────────────────────┤
│ Environment Variables                       │
│ ┌─────────────────┐ ┌─────────────────────┐ │
│ │ NODE_ENV        │ │ production          │ │
│ └─────────────────┘ └─────────────────────┘ │
│                                             │
│ Custom Domain                               │
│ ┌─────────────────────────────────────────┐ │
│ │ myapp.example.com                       │ │
│ └─────────────────────────────────────────┘ │
│                                             │
│ [+ Add Environment Variable]                │
└─────────────────────────────────────────────┘
```

**CSS Implementation:**
```css
.disclosure-button {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--space-4);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.disclosure-button:hover {
  background: var(--primary-50);
  border-color: var(--primary-500);
}

.disclosure-button:focus {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
}

.disclosure-content {
  max-height: 0;
  overflow: hidden;
  transition: max-height 0.3s ease;
}

.disclosure-content[aria-hidden="false"] {
  max-height: 500px; /* Adjust based on content */
}
```

### 2. Configuration Cards

```
┌─────────────────────────────────────────────┐
│ 🌐 Web Application                     ✓   │
│ Perfect for React, Vue, Angular apps        │
│                                             │
│ Features:                                   │
│ • Hot reload development                    │
│ • Optimized production builds               │
│ • Static asset handling                     │
│                                             │
│ [Selected] [Customize →]                   │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 📱 Mobile Application                       │
│ React Native, Flutter, or hybrid apps       │
│                                             │
│ Features:                                   │
│ • Device testing                            │
│ • App store deployment                      │
│ • Native performance                        │
│                                             │
│ [Select] [Learn More]                      │
└─────────────────────────────────────────────┘
```

### 3. Smart Defaults Interface

```
┌─────────────────────────────────────────────┐
│ 🎯 Smart Detection Results                  │
│                                             │
│ ✅ Project Type: React Application (95%)   │
│    Based on: package.json, .tsx files      │
│                                             │
│ ✅ Framework: React 18 (99%)               │
│    Based on: package.json dependencies     │
│                                             │
│ ✅ Build Tool: Vite (87%)                  │
│    Based on: vite.config.js detected       │
│                                             │
│ 🔧 Need to make changes?                    │
│    [Override Detection] [Manual Setup]     │
│                                             │
│ [Looks Good, Continue →]                   │
└─────────────────────────────────────────────┘
```

### 4. Progressive Complexity Indicators

```
Configuration Options:

┌─────────────────────────────────────────────┐
│ 🟢 BASIC                                   │
│ Essential settings to get started           │
│ ⏱️ ~2 minutes                               │
│                                             │
│ Project Type: [Web App ▼]                  │
│ Framework: [Auto-detected]                  │
│ Deployment: [Development ▼]                 │
│                                             │
│ [Quick Setup →]                            │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🟡 INTERMEDIATE                            │
│ Customize common settings                   │
│ ⏱️ ~10 minutes                              │
│                                             │
│ Everything in Basic, plus:                  │
│ • Environment variables                     │
│ • Custom domains                            │
│ • Performance optimization                  │
│                                             │
│ [Custom Setup →]                           │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ 🔴 ADVANCED                                │
│ Full control and customization              │
│ ⏱️ ~30 minutes                              │
│ 🎓 Technical knowledge recommended          │
│                                             │
│ Everything in Intermediate, plus:           │
│ • Security configuration                    │
│ • Load balancing                            │
│ • Custom build pipelines                    │
│ • Monitoring & analytics                    │
│                                             │
│ [Expert Setup →]                           │
└─────────────────────────────────────────────┘
```

### 5. Error States with Recovery

```
┌─────────────────────────────────────────────┐
│ ⚠️ Configuration Issue Detected             │
│                                             │
│ Problem: Port 3000 is already in use       │
│                                             │
│ This usually happens when:                  │
│ • Another development server is running     │
│ • A previous session didn't close properly │
│ • System service is using this port        │
│                                             │
│ 🛠️ Quick Fixes:                            │
│ [Use Port 3001] [Stop Other Services]      │
│                                             │
│ 🔧 Advanced Options:                        │
│ [Auto-detect Available Port]               │
│ [Custom Port Configuration]                │
│                                             │
│ Need help? [View Troubleshooting Guide]    │
└─────────────────────────────────────────────┘
```

### 6. Preview and Confirmation Interface

```
┌─────────────────────────────────────────────┐
│ 📋 Configuration Preview                    │
│                                             │
│ Project: my-react-app                       │
│ Type: Web Application                       │
│ Framework: React 18.2.0                     │
│ Build Tool: Vite 4.3.0                      │
│ Deployment: Development                     │
│                                             │
│ 📁 Files to be created:                     │
│ • package.json                              │
│ • vite.config.js                            │
│ • .env.development                          │
│ • docker-compose.yml                        │
│                                             │
│ ⏱️ Estimated setup time: 45 seconds         │
│                                             │
│ [◀ Back] [Deploy Configuration →]          │
└─────────────────────────────────────────────┘

During Deployment:
┌─────────────────────────────────────────────┐
│ 🚀 Deploying Configuration                  │
│                                             │
│ ✅ Creating project structure               │
│ ✅ Installing dependencies                  │
│ 🔄 Configuring development server           │
│ ⏳ Starting application...                  │
│                                             │
│ Progress: ████████████░░░░ 75%             │
│                                             │
│ [View Live Logs] [Cancel Deployment]       │
└─────────────────────────────────────────────┘

Success State:
┌─────────────────────────────────────────────┐
│ 🎉 Configuration Complete!                  │
│                                             │
│ Your React application is now running at:   │
│ 🔗 http://localhost:3000                    │
│                                             │
│ Next Steps:                                 │
│ ✨ [Open Application] [View Code]          │
│ 🛠️ [Customize Settings] [Add Features]     │
│ 📚 [Documentation] [Tutorials]             │
│                                             │
│ 🏆 Achievement Unlocked: First Deployment! │
└─────────────────────────────────────────────┘
```

## Responsive Design Breakpoints

### Mobile First Approach

#### Mobile (320px - 767px)
```
┌─────────────────┐
│ Configuration   │
│                 │
│ [Quick Setup]   │
│ ⏱️ 2 minutes     │
│                 │
│ [Custom Setup]  │
│ ⏱️ 10 minutes    │
│                 │
│ [Advanced]      │
│ ⏱️ 30 minutes    │
│                 │
│ Recent:         │
│ • My Web App    │
│ • API Service   │
│                 │
│ [View All →]    │
└─────────────────┘
```

#### Tablet (768px - 1023px)
```
┌─────────────────────────────────┐
│ Configuration Setup             │
│                                 │
│ ┌─────────────┐ ┌─────────────┐ │
│ │ Quick Setup │ │ Custom      │ │
│ │ ⏱️ 2 min     │ │ ⏱️ 10 min    │ │
│ │             │ │             │ │
│ │ [Start →]  │ │ [Start →]  │ │
│ └─────────────┘ └─────────────┘ │
│                                 │
│ ┌─────────────┐ ┌─────────────┐ │
│ │ Advanced    │ │ Recent      │ │
│ │ ⏱️ 30 min    │ │ Projects    │ │
│ │             │ │             │ │
│ │ [Start →]  │ │ [View All] │ │
│ └─────────────┘ └─────────────┘ │
└─────────────────────────────────┘
```

#### Desktop (1024px+)
```
┌─────────────────────────────────────────────────────────────┐
│ Configuration Setup                         [Profile ▼]    │
├─────────────────────────────────────────────────────────────┤
│ ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│ │ 🟢 Quick Setup  │ │ 🟡 Custom       │ │ 🔴 Advanced     │ │
│ │                 │ │                 │ │                 │ │
│ │ Essential       │ │ Customize       │ │ Full control    │ │
│ │ settings only   │ │ common options  │ │ & optimization  │ │
│ │                 │ │                 │ │                 │ │
│ │ ⏱️ ~2 minutes    │ │ ⏱️ ~10 minutes   │ │ ⏱️ ~30 minutes   │ │
│ │                 │ │                 │ │                 │ │
│ │ [Start Setup]   │ │ [Start Setup]   │ │ [Start Setup]   │ │
│ └─────────────────┘ └─────────────────┘ └─────────────────┘ │
│                                                             │
│ Recent Projects                        Templates            │
│ ┌─────────────────────────────────────┐ ┌─────────────────┐ │
│ │ • My React App     [Continue →]     │ │ React SPA       │ │
│ │ • API Service      [Configure →]    │ │ Vue.js App      │ │
│ │ • Mobile App       [Deploy →]       │ │ Next.js Site    │ │
│ │                                     │ │ Express API     │ │
│ │ [View All Projects]                 │ │ [Browse All →] │ │
│ └─────────────────────────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Animation and Micro-interactions

### Progressive Disclosure Animation
```css
@keyframes expandDisclosure {
  0% {
    max-height: 0;
    opacity: 0;
    transform: translateY(-10px);
  }
  50% {
    max-height: 250px;
    opacity: 0.5;
  }
  100% {
    max-height: 500px;
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes collapseDisclosure {
  0% {
    max-height: 500px;
    opacity: 1;
    transform: translateY(0);
  }
  50% {
    max-height: 250px;
    opacity: 0.5;
  }
  100% {
    max-height: 0;
    opacity: 0;
    transform: translateY(-10px);
  }
}

/* Respect reduced motion preferences */
@media (prefers-reduced-motion: reduce) {
  .disclosure-content {
    animation: none !important;
    transition: none !important;
  }
}
```

### Button Hover States
```css
.btn-primary {
  background: var(--primary-500);
  color: white;
  transition: all 0.15s ease;
  transform: scale(1);
}

.btn-primary:hover {
  background: var(--primary-600);
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(8, 145, 178, 0.25);
}

.btn-primary:active {
  transform: scale(0.98);
}
```

### Loading States
```css
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.6; }
  100% { opacity: 1; }
}

.loading-state {
  animation: pulse 1.5s infinite;
  pointer-events: none;
}

.spinner {
  width: 20px;
  height: 20px;
  border: 2px solid var(--gray-300);
  border-top: 2px solid var(--primary-500);
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
```

## Dark Mode Support

```css
@media (prefers-color-scheme: dark) {
  :root {
    --background: #0f172a;
    --surface: #1e293b;
    --surface-elevated: #334155;
    --text-primary: #f1f5f9;
    --text-secondary: #cbd5e1;
    --text-disabled: #64748b;
    --border: #334155;
    --border-focus: #0ea5e9;
  }

  .disclosure-button {
    background: var(--surface);
    color: var(--text-primary);
    border-color: var(--border);
  }

  .disclosure-button:hover {
    background: #1e40af20;
    border-color: var(--border-focus);
  }
}

/* Manual dark mode toggle */
[data-theme="dark"] {
  /* Same dark mode variables */
}
```

## Accessibility Visual Indicators

### Focus States
```css
/* High-visibility focus indicators */
.focus-visible {
  outline: 2px solid var(--primary-500);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px rgba(8, 145, 178, 0.1);
}

/* Skip to content link */
.skip-link {
  position: absolute;
  top: -40px;
  left: 6px;
  background: var(--primary-500);
  color: white;
  padding: 8px;
  border-radius: 4px;
  text-decoration: none;
  transition: top 0.15s ease;
}

.skip-link:focus {
  top: 6px;
}
```

### Screen Reader Only Content
```css
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.sr-only-focusable:focus {
  position: static;
  width: auto;
  height: auto;
  padding: inherit;
  margin: inherit;
  overflow: visible;
  clip: auto;
  white-space: normal;
}
```

## Component States Documentation

### Interactive States
```css
/* Button States */
.btn {
  /* Default state */
  opacity: 1;
  cursor: pointer;
}

.btn:hover {
  /* Hover state */
  opacity: 0.9;
}

.btn:focus {
  /* Focus state */
  outline: 2px solid var(--primary-500);
}

.btn:active {
  /* Active/pressed state */
  transform: scale(0.98);
}

.btn:disabled {
  /* Disabled state */
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}

.btn[aria-busy="true"] {
  /* Loading state */
  position: relative;
  color: transparent;
}

.btn[aria-busy="true"]::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 20px;
  height: 20px;
  border: 2px solid currentColor;
  border-radius: 50%;
  border-top-color: transparent;
  animation: spin 1s linear infinite;
}
```

## Implementation Guidelines

### CSS Architecture
- Use CSS Custom Properties for theming
- Implement design tokens systematically
- Follow BEM methodology for class naming
- Ensure cascade doesn't break component isolation

### Component Development
- Build components with progressive enhancement
- Test all interactive states
- Validate accessibility in each component
- Document component API and usage

### Performance Considerations
- Optimize animations for 60fps
- Use transform and opacity for animations
- Implement lazy loading for complex interfaces
- Minimize layout thrashing

---

*Document version: 1.0*
*Last updated: 2025-09-25*
*Author: Configuration System UX Team*
*Design System: v1.0 Compliant*