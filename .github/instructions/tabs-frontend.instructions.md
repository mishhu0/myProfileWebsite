---
description: "Use when editing tab modules in js/tab-*.js for the Windows 95/98 portfolio website. Covers DOM ownership, JSON-backed content loading, fallback states, tab-local interactions, and keeping changes aligned with matching main.html markup and SCSS."
name: "Tabs Frontend"
applyTo: "js/tab-*.js"
---

# Tabs Frontend Guidelines

- Treat each `js/tab-*.js` file as the owner of one window or content slice. Keep behavior local to that tab before touching shared window/taskbar code.
- Verify the matching DOM structure in `main.html` before changing selectors, ids, or class names. These modules rely on specific element lookups and should fail safely if required nodes are missing.
- If the tab loads JSON data, verify the fetch path and data shape first. In this repo, blog, photography, and similar content tabs are intentionally data-driven.
- Preserve fallback behavior. If content cannot load, the tab should still render a clear empty or fallback state rather than breaking the window.
- Prefer local render helpers for tab-specific UI state such as active list items, detail panes, counters, or hover panels. Do not move tab-specific state into `js/main.js` unless the behavior truly becomes shared.
- Keep content rendering compatible with the existing retro window layout and the corresponding SCSS partials.
- When a tab bug looks visual rather than behavioral, check the matching `scss/*.scss` partial before rewriting JavaScript.
- When a tab bug looks like open, close, minimize, z-index, or drag behavior, check `js/tabs-functionality.js` and `js/main.js` instead of overloading the tab module.
- Avoid broad refactors across multiple tabs unless the task explicitly calls for shared tab infrastructure.
- After changing a tab module, manually verify the relevant window opens, populates content, and preserves its local interactions without regressing taskbar or focus behavior.