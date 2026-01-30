# Task 01 — Bun Tooling, TypeScript Build, CI

## Goal
Introduce a Bun-only TypeScript build pipeline that outputs bundled JS into `xyz.brbc.jellyfin.iinaplugin/dist` and `xyz.brbc.jellyfin.iinaplugin/ui/dist`. No `dist/` committed. CI builds + typechecks. Release workflow builds before zipping.

## Constraints
- No Node required locally; use Bun for everything.
- No framework; no bundler other than `bun build`.
- Plugin runtime is not Node.js; build targets must be compatible.
- Keep `api_key` in stream URLs; do not remove.

## Deliverables
1) `package.json` with Bun scripts:
   - `typecheck`: `tsc --noEmit -p tsconfig.plugin.json && tsc --noEmit -p tsconfig.ui.json`
   - `build`: `bun run build:plugin && bun run build:ui`
   - `build:plugin`: `bun build src/plugin/main.ts src/plugin/global.ts --outdir xyz.brbc.jellyfin.iinaplugin/dist --target=browser --format=iife --minify=false`
   - `build:ui`: `bun build src/ui/sidebar.ts --outdir xyz.brbc.jellyfin.iinaplugin/ui/dist --target=browser --format=iife --minify=false`
   - optional: `clean` script to remove dist directories
2) `bun.lockb` committed.
3) `tsconfig.plugin.json` and `tsconfig.ui.json`:
   - plugin config: `lib` without DOM, include `src/plugin/**` + `src/shared/**`.
   - ui config: DOM libs enabled, include `src/ui/**` + `src/shared/**`.
   - Both should reference `iina-plugin-definition` types for plugin context.
4) Update `.gitignore` to include `xyz.brbc.jellyfin.iinaplugin/dist/` and `xyz.brbc.jellyfin.iinaplugin/ui/dist/`.
5) Update `Info.json` to reference `dist/main.js` and `dist/global.js`.
6) Update `ui/sidebar.html` to load `ui/dist/sidebar.js` instead of `sidebar.js`.
7) Update `.github/workflows/release.yml`:
   - add Bun setup
   - `bun install --frozen-lockfile`
   - `bun run build`
   - then zip plugin folder as before.
8) Add CI workflow (new `.github/workflows/ci.yml`):
   - on push + PR
   - setup bun
   - `bun install --frozen-lockfile`
   - `bun run typecheck`
   - `bun run build`

## Notes
- `bun build` output must be plain JS compatible with IINA plugin runtime.
- Use `--format=iife` for safety (avoid ESM import issues in plugin context).
- Ensure build output paths match `Info.json`.

## Handoff
After completion, update `to-do/00-rework-overview.md` notes with exact scripts, tsconfig settings, and any issues found.
