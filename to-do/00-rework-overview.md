# Jellyfin IINA TypeScript Rework — Overview

## Goals
- Full TypeScript rewrite of plugin + sidebar (no JS sources left).
- Split large files into smaller, cohesive modules.
- Bun-only tooling (no Node required for local dev).
- No `dist/` committed; CI builds artifacts for releases.
- HTTPS-only: remove ATS workaround and do all Jellyfin API calls in plugin context.
- Move playback reporting, media segments, autoplay resolution into plugin context.
- Keep `api_key` in stream URLs for now (avoid breaking playback/autoplay).
- Use `@jellyfin/sdk` **types only** (no runtime SDK/axios).
- No UI framework (plain TS + DOM).

## Key Decisions
- **Bun is the only required tool** for installs, typecheck, build.
- **`dist/` is built in CI/release only** and not committed.
- **HTTPS-only**: UI should reject `http://` servers; plugin should double-check.
- **Plugin context owns Jellyfin API calls** for reporting, segments, autoplay.
- **Sidebar webview owns browsing/search** and playback initiation.
- **Shared message types** live in `src/shared/` and are imported by plugin + UI.

## Runtime Constraints (from AGENTS.md)
- Plugin context is not Node.js (no `require`, no Node builtins).
- Sidebar webview has DOM + `fetch()`.
- `sidebar.loadFile()` clears message listeners — always re-register after load.
- Logs in plugin context should be prefixed with `Jellyfin:`.
- Use 4 spaces, semicolons, explicit checks.

## Expected Output Structure
- `src/plugin/...` → build to `xyz.brbc.jellyfin.iinaplugin/dist/*.js`
- `src/ui/...` → build to `xyz.brbc.jellyfin.iinaplugin/ui/dist/sidebar.js`
- `xyz.brbc.jellyfin.iinaplugin/Info.json` points to `dist/main.js` + `dist/global.js`
- `xyz.brbc.jellyfin.iinaplugin/ui/sidebar.html` loads `ui/dist/sidebar.js`

## Message Protocol Baseline
- UI → Plugin: `authUpdated`, `authCleared`
- Plugin → UI: existing `refreshSidebar` stays
- UI → Plugin: existing `playItem` message stays
- Remove UI handlers for `reportPlayback`, `getMediaSegments`, `resolveNextEpisode`

## Task List
- [ ] `01-tooling-build.md` — Bun tooling, tsconfig split, build output, CI/release updates
- [ ] `02-shared-types.md` — shared message types + Jellyfin model types (types-only)
- [ ] `03-plugin-context.md` — plugin-side TS rewrite + Jellyfin API client + reporting/autoplay/segments
- [ ] `04-sidebar-ui.md` — sidebar TS rewrite + HTTPS-only + auth handoff to plugin

## Notes / Cross-agent Updates
- Task 01: Added Bun tooling (`package.json` scripts for build/typecheck/clean) with
  `bun build` targeting IIFE browser output into `xyz.brbc.jellyfin.iinaplugin/dist`
  and `xyz.brbc.jellyfin.iinaplugin/ui/dist`. Added `tsconfig.plugin.json` (no DOM
  libs) and `tsconfig.ui.json` (DOM libs) with `typeRoots` including
  `iina-plugin-definition`. Updated `Info.json` to `dist/main.js` + `dist/global.js`
  and `ui/sidebar.html` to load `dist/sidebar.js`. Dropped `--minify=false`
  (bun 1.3 rejects values; default is no minify). Added `.github/workflows/ci.yml`
  plus bun install/typecheck/build steps in `release.yml`.
- Task 02: Added shared type modules `src/shared/messages.ts` and
  `src/shared/jellyfin.ts`. Messages include typed payloads/unions for
  `authUpdated`, `authCleared`, `playItem`, and `refreshSidebar` with a
  `MESSAGE_NAMES` registry. Jellyfin types are imported from
  `@jellyfin/sdk/lib/generated-client/models` (types only) and re-aliased alongside
  local helper types (`PlaybackContext`, `MediaSegment`, `AutoplayRequest`,
  `AutoplayResolution`).
- Task 03: Rebuilt plugin context in `src/plugin/` with split modules
  (`constants.ts`, `utils.ts`, `state.ts`, `http.ts`, `playback.ts`,
  `segments.ts`, `autoplay.ts`, `main.ts`, `global.ts`). Playback reporting,
  segment fetching, and autoplay now use `iina.http` directly with a
  HTTPS-only guard (non-HTTPS auth/playback is rejected via `iina.utils.ask`).
  Message names remain `authUpdated`, `authCleared`, `playItem`, and
  `refreshSidebar`; reporting/segments/autoplay no longer use sidebar
  message round-trips.
- Task 04: Rewrote the sidebar UI in `src/ui/` with split modules
  (`constants.ts`, `dom.ts`, `state.ts`, `storage.ts`, `utils.ts`, `api.ts`,
  `render.ts`, `playback.ts`, `sidebar.ts`). Login/session restore now enforce
  https-only server URLs and post `authUpdated`/`authCleared` to the plugin.
  Sidebar playback reporting/segments/autoplay message handlers were removed;
  browsing/search remain in the webview. `tsconfig.ui.json` now disables
  `allowJs`.
