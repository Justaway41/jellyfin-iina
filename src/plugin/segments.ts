import type { JellyfinMediaSegmentQuery } from "../shared/jellyfin";

import {
    SKIP_SEGMENT_POLL_INTERVAL_MS,
    SKIP_SEGMENT_PREF_KEY,
    TICKS_PER_SECOND
} from "./constants";
import { requestJson } from "./http";
import { getCurrentPlayback, NormalizedSegment } from "./state";
import { formatError } from "./utils";

const { console, core, mpv, overlay, preferences } = iina;

const SKIP_OVERLAY_STYLE = `
    .skip-overlay {
        position: fixed;
        right: 120px;
        bottom: 120px;
        z-index: 1000;
    }

    .skip-button {
        font-size: 20px;
        font-weight: 600;
        padding: 13px 24px;
        background: #ffffff;
        color: #000000;
        border: none;
        border-radius: 999px;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.25);
        cursor: pointer;
    }

    .skip-button:active {
        transform: scale(0.98);
    }
`;

let skipOverlayVisible = false;
let skipOverlayEnabled = true;
let skipOverlayInitialized = false;
let skipOverlayLabel = "";
let skipSegmentTimer: ReturnType<typeof setInterval> | null = null;
let activeSkipSegment: NormalizedSegment | null = null;

function isSkipSegmentsEnabled(): boolean {
    const value = preferences.get(SKIP_SEGMENT_PREF_KEY);
    if (value === undefined || value === null) {
        return true;
    }
    return Boolean(value);
}

function shouldShowSkipOverlay(segment: NormalizedSegment | null): boolean {
    if (!segment) {
        return false;
    }
    if (segment.endSeconds === null || segment.endSeconds === undefined) {
        return false;
    }
    return segment.endSeconds > segment.startSeconds;
}

function normalizeSegments(
    segments: { Type?: string; StartTicks?: number | null; EndTicks?: number | null }[],
    runtimeTicks: number
): NormalizedSegment[] {
    const runtimeSeconds = runtimeTicks ? runtimeTicks / TICKS_PER_SECOND : 0;
    const fallbackDuration = core.status.duration;
    const resolvedRuntime = runtimeSeconds || (typeof fallbackDuration === "number" ? fallbackDuration : 0);

    return (segments || [])
        .map((segment) => {
            const type = segment.Type === "Intro" || segment.Type === "Outro" ? segment.Type : null;
            if (!type) {
                return null;
            }
            const hasStart = segment.StartTicks !== undefined && segment.StartTicks !== null;
            const hasEnd = segment.EndTicks !== undefined && segment.EndTicks !== null;
            let startSeconds = hasStart ? segment.StartTicks / TICKS_PER_SECOND : null;
            let endSeconds = hasEnd ? segment.EndTicks / TICKS_PER_SECOND : null;

            if (type === "Intro" && startSeconds === null && endSeconds !== null) {
                startSeconds = 0;
            }

            if (type === "Outro" && endSeconds === null && resolvedRuntime > 0) {
                endSeconds = resolvedRuntime;
            }

            return {
                type: type,
                startSeconds: startSeconds,
                endSeconds: endSeconds
            };
        })
        .filter((segment): segment is NormalizedSegment => Boolean(segment));
}

function getActiveSegment(positionSeconds: number, segments: NormalizedSegment[]): NormalizedSegment | null {
    if (!segments || !segments.length) {
        return null;
    }
    const active = segments.filter((segment) => {
        if (segment.startSeconds === null || segment.endSeconds === null) {
            return false;
        }
        return positionSeconds >= segment.startSeconds && positionSeconds < segment.endSeconds;
    });

    if (!active.length) {
        return null;
    }

    const introSegment = active.find((segment) => segment.type === "Intro");
    return introSegment || active[0];
}

function getSkipLabel(segment: NormalizedSegment | null): string {
    if (!segment) {
        return "";
    }
    if (segment.type === "Intro") {
        return "Skip Intro";
    }
    if (segment.type === "Outro") {
        return "Skip Credits";
    }
    return "Skip";
}

function renderSkipButton(label: string): string {
    return `
        <div class="skip-overlay">
            <button class="skip-button" data-clickable onclick="iina.postMessage('skip-segment')" type="button">
                ${label}
            </button>
        </div>
    `;
}

