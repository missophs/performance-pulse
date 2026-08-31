---
name: Performance Pulse
description: A private 1:1 and performance conversation tool for an employee and their manager.
colors:
  ink-violet: "#241b4d"
  muted-violet: "#7a6fa3"
  faint-violet: "#a99fc7"
  accent-violet: "#7c3aed"
  accent-pink: "#ec4899"
  accent-cyan: "#06b6d4"
  accent-soft: "#f3eeff"
  surface-card: "#ffffff"
  surface-card-2: "#faf8ff"
  border-hairline: "#e9e4f8"
  good: "#10b981"
  warn: "#f59e0b"
  risk: "#ef4444"
  info: "#06b6d4"
typography:
  body:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "13.5px"
    fontWeight: 400
    lineHeight: 1.5
  title:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-.02em"
  label:
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    letterSpacing: ".05em"
rounded:
  sm: "8px"
  md: "10px"
  lg: "16px"
  pill: "20px"
spacing:
  sm: "8px"
  md: "14px"
  lg: "20px"
components:
  button-primary:
    backgroundColor: "{colors.accent-violet}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "10px 17px"
  button-secondary:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-violet}"
    rounded: "{rounded.md}"
    padding: "10px 17px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted-violet}"
    rounded: "{rounded.md}"
    padding: "10px 17px"
  card:
    backgroundColor: "{colors.surface-card}"
    rounded: "{rounded.lg}"
    padding: "18px 20px"
---

# Design System: Performance Pulse

## Overview

**Creative North Star: "The Trusted Console"**

A dark violet operator's shell wraps a bright, paper-white workspace: the interface reads as
a private, well-built tool for a serious two-person conversation, not a public-facing SaaS
marketing surface and not a bureaucratic HR form. Structure is Operate-mode plain — sidebar,
topbar, stacked cards — but every accent (gradient badges, stat tiles, the coach callout) is
saturated and confident rather than muted, because the two colors in this room (a violet and a
pink) are trusted with real emotional weight: recognition, progress, warmth. The privacy
promise gets its own visual language (mint-green banners) so it reads as a standing guarantee,
not incidental copy.

Do not read this as a generic AI-generated dashboard. The give-away tells to actively avoid:
a system font stack instead of Inter, a genuinely dark (not just tinted-gray) sidebar shell,
white cards with real shadow instead of flat gray-on-gray, and named per-context accent colors
(purple/pink/cyan/green/amber) instead of one blue doing everything.

**Key Characteristics:**
- Dark violet gradient shell (sidebar + page background) framing bright white content cards
- One accent gradient (violet → pink) carries all primary actions and active states
- Named semantic colors (cyan, green, amber, red) are reserved for distinct meanings, never decorative
- System-font typography, no webfont — this is a tool, not a brand showcase
- Soft-lifted cards (16px radius, ambient shadow) over a hairline-bordered flat alternative

## Colors

The palette runs one confident accent gradient against a near-black violet shell and stark
white cards; every other color is functional, not decorative.

### Primary
- **Accent Violet** (`#7c3aed`): primary actions, focus rings, active nav/tab state, links inside dark surfaces.
- **Accent Pink** (`#ec4899`): the second stop in the primary gradient (`linear-gradient(135deg, #7c3aed, #ec4899)`); used wherever the primary gradient appears (buttons, active nav, stat tiles, avatars, the coach badge).

### Secondary
- **Accent Cyan** (`#06b6d4`): a third, less-frequent accent — the "info"/cyan stat tile and one avatar gradient. Never used for primary actions.

### Neutral
- **Ink Violet** (`#241b4d`): primary text color on white/light surfaces.
- **Muted Violet** (`#7a6fa3`): secondary text — captions, sub-labels, ghost-button text.
- **Faint Violet** (`#a99fc7`): tertiary text — hints, meta timestamps.
- **Card White** (`#ffffff`) / **Card Wash** (`#faf8ff`): the two card background tones; wash is for slightly-recessed rows inside a card (suggestions, hover states).
- **Hairline Border** (`#e9e4f8`): the only border color on light surfaces.

### Status
- **Good** (`#10b981`) — the privacy banners/notes use this at low opacity on the dark shell, and full-strength on light surfaces.
- **Warn** (`#f59e0b`) — nudge callouts, amber stat tile, amber badges.
- **Risk** (`#ef4444`) — danger buttons, risk badges. Never used for a primary action.

### Named Rules
**The Two-Color Budget Rule.** Only the violet→pink gradient signals "this is the primary action or the thing that's active right now." Cyan, green, and amber are meaning-carrying (info, success, warning) and must never substitute for the primary gradient on a button or active state.

## Typography

