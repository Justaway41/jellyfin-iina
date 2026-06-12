import { CLIENT_NAME, DEBUG_LOGS, DEVICE_NAME, TICKS_PER_SECOND } from "../shared/constants";

export { CLIENT_VERSION } from "../shared/version";
export { CLIENT_NAME, DEBUG_LOGS, DEVICE_NAME, TICKS_PER_SECOND };

export const SHOW_SIDEBAR_DELAY_MS = 300;

const PLUGINS_DIR = "~/Library/Application Support/com.colliderli.iina/plugins";
// Extension-less on purpose: IINA titles local files with the raw filename
// (force-media-title is ignored for non-network resources), so the file name
// is what shows in the title bar. mpv detects the image format by content.
export const JELLYFIN_SPLASH_CANDIDATES = [
    `${PLUGINS_DIR}/xyz.brbc.jellyfin.iinaplugin/assets/Jellyfin`,
    `${PLUGINS_DIR}/xyz.brbc.jellyfin.iinaplugin-dev/assets/Jellyfin`
];
export const SPLASH_URL_MARKER = "assets/Jellyfin";

export const RESUME_SEEK_DELAY_MS = 1000;

export const PROGRESS_REPORT_INTERVAL_MS = 10000;
export const PLAYBACK_TICK_INTERVAL_MS = 1000;
export const EOF_WATCH_THRESHOLD_SECONDS = 0.5;

export const SKIP_SEGMENT_POLL_INTERVAL_MS = 500;
export const SKIP_SEGMENT_PREF_KEY = "skipSegmentsEnabled";
export const AUTOPLAY_NEXT_PREF_KEY = "autoplayNextEpisodeEnabled";
export const PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY = "preferEpisodeImagesInNextUp";

export const FIELDS_EPISODES =
    "Overview,MediaSources,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId";
export const FIELDS_SEASONS = "Overview,UserData,RunTimeTicks";
export const ITEM_DETAILS_FIELDS =
    "ProductionYear,ParentIndexNumber,IndexNumber,SeriesName,SeriesId,SeasonId,ParentId,Type,Name";
