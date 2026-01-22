// IINA Jellyfin Plugin - main.js
// Handles playback requests from sidebar and reports playback state to Jellyfin
const { console, event, sidebar, mpv, global } = iina;

const SHOW_SIDEBAR_DELAY_MS = 300;
const JELLYFIN_SPLASH_NAME = 'Jellyfin.png';
const JELLYFIN_SPLASH_URL = `${JELLYFIN_SPLASH_NAME}`;

console.log('Jellyfin: Plugin loaded');

// Playback reporting state
let currentPlayback = null;
let progressReportTimer = null;
let pendingWindowTitle = null;
const PROGRESS_REPORT_INTERVAL = 10000; // 10 seconds



// Sidebar state for handling message timing
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
            currentPlayback = {
                itemId: params['_jf_itemId'],
                mediaSourceId: params['mediaSourceId'],
                playSessionId: playSessionId,
                accessToken: params['api_key'],
                deviceId: params['_jf_deviceId'],
                serverUrl: getUrlOrigin(url),
                runtimeTicks: parseInt(params['_jf_runtimeTicks']) || 0
            };
            applyWindowTitle(pendingWindowTitle);
            reportPlaybackStart();
            startProgressReporting();
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