**Body Font:** System UI stack (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif`) — no webfont anywhere in the project.

**Character:** Plain and fast-reading, not editorial. Weight and size carry hierarchy instead of a display face; the boldest text on any screen is a stat number, not a headline.

### Hierarchy
- **Title** (700, 24px, -.02em tracking): page-level `h1` only, one per view.
- **Card Heading** (600–700, 15.5px): `.card h2` — one per card.
- **Body** (400, 13.5px, 1.5 line-height): the default reading size for list items, form values, check-in answers.
- **Caption** (400–600, 11.5–12.5px): `.card-note`, `.item-sub`, hints — always `var(--muted)` or `var(--faint)`.
- **Label** (700, 11px, uppercase, .03–.05em tracking): form field labels, stat labels, badge text.
- **Stat Number** (800, 27px, tabular-nums): the single largest text on any screen — reserved for dashboard stat tiles.

### Named Rules
**The One Headline Rule.** Exactly one 24px `h1` per view; every other heading is a card-level 15.5px `h2`. Nothing competes with the page title.

## Layout

Two-region shell: a fixed-width (236px) dark sidebar and a fluid main column (max-width 1040px, centered content, not edge-to-edge). Content is stacked cards inside `main`, never a dense multi-column dashboard grid outside of the stat-tile row (`auto-fit, minmax(158px, 1fr)`). Below 820px the sidebar collapses into a horizontal, scrollable top bar and the stat grid drops to 2 columns (1 column under 420px). Spacing rhythm is tight and functional: 12–14px between list rows and cards, 18–20px card padding — this is a working tool meant to fit a lot on screen, not a spacious marketing layout.

## Elevation & Depth

Hybrid: the dark shell uses translucency and blur (`backdrop-filter: blur(12px)` on the sidebar, frosted glass over the gradient background) while light-surface cards use a single soft ambient shadow (`0 8px 28px rgba(15,12,41,.28)`) rather than a layered elevation scale. There is no shadow scale with multiple steps — one shadow value serves every resting card, and colored glows (`box-shadow` tinted to match a gradient) mark emphasis on gradient elements like stat tiles and the logo mark.

### Named Rules
**The One Shadow Rule.** Resting cards get exactly one shadow value. Depth differences between elements are expressed through color and gradient glow, not a multi-step elevation system.

## Shapes

Generously rounded throughout, scaling with the element's weight: 16px on cards and stat tiles, 10–11px on buttons and small containers, 8–9px on inputs and small buttons, full pill (20px+ or 50%) on chips, tabs, badges, and avatars. No sharp corners anywhere in the system. Borders are 1px hairlines only on light surfaces; dark-shell elements use translucent white borders instead of a border color.

## Components

### Buttons
- **Shape:** 10px radius (`--radius` is reserved for larger containers); 8px for `.btn.sm`.
- **Primary:** violet→pink gradient background, white text, colored ambient shadow, 700 weight, 10px/17px padding.
- **Secondary:** flat `accent-soft` (#f3eeff) background, violet text, no shadow.
- **Ghost:** transparent background, hairline border, muted text; hover shifts border and text to accent violet.
- **Danger:** flat `#fee2e2` background, risk-red text, no shadow — visually quiet, never gradient (gradient is reserved for primary/positive actions).
- **Hover / Focus:** primary/secondary/ghost all lift 1px on hover (`translateY(-1px)`); every interactive element gets a visible `outline: 2px solid` focus ring — this system does not rely on color alone for focus state.

### Chips / Badges
- **Chip (filter):** hairline border, white background, pill radius; active state fills solid accent violet.
- **Badge (status):** pill radius, uppercase 10px label, tinted background + matching dark text per semantic color (grey/purple/pink/cyan/green/amber/red) — never the raw saturated color as a badge background.

### Cards / Containers
- **Corner Style:** 16px radius, consistent across `.card` and `.step`.
- **Background:** white, or `--card-2` wash for a nested/recessed row inside a card.
- **Shadow Strategy:** single ambient shadow per the Elevation section; no hover-lift on static cards (only interactive stat tiles lift).
- **Border:** 1px hairline, always present alongside the shadow (never shadow-only).
- **Internal Padding:** 18–20px card padding; 16–18px on stepper cards.

### Inputs / Fields
- **Style:** 9px radius, hairline border, white background, 13.5px text — bumped to 16px font-size on mobile to prevent iOS auto-zoom.
- **Focus:** 2px accent-violet outline plus border color shift to accent violet.
- **Labels:** always uppercase, 11.5px, 700 weight, muted-violet — sits above the field, never inline/floating.

### Navigation
- **Sidebar (desktop):** dark, translucent, blurred; nav items are pill-radius rows, active state gets the full primary gradient plus glow shadow — not just a background tint.
- **Sidebar (mobile, <820px):** collapses to a sticky horizontal scroll strip; identical item styling, no separate mobile-only visual language.
- **Tabs:** pill-shaped, translucent-white at rest on dark backgrounds, solid white with violet text when active.

## Do's and Don'ts

### Do:
- **Do** keep the primary gradient (violet → pink) exclusive to primary actions and "this is active" states — that exclusivity is what makes it read as meaningful rather than decorative.
- **Do** give every interactive element a real `:focus-visible` outline; this system never relies on color-only affordance.
- **Do** reserve cyan/green/amber/red for their semantic meaning (info/success/warning/danger) even when adding new components.
- **Do** keep card corners at 16px and buttons/inputs in the 8–11px range — don't introduce a third radius scale.

### Don't:
- **Don't** add a second accent gradient or a competing "primary" color — one gradient owns primary actions system-wide.
- **Don't** flatten the dark sidebar to solid gray — the blur + translucency over the gradient shell is a deliberate, checked-for anti-pattern avoidance (a flat gray sidebar is the generic-AI-dashboard tell this system exists to avoid).
- **Don't** stack a shadow-only card without its hairline border, or vice versa — this system always pairs both.
- **Don't** introduce Inter or any webfont; the system-font stack is deliberate for a tool, not a brand surface.
