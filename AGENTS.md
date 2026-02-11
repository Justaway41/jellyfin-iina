# AGENTS.md

This guidance is for agentic coding assistants working in this repository. It documents the current runtime constraints, repo layout, coding conventions, and safe validation steps.

## Project Summary

- Project: Jellyfin sidebar plugin for IINA on macOS.
- Runtime environments:
  - Plugin context (`xyz.brbc.jellyfin.iinaplugin/dist/main.js`, `xyz.brbc.jellyfin.iinaplugin/dist/global.js`): IINA plugin JS runtime (not Node.js), built from `src/plugin/`.
  - Sidebar webview (`xyz.brbc.jellyfin.iinaplugin/ui/sidebar.html`, `xyz.brbc.jellyfin.iinaplugin/ui/dist/sidebar.js`): browser-like webview environment with DOM and `fetch()`, built from `src/ui/`.
  - Preferences page (`xyz.brbc.jellyfin.iinaplugin/ui/preferences.html`): static HTML loaded by IINA's plugin preferences UI.
- Languages: TypeScript (source), compiled JavaScript, HTML, CSS.
- Bun-only tooling for build/typecheck. Do not introduce Node-based tooling without explicit request.

## Repository Layout

- `src/plugin/`: plugin TypeScript sources (compiled to `xyz.brbc.jellyfin.iinaplugin/dist`).
- `src/ui/`: sidebar TypeScript sources (compiled to `xyz.brbc.jellyfin.iinaplugin/ui/dist`).
- `src/shared/`: shared message + Jellyfin types for plugin and UI.
- `Info.json` (repo root): minimal update manifest for IINA update checks (`identifier`, `version`, `ghVersion`).
- `xyz.brbc.jellyfin.iinaplugin/Info.json`: plugin manifest, entrypoints, permissions.
- `xyz.brbc.jellyfin.iinaplugin/dist/`: generated plugin runtime output (do not edit manually).
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.html`: sidebar webview template.
- `xyz.brbc.jellyfin.iinaplugin/ui/preferences.html`: plugin preferences template.
- `xyz.brbc.jellyfin.iinaplugin/ui/dist/`: generated sidebar runtime output (do not edit manually).
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.css`: sidebar styling.
- `xyz.brbc.jellyfin.iinaplugin/assets/`: plugin assets (splash image, etc).
- `xyz.brbc.jellyfin.iinaplugin/ui/assets/`: sidebar UI assets (logos/icons).

## Build / Lint / Test

There is a Bun-based build + typecheck pipeline and no lint/test tooling.

- Build: `bun run build` (outputs to `xyz.brbc.jellyfin.iinaplugin/dist` and `xyz.brbc.jellyfin.iinaplugin/ui/dist`, not committed).
- Typecheck: `bun run typecheck`.
- Sync root update manifest: `bun run sync:root-info`.
- Verify root update manifest: `bun run verify:root-info`.
- Verify built client version: `bun run verify:built-client-version` (checks `Info.json` version in built outputs).
- Lint/format: none (do not introduce tooling unless explicitly requested).
- Tests: none.

## Manual Validation (Recommended)

To test changes locally in IINA:

1. Install deps + build:
   - `bun install`
   - `bun run build`
2. Reinstall plugin into IINA’s plugin directory:
   - `rm -rf "$HOME/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin"`
   - `cp -R /Users/ada-bee/Developer/jellyfin-iina/xyz.brbc.jellyfin.iinaplugin "$HOME/Library/Application Support/com.colliderli.iina/plugins/"`
3. Restart IINA.
4. Open IINA Log Viewer: Help → Log Viewer.
5. Open Jellyfin sidebar:
   - Menu item / hotkey (Shift+J), or
   - Sidebar tab “Jellyfin”.
6. Verify:
   - Login/session restore works.
   - Browsing works (Home, libraries, seasons, episodes).
   - Search works.
   - Playback launches correctly and resume seek works.
   - Playback reporting updates progress and sends stop events.
   - Autoplay next episode works (if enabled).
   - Skip Intro/Credits overlay works (if enabled).

## Platform and API Constraints

### Plugin Context (`dist/main.js`, `dist/global.js`)

