# 3D Anvil — Forge Theme Style Guide

This document describes the current design system: a **forge-like theme** (blacksmith/anvil, hot metal, embers, sparks) used across the app. Use it when adding or updating UI so styles stay consistent.

---

## Design concept

- **Metaphor**: Forge / blacksmith — heating, striking, sparks, embers, hot metal.
- **Accent**: Orange/amber (`orange-400`, `amber-*`, `rgba(251,146,60,...)`) for heat, CTAs, focus, and active states.
- **Base**: Same warm neutrals as before (cream/beige light, dark brown/black dark) with gray text scale.
- **Motion**: Subtle heat shimmers, floating embers, letter-forging animations, and smooth transitions.

---

## Color palette

### CSS variables (use these for theme-aware UI)

| Variable        | Light      | Dark        |
|----------------|------------|------------|
| `--background` | `#EBE7E0`  | `#141311`  |
| `--foreground` | `#262626`  | `#E5E5E5`  |

### Forge accent (orange/amber)

- **Primary forge**: `rgba(251, 146, 60, …)` / Tailwind `orange-400`
- **Secondary**: `rgba(245, 158, 11, …)` / `amber-500`
- **Glow**: Multi-layer box-shadows (e.g. `0 0 20px rgba(255,170,0,0.5)`) for CTAs and hover
- **Semantic**: Green for "open"/success (`green-500`), red for "closed"/errors (`red-500`)

### Gray scale (unchanged)

- Text: `gray-900` / `gray-100` (primary), `gray-500`–`gray-400` (secondary/muted)
- Borders: `gray-300` / `gray-700`, or `rgba(107,114,128,0.3)` for forge panels
- Backgrounds: `gray-50/80`, `gray-900/40` for cards

### Selection & focus

- Selection: `bg-gray-900 text-white` (light), `bg-gray-100 text-gray-900` (dark)
- Focus rings: `ring-2 ring-orange-400 ring-offset-2` for forge inputs; black/white for legacy buttons

---

## Typography

### Fonts

- **Sans**: Geist Sans (`var(--font-geist-sans)`)
- **Mono**: Geist Mono (`var(--font-geist-mono)`) — addresses, code, numeric inputs

### Scale (Tailwind)

| Class         | Size                      | Use                    |
|---------------|---------------------------|------------------------|
| `text-display`| clamp(3rem, 10vw, 8rem)   | Hero (legacy)          |
| `text-headline` | clamp(2rem, 5vw, 4rem)   | Section headings       |
| `text-title`  | clamp(1.5rem, 3vw, 2.5rem)| Card titles            |
| `text-body-lg`| 1.25rem                   | Lead / emphasis       |
| `text-body`   | 1rem                      | Body                   |
| `text-small`  | 0.875rem                  | Secondary copy        |
| `text-caption`| 0.75rem                    | Labels, metadata      |

### Labels

- **Section/label**: `.text-label` = `text-caption uppercase tracking-widest text-gray-500 dark:text-gray-400`
- Uppercase labels often use `tracking-wider` or `tracking-widest`

---

## Layout

- **Container**: `.container-custom` — `max-w-7xl mx-auto px-6 md:px-8 lg:px-12`
- **Section padding**: `.section-padding` — `py-20 md:py-32`
- **Main**: `pt-16 md:pt-20` under fixed nav

---

## Forge-specific components (CSS classes)

Defined in `src/app/globals.css`. Use these instead of ad‑hoc Tailwind for consistency.

### Page wrappers

| Class                     | Use |
|---------------------------|-----|
| `page-home`               | Home: unified gradient + fixed grid + scroll-based effects |
| `page-inner-forge`        | Inner pages: gradient + grid |
| `page-inner-forge--compact` | Inner page, solid `--background` |
| `page-inner-forge--no-scroll` | Full-viewport (e.g. mint), no page scroll |
| `page-inner-forge--forging` | Minting/forging state: stronger heat/embers |

### Sections

| Class                | Use |
|----------------------|-----|
| `section-hero`        | Hero: gradient, grid, min-height |
| `section-forge`       | Content sections: gradient + drifting grid |
| `section-cta-forge`   | "Ready to forge?" CTA block |

### Cards

| Class                    | Use |
|--------------------------|-----|
| `card-forge`             | Feature cards: gray border, hover → orange "heating" border + glow + heat shimmer |
| `card-forge-interactive`  | Selectable items (e.g. collections): border, hover orange glow + heat waver |
| `card-forge-heat-shimmer`| Child div for heat overlay on hover |

### Buttons

