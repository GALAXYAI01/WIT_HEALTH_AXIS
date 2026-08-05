---
name: Sophisticated Professional
colors:
  surface: '#f7f9fb'
  surface-dim: '#d8dadc'
  surface-bright: '#f7f9fb'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f2f4f6'
  surface-container: '#eceef0'
  surface-container-high: '#e6e8ea'
  surface-container-highest: '#e0e3e5'
  on-surface: '#191c1e'
  on-surface-variant: '#444748'
  inverse-surface: '#2d3133'
  inverse-on-surface: '#eff1f3'
  outline: '#747878'
  outline-variant: '#c4c7c7'
  surface-tint: '#5f5e5e'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#1c1b1b'
  on-primary-container: '#858383'
  inverse-primary: '#c8c6c5'
  secondary: '#545f72'
  on-secondary: '#ffffff'
  secondary-container: '#d5e0f7'
  on-secondary-container: '#586377'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#161c22'
  on-tertiary-container: '#7e848c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#e5e2e1'
  primary-fixed-dim: '#c8c6c5'
  on-primary-fixed: '#1c1b1b'
  on-primary-fixed-variant: '#474746'
  secondary-fixed: '#d8e3fa'
  secondary-fixed-dim: '#bcc7dd'
  on-secondary-fixed: '#111c2c'
  on-secondary-fixed-variant: '#3c475a'
  tertiary-fixed: '#dde3eb'
  tertiary-fixed-dim: '#c1c7cf'
  on-tertiary-fixed: '#161c22'
  on-tertiary-fixed-variant: '#41474e'
  background: '#f7f9fb'
  on-background: '#191c1e'
  surface-variant: '#e0e3e5'
typography:
  display-lg:
    fontFamily: Libre Caslon Text
    fontSize: 48px
    fontWeight: '400'
    lineHeight: 56px
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Libre Caslon Text
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 44px
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Libre Caslon Text
    fontSize: 32px
    fontWeight: '400'
    lineHeight: 40px
  headline-sm:
    fontFamily: Libre Caslon Text
    fontSize: 24px
    fontWeight: '400'
    lineHeight: 32px
  body-lg:
    fontFamily: Public Sans
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.05em
  data-mono:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  base: 4px
  xs: 8px
  sm: 16px
  md: 24px
  lg: 40px
  xl: 64px
  gutter: 24px
  margin-mobile: 16px
  margin-desktop: 48px
---

## Brand & Style

This design system is built for high-stakes professional environments where clarity, authority, and modern sophistication are paramount. The aesthetic merges the intellectual rigor of traditional editorial design with the precision of contemporary software interfaces.

The design style is **Minimalist-Professional**, characterized by generous white space, a disciplined typographic scale, and subtle tonal layering. It avoids "tech-generic" tropes in favor of a bespoke, curated atmosphere that feels intentional and reliable. The emotional response is one of calm confidence and structured intelligence.

## Colors

The palette is anchored by a high-contrast monochromatic core to ensure maximum legibility and a "paper-and-ink" professional feel.

- **Primary**: A deep, "near-black" used for primary text and high-action components.
- **Secondary**: A muted slate used for secondary information and supporting icons.
- **Tertiary**: A soft grey for borders and inactive states.
- **Neutral**: A crisp, cool-toned white for background surfaces.

The color mode is strictly **light**, emphasizing the editorial and document-centric nature of the interface.

## Typography

Typography is the primary differentiator of this design system. It uses a "Serif-Display, Sans-Body" pairing to balance heritage with utility.

- **Headings**: Use **Libre Caslon Text**. It provides a literary, authoritative voice that feels established and sophisticated.
- **Body & Interface**: Use **Public Sans**. Chosen for its institutional clarity and neutral, accessible character. It ensures that dense information remains readable.
- **Data & Monospace**: Use **JetBrains Mono** for all numerical data, code snippets, and technical metadata.
- **Labels**: Small-scale labels should be uppercase with slightly increased letter spacing to maintain a clean, organized hierarchy.

## Layout & Spacing

The layout follows a **Fluid Grid** model with a strictly enforced 8px rhythmic scale. 

- **Grid**: A 12-column layout for desktop, 8-column for tablet, and 4-column for mobile.
- **Rhythm**: Vertical rhythm is driven by the 24px body line height. All component heights and margins should be multiples of 4px, ideally 8px.
- **Density**: The design favors "High Air" (Low Density) to prevent cognitive overload. Margins are generous to frame content like an editorial layout.

## Elevation & Depth

This system uses **Tonal Layers** and **Low-Contrast Outlines** rather than heavy shadows to signify depth.

- **Hierarchy**: Depth is created by shifting background colors (e.g., a neutral background with a white card).
- **Borders**: Use subtle 1px borders in `tertiary` color to define boundaries. 
- **Shadows**: When elevation is required (e.g., dropdowns or modals), use a single, highly-diffused ambient shadow: `0 4px 20px rgba(0,0,0,0.05)`. This keeps the UI feeling light and integrated.

## Shapes

The shape language is **Soft** and restrained.

- **Radius**: Use a standard 4px (`0.25rem`) radius for most components. This creates a professional look that is approachable but not overly "bubbly" or consumer-grade.
- **Interactive Elements**: Large cards may use 8px (`0.5rem`), but primary buttons and inputs should remain at 4px to maintain a sharp, precise character.

## Components

- **Buttons**: Primary buttons are solid `primary_color_hex` with white `label-md` text. Secondary buttons use a `tertiary` border with `primary` text.
- **Inputs**: Use a 1px `tertiary` border. On focus, the border transitions to `primary` with no glow/outer shadow.
- **Cards**: Cards are white surfaces on a `neutral` background, using a 1px `tertiary` border. 
- **Chips/Tags**: Use `body-sm` typography with a light grey background and no border for a subtle metadata look.
- **Lists**: Maintain clear horizontal dividers using 1px `tertiary` lines. Use `data-mono` for any list items containing IDs or timestamps.
- **Data Tables**: Use `data-mono` for all numeric cells. Header cells should use `label-md` in uppercase.