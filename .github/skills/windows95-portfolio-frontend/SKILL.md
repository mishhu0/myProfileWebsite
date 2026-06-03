---
name: windows95-portfolio-frontend
description: 'Implement, debug, or refine the Windows 95/98 portfolio website. Use for retro UI tabs, taskbar behavior, movable windows, options panel, blog/projects/photography content, music player, audio controls, three.js visualizer, SCSS styling, and keeping style.css in sync with scss/style.scss.'
argument-hint: 'Describe the website change, bug, or UI slice to work on'
user-invocable: true
---

# Windows 95/98 Portfolio Frontend

Use this skill when working on this website's frontend behavior or presentation. It is tuned for the current project structure, the retro desktop metaphor, and the existing split between HTML structure, modular JavaScript, and SCSS partials.

## What This Skill Covers
- Desktop-window UI changes in `main.html`
- Window, taskbar, and movable-tab behavior in `js/main.js` and `js/tabs-functionality.js`
- Feature-specific tab logic in `js/tab-*.js`
- Music player, volume, and visualizer logic in `js/music-player.js`, `js/music-volume.js`, `js/music-visualizer-controller.js`, and `js/music-visualizer-three.js`
- Styling in `scss/*.scss`, with `scss/style.scss` as the SCSS entry and `style.css` as the compiled output
- Content-backed UI slices that load JSON from `misc/`, `blogs/`, `music/`, and `photography/`

## Project Facts
- The site is a vanilla frontend. Do not introduce React, Vue, or another framework.
- `main.html` is the markup anchor for windows, taskbar controls, and desktop icons.
- `js/main.js` defines shared app configuration such as `APP_CONFIG`, desktop icon to window mapping, changelog/to-do loading, and other cross-window behavior.
- `js/tabs-functionality.js` owns taskbar button state, open/close/minimize behavior, focus, z-index, and drag interactions.
- Feature logic is intentionally split by area: tab modules, music modules, and utility modules.
- SCSS is the source of truth. If styles change, update the relevant partial in `scss/` and compile to `style.css` with `npm run build`.

## Workflow
1. Start from the concrete anchor the request mentions: a file, selector, visible bug, control, window, or feature.
2. Identify the owning slice before editing:
   - Window chrome, focus, minimize, close, taskbar button, drag, or z-index issue: inspect `js/tabs-functionality.js` first, then `js/main.js` if config wiring is involved.
   - Desktop icon to tab mismatch: inspect `APP_CONFIG.desktopIconMap` and `APP_CONFIG.windowConfigs` in `js/main.js`, then the related markup in `main.html`.
   - A tab's content or rendering issue: inspect the matching `js/tab-*.js`, its window markup in `main.html`, the backing JSON if present, and the matching SCSS partial.
   - Music playback, track metadata, genre colors, download state, or YouTube linkage: inspect `js/music-player.js` and the relevant JSON in `music/`.
   - Visualizer behavior: inspect `js/music-visualizer-controller.js` and `js/music-visualizer-three.js` before changing unrelated music code.
   - Volume popup or shared audio controls: inspect `js/music-volume.js`.
   - Layout or theming issue with otherwise-correct behavior: inspect the owning partial in `scss/` before touching JavaScript.
3. Make the smallest local fix that preserves the current retro Windows 95/98 aesthetic and existing interaction model.
4. Keep structure aligned across layers:
   - HTML defines the window or control
   - JavaScript owns behavior and state
   - SCSS owns layout and appearance
   - JSON files own editable content data when the feature is data-driven
5. Validate the touched slice immediately after the first substantive edit.

## Decision Rules
- Do not widen scope just because nearby code is messy. Fix the behavior the request is about.
- Do not refactor broadly unless the change cannot be made safely without it.
- Do not edit generated or content files unless the request actually requires a content update.
- Do not modify backend or server configuration; this project is frontend-only.
- If a style change is needed, prefer SCSS partials over editing `style.css` directly.
- If `style.css` must reflect the SCSS change, run `npm run build` after editing.
- If the issue is data-loading related, verify the fetch path and JSON shape before assuming the rendering code is wrong.

## Quality Bar
A change is complete when all of the following are true:
- The affected control, tab, or content slice works in the intended window/tab flow.
- The retro chrome, button treatment, spacing, and visual tone still match the rest of the site.
- The fix stays local to the owning HTML, JS, SCSS, or JSON slice.
- `style.css` is regenerated after SCSS changes.
- There are no obvious regressions in open, close, minimize, focus, drag, or taskbar behavior for the touched window.

## Validation Checklist
1. Run `npm run build` when any SCSS file changes.
2. Manually verify the touched interaction in the browser:
   - Open the relevant desktop icon or taskbar item
   - Check focus and z-index
   - Check close and minimize behavior if applicable
   - Check responsive positioning if layout changed
   - Check audio behavior only if the change touched music or volume logic
3. If JSON-backed content changed, verify the data loads without fallback states.

## Good Prompts For This Skill
- Fix the taskbar button state when a tab is minimized and reopened.
- Update the music window layout without breaking the retro chrome.
- Debug why the photography tab is rendering fallback content.
- Improve the options panel styling and keep `style.css` in sync.
- Adjust the visualizer controls without changing unrelated music player behavior.

## Non-Goals
- Framework migrations
- Backend work
- Repo-wide refactors unrelated to the requested website change
- Replacing the Windows 95/98 visual language with a modern design system