- Not Node.js: no `require()`, no npm modules.
- Use IINA APIs (`iina.sidebar`, `iina.event`, `iina.mpv`, `iina.global`, `iina.http`, etc).
- `sidebar.loadFile()` clears sidebar message listeners:
  - Always register `sidebar.onMessage(...)` after calling `sidebar.loadFile(...)`.

### Sidebar Webview (`ui/dist/sidebar.js`)

- Has DOM + `fetch()`.
- Use `fetch()` for browsing/search API calls; playback reporting happens in plugin context.
- Session persistence is handled with `localStorage` in the webview.

## Known Behavior / Design Decisions

- HTTPS-only Jellyfin servers (UI + plugin reject `http://`).
- Playback reporting, media segments, and autoplay resolution run in the plugin context via `iina.http`.
- Splash handling:
  - The splash path uses `~` and is opened via `core.open()`; this is intentional.
  - `mpv.command('loadfile', ...)` can have issues resolving `~` in file paths.
- Sidebar header action is a **Home** button (not “refresh current view”):
  - Home resets navigation/search state and reloads the Home view.
- “Refresh sidebar” messages from `main.js` also return to Home.

## Message Passing Patterns

### Global → Main

- `global.postMessage(playerId, 'showJellyfinSidebar', {})`:
  - Used to toggle the sidebar (Shift+J behavior).

### Sidebar → Main

- `iina.postMessage('authUpdated', { serverUrl, accessToken, userId, username, deviceId, serverName })`:
  - Used after login/session restore to sync auth into the plugin context.
- `iina.postMessage('authCleared', {})`:
  - Used on logout to clear plugin auth state.
- `iina.postMessage('playItem', { url, resumeSeconds, title })`:
  - Used to start playback from the sidebar.

### Main → Sidebar

- `sidebar.postMessage('refreshSidebar', {})`:
  - Requests the sidebar to return to Home and reload content.

## Jellyfin API Conventions

- Use the MediaBrowser Authorization header pattern.
- Include `Token` when authenticated.
- Ticks conversions:
  - `1 second = 10,000,000 ticks` (`TICKS_PER_SECOND`).
- Direct play flow:
  - Use `PlaybackInfo` before starting playback to obtain `PlaySessionId` and `MediaSourceId`.
- Stream URLs include session tracking params used by `main.js` for reporting.

## Code Style Guidelines

### JavaScript

- Indentation: 4 spaces.
- Use semicolons consistently.
- Prefer `const`; use `let` only when reassignment is required.
- Prefer `async/await` over chained promises.
- Prefer explicit checks over clever truthy logic.
- Keep lines under ~100 characters when reasonable.
- Logging:
  - Prefix logs in plugin context with `Jellyfin:`.
  - Use `console.error` for actionable failures.

### Sidebar UI Safety

- Treat Jellyfin strings as untrusted:
  - Use `escapeHtml()` when injecting into HTML strings.
  - Use `textContent` when possible for direct DOM updates.

### CSS

- Use existing CSS variables in `:root`.
- Keep selectors flat; avoid deep nesting.
- Keep transitions simple.

### JSON

- Two-space indentation (match existing `Info.json`).
- Double quotes, no trailing commas.

## Files to Treat Carefully

- `xyz.brbc.jellyfin.iinaplugin/Info.json`: manifest, permissions, entrypoints.
- `Info.json` (repo root): minimal update manifest used by IINA's GitHub update check.
- `src/plugin/`: playback lifecycle + reporting + autoplay + segments (source of truth).
- `src/ui/`: browsing/search + login UI (source of truth).
- `src/shared/`: shared message + Jellyfin types used by plugin and UI.

## Notes

- Use the existing Bun build pipeline; do not add new tooling unless explicitly requested.
- Prefer small, targeted edits aligned with existing patterns.
- Releases are published as `.iinaplgz` assets built in CI; `dist/` is not committed.
- GitHub installs pull from release assets, not the repository contents.
- IINA update checks read `Info.json` from repo root (`raw.githubusercontent.com/<repo>/master/Info.json`).
- Keep root `Info.json` minimal and in sync with `xyz.brbc.jellyfin.iinaplugin/Info.json`.
- Use `bun.lock` (not `bun.lockb`).
- If unsure about IINA API behavior, consult https://docs.iina.io/pages/creating-plugins.html.
