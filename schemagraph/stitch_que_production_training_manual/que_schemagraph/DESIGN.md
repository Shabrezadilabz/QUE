---
name: Que (SchemaGraph)
colors:
  surface: '#031427'
  surface-dim: '#031427'
  surface-bright: '#2a3a4f'
  surface-container-lowest: '#000f21'
  surface-container-low: '#0b1c30'
  surface-container: '#102034'
  surface-container-high: '#1b2b3f'
  surface-container-highest: '#26364a'
  on-surface: '#d3e4fe'
  on-surface-variant: '#c6c6cd'
  inverse-surface: '#d3e4fe'
  inverse-on-surface: '#213145'
  outline: '#909097'
  outline-variant: '#45464d'
  surface-tint: '#bec6e0'
  primary: '#bec6e0'
  on-primary: '#283044'
  primary-container: '#0f172a'
  on-primary-container: '#798098'
  inverse-primary: '#565e74'
  secondary: '#7bd0ff'
  on-secondary: '#00354a'
  secondary-container: '#00a6e0'
  on-secondary-container: '#00374d'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#001c10'
  on-tertiary-container: '#009365'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#031427'
  on-background: '#d3e4fe'
  surface-variant: '#26364a'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-sm:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
  code-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '700'
    lineHeight: 16px
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  panel-margin: 1rem
  gutter-dense: 0.5rem
  cell-padding: 0.25rem 0.5rem
  layout-sidebar: 260px
  layout-inspector: 320px
---

## Brand & Style

The design system is engineered for data professionals who demand precision, technical density, and high-trust interactions. The brand personality is **Precise, Authoritative, and Collaborative**, mirroring the experience of a high-end Integrated Development Environment (IDE).

The visual language follows a **Technical Minimalist** style. It prioritizes information density and structural clarity over decorative elements. It utilizes a "Schema-first" aesthetic, characterized by clear node-based layouts, explicit connection points, and a focus on data lineage. The emotional response should be one of "systemic mastery"—where the complexity of a massive data warehouse feels navigable and controlled.

The interface leverages a sophisticated dark-mode architecture to reduce eye strain during deep-work sessions, using subtle tonal layering to establish a clear hierarchy of panels and workspaces.

## Colors

The palette is optimized for a technical environment, using a core of deep slates and charcoals to define the canvas.

- **Primary Canvas**: A deep, saturated charcoal (`#020617`) serves as the base layer, providing maximum contrast for syntax highlighting and data visualizations.
- **Cyber Blue**: Reserved exclusively for AI-assisted features, suggested schema changes, and "Ghost Text" completions.
- **Emerald**: Used as a mark of quality. It represents "Certified" tables, verified lineage, and successful pipeline runs.
- **Warning/Drift**: An amber tone specifically designated for data drift alerts or schema mismatches.
- **Borders**: High-precision, low-contrast borders (`#334155`) are used to separate IDE panels without creating visual noise.

## Typography

This design system uses a dual-font approach to distinguish between UI metadata and actual data content.

1. **Inter**: Used for all functional UI elements, navigation, and documentation. It provides a neutral, highly readable foundation that scales from dense labels to large headlines.
2. **JetBrains Mono**: Used for all SQL editors, schema names, cell values, and "Evidence" badges. The monospaced nature ensures that vertical alignment in code and data tables is perfectly preserved.

Typography should be kept small and dense (13px for body) to maximize the information visible on screen without sacrificing legibility.

## Layout & Spacing

The layout follows a **Fixed-Panel IDE model**. It is designed to maximize the "Work Surface" while keeping auxiliary tools (Schema Browser, Lineage Graph, Inspector) reachable.

- **Grid System**: A rigorous 4px baseline grid ensures alignment across dense data tables and code editors.
- **Breakpoints**: Desktop-first. Mobile is treated as a "view-only" experience for monitoring pipeline status.
- **Panel Logic**: Sidebars are collapsible to provide a "Zen Mode" for SQL writing. Gutters are kept thin (8px) to emphasize the connection between related data nodes.

## Elevation & Depth

In a technical "Schema-first" interface, depth is conveyed through **Tonal Layers** rather than heavy shadows.

- **Layer 0 (Canvas)**: The darkest surface (`#020617`), used for the background of the entire application.
- **Layer 1 (Panels)**: Surface-container tiers (`#0F172A`) that house the primary editor and sidebars.
- **Layer 2 (Modals/Popovers)**: Slightly lighter (`#1E293B`) with a crisp, 1px border. 
- **AI Surfaces**: Elements suggested by the AI use a subtle "Cyber Blue" inner glow or a semi-transparent overlay to indicate their non-committed state.
- **Lines/Edges**: Connecting lines in the lineage graph use a 1.5px stroke. Active paths are highlighted with a Cyber Blue glow.

## Shapes

The shape language is **Technical and Precise**. 

- **UI Components**: Use a 4px (Soft) radius. This provides enough softness to be modern while maintaining the rigid, "organized" feel of a spreadsheet or code editor.
- **Nodes/Tables**: Rectangular with subtle rounding to denote them as discrete objects within the graph.
- **Presence Chips**: Fully rounded (Pill) to distinguish human elements from technical nodes.
- **Inputs**: Sharp corners or minimal 4px rounding to maximize internal space for monospaced text.

## Components

- **Technical Nodes (Tables)**: Header sections use `label-caps` for metadata (e.g., "SOURCE", "VIEW"). Rows use `code-sm` typography with an icon for data types (string, int, bool).
- **Edges (Joins)**: Visual connectors between tables. When hovered, the specific keys on both tables should highlight in Cyber Blue.
- **Presence Chips**: Small, high-contrast avatars with a status ring. Positioned in the top right of the editor to show active collaboration.
- **Notebook Editors**: A mix of Markdown for documentation and SQL blocks for logic. SQL blocks should have a distinct "Layer 2" background to separate them from documentation.
- **Evidence Badges**: Small, high-contrast tags (e.g., "SOC2", "PII", "CERTIFIED") using `label-caps`. 
- **Buttons**:
    - *Primary (Action)*: Solid Cyber Blue with white/black text.
    - *Secondary (Secondary Action)*: Ghost button with a 1px border.
    - *AI Suggestion*: Gradient border using Cyber Blue to Purple transition.
- **Inputs**: Always include a "Mono" mode for writing column names or filters. Error states (Data Drift) should use the Warning color for the border and a subtle background tint.