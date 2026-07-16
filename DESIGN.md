---
name: MaintX Pro
description: Procurement & Stock Management Dashboard
colors:
  primary: "#6366f1"
  primary-hover: "#4f46e5"
  neutral-bg: "#f8fafc"
  neutral-border: "#f1f5f9"
  neutral-sidebar: "#020617"
  accent-success: "#10b981"
  accent-warning: "#f59e0b"
  accent-danger: "#f43f5e"
typography:
  display:
    fontFamily: "Inter, Sarabun, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.75rem
  body:
    fontFamily: "Inter, Sarabun, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.25rem
  label:
    fontFamily: "Inter, Sarabun, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  sm: "4px"
  lg: "8px"
  xl: "12px"
spacing:
  md: "16px"
  lg: "24px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
  card:
    backgroundColor: "#ffffff"
    rounded: "{rounded.xl}"
    padding: "24px"
---

# Design System: MaintX Pro

## 1. Overview

**Creative North Star: "The Industrial Ledger"**

MaintX Pro is designed with high visual density, clear structure, and industrial reliability. It avoids empty space and decorative flair in favor of high-utility tables, direct inline buttons, and rich data visualization. It explicitly rejects soft beige/cream backgrounds, glowing glassmorphism, or low-contrast text.

**Key Characteristics:**
- High-contrast, clean grid layout.
- High-density tables showing comprehensive details at a single glance.
- Minimal transition delays, prioritizing functional speed over playful motion.

## 2. Colors

All colors carry high contrast ratios (>4.5:1) for optimal readability under ambient factory floor lighting.

### Primary
- **Indigo Accent** (#6366f1): Used for primary interactive actions, active sidebar navigation highlights, and core highlights.

### Neutral
- **Slate Background** (#f8fafc): Neutral canvas background.
- **Deep Navy Sidebar** (#020617): High contrast left side navigation bar.
- **White Surface** (#ffffff): Card and container backgrounds.
- **Slate Border / Scrollbar Track** (#f1f5f9): Border and scrollbar track neutral styling.

### Named Rules
**The 10% Highlight Rule.** Bold indigo accent is reserved only for active state selections and main call-to-actions, keeping the rest of the interface focused on raw data.

## 3. Typography

**Display Font:** Inter (Latin), Sarabun (Thai)
**Body Font:** Inter, Sarabun
**Label/Mono Font:** Inter

### Hierarchy
- **Display** (Bold (700), 1.125rem, 1.75rem): Used for main page headers.
- **Body** (Regular (400), 0.875rem, 1.25rem): Used for primary table content and descriptions.
- **Label** (Bold (700), 0.75rem, 1rem): Used for table headers and statuses.

## 4. Elevation

The system is flat by default, relying on subtle borders (#e2e8f0) and slight elevations for depth representation.

### Shadow Vocabulary
- **Card Shadow** (`box-shadow: 0 1px 3px 0 rgba(0,0,0,0.1)`): Standard card overlay.

### Named Rules
**The Flat-by-Default Rule.** Surfaces remain flat. Shadows are reserved exclusively for cards and modally layered elements.

## 5. Components

### Buttons
- **Shape:** Rounded corners (8px radius (rounded-lg) / 4px radius (rounded-sm) for small utilities)
- **Primary:** Indigo background, white text.
- **Hover:** Darker indigo (#4f46e5).

### Cards / Containers
- **Corner Style:** Rounded (12px radius)
- **Background:** White (#ffffff)
- **Border:** Light slate (#e2e8f0)

### Inputs / Fields
- **Style:** Bordered (#e2e8f0) with rounded corners (8px).
- **Focus:** Focus ring outline (#6366f1) with 20% opacity.

## 6. Do's and Don'ts

### Do:
- **Do** maintain a strict contrast ratio of at least 4.5:1 for all text.
- **Do** align Thai and English text properly using the custom font stack.

### Don't:
- **Don't** use decorative gradients, glassmorphism, or soft cream colors.
- **Don't** hide critical table columns on larger viewports.
