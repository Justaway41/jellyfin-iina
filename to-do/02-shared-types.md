# Task 02 — Shared Types & Message Contracts

## Goal
Create a shared TypeScript module defining message payloads and core Jellyfin model types used across plugin + UI. This should reduce drift and make the plugin/UI boundary explicit.

## Constraints
- Use `@jellyfin/sdk` **types only**. Do not add runtime dependency usage (no axios).
- Keep types minimal: only include models actually used in this plugin.
- Shared types must be importable by both plugin and UI builds.

## Deliverables
1) New `src/shared/` directory with:
   - `messages.ts`: typed message payloads + event names.
   - `jellyfin.ts`: type aliases for models/requests/responses used by the plugin.
2) Message contracts should include:
   - UI → Plugin: `authUpdated` (serverUrl, accessToken, userId, username, deviceId, serverName)
   - UI → Plugin: `authCleared`
   - UI → Plugin: `playItem` (url, resumeSeconds, title)
   - Plugin → UI: `refreshSidebar`
   - Plugin → UI: any needed state notifications (optional; keep minimal).
3) Keep a small registry or union for message names to avoid typos.
4) Add helper types:
   - `PlaybackContext` (itemId, mediaSourceId, playSessionId, accessToken, deviceId, serverUrl, runtimeTicks, seriesId, seasonId, episodeIndex, etc.)
   - `MediaSegment` (type Intro/Outro, startTicks, endTicks)
   - `AutoplayResolution` payload type.

## Guidance
- Use `import type { ... } from '@jellyfin/sdk/...';` only for types.
- Do not rely on SDK runtime utilities.
- Ensure shared types are stable and avoid re-exports of large SDK modules (keep it light).

## Handoff
After completion, update `to-do/00-rework-overview.md` with:
- New file names
- Message type definitions summary
- Any decisions about SDK type usage
