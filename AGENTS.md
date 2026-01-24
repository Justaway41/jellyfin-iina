# AGENTS.md

This guidance is for agentic coding assistants working in this repository. It documents the current runtime constraints, repo layout, coding conventions, and safe validation steps.

## Project Summary

- Project: Jellyfin sidebar plugin for IINA on macOS.
- Runtime environments:
  - Plugin context (`main.js`, `global.js`): IINA plugin JS runtime (not Node.js).
  - Sidebar webview (`ui/sidebar.html`, `ui/sidebar.js`): browser-like webview environment with DOM and `fetch()`.
- Languages: plain JavaScript, HTML, CSS.
- No build, bundler, or package manager. Edit files directly under `xyz.brbc.jellyfin.iinaplugin/`.

## Repository Layout

- `xyz.brbc.jellyfin.iinaplugin/Info.json`: plugin manifest, entrypoints, permissions.
- `xyz.brbc.jellyfin.iinaplugin/global.js`: global entry (runs before any player window exists).
- `xyz.brbc.jellyfin.iinaplugin/main.js`: per-player entry (sidebar wiring, playback detection, reporting, skip overlay, autoplay).
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.html`: sidebar webview template.
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.js`: sidebar UI, authentication, browsing/search, Jellyfin API calls via `fetch()`.
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.css`: sidebar styling.
- `xyz.brbc.jellyfin.iinaplugin/assets/`: plugin assets (splash image, etc).
- `xyz.brbc.jellyfin.iinaplugin/ui/assets/`: sidebar UI assets (logos/icons).

## Build / Lint / Test

There is no configured build, lint, or automated test framework in this repo.

- Build: none.
- Lint/format: none (do not introduce tooling unless explicitly requested).
- Tests: none.

## Manual Validation (Recommended)

To test changes locally in IINA:

1. Reinstall plugin into IINA’s plugin directory:
   - `rm -rf "$HOME/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin"`
   - `cp -R /Users/ada-bee/Developer/jellyfin-iina/xyz.brbc.jellyfin.iinaplugin "$HOME/Library/Application Support/com.colliderli.iina/plugins/"`
2. Restart IINA.
3. Open IINA Log Viewer: Help → Log Viewer.
4. Open Jellyfin sidebar:
   - Menu item / hotkey (Shift+J), or
   - Sidebar tab “Jellyfin”.
5. Verify:
   - Login/session restore works.
   - Browsing works (Home, libraries, seasons, episodes).
   - Search works.
   - Playback launches correctly and resume seek works.
   - Playback reporting updates progress and sends stop events.
   - Autoplay next episode works (if enabled).
   - Skip Intro/Credits overlay works (if enabled).

## Platform and API Constraints

### Plugin Context (`main.js`, `global.js`)

- Not Node.js: no `require()`, no npm modules.
- Use IINA APIs (`iina.sidebar`, `iina.event`, `iina.mpv`, `iina.global`, etc).
- `sidebar.loadFile()` clears sidebar message listeners:
  - Always register `sidebar.onMessage(...)` after calling `sidebar.loadFile(...)`.

### Sidebar Webview (`ui/sidebar.js`)

- Has DOM + `fetch()`.
- Use `fetch()` for Jellyfin API calls (ATS can block plugin-context HTTP).
- Session persistence is handled with `localStorage` in the webview.

## Known Behavior / Design Decisions

- HTTP support is preserved (plugin supports `http://` Jellyfin servers).
- Playback reporting is performed by the sidebar webview via `fetch()`:
  - `main.js` sends reporting requests to the sidebar to avoid ATS issues in plugin context.
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

- `iina.postMessage('playItem', { url, resumeSeconds, title })`:
  - Used to start playback from the sidebar.

### Main → Sidebar

- `sidebar.postMessage('refreshSidebar', {})`:
  - Requests the sidebar to return to Home and reload content.
- `sidebar.postMessage('reportPlayback', { endpoint, body })`:
  - Sidebar performs the Jellyfin API call via `fetch()`.
- `sidebar.postMessage('getMediaSegments', { itemId })`:
  - Sidebar fetches intro/outro segments via Jellyfin API.
- `sidebar.postMessage('resolveNextEpisode', { requestId, itemId, seriesId, seasonId, episodeIndex })`:
  - Sidebar resolves next episode and returns stream data.

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
- `xyz.brbc.jellyfin.iinaplugin/main.js`: playback lifecycle + reporting.
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.js`: API requests + UI state.

## Notes

- Do not add build scripts or testing infrastructure unless explicitly requested.
- Prefer small, targeted edits aligned with existing patterns.
- Releases are published as `.iinaplgz` assets; verify packaging in the GitHub release.
- If unsure about IINA API behavior, consult https://docs.iina.io/pages/creating-plugins.html.
