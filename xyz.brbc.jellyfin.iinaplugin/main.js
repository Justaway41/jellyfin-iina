// IINA Jellyfin Plugin - main.js
// Handles playback requests from sidebar and reports playback state to Jellyfin
const { console, core, event, sidebar, mpv, global, overlay, preferences } = iina;

const SHOW_SIDEBAR_DELAY_MS = 300;
const JELLYFIN_SPLASH_URL = '~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin/assets/Jellyfin.png';
const TICKS_PER_SECOND = 10000000;
const RESUME_SEEK_DELAY_MS = 1000;

console.log('Jellyfin: Plugin loaded');

// Playback reporting state
let currentPlayback = null;
let pendingWindowTitle = null;
let autoplayRequestId = 0;
let autoplayTransitionTimer = null;
let isReplacingPlayback = false;
let shouldResetPlaylistOnNextLoad = false;
let lastKnownPositionTicks = 0;
let playbackTickTimer = null;
let playbackTickCount = 0;
const PROGRESS_REPORT_INTERVAL = 10000; // 10 seconds
const PLAYBACK_TICK_INTERVAL_MS = 1000;
const EOF_WATCH_THRESHOLD_SECONDS = 0.5;

const SKIP_SEGMENT_POLL_INTERVAL = 500;
const SKIP_SEGMENT_PREF_KEY = 'skipSegmentsEnabled';
const AUTOPLAY_NEXT_PREF_KEY = 'autoplayNextEpisodeEnabled';
const AUTOPLAY_TRANSITION_TIMEOUT_MS = 2500;

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

