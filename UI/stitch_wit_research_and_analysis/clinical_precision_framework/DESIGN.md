---
name: Clinical Precision Framework
colors:
  surface: '#f7f9ff'
  surface-dim: '#d7dadf'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4f9'
  surface-container: '#ebeef3'
  surface-container-high: '#e5e8ed'
  surface-container-highest: '#e0e3e8'
  on-surface: '#181c20'
  on-surface-variant: '#43474e'
  inverse-surface: '#2d3135'
  inverse-on-surface: '#eef1f6'
  outline: '#73777f'
  outline-variant: '#c3c6cf'
  surface-tint: '#436084'
  primary: '#002444'
  on-primary: '#ffffff'
  primary-container: '#1b3a5c'
  on-primary-container: '#87a4cc'
  inverse-primary: '#abc9f2'
  secondary: '#3f6181'
  on-secondary: '#ffffff'
  secondary-container: '#b8dbff'
  on-secondary-container: '#3e6080'
  tertiary: '#4f0012'
  on-tertiary: '#ffffff'
  tertiary-container: '#711124'
  on-tertiary-container: '#fa7b86'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d2e4ff'
  primary-fixed-dim: '#abc9f2'
  on-primary-fixed: '#001c38'
  on-primary-fixed-variant: '#2b486b'
  secondary-fixed: '#cee5ff'
  secondary-fixed-dim: '#a7caee'
  on-secondary-fixed: '#001d33'
  on-secondary-fixed-variant: '#264968'
  tertiary-fixed: '#ffdadb'
  tertiary-fixed-dim: '#ffb2b6'
  on-tertiary-fixed: '#40000d'
  on-tertiary-fixed-variant: '#842131'
  background: '#f7f9ff'
  on-background: '#181c20'
  surface-variant: '#e0e3e8'
typography:
  headline-lg:
    fontFamily: Playfair Display
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 40px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Playfair Display
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  headline-sm:
    fontFamily: Playfair Display
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  body-lg:
    fontFamily: Public Sans
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Public Sans
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Public Sans
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  data-display:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
    letterSpacing: -0.01em
  label-caps:
    fontFamily: Public Sans
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
  unit: 4px
  container-max: 1440px
  gutter: 16px
  margin-desktop: 32px
  margin-mobile: 16px
  panel-padding: 20px
---

## Brand & Style

The design system is engineered for high-stakes institutional research where accuracy and trust are paramount. It adopts a **Modern Corporate** aesthetic with a lean toward **Scientific Rigor**, utilizing structured grids and high-density information layouts to facilitate rapid analysis.

The visual narrative avoids decorative flourishes, focusing instead on clarity and visual hierarchy. By combining high-contrast serif headings with utilitarian sans-serif body text, the system evokes the authority of a medical journal while maintaining the efficiency of a modern diagnostic tool. The interface prioritizes functional density, ensuring that large datasets are legible and actionable without overwhelming the researcher.

## Colors

This color palette is anchored in stability and medical urgency. 

- **Primary & Secondary Blues:** Used for structural elements, primary actions, and navigational wayfinding. These colors establish a baseline of institutional reliability.
- **Background & Surfaces:** The cool off-white background reduces eye strain during long research sessions while providing a crisp canvas for deep charcoal text.
- **Alert / Flagged Results:** The muted maroon is reserved strictly for medically significant findings. It is a high-signal color meant to draw immediate attention to critical data points (e.g., Malignant/Parasitized) without the alarmist nature of a bright scarlet.
- **Typography:** Charcoal (#2B2F33) provides the highest legibility for body content, while Slate Gray is used for metadata and labels to manage visual noise.

## Typography

The typographic system uses a tri-font strategy to separate intent:

1.  **Playfair Display (Headlines):** Used for page titles and section headers to provide an authoritative, editorial feel.
2.  **Public Sans (Body):** A neutral, highly legible sans-serif for descriptions, inputs, and general interface text.
3.  **JetBrains Mono (Numeric/Data):** Crucial for microscopic diagnostic IDs, specimen counts, and timestamps. The monospaced nature ensures that columns of numbers align perfectly, aiding in comparative analysis.

**Implementation Note:** Always use JetBrains Mono for any value derived from a database or a scientific instrument to distinguish "system data" from "interpretive text."

## Layout & Spacing

The design system utilizes a **Fixed Grid** approach for desktop analysis views to ensure consistent positioning of high-density data panels. 

- **Grid:** A 12-column grid system with 16px gutters.
- **Panels:** Content is organized into "Bordered Panels." These panels act as the primary containers for diagnostic data. 
- **Dividers:** Use 1px hairline dividers (#E5E7EB) to separate content within panels rather than using wide margins. This maintains high information density while providing clear logical grouping.
- **Responsiveness:** On mobile devices, panels stack vertically and horizontal margins reduce to 16px. Complex data tables should allow for horizontal scrolling within their parent panel to maintain data integrity.

## Elevation & Depth

This design system eschews shadows in favor of **Low-contrast Outlines** and **Tonal Layers**. 

- **Flat Hierarchy:** Depth is communicated through 1px solid borders (#D1D5DB) and subtle shifts in background color.
- **Surface Tiers:** 
  - Level 0 (Canvas): #F6F7F9
  - Level 1 (Panels): #FFFFFF with a 1px border.
  - Level 2 (Active/Hover): #E2E8F0 subtle tint.
- **No Shadows:** To maintain a "scientific" and "flat" feel, avoid ambient shadows. Interactive elements should use color shifts or border weight changes to indicate state rather than elevation.

## Shapes

The shape language is strictly **Soft (Minimal)**. 

- **Standard Radius:** 4px (0.25rem) is the maximum radius allowed for buttons, input fields, and panels.
- **Interactive Elements:** Buttons and form controls should feel sharp and precise.
- **Data Points:** In visualizations, use square markers or very slightly rounded points to reinforce the mathematical nature of the research.
- **Large Containers:** Even large dashboard cards must adhere to the 4px limit to avoid a "consumer-app" aesthetic.

## Components

### Buttons
- **Primary:** Solid Deep Navy (#1B3A5C) with White text. Sharp 4px corners.
- **Secondary:** Outlined Steel Blue (#4A6C8C) with 1px border.
- **Critical:** Solid Muted Maroon (#8B2635) reserved only for destructive actions or confirming malignant findings.

### Data Tables
- Use Public Sans for headers (Bold, 12px) and JetBrains Mono for cell data.
- Row zebra-striping is encouraged using #F9FAFB for even rows to assist in horizontal scanning.
- 1px hairline borders between all cells.

### Status Chips
- **Malignant/Flagged:** Muted maroon background (10% opacity) with solid maroon text.
- **Normal/Clear:** Slate gray background (10% opacity) with dark charcoal text.
- Chips should be rectangular with a 2px radius.

### Input Fields
- 1px border (#D1D5DB). On focus, border changes to Steel Blue (#4A6C8C) with no outer glow.
- Labels must be in Public Sans (Bold, 12px) positioned above the field.

### Diagnostic Cards
- White background, 1px border (#D1D5DB). 
- Headers within cards should use Playfair Display (Small) with a hairline divider separating the header from the body content.