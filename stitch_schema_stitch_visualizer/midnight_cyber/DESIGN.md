---
name: Midnight Cyber
colors:
  surface: '#131313'
  surface-dim: '#131313'
  surface-bright: '#393939'
  surface-container-lowest: '#0e0e0e'
  surface-container-low: '#1b1b1b'
  surface-container: '#1f1f1f'
  surface-container-high: '#2a2a2a'
  surface-container-highest: '#353535'
  on-surface: '#e2e2e2'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#e2e2e2'
  inverse-on-surface: '#303030'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#c2c6db'
  on-secondary: '#2b3040'
  secondary-container: '#414658'
  on-secondary-container: '#b0b4c9'
  tertiary: '#ffffff'
  on-tertiary: '#263143'
  tertiary-container: '#d8e3fb'
  on-tertiary-container: '#5a6579'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#dee1f7'
  secondary-fixed-dim: '#c2c6db'
  on-secondary-fixed: '#161b2b'
  on-secondary-fixed-variant: '#414658'
  tertiary-fixed: '#d8e3fb'
  tertiary-fixed-dim: '#bcc7de'
  on-tertiary-fixed: '#111c2d'
  on-tertiary-fixed-variant: '#3c475a'
  background: '#131313'
  on-background: '#e2e2e2'
  surface-variant: '#353535'
typography:
  headline-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
    letterSpacing: '0'
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.5'
  label-caps:
    fontFamily: Space Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.1em
  code-snippet:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '500'
    lineHeight: '1.4'
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 48px
  gutter: 16px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style

The design system is a high-intensity, developer-centric interface that prioritizes technical precision and immediate visual impact. The personality is "Aggressive Utility"—a blend of modern Digital Brutalism and high-contrast functionality. It targets power users, developers, and security professionals who require clarity in low-light environments.

The UI evokes a sense of "terminal-plus" sophistication. It moves beyond the simple CLI by using sharp geometric accents and a strict adherence to a grid, creating an atmosphere of focus, speed, and uncompromising technical capability. All elements are designed to feel "active" or "live," using the vibrant primary color to pierce through a dark, multi-layered background.

## Colors

The palette is built on a "True Black" foundation to maximize OLED efficiency and contrast.

- **Primary (#CCFF00):** A piercing lime green used exclusively for call-to-actions, active states, and critical data highlights. 
- **Secondary (#0A0F1E):** A deep midnight navy used for structural surfaces and containers to provide a subtle sense of depth against the black background.
- **Tertiary (#1E293B):** A slate blue-grey used for borders, inactive icons, and secondary information.
- **Surface:** The base layer is pure `#000000`. Overlays and cards utilize the Secondary or Tertiary shades with high-contrast borders.
- **Functional:** Success is mapped to Primary; Warnings are mapped to a pure #FF3E00 (Safety Orange); Errors are mapped to #FF0055 (Electric Rose).

## Typography

Typography in this design system is high-density and strictly functional. 

**Headlines:** Use **Space Grotesk** for a geometric, futuristic feel. Headlines should be tightly tracked (negative letter spacing) to feel dense and impactful.
**Body:** Use **JetBrains Mono** for all long-form text and data. The monospaced nature ensures that columns of information align perfectly, echoing a code editor.
**Labels:** Use **Space Mono** in all-caps for metadata, button labels, and status indicators. This adds to the "instrument panel" aesthetic.

Hierarchy is established through weight and color rather than excessive scale. Always ensure Primary green is used sparingly for text, reserved only for high-priority status or active navigation links.

## Layout & Spacing

This design system employs a **strict fluid grid** based on a 4px baseline. 

- **Grid Model:** 12-column system for desktop, 6-column for tablet, and 2-column for mobile.
- **Rhythm:** Spacing should be mathematical and predictable. Use 16px (md) as the standard padding for containers.
- **Density:** The layout is high-density. Avoid excessive whitespace; instead, use structural borders and tonal shifts to separate content.
- **Responsiveness:** On mobile, margins shrink to 16px, and complex data tables should horizontal-scroll or collapse into high-contrast list items. Desktop layouts should prioritize horizontal information density, filling the screen with modular widgets.

## Elevation & Depth

In this design system, depth is conveyed through **Bold Borders** and **Tonal Layering** rather than shadows.

- **Zero Shadows:** Do not use drop shadows. Elevation is binary.
- **Borders:** Use 1px or 2px solid borders to define surfaces.
  - Inactive containers: 1px solid #1E293B.
  - Active/Focused containers: 1.5px solid #CCFF00.
- **Layering:** 
  - Level 0 (Background): #000000.
  - Level 1 (Cards/Sidebar): #0A0F1E.
  - Level 2 (Inputs/Modals): #1E293B.
- **Interactivity:** Elements "lift" by changing border color from Tertiary to Primary, or by switching background colors to a low-opacity Primary green (e.g., #CCFF00 at 10% opacity).

## Shapes

The shape language is strictly **Sharp (0px)**. 

Every UI element—including buttons, input fields, cards, and modals—must have 90-degree corners. This reinforces the technical, brutalist nature of the design. No exceptions for "pill" buttons or rounded toggles. If a circular element is required (e.g., user avatar), it should be framed within a square container or displayed as a pixelated hex-shape if possible.

## Components

- **Buttons:** Primary buttons are solid #CCFF00 with black #000000 text. Secondary buttons are ghost-style with a 1px #CCFF00 border and #CCFF00 text. Hover states should invert colors or add a 2px offset "shadow" border in a contrasting color.
- **Inputs:** Square boxes with #0A0F1E background and 1px #1E293B border. Upon focus, the border turns #CCFF00 and a 1px Primary-colored glow (inner stroke) is acceptable.
- **Chips/Tags:** Small, high-contrast rectangles. Active tags use #CCFF00 background. Inactive tags use a dark navy background with white or grey monospaced text.
- **Lists:** Rows separated by 1px solid #1E293B borders. Selection is indicated by a 4px wide vertical "Primary" bar on the left edge of the row.
- **Cards:** No padding between the card edge and the internal header. Use a "Header Bar" style where the top 24px of the card is a different tonal color (#1E293B) to house the title.
- **Data Visualization:** Use the Primary green for the main data line. All grid lines in charts should be #1E293B and 0.5px wide.
- **Status Indicators:** Use square "LED" pips. A solid Primary square for 'online', an empty Tertiary-bordered square for 'offline'.