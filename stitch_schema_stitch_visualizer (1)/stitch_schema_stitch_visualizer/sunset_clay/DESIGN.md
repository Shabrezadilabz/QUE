---
name: Sunset Clay
colors:
  surface: '#fbf8ff'
  surface-dim: '#d6d8f9'
  surface-bright: '#fbf8ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f4f2ff'
  surface-container: '#edecff'
  surface-container-high: '#e6e6ff'
  surface-container-highest: '#dfe0ff'
  on-surface: '#161a32'
  on-surface-variant: '#55423e'
  inverse-surface: '#2b2e48'
  inverse-on-surface: '#f1efff'
  outline: '#88726d'
  outline-variant: '#dbc1ba'
  surface-tint: '#9a442d'
  primary: '#9a442d'
  on-primary: '#ffffff'
  primary-container: '#e07a5f'
  on-primary-container: '#5b1604'
  inverse-primary: '#ffb4a1'
  secondary: '#605f50'
  on-secondary: '#ffffff'
  secondary-container: '#e6e3d0'
  on-secondary-container: '#666556'
  tertiary: '#386753'
  on-tertiary: '#ffffff'
  tertiary-container: '#70a18a'
  on-tertiary-container: '#003725'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdbd2'
  primary-fixed-dim: '#ffb4a1'
  on-primary-fixed: '#3c0800'
  on-primary-fixed-variant: '#7c2e19'
  secondary-fixed: '#e6e3d0'
  secondary-fixed-dim: '#c9c7b5'
  on-secondary-fixed: '#1c1c11'
  on-secondary-fixed-variant: '#48473a'
  tertiary-fixed: '#bbeed4'
  tertiary-fixed-dim: '#9fd1b8'
  on-tertiary-fixed: '#002115'
  on-tertiary-fixed-variant: '#1f4f3c'
  background: '#fbf8ff'
  on-background: '#161a32'
  surface-variant: '#dfe0ff'
typography:
  headline-xl:
    fontFamily: Hanken Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Hanken Grotesk
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Hanken Grotesk
    fontSize: 28px
    fontWeight: '600'
    lineHeight: 36px
  headline-md:
    fontFamily: Hanken Grotesk
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  body-lg:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.04em
  code-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 40px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
  max-width: 1440px
---

## Brand & Style

This design system is built for a data engineering platform that prioritizes human intuition alongside technical precision. It departs from the cold, sterile blues typically found in the industry, opting instead for an organic, sophisticated aesthetic that reduces cognitive fatigue during long sessions of pipeline orchestration and data modeling.

The style is **Minimalist-Organic**. It utilizes expansive white space (rendered in cream), high-quality typography, and a "soft-tactile" feel. Surfaces are layered with subtle tonal changes rather than heavy shadows, creating a workspace that feels calm, grounded, and premium. The target audience is senior data engineers who value clarity and a refined professional environment.

## Colors

The palette is inspired by natural earthen tones to evoke stability and focus.

- **Primary (Terracotta):** Used for primary actions, active states, and brand moments. It provides a warm focal point without being aggressive.
- **Secondary (Cream):** The foundational background color. It reduces eye strain compared to pure white and provides a sophisticated, "paper-like" quality.
- **Tertiary (Sage):** Reserved specifically for success states, valid data validations, and "healthy" system indicators.
- **Neutral (Charcoal):** Used for primary text and deep interface borders to ensure high legibility and a grounded structure.
- **Accent (Sand):** A muted version of the primary color (#F2CC8F) used for warnings or secondary highlights.

## Typography

The typography strategy balances modern professionalism with technical utility. 

- **Headlines:** Hanken Grotesk provides a sharp, contemporary look for page titles and section headers, lending an air of modern engineering excellence.
- **Body:** Inter is chosen for its exceptional readability in data-dense environments. It remains neutral and functional.
- **Labels & Code:** Geist is utilized for UI labels, metadata, and code snippets. Its technical, precise nature suits the monospaced requirements of data schemas and SQL editors while maintaining the system's clean aesthetic.

## Layout & Spacing

The design system employs a **Fluid-to-Fixed Grid** model. On desktop, content is housed within a 12-column grid with a maximum width of 1440px to ensure line lengths remain readable. 

A strict 8px spacing scale governs all spatial relationships. Sidebars and navigation panels use a "safe margin" of 24px from the screen edge. For data-heavy views (like pipeline graphs or tables), the gutter is reduced to 16px to maximize information density without sacrificing the organic, airy feel of the brand.

- **Mobile:** 4-column grid, 16px margins.
- **Tablet:** 8-column grid, 24px margins.
- **Desktop:** 12-column grid, 48px margins.

## Elevation & Depth

Visual hierarchy is achieved through **Tonal Layering** and **Low-Contrast Outlines**. 

Instead of traditional drop shadows, this system uses subtle shifts in background saturation to denote elevation. The base layer is the Secondary Cream (#F2EDE4). Raised elements, like cards or modals, use a pure white surface with a very thin (1px) border in a slightly darker cream or muted sand.

Where depth is required for focus (e.g., dropdowns), a soft, ambient shadow is used: `0px 4px 20px rgba(61, 64, 91, 0.08)`. This shadow is tinted with the Neutral Charcoal color to keep it feeling natural and integrated rather than "floating" in a void.

## Shapes

The shape language is **Rounded**, echoing the organic and approachable brand narrative. 

Buttons and input fields utilize a 0.5rem (8px) corner radius, which provides a friendly but professional silhouette. Large containers like cards and dashboard panels use the `rounded-lg` (16px) or `rounded-xl` (24px) scale to soften the interface and differentiate the platform from the sharp, boxy look of legacy enterprise software.

## Components

- **Buttons:** Primary buttons are solid Terracotta (#E07A5F) with white text. Secondary buttons use a Charcoal outline with no fill. Ghost buttons use Charcoal text. All buttons have an 8px radius.
- **Inputs:** Fields use a soft off-white fill with a 1px Charcoal border at 20% opacity. On focus, the border becomes 100% Primary Terracotta.
- **Chips/Badges:** Used for data tags. These should have a background of 10% opacity of the category color (e.g., 10% Sage for 'Success') with 100% opacity text of the same color.
- **Cards:** White backgrounds, 16px radius, and a 1px border in 'Sand' (#F2CC8F) at 30% opacity. No shadow by default.
- **Data Tables:** Row lines are 1px solid Cream (darkened by 5%). Header text uses Geist (Label-sm) in all-caps with 0.04em tracking.
- **Pipeline Nodes:** To be styled as highly rounded rectangles (24px radius) with subtle icons and Geist typography for technical labels.