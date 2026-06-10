---
name: hakureinoyume-ui
description: Project frontend UI implementation standards for hakureinoyume-site. Use when changing this repository's React/Next.js pages, CSS, theme variables, glass panels, dashboard cards, responsive layouts, dark/light theme behavior, or reusable UI components.
---

# Hakureinoyume UI

## Overview

Use this skill to keep UI changes in `hakureinoyume-site` consistent with the existing Next.js app, global CSS variables, glass-panel visual language, and dark/light theme behavior.

## Workflow

1. Inspect the existing component and nearby CSS before editing.
2. Prefer existing components from `src/app/_components` for stable card, header, and progress primitives.
3. Use global CSS variables for color, borders, shadows, and status accents.
4. Keep page-level layout in page shells or parent grids, not inside card contents.
5. Verify both light and dark themes when the change touches color, glass surfaces, hover states, selected states, disabled or muted states, or overlays.

## Theme Rules

- Treat `src/app/globals.css` as the main token source for the homepage.
- Prefer `--bg-color`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent`, `--accent-hover`, `--accent-light`, `--glass-bg`, `--glass-border`, `--glass-shadow`, `--header-bg`, `--progress-bg`, and `--progress-fill`.
- Do not add static light-only colors such as `rgba(255,255,255,...)` to component states unless a matching dark value or semantic variable is added.
- When adding component-specific tokens, define them in `:root` and override them in `[data-theme="dark"]`.
- Keep `site-theme.ts` `--theme-*` variables for dynamic background and admin contexts unless the current code path already uses them.
- New visual states must cover normal, hover/focus, selected/active, muted/disabled, and status variants where relevant.

## Layout Rules

- Keep the visual core as background image plus glass panels.
- Use `GlassPanel`, `DashboardCard`, `CardHeader`, and `ProgressBar` when they match the structure.
- Do not add new oversized floating containers around existing cards.
- Keep cards responsible for content, not page grid structure.
- Preserve mobile readability with single-column behavior and avoid layout relationships that only work with absolute positioning.

## Component Rules

- Name CSS classes by component semantics, not by color or temporary placement.
- Reuse existing radius, shadow, spacing, and glass border conventions before inventing new ones.
- Use icon components already present in the app, especially lucide icons, for icon buttons.
- Keep transitions scoped to actual changing properties.
- Use static CSS for static visuals; reserve inline styles for dynamic values such as percentages or CSS variable values.
- Extract repeated stable structures only after they appear enough to justify reuse.

## CSS Organization

- Keep global CSS organized as tokens, reset, base, utilities, layout, components, page-specific sections, then responsive styles.
- Add tokens near existing root theme variables.
- Add component rules in the relevant component section.
- Avoid unrelated refactors when fixing a focused UI issue.

## Validation

- Run the project lint or the narrowest available check after code edits.
- For visual UI work, inspect desktop and mobile when a local browser is available, and check that text stays legible in light and dark themes.
- Pay special attention to contrast on glass surfaces because background images vary in brightness.
