// IINA Jellyfin Plugin - main.js
// Handles playback requests from sidebar and reports playback state to Jellyfin
const { console, core, event, sidebar, mpv, global, overlay, preferences } = iina;

const SHOW_SIDEBAR_DELAY_MS = 300;
const JELLYFIN_SPLASH_NAME = 'Jellyfin.png';
const JELLYFIN_SPLASH_URL = `${JELLYFIN_SPLASH_NAME}`;

console.log('Jellyfin: Plugin loaded');

// Playback reporting state
let currentPlayback = null;
let progressReportTimer = null;
let pendingWindowTitle = null;
const PROGRESS_REPORT_INTERVAL = 10000; // 10 seconds

const SKIP_SEGMENT_POLL_INTERVAL = 500;
const SKIP_SEGMENT_PREF_KEY = 'skipSegmentsEnabled';

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
let skipOverlayLabel = '';
let skipSegmentTimer = null;
let activeSkipSegment = null;

let windowReady = false;
let pendingShowSidebar = false;
let sidebarVisible = false;

function getSidebarVisibility() {
    if (typeof sidebar.isVisible === 'function') {
        return sidebar.isVisible();
    }

    return sidebarVisible;
}

function showSidebarWithNotification() {
    sidebar.show();
    sidebarVisible = true;
    global.postMessage('sidebarShown', {});
}

function hideSidebar() {
    sidebar.hide();
    sidebarVisible = false;
}

// Listen for global message to show sidebar (from menu item / hotkey in global.js)
global.onMessage('showJellyfinSidebar', () => {
    console.log('Jellyfin: Received showJellyfinSidebar message');
    if (windowReady) {
        if (getSidebarVisibility()) {
            console.log('Jellyfin: Sidebar already open, hiding it');
            hideSidebar();
            return;
        }

        setTimeout(() => {
            showSidebarWithNotification();
        }, SHOW_SIDEBAR_DELAY_MS);
    } else {
        pendingShowSidebar = true;
    }
});

// Wait for window to be ready before loading sidebar
event.on('iina.window-loaded', () => {
    console.log('Jellyfin: Window loaded');

    // Load sidebar FIRST - loadFile() clears all message listeners!
    sidebar.loadFile('ui/sidebar.html');

    // Register message handlers AFTER loadFile
    sidebar.onMessage('playItem', (data) => {
        console.log('Jellyfin: Received playItem');

        if (data && data.url) {
            const url = String(data.url);
            pendingWindowTitle = data.title || null;
            console.log('Jellyfin: Playing URL:', url.substring(0, 80) + '...');

            // Use mpv.command instead of core.open (core.open crashes)
            mpv.command('loadfile', [url, 'replace']);

            // Hide sidebar once playback starts
            hideSidebar();

            // Handle resume position
            if (data.resumeSeconds && data.resumeSeconds > 0) {
                console.log('Jellyfin: Will seek to', data.resumeSeconds, 'seconds');
                setTimeout(() => {
                    mpv.set('time-pos', data.resumeSeconds);
                }, 1000);
            }
        }
    });

    sidebar.onMessage('mediaSegments', (data) => {
        if (!currentPlayback || !data || data.itemId !== currentPlayback.itemId) return;
        currentPlayback.segments = normalizeSegments(data.segments || [], currentPlayback);
    });


    // Mark window as ready
    windowReady = true;

    // Register this player instance with global entry
    global.postMessage('playerReady', {});

    // Show sidebar if it was requested before window was ready
    if (pendingShowSidebar) {
        console.log('Jellyfin: Showing sidebar (pending request)');
        setTimeout(() => {
            showSidebarWithNotification();
        }, SHOW_SIDEBAR_DELAY_MS);
        pendingShowSidebar = false;
    }

    console.log('Jellyfin: Ready');
});

// Parse URL query parameters (IINA's JS environment lacks URL API)
function parseUrlParams(url) {
    const params = {};
    const queryStart = url.indexOf('?');
    if (queryStart === -1) return params;

    const queryString = url.substring(queryStart + 1);
    const pairs = queryString.split('&');
    for (const pair of pairs) {
        const eqIndex = pair.indexOf('=');
        if (eqIndex > 0) {
            const key = decodeURIComponent(pair.substring(0, eqIndex));
            const value = decodeURIComponent(pair.substring(eqIndex + 1));
            params[key] = value;
        }
    }
    return params;
}

// Extract origin (scheme + host) from URL
function getUrlOrigin(url) {
    const schemeEnd = url.indexOf('://');
    if (schemeEnd === -1) return '';

    const hostStart = schemeEnd + 3;
    const pathStart = url.indexOf('/', hostStart);
    if (pathStart === -1) return url;
    return url.substring(0, pathStart);
}

