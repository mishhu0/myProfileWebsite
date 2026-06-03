---
description: "Use when editing SCSS partials, palette values, responsive layout, retro window chrome, or styling for the Windows 95/98 portfolio website. Covers scss/*.scss ownership, selector alignment, and rebuilding style.css from scss/style.scss."
name: "SCSS Frontend"
applyTo: "scss/**/*.scss"
---

# SCSS Frontend Guidelines

- SCSS is the source of truth. Edit the relevant file in `scss/` and treat `scss/style.scss` as the entry point that composes the partials.
- Keep `style.css` in sync by running `npm run build` after SCSS changes that should be reflected in the compiled stylesheet.
- Prefer changing the most specific owning partial such as `_music-player.scss`, `_taskbar.scss`, `_options-panel.scss`, `_blog.scss`, or `_photography.scss` instead of piling unrelated rules into `style.scss`.
- Preserve the Windows 95/98 aesthetic: beveled chrome, deliberate spacing, readable contrast, and the existing desktop/window visual language.
- Keep selectors aligned with existing `main.html` structure and JavaScript hooks. Avoid renaming classes or ids unless the task explicitly requires coordinated HTML and JS updates.
- Reuse existing palette variables and shared patterns where possible before adding new colors or one-off rules.
- Avoid broad refactors or cosmetic restyling outside the requested slice.
- If layout changes affect a windowed panel, manually verify focus, overflow, taskbar overlap, and mobile or narrow-width behavior.