| Class               | Use |
|---------------------|-----|
| `btn-forge-cta`     | Primary CTA ("Ready to forge?"): dark bg + strong orange glow, pulse on hover |
| `btn-forge-outline` | Secondary actions: border, text inherit; focus/hover orange (defined in globals) |
| `btn-forge-secondary` | Lower emphasis (e.g. Settings/View): subtle fill (defined in globals) |
| `btn-hero-primary`  | Hero "Start Forging": dark, orange glow on hover |
| `btn-ghost`         | Text-only, hover color change |
| `btn-primary` / `btn-outline` | Legacy neutral buttons |

### Form & inputs

| Class                 | Use |
|-----------------------|-----|
| `input-forge`         | Text/textarea/inputs: subtle bg, gray border, orange focus ring + glow |
| `upload-forge`        | Drop zone: dashed border, orange on hover |
| `divider-forge`       | Horizontal rule: gradient line |

### Tabs & chips

| Class                 | Use |
|-----------------------|-----|
| `tab-forge`           | Tab base (padding, uppercase, border-bottom transparent) |
| `tab-forge-active`    | Active tab: orange underline + glow |
| `tab-forge-inactive`  | Inactive: muted color, hover to foreground |
| `chip-forge`          | Pill (e.g. royalty %): border, hover orange |
| `chip-forge-active`   | Selected: orange tint + border |

### Status & feedback

| Class              | Use |
|--------------------|-----|
| `status-forge`     | Status banner: orange border + light fill + heat waver |
| `error-forge`      | Error banner: red border + light red fill |
| `spinner-forge`    | Loading: orange circular spinner |
| `back-link-forge`  | Back link: muted, hover orange |

### Mint/drop states

| Class                     | Use |
|---------------------------|-----|
| `mint-card-open`          | Mint open: green border + glow |
| `mint-card-closed`        | Mint closed: red border |
| `phase-end-highlight-forge` | Highlight when "+ Add phase" is used (orange outline animation) |
| `scroll-to-top-forge`     | FAB: orange border, glow on hover |

### Stats & structure

| Class               | Use |
|---------------------|-----|
| `stat-forge`        | Stat block: border, orange bottom line on hover |
| `forge-step-number` | Step numbers with ember-style glow |

---

## Forge hero & animation (home)

- **Hero headline**: `<ForgeWord />` — "Forge 3D Assets / On Solana" with letter-forging animation (`.forge-letter`, `.forge-sparks`, `.forge-dust`, `.forge-word` ember glow).
- **Step numbers**: `<ForgeStepNumber />` with ember glow; optional strike animation.
- **Effects**: `.page-home-effects` (heat gradient, vignette, embers) driven by scroll (`--effects-intensity`).
- **Cards**: `.card-forge` with `.card-forge-heat-shimmer`, `.card-spark` for hover.
- **CTA**: `.btn-forge-cta` with strong orange glow and pulse.

Key animation classes: `animate-fade-in`, `animate-slide-up`, `animation-delay-100` … `500`, `card-heat-waver`, `heat-waver`, `ember-rise`, `grid-drift`.

---

## Dark mode

- **Method**: Class-based (`dark:` / `.dark`).
- **Persistence**: `localStorage` key `theme`; fallback `prefers-color-scheme`; script in `<head>` to avoid flash.
- All forge components have `.dark` variants in `globals.css`.

---

## Responsive

- Breakpoints: Tailwind defaults (sm 640, md 768, lg 1024, xl 1280, 2xl 1536).
- Mobile: single column, optional hamburger nav; typography uses clamp().
- Grids: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` (or similar).

---

## Accessibility

- Focus: visible focus rings (orange for forge inputs, black/white for legacy buttons).
- Semantic HTML and ARIA where needed (e.g. `aria-hidden` on decorative effects).
- Contrast: primary text and CTAs meet contrast requirements.

---

## File reference

| File | Purpose |
|------|--------|
| `src/app/globals.css` | Forge component classes, animations, page/section/card/button/input styles |
| `tailwind.config.ts`   | Colors (background/foreground, gray), fonts, font sizes, spacing, keyframes |
| `src/app/layout.tsx`   | Font loading, theme script, Navbar, main padding |

---

## Known issues

1. **Navbar background** — Navbar uses `#e8e4dd` / `#0a0908` with opacity instead of the design tokens `#EBE7E0` / `#141311`. Consider switching to `var(--background)` for consistency.
2. **Theme toggle** — Comment in `Navbar.tsx` says "Theme toggle disabled - dark mode only". If light mode is reintroduced, ensure all forge components already have light variants in CSS.