// Detect Jellyfin streams and set up playback reporting
event.on('mpv.file-loaded', () => {
    const url = mpv.getString('path');
    if (!url) return;

    if (url.includes(JELLYFIN_SPLASH_NAME)) {
        console.log('Jellyfin: Splash loaded, showing sidebar');
        showSidebarWithNotification();
        sidebar.postMessage('refreshSidebar', {});
        return;
    }

    // Only process Jellyfin stream URLs
    if (!url.includes('/Videos/') || !url.includes('playSessionId=')) return;

    try {
        const params = parseUrlParams(url);
        const playSessionId = params['playSessionId'];

        if (playSessionId) {
            console.log('Jellyfin: Detected Jellyfin stream, starting playback reporting');
            clearSkipSegmentState();
            currentPlayback = {
                itemId: params['_jf_itemId'],
                mediaSourceId: params['mediaSourceId'],
                playSessionId: playSessionId,
                accessToken: params['api_key'],
                deviceId: params['_jf_deviceId'],
                serverUrl: getUrlOrigin(url),
                runtimeTicks: parseInt(params['_jf_runtimeTicks']) || 0,
                segments: []
            };
            applyWindowTitle(pendingWindowTitle);
            reportPlaybackStart();
            startProgressReporting();

            skipOverlayEnabled = isSkipSegmentsEnabled();
            startSkipSegmentPolling();
            if (skipOverlayEnabled) {
                requestMediaSegments();
            }
        }
    } catch (e) {
        console.log('Jellyfin: URL parse error:', e.message || e);
    }
});

function applyWindowTitle(title) {
    if (!title) return;

    if (typeof mpv.setString === 'function') {
        mpv.setString('force-media-title', title);
    } else {
        mpv.set('force-media-title', title);
    }

    console.log('Jellyfin: Set window title to', title);
}

// Report playback stopped when file ends
event.on('mpv.end-file', () => {
    if (!currentPlayback) return;

    console.log('Jellyfin: Playback ended');
    reportPlaybackStopped();
    stopProgressReporting();
    clearSkipSegmentState();

    handleNoNextEpisode('auto-play disabled');
});

// Report progress on pause/resume
event.on('mpv.pause.changed', () => {
    if (currentPlayback) {
        reportPlaybackProgress(mpv.getFlag('pause'));
    }
});

function handleShutdown(reason) {
    if (!currentPlayback) return;
    console.log('Jellyfin: Shutdown detected (' + reason + '), reporting stop');
    reportPlaybackStopped();
    stopProgressReporting();
    clearSkipSegmentState();
}

// Best-effort stop report on quit/close
event.on('iina.window-will-close', () => {
    handleShutdown('window close');
});

event.on('iina.application-will-terminate', () => {
    handleShutdown('app terminate');
});

// === Playback Reporting Functions ===
// Note: We send reporting requests to sidebar.js which uses fetch()
// This bypasses ATS restrictions that block http.post() for HTTP URLs

function getPositionTicks() {
    return Math.floor((mpv.getNumber('time-pos') || 0) * 10000000);
}

function isSkipSegmentsEnabled() {
    const value = preferences.get(SKIP_SEGMENT_PREF_KEY);
    if (value === undefined || value === null) return true;
    return Boolean(value);
}

function shouldShowSkipOverlay(segment) {
    if (!segment) return false;
    if (segment.endSeconds === null || segment.endSeconds === undefined) return false;
    return segment.endSeconds > segment.startSeconds;
}

function normalizeSegments(segments, playback) {
    const runtimeSeconds = playback?.runtimeTicks ? playback.runtimeTicks / 10000000 : 0;
    const fallbackDuration = core.status.duration;
    const resolvedRuntime = runtimeSeconds || (typeof fallbackDuration === 'number' ? fallbackDuration : 0);

    return (segments || []).map(segment => {
        const type = segment.type;
        const hasStart = segment.startTicks !== undefined && segment.startTicks !== null;
        const hasEnd = segment.endTicks !== undefined && segment.endTicks !== null;
        let startSeconds = hasStart ? segment.startTicks / 10000000 : null;
        let endSeconds = hasEnd ? segment.endTicks / 10000000 : null;

        if (type === 'Intro' && startSeconds === null && endSeconds !== null) {
            startSeconds = 0;
        }

        if (type === 'Outro' && endSeconds === null && resolvedRuntime > 0) {
            endSeconds = resolvedRuntime;
        }

        return {
            type: type,
            startSeconds: startSeconds,
            endSeconds: endSeconds
        };
    }).filter(segment => segment.type === 'Intro' || segment.type === 'Outro');
}

function getActiveSegment(positionSeconds, segments) {
    if (!segments || !segments.length) return null;
    const active = segments.filter(segment => {
        if (segment.startSeconds === null || segment.endSeconds === null) return false;
        return positionSeconds >= segment.startSeconds && positionSeconds < segment.endSeconds;
    });

    if (!active.length) return null;

    const introSegment = active.find(segment => segment.type === 'Intro');
    return introSegment || active[0];
}

function getSkipLabel(segment) {
    if (!segment) return '';
    if (segment.type === 'Intro') return 'Skip Intro';
    if (segment.type === 'Outro') return 'Skip Credits';
    return 'Skip';
}

function showSkipOverlay(label) {
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
        overlay.onMessage('skip-segment', () => {
            if (!activeSkipSegment) return;
            const target = activeSkipSegment.endSeconds;
            if (typeof target === 'number' && target > 0) {
                mpv.set('time-pos', Math.max(0, target + 0.5));
            }
            hideSkipOverlay();
        });
        skipOverlayInitialized = true;
    }
}

function renderSkipButton(label) {
    return `
        <div class="skip-overlay">
            <button class="skip-button" data-clickable onclick="iina.postMessage('skip-segment')" type="button">
                ${label}
            </button>
        </div>
    `;
}

function hideSkipOverlay() {
    if (!skipOverlayVisible) return;
    overlay.hide();
    overlay.setClickable(false);
    skipOverlayVisible = false;
    skipOverlayLabel = '';
    activeSkipSegment = null;
}

function startSkipSegmentPolling() {
    stopSkipSegmentPolling();
    skipSegmentTimer = setInterval(() => {
        refreshSkipSegmentPreference();
        if (!skipOverlayEnabled || !currentPlayback) {
            hideSkipOverlay();
            return;
        }

        const positionSeconds = mpv.getNumber('time-pos') || 0;
        const segment = getActiveSegment(positionSeconds, currentPlayback.segments);

        if (segment && shouldShowSkipOverlay(segment)) {
            const label = getSkipLabel(segment);
            activeSkipSegment = segment;
            showSkipOverlay(label);
        } else {
            hideSkipOverlay();
        }
    }, SKIP_SEGMENT_POLL_INTERVAL);
}

function stopSkipSegmentPolling() {
    if (skipSegmentTimer) {
        clearInterval(skipSegmentTimer);
        skipSegmentTimer = null;
    }
}

function refreshSkipSegmentPreference() {
    const enabled = isSkipSegmentsEnabled();
    if (enabled !== skipOverlayEnabled) {
        skipOverlayEnabled = enabled;
        if (!skipOverlayEnabled) {
            hideSkipOverlay();
            return;
        }

        if (currentPlayback) {
            requestMediaSegments();
        }
    }
}

function requestMediaSegments() {
    if (!currentPlayback || !currentPlayback.itemId) return;
    sidebar.postMessage('getMediaSegments', { itemId: currentPlayback.itemId });
}

function clearSkipSegmentState() {
    stopSkipSegmentPolling();
    hideSkipOverlay();
    activeSkipSegment = null;
    if (currentPlayback) {
        currentPlayback.segments = [];
    }
}

function reportPlaybackStart() {
    if (!currentPlayback) return;
    console.log('Jellyfin: Reporting playback start');
    console.log('Jellyfin: ItemId:', currentPlayback.itemId, 'PlaySessionId:', currentPlayback.playSessionId);

    sidebar.postMessage('reportPlayback', {
        endpoint: '/Sessions/Playing',
        body: {
            ItemId: currentPlayback.itemId,
            MediaSourceId: currentPlayback.mediaSourceId,
            PlaySessionId: currentPlayback.playSessionId,
            PositionTicks: getPositionTicks(),
            CanSeek: true,
            IsPaused: false,
            PlayMethod: 'DirectStream'
        }
    });
}

function reportPlaybackProgress(isPaused) {
    if (!currentPlayback) return;

    sidebar.postMessage('reportPlayback', {
        endpoint: '/Sessions/Playing/Progress',
        body: {
            ItemId: currentPlayback.itemId,
            MediaSourceId: currentPlayback.mediaSourceId,
            PlaySessionId: currentPlayback.playSessionId,
            PositionTicks: getPositionTicks(),
            IsPaused: isPaused || false,
            PlayMethod: 'DirectStream'
        }
    });
}

function reportPlaybackStopped() {
    if (!currentPlayback) return;
    const positionTicks = getPositionTicks();
    console.log('Jellyfin: Reporting playback stopped at position:', positionTicks);

    sidebar.postMessage('reportPlayback', {
        endpoint: '/Sessions/Playing/Stopped',
        body: {
            ItemId: currentPlayback.itemId,
            MediaSourceId: currentPlayback.mediaSourceId,
            PlaySessionId: currentPlayback.playSessionId,
            PositionTicks: positionTicks
        }
    });
}

function startProgressReporting() {
    stopProgressReporting();
    progressReportTimer = setInterval(() => {
        reportPlaybackProgress(mpv.getFlag('pause'));
    }, PROGRESS_REPORT_INTERVAL);
}

function stopProgressReporting() {
    if (progressReportTimer) {
        clearInterval(progressReportTimer);
        progressReportTimer = null;
    }
}

function handleNoNextEpisode(reason) {
    console.log('Jellyfin: No next episode:', reason);
    const serverUrl = currentPlayback?.serverUrl || '';

    clearSkipSegmentState();
    currentPlayback = null;

    if (serverUrl) {
        const splashUrl = `${serverUrl}/${JELLYFIN_SPLASH_NAME}`;
        mpv.command('loadfile', [splashUrl, 'replace']);
    } else {
        mpv.command('loadfile', [JELLYFIN_SPLASH_URL, 'replace']);
    }

    showSidebarWithNotification();
    sidebar.postMessage('refreshSidebar', {});
}