function showSidebarWithDelay() {
    setTimeout(() => {
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar() {
    sidebar.hide();
    sidebarVisible = false;
}

function toggleSidebarFromHotkey() {
    if (!windowReady) {
        pendingShowSidebar = true;
        return;
    }

    if (getSidebarVisibility()) {
        console.log('Jellyfin: Sidebar already open, hiding it');
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

// Listen for global message to show sidebar (from menu item / hotkey in global.js)
global.onMessage('showJellyfinSidebar', () => {
    console.log('Jellyfin: Received showJellyfinSidebar message');
    toggleSidebarFromHotkey();
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
            isReplacingPlayback = true;
            shouldResetPlaylistOnNextLoad = true;
            if (data.title) {
                const safeTitle = String(data.title).replace(/[,\n\r=]/g, ' ');
                mpv.command('loadfile', [url, 'replace', '-1', `force-media-title=${safeTitle}`]);
            } else {
                mpv.command('loadfile', [url, 'replace']);
            }

            // Hide sidebar once playback starts
            hideSidebar();

            // Handle resume position
            if (data.resumeSeconds && data.resumeSeconds > 0) {
                console.log('Jellyfin: Will seek to', data.resumeSeconds, 'seconds');
                setTimeout(() => {
                    mpv.set('time-pos', data.resumeSeconds);
                }, RESUME_SEEK_DELAY_MS);
            }
        }
    });

    sidebar.onMessage('mediaSegments', (data) => {
        if (!currentPlayback || !data || data.itemId !== currentPlayback.itemId) return;
        currentPlayback.segments = normalizeSegments(data.segments || [], currentPlayback);
    });

    sidebar.onMessage('autoplayNext', (data) => {
        if (!currentPlayback || !data) return;
        if (data.requestId && data.requestId !== currentPlayback.autoplayRequestId) return;

        if (data.error) {
            console.error('Jellyfin: Autoplay lookup failed:', data.error);
            return;
        }

        if (!data.url) {
            currentPlayback.autoplayQueued = false;
            currentPlayback.nextItemId = '';
            return;
        }

        currentPlayback.nextItemId = data.itemId || '';
        queueNextEpisode(data.url, data.title || '');

    });


    // Mark window as ready
    windowReady = true;

    // Register this player instance with global entry
    global.postMessage('playerReady', {});

    // Show sidebar if it was requested before window was ready
    if (pendingShowSidebar) {
        console.log('Jellyfin: Showing sidebar (pending request)');
        showSidebarWithDelay();
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

function parseEpisodeIndex(value) {
    if (value === undefined || value === null || value === '') return null;
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function buildPlaybackContextFromUrl(url) {
    const params = parseUrlParams(url);
    const playSessionId = params['playSessionId'];
    if (!playSessionId) return null;

    return {
        itemId: params['_jf_itemId'],
        mediaSourceId: params['mediaSourceId'],
        playSessionId: playSessionId,
        accessToken: params['api_key'],
        deviceId: params['_jf_deviceId'],
        serverUrl: getUrlOrigin(url),
        runtimeTicks: Number.parseInt(params['_jf_runtimeTicks'], 10) || 0,
        seriesId: params['_jf_seriesId'] || '',
        seasonId: params['_jf_seasonId'] || '',
        episodeIndex: parseEpisodeIndex(params['_jf_episodeIndex']),
        autoplayQueued: false,
        autoplayRequestId: 0,
        nextItemId: '',
        segments: []
    };
}

function startPlaybackSession(playback) {
    console.log('Jellyfin: Detected Jellyfin stream, starting playback reporting');
    clearSkipSegmentState();
    isReplacingPlayback = false;

    currentPlayback = {
        ...playback,
        isEpisode: Boolean(playback.seriesId || playback.episodeIndex !== null)
    };

    lastKnownPositionTicks = 0;
    playbackTickCount = 0;
    startPlaybackTick();

    if (pendingWindowTitle) {
        applyWindowTitle(pendingWindowTitle);
        pendingWindowTitle = null;
    }

    reportPlaybackStart();

    skipOverlayEnabled = isSkipSegmentsEnabled();
    startSkipSegmentPolling();
    if (skipOverlayEnabled) {
        requestMediaSegments();
    }

    if (shouldResetPlaylistOnNextLoad) {
        prunePlaylistToCurrentEntry();
        shouldResetPlaylistOnNextLoad = false;
    }
    if (currentPlayback.isEpisode && isAutoplayNextEnabled()) {
        requestAutoplayNextEpisode();
    }
}

// Detect Jellyfin streams and set up playback reporting
event.on('mpv.file-loaded', () => {
    const url = mpv.getString('path');
    if (!url) return;

    isReplacingPlayback = false;
    clearAutoplayTransitionTimer();

    if (url.includes('Jellyfin.png')) {
        console.log('Jellyfin: Splash loaded, showing sidebar');
        showSidebarWithNotification();
        sidebar.postMessage('refreshSidebar', {});
        return;
    }

    // Only process Jellyfin stream URLs
    if (!url.includes('/Videos/') || !url.includes('playSessionId=')) return;

    try {
        const playback = buildPlaybackContextFromUrl(url);
        if (!playback) return;

        startPlaybackSession(playback);
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
    if (isReplacingPlayback || currentPlayback.autoplayQueued) return;

    console.log('Jellyfin: Playback ended');
    reportPlaybackStopped();
    stopPlaybackTick();
    clearSkipSegmentState();
    handleNoNextEpisode('end of playback');
});

// Report progress on pause/resume
event.on('mpv.pause.changed', () => {
    if (currentPlayback) {
        updateLastKnownPosition();
        reportPlaybackProgress(mpv.getFlag('pause'));
    }
});

function handleShutdown(reason) {
    if (!currentPlayback) return;
    console.log('Jellyfin: Shutdown detected (' + reason + '), reporting stop');
    reportPlaybackStopped();
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
    return Math.floor((mpv.getNumber('time-pos') || 0) * TICKS_PER_SECOND);
}

function updateLastKnownPosition() {
    if (!currentPlayback) return;
    const ticks = getPositionTicks();
    if (ticks > 0) {
        lastKnownPositionTicks = ticks;
    }
}

function isSkipSegmentsEnabled() {
    const value = preferences.get(SKIP_SEGMENT_PREF_KEY);
    if (value === undefined || value === null) return true;
    return Boolean(value);
}

function isAutoplayNextEnabled() {
    const value = preferences.get(AUTOPLAY_NEXT_PREF_KEY);
    if (value === undefined || value === null) return true;
    return Boolean(value);
}

function shouldShowSkipOverlay(segment) {
    if (!segment) return false;
    if (segment.endSeconds === null || segment.endSeconds === undefined) return false;
    return segment.endSeconds > segment.startSeconds;
}

function normalizeSegments(segments, playback) {
    const runtimeSeconds = playback?.runtimeTicks ? playback.runtimeTicks / TICKS_PER_SECOND : 0;
    const fallbackDuration = core.status.duration;
    const resolvedRuntime = runtimeSeconds || (typeof fallbackDuration === 'number' ? fallbackDuration : 0);

    return (segments || []).map(segment => {
        const type = segment.type;
        const hasStart = segment.startTicks !== undefined && segment.startTicks !== null;
        const hasEnd = segment.endTicks !== undefined && segment.endTicks !== null;
        let startSeconds = hasStart ? segment.startTicks / TICKS_PER_SECOND : null;
        let endSeconds = hasEnd ? segment.endTicks / TICKS_PER_SECOND : null;

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
    const resolvedTicks = positionTicks || lastKnownPositionTicks || 0;
    console.log('Jellyfin: Reporting playback stopped at position:', resolvedTicks / TICKS_PER_SECOND);

    sidebar.postMessage('reportPlayback', {
        endpoint: '/Sessions/Playing/Stopped',
        body: {
            ItemId: currentPlayback.itemId,
            MediaSourceId: currentPlayback.mediaSourceId,
            PlaySessionId: currentPlayback.playSessionId,
            PositionTicks: resolvedTicks
        }
    });
}

function startPlaybackTick() {
    stopPlaybackTick();
    playbackTickTimer = setInterval(() => {
        if (!currentPlayback) return;
        if (isReplacingPlayback) return;

        updateLastKnownPosition();
        playbackTickCount += 1;

        if (playbackTickCount >= PROGRESS_REPORT_INTERVAL / PLAYBACK_TICK_INTERVAL_MS) {
            playbackTickCount = 0;
            reportPlaybackProgress(mpv.getFlag('pause'));
        }

        if (currentPlayback.autoplayQueued) return;

        const duration = mpv.getNumber('duration');
        const timePos = mpv.getNumber('time-pos');
        const paused = mpv.getFlag('pause');
        const eofReached = mpv.getFlag('eof-reached');

        if (!duration || duration <= 0 || timePos === undefined || timePos === null) return;

        const nearEnd = duration - timePos <= EOF_WATCH_THRESHOLD_SECONDS;
        if (!nearEnd) return;

        if (!paused && !eofReached) return;

        console.log('Jellyfin: Playback reached EOF (tick)');
        reportPlaybackStopped();
        stopPlaybackTick();
        clearSkipSegmentState();
        handleNoNextEpisode('eof tick');
    }, PLAYBACK_TICK_INTERVAL_MS);
}

function stopPlaybackTick() {
    if (playbackTickTimer) {
        clearInterval(playbackTickTimer);
        playbackTickTimer = null;
    }
}

function handleNoNextEpisode(reason) {
    console.log('Jellyfin: No next episode:', reason);
    clearSkipSegmentState();
    stopPlaybackTick();
    currentPlayback = null;

    isReplacingPlayback = true;
    try {
        core.open(JELLYFIN_SPLASH_URL);
    } catch (error) {
        console.error('Jellyfin: Failed to open splash with core.open', error.message || error);
    }

    showSidebarWithNotification();
    sidebar.postMessage('refreshSidebar', {});
}


function startAutoplayTransitionTimer(playSessionId) {
    clearAutoplayTransitionTimer();

    autoplayTransitionTimer = setTimeout(() => {
        autoplayTransitionTimer = null;
        if (!currentPlayback) return;
        if (currentPlayback.playSessionId !== playSessionId) return;
        if (currentPlayback.autoplayQueued) {
            handleNoNextEpisode('autoplay timeout');
        }
    }, AUTOPLAY_TRANSITION_TIMEOUT_MS);
}

function clearAutoplayTransitionTimer() {
    if (autoplayTransitionTimer) {
        clearTimeout(autoplayTransitionTimer);
        autoplayTransitionTimer = null;
    }
}

function prunePlaylistToCurrentEntry() {
    const playlist = mpv.getNative('playlist');
    if (!Array.isArray(playlist)) return;

    const currentIndex = findCurrentPlaylistIndex(playlist);
    if (currentIndex === -1) return;

    for (let i = playlist.length - 1; i >= 0; i -= 1) {
        if (i !== currentIndex) {
            mpv.command('playlist-remove', [String(i)]);
        }
    }
}

function findCurrentPlaylistIndex(playlist) {
    if (!Array.isArray(playlist)) return -1;
    return playlist.findIndex(entry => entry && (entry.current || entry.playing));
}

function getItemIdFromPlaylistEntry(entry) {
    if (!entry || !entry.filename) return '';
    const params = parseUrlParams(entry.filename);
    return params['_jf_itemId'] || '';
}

function queueNextEpisode(url, title) {
    if (!currentPlayback) return;

    try {
        const playlist = mpv.getNative('playlist');
        const currentIndex = findCurrentPlaylistIndex(playlist);

        if (currentIndex !== -1) {
            const nextEntry = playlist[currentIndex + 1];
            const nextItemId = getItemIdFromPlaylistEntry(nextEntry);

            if (nextItemId && nextItemId === currentPlayback.nextItemId) {
                currentPlayback.autoplayQueued = true;
                return;
            }

            for (let i = playlist.length - 1; i > currentIndex; i -= 1) {
                mpv.command('playlist-remove', [String(i)]);
            }
        }

        if (title) {
            const safeTitle = String(title).replace(/[,\n\r=]/g, ' ');
            mpv.command('loadfile', [url, 'insert-next', '-1', `force-media-title=${safeTitle}`]);
        } else {
            mpv.command('loadfile', [url, 'insert-next']);
        }
        currentPlayback.autoplayQueued = true;
        console.log('Jellyfin: Queued next episode');
    } catch (error) {
        console.error('Jellyfin: Failed to queue next episode', error.message || error);
    }
}

function requestAutoplayNextEpisode() {
    if (!currentPlayback) return;

    autoplayRequestId += 1;
    currentPlayback.autoplayRequestId = autoplayRequestId;
    currentPlayback.autoplayQueued = false;

    sidebar.postMessage('resolveNextEpisode', {
        requestId: autoplayRequestId,
        itemId: currentPlayback.itemId,
        seriesId: currentPlayback.seriesId,
        seasonId: currentPlayback.seasonId,
        episodeIndex: currentPlayback.episodeIndex
    });
}


