# Task 03 — Plugin Context TS Rewrite + Jellyfin API Client

## Goal
Rewrite `main.js` + `global.js` as TypeScript modules under `src/plugin/`, split into smaller files, and move all Jellyfin API calls (playback reporting, media segments, autoplay resolution) into plugin context. Sidebar UI no longer performs those API calls.

## Constraints
- Plugin runtime is NOT Node.js.
- Use IINA APIs only (`iina.sidebar`, `iina.event`, `iina.mpv`, `iina.http` etc).
- HTTPS-only: reject/guard non-HTTPS server URLs.
- Keep `api_key` in playback URLs for now.
- Logging: prefix `Jellyfin:`.
- Do not add new build tools; TS only.

## Expected Module Layout (example)
- `src/plugin/main.ts` — entry point wiring
- `src/plugin/global.ts` — global menu + player activation
- `src/plugin/playback.ts` — playback lifecycle, mpv hooks, reporting
- `src/plugin/autoplay.ts` — next-episode resolution + playlist queue
- `src/plugin/segments.ts` — intro/outro polling + overlay
- `src/plugin/http.ts` — Jellyfin HTTP client (auth header + JSON)
- `src/plugin/state.ts` — session/auth state, currentPlayback

## Key Functional Changes
1) **Auth state in plugin context**
   - Receive `authUpdated` / `authCleared` messages from UI.
   - Store `serverUrl`, `accessToken`, `userId`, `deviceId` in plugin memory (and optionally `preferences` for persistence if desired).
   - Validate `serverUrl` is HTTPS; if not, reject and show alert.

2) **Playback reporting in plugin context**
   - Replace `sidebar.postMessage('reportPlayback', ...)` with direct Jellyfin API calls (`iina.http` or equivalent).
   - Implement `reportPlaybackStart`, `reportPlaybackProgress`, `reportPlaybackStopped` using plugin HTTP client.

3) **Media segments in plugin context**
   - Instead of sidebar `getMediaSegments`, use plugin HTTP client to call `/MediaSegments`.
   - Normalize segments the same way as current logic (Intro/Outro handling).

4) **Autoplay resolution in plugin context**
   - Replace `resolveNextEpisode` sidebar request with direct calls to `/Shows/.../Episodes` and `PlaybackInfo`.
   - Queue next episode using existing mpv playlist logic.

5) **Sidebar message plumbing**
   - Keep `playItem` from UI → plugin.
   - Keep `refreshSidebar` from plugin → UI.
   - Remove any other message exchanges used only for reporting/segments/autoplay.

## Implementation Notes
- Use `iina.http` (or `iina.http.request`) for HTTPS calls. Make sure ATS is irrelevant now that HTTPS is required.
- Reuse the existing parsing logic for playback context from URL query params.
- Preserve skip overlay behavior, but move segment fetch from UI to plugin.
- Cleanly reset timers/state on end-file + window close + app terminate.

## Handoff
After completion, update `to-do/00-rework-overview.md` with:
- New module list
- Any new message names
- Any IINA API caveats or gotchas discovered