function showSkipOverlay(label: string): void {
    if (skipOverlayVisible) {
        if (label !== skipOverlayLabel) {
            overlay.setContent(renderSkipButton(label));
            skipOverlayLabel = label;
        }
        return;
    }

    skipOverlayLabel = label;

    overlay.simpleMode();
    overlay.setStyle(SKIP_OVERLAY_STYLE);
    overlay.setContent(renderSkipButton(label));
    overlay.setClickable(true);
    overlay.show();
    skipOverlayVisible = true;

    if (!skipOverlayInitialized) {
        overlay.onMessage("skip-segment", () => {
            if (!activeSkipSegment) {
                return;
            }
            const target = activeSkipSegment.endSeconds;
            if (typeof target === "number" && target > 0) {
                mpv.set("time-pos", Math.max(0, target + 0.5));
            }
            hideSkipOverlay();
        });
        skipOverlayInitialized = true;
    }
}

function hideSkipOverlay(): void {
    if (!skipOverlayVisible) {
        return;
    }
    overlay.hide();
    overlay.setClickable(false);
    skipOverlayVisible = false;
    skipOverlayLabel = "";
    activeSkipSegment = null;
}

async function requestMediaSegments(): Promise<void> {
    const playback = getCurrentPlayback();
    if (!playback || !playback.itemId) {
        return;
    }
    if (!playback.serverUrl || !playback.accessToken || !playback.deviceId) {
        return;
    }
    if (!playback.isEpisode) {
        playback.segments = [];
        return;
    }

    const expectedItemId = playback.itemId;
    try {
        const result = await requestJson<JellyfinMediaSegmentQuery>(
            {
                serverUrl: playback.serverUrl,
                accessToken: playback.accessToken,
                deviceId: playback.deviceId
            },
            {
                method: "GET",
                endpoint: `/MediaSegments/${playback.itemId}?includeSegmentTypes=Intro&includeSegmentTypes=Outro`
            }
        );

        const segments = (result?.Items || []).map((segment) => ({
            Type: segment.Type,
            StartTicks: segment.StartTicks,
            EndTicks: segment.EndTicks
        }));

        const latestPlayback = getCurrentPlayback();
        if (!latestPlayback || latestPlayback.itemId !== expectedItemId) {
            return;
        }

        latestPlayback.segments = normalizeSegments(segments, latestPlayback.runtimeTicks);
    } catch (error) {
        console.error(`Jellyfin: Failed to fetch media segments: ${formatError(error)}`);
        const latestPlayback = getCurrentPlayback();
        if (latestPlayback && latestPlayback.itemId === expectedItemId) {
            latestPlayback.segments = [];
        }
    }
}

function refreshSkipSegmentPreference(): void {
    const enabled = isSkipSegmentsEnabled();
    if (enabled !== skipOverlayEnabled) {
        skipOverlayEnabled = enabled;
        if (!skipOverlayEnabled) {
            hideSkipOverlay();
            return;
        }

        void requestMediaSegments();
    }
}

export function startSegmentPolling(): void {
    stopSegmentPolling();
    refreshSkipSegmentPreference();
    if (skipOverlayEnabled) {
        void requestMediaSegments();
    }

    skipSegmentTimer = setInterval(() => {
        refreshSkipSegmentPreference();
        const playback = getCurrentPlayback();
        if (!skipOverlayEnabled || !playback) {
            hideSkipOverlay();
            return;
        }

        const positionSeconds = mpv.getNumber("time-pos") || 0;
        const segment = getActiveSegment(positionSeconds, playback.segments);

        if (segment && shouldShowSkipOverlay(segment)) {
            const label = getSkipLabel(segment);
            activeSkipSegment = segment;
            showSkipOverlay(label);
        } else {
            hideSkipOverlay();
        }
    }, SKIP_SEGMENT_POLL_INTERVAL_MS);
}

export function stopSegmentPolling(): void {
    if (skipSegmentTimer) {
        clearInterval(skipSegmentTimer);
        skipSegmentTimer = null;
    }
}

export function clearSegmentState(): void {
    stopSegmentPolling();
    hideSkipOverlay();
    activeSkipSegment = null;
    const playback = getCurrentPlayback();
    if (playback) {
        playback.segments = [];
    }
}
