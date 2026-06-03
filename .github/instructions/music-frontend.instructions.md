---
description: "Use when editing music player, volume, audio, playlist, or visualizer code in js/music-*.js. Covers module boundaries, Web Audio handling, JSON-backed track data, and keeping music changes isolated from unrelated window logic."
name: "Music Frontend"
applyTo: "js/music-*.js"
---

# Music Frontend Guidelines

- Treat `js/music-player.js` as the owner of library loading, track metadata, genre palette mapping, and playback UI state.
- Treat `js/music-volume.js` as the owner of shared volume popup and global volume behavior.
- Treat `js/music-visualizer-controller.js` and `js/music-visualizer-three.js` as the owner of visualizer orchestration and rendering. Do not fold visualizer changes into unrelated player logic unless the bug crosses that boundary.
- Keep fixes local to the owning music module before touching `js/main.js`, tab wiring, or unrelated windows.
- Preserve the current vanilla JavaScript architecture. Do not introduce framework patterns.
- When changing track loading, verify fetch paths and JSON shape in `music/songs-library.json`, `music/genre-library.json`, and `music/fetched-songs-ytb-api.json` before rewriting rendering logic.
- For HTML audio elements, set `audio.src` to the intended file path directly. Do not use `URL.createObjectURL` with a plain string path.
- For Web Audio integration, keep the media element pipeline compatible with `AudioContext`, `createMediaElementSource(audio)`, and the destination/output chain.
- Preserve fallback behavior when music or metadata fetches fail. If data cannot load, the UI should still degrade cleanly.
- If a change affects playback controls, manually verify play, pause, track switch, volume behavior, and visualizer response.