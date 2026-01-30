# Task 04 — Sidebar UI TS Rewrite + HTTPS-only + Auth Handoff

## Goal
Rewrite `ui/sidebar.js` into TypeScript under `src/ui/`, split into smaller modules if needed. Keep DOM-based UI and browsing/search logic in the webview, but remove playback reporting, media segments, and autoplay resolution (handled by plugin context now). Enforce HTTPS-only server URLs.

## Constraints
- No framework (plain TS + DOM).
- Use `@jellyfin/sdk` **types only**.
- Keep API calls for browsing/search in the webview (`fetch()`), but do NOT handle reporting/segments/autoplay.
- `api_key` remains in stream URLs (for now).
- UI must hand auth data to plugin context using `authUpdated` message.

## Expected Module Layout (example)
- `src/ui/sidebar.ts` — entry point
- `src/ui/api.ts` — webview fetch wrapper (browsing/search only)
- `src/ui/state.ts` — UI state + session storage
- `src/ui/render.ts` — rendering helpers (list cards, sections)
- `src/ui/events.ts` — DOM event handlers

## Key Changes
1) **HTTPS-only validation**
   - On login: reject `http://` URLs with a clear error message.
   - Also validate on session restore from localStorage.

2) **Auth handoff to plugin**
   - After login success, post message to plugin: `authUpdated` with serverUrl, accessToken, userId, username, deviceId, serverName.
   - On logout, post `authCleared`.

3) **Remove reporting/segments/autoplay handlers**
   - Delete `iina.onMessage('reportPlayback' | 'getMediaSegments' | 'resolveNextEpisode')` and related API logic.
   - UI no longer posts `autoplayNext` or `mediaSegments` messages.

4) **Keep browsing/search API calls in UI**
   - `apiRequest()` remains for library browsing, search, fetching items, playback info, etc.
   - Uses `fetch()` and Jellyfin auth header.

5) **Playback initiation**
   - Keep `playItem` message to plugin with stream URL + resumeSeconds + title.

## Notes
- Update URL parsing when restoring session: avoid `new URL` if it throws; add a safe parser or try/catch with fallback.
- Ensure all user-controlled strings are escaped when inserted into HTML.

## Handoff
After completion, update `to-do/00-rework-overview.md` with:
- New module list
- Any refactors to rendering to reduce `innerHTML`
- Any UX changes due to HTTPS-only enforcement
