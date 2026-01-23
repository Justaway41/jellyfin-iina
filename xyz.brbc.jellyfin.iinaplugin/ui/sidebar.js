// ui/sidebar.js - Sidebar webview JavaScript
// This file handles authentication and API calls directly using fetch()

// Constants
const CLIENT_NAME = 'IINA Jellyfin Plugin';
const CLIENT_VERSION = '1.0.2';
const DEVICE_NAME = 'IINA';
const DEBUG_LOGS = false;

function log(...args) {
    if (DEBUG_LOGS) {
        console.log('Jellyfin UI:', ...args);
    }
}

// State management
const state = {
    breadcrumb: [],
    serverUrl: '',
    serverName: '',
    accessToken: '',
    userId: '',
    deviceId: '',
    username: '',
    searchQuery: '',
    currentLibrary: null,
    currentSeries: null,
    currentSeason: null,
    lastAction: null
};

let sidebarReady = false;
let pendingSidebarRefresh = false;

// Generate or retrieve device ID
function getDeviceId() {
    if (state.deviceId) return state.deviceId;

    // Try to get from localStorage
    let deviceId = localStorage.getItem('jellyfin-device-id');
    if (!deviceId) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        deviceId = 'iina-jellyfin-';
        for (let i = 0; i < 16; i++) {
            deviceId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        localStorage.setItem('jellyfin-device-id', deviceId);
    }
    state.deviceId = deviceId;
    return deviceId;
}


// Build authorization header for Jellyfin API
function getAuthHeader() {
    const parts = [
        `Client="${CLIENT_NAME}"`,
        `Device="${DEVICE_NAME}"`,
        `DeviceId="${getDeviceId()}"`,
        `Version="${CLIENT_VERSION}"`
    ];

    if (state.accessToken) {
        parts.push(`Token="${state.accessToken}"`);
    }

    return `MediaBrowser ${parts.join(', ')}`;
}

// API request helper
async function apiRequest(method, endpoint, data = null) {
    const url = `${state.serverUrl}${endpoint}`;
    const options = {
        method: method,
        headers: {
            'Authorization': getAuthHeader(),
            'Content-Type': 'application/json'
        }
    };

    if (data && (method === 'POST' || method === 'PUT')) {
        options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
    }

    // Some endpoints return empty response
    const text = await response.text();
    return text ? JSON.parse(text) : null;
}

// DOM Elements
const loginView = document.getElementById('login-view');
const browseView = document.getElementById('browse-view');
const loginForm = document.getElementById('login-form');
const loginError = document.getElementById('login-error');
const connectBtn = document.getElementById('connect-btn');
const backBtn = document.getElementById('back-btn');
const sectionHeader = document.getElementById('section-header');
const sectionTitle = document.getElementById('section-title');
const content = document.getElementById('content');
const loading = document.getElementById('loading');
const errorState = document.getElementById('error-state');
const serverName = document.getElementById('server-name');
const serverHost = document.getElementById('server-host');
const userName = document.getElementById('user-name');
const searchInput = document.getElementById('search-input');
const clearSearchButton = document.getElementById('clear-search');
const logoutBtn = document.getElementById('logout-btn');
const refreshBtn = document.getElementById('refresh-btn');
const retryBtn = document.getElementById('retry-btn');

// Session storage using localStorage (more reliable than message passing)
function saveSessionToStorage() {
    const sessionData = {
        serverUrl: state.serverUrl,
        serverName: state.serverName,
        accessToken: state.accessToken,
        userId: state.userId,
        username: state.username,
        savedAt: Date.now()
    };
    localStorage.setItem('jellyfin-session', JSON.stringify(sessionData));
    log('Session saved to localStorage');
}

function loadSessionFromStorage() {
    try {
        const stored = localStorage.getItem('jellyfin-session');
        if (stored) {
            const sessionData = JSON.parse(stored);
            if (sessionData.serverUrl && sessionData.accessToken && sessionData.userId) {
                return sessionData;
            }
        }
    } catch (e) {
        console.error('Failed to load session from localStorage:', e);
    }
    return null;
}

function clearSessionFromStorage() {
    localStorage.removeItem('jellyfin-session');
    log('Session cleared from localStorage');
}



// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    getDeviceId();

    // Try to restore session from localStorage
    const savedSession = loadSessionFromStorage();
    if (savedSession) {
        state.serverUrl = savedSession.serverUrl;
        state.accessToken = savedSession.accessToken;
        state.userId = savedSession.userId;
        state.username = savedSession.username;
        const serverHostValue = new URL(savedSession.serverUrl).hostname;
        state.serverName = savedSession.serverName || '';
        updateServerHeader(state.serverName || serverHostValue, serverHostValue);
        userName.textContent = savedSession.username;
        showBrowseView();
        loadHome();
    } else {
        showLoginView();
    }

    sidebarReady = true;
    if (pendingSidebarRefresh) {
        refreshSidebarContent('pending');
    }
});

function setupEventListeners() {
    // Login form
    loginForm.addEventListener('submit', handleLogin);

    // Navigation
    backBtn.addEventListener('click', handleBack);
    logoutBtn.addEventListener('click', handleLogout);
    refreshBtn.addEventListener('click', handleRefresh);
    retryBtn.addEventListener('click', handleRetry);

    // Search
    searchInput.addEventListener('input', handleSearchInput);
    searchInput.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
            handleSearchSubmit(event);
        }
    });
    clearSearchButton.addEventListener('click', handleClearSearch);

    // Delegated handlers for dynamic content
    content.addEventListener('click', handleContentClick);
    content.addEventListener('keydown', handleContentKeydown);
    content.addEventListener('error', handleContentError, true);
}

// Login handler - direct API call
async function handleLogin(e) {
    e.preventDefault();

    const serverUrl = document.getElementById('server-url').value.trim().replace(/\/$/, '');
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value;

    connectBtn.disabled = true;
    connectBtn.textContent = 'Connecting...';
    loginError.textContent = '';

    try {
        // Authenticate directly with Jellyfin
        const authResponse = await fetch(`${serverUrl}/Users/AuthenticateByName`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `MediaBrowser Client="${CLIENT_NAME}", Device="${DEVICE_NAME}", DeviceId="${getDeviceId()}", Version="${CLIENT_VERSION}"`
            },
            body: JSON.stringify({
                Username: username,
                Pw: password
            })
        });

        if (!authResponse.ok) {
            throw new Error('Authentication failed. Check your credentials.');
        }

        const authData = await authResponse.json();

        // Store session state
        state.serverUrl = serverUrl;
        state.accessToken = authData.AccessToken;
        state.userId = authData.User.Id;
        state.username = authData.User.Name;

        const serverDisplayName = await fetchServerName();
        state.serverName = serverDisplayName;

        // Device name will be delivered via setDeviceName

        // Save session to localStorage for persistence
        saveSessionToStorage();

        // Update UI
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
        const serverHostValue = new URL(serverUrl).hostname;
        updateServerHeader(serverDisplayName || serverHostValue, serverHostValue);
        userName.textContent = state.username;
        showBrowseView();
        loadHome();



    } catch (error) {
        connectBtn.disabled = false;
        connectBtn.textContent = 'Connect';
        loginError.textContent = error.message || 'Connection failed';
    }
}

function handleLogout() {
    // Clear local state
    state.serverUrl = '';
    state.serverName = '';
    state.accessToken = '';
    state.userId = '';
    state.username = '';

    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.searchQuery = '';

    // Clear saved session from localStorage
    clearSessionFromStorage();

    // Update UI
    showLoginView();
    document.getElementById('password').value = '';
    searchInput.value = '';
    clearSearchButton.classList.add('hidden');
}

// Navigation
function handleBack() {
    if (state.breadcrumb.length === 0) return;

    state.breadcrumb.pop();

    if (state.breadcrumb.length === 0) {
        state.currentLibrary = null;
        state.currentSeries = null;
        state.currentSeason = null;
        if (state.searchQuery) {
            performSearch(state.searchQuery);
        } else {
            loadHome();
        }
    } else {
        const prev = state.breadcrumb[state.breadcrumb.length - 1];
        switch (prev.type) {
            case 'library':
                state.currentSeries = null;
                state.currentSeason = null;
                reloadItems(prev);
                break;
            case 'series':
                state.currentSeason = null;
                reloadSeasons(prev);
                break;
            case 'season':
                reloadEpisodes(prev);
                break;
        }
    }
}

function handleRetry() {
    if (state.lastAction) {
        state.lastAction();
    }
}

function handleRefresh() {
    resetSearchState(false);
    refreshSidebarContent('manual');
}

async function reloadItems(breadcrumb) {
    updateTitle(breadcrumb.name);
    showLoading();
    const itemType = breadcrumb.collectionType === 'movies' ? 'Movie' : 'Series';

    try {
        let endpoint = `/Users/${state.userId}/Items?ParentId=${breadcrumb.id}`;
        endpoint += '&SortBy=SortName&SortOrder=Ascending';
        endpoint += '&Fields=Overview,Genres,MediaSources,UserData,RunTimeTicks';
        endpoint += '&EnableImageTypes=Primary,Backdrop,Thumb';
        endpoint += `&IncludeItemTypes=${itemType}`;

        const data = await apiRequest('GET', endpoint);
        const items = data.Items || [];

        hideLoading();
        if (items.length === 0) {
            renderEmptyState('No items found');
            return;
        }
        renderListCards(items, { showSeriesName: false });
    } catch (error) {
        showError(error.message || 'Failed to load items');
    }
}

async function reloadSeasons(breadcrumb) {
    updateTitle(breadcrumb.name);
    showLoading();

    try {
        const [nextUpItem, seasons] = await Promise.all([
            loadNextUpForSeries(breadcrumb.id),
            fetchSeasons(breadcrumb.id)
        ]);

        hideLoading();
        if (seasons.length === 0 && !nextUpItem) {
            renderEmptyState('No seasons found');
            return;
        }
        renderSeriesOverview(nextUpItem, seasons);
    } catch (error) {
        showError(error.message || 'Failed to load seasons');
    }
}

async function reloadEpisodes(breadcrumb) {
    updateTitle(breadcrumb.name);
    showLoading();

    try {
        const endpoint = `/Shows/${breadcrumb.seriesId}/Episodes?UserId=${state.userId}&SeasonId=${breadcrumb.id}&Fields=Overview,MediaSources,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber`;
        const data = await apiRequest('GET', endpoint);
        const episodes = data.Items || [];

        hideLoading();
        if (episodes.length === 0) {
            renderEmptyState('No episodes found');
            return;
        }
        renderListCards(episodes, { showSeriesName: false, showEpisodeNumber: true, useEpisodeThumbnail: true });
    } catch (error) {
        showError(error.message || 'Failed to load episodes');
    }
}

// View switching
function showLoginView() {
    loginView.classList.remove('hidden');
    browseView.classList.add('hidden');
}

function showBrowseView() {
    loginView.classList.add('hidden');
    browseView.classList.remove('hidden');
    resetSearchState(false);
    refreshSidebarContent('show');
}

function updateServerHeader(displayName, hostName) {
    serverName.textContent = displayName || hostName;
    serverHost.textContent = hostName;
}

function refreshSidebarContent(reason) {
    if (!sidebarReady) {
        pendingSidebarRefresh = true;
        return;
    }

    if (!state.accessToken || !state.userId) {
        return;
    }

    pendingSidebarRefresh = false;
    log('Refreshing sidebar content:', reason || 'unknown');

    if (state.searchQuery) {
        performSearch(state.searchQuery);
        return;
    }

    if (state.lastAction) {
        state.lastAction();
        return;
    }

    loadHome();
}

function showLoading() {
    loading.classList.remove('hidden');
    content.classList.add('hidden');
    errorState.classList.add('hidden');
}

function hideLoading() {
    loading.classList.add('hidden');
    content.classList.remove('hidden');
}

function renderEmptyState(message) {
    const emptyState = document.createElement('div');
    emptyState.className = 'empty-state';
    emptyState.textContent = message;
    content.innerHTML = '';
    content.appendChild(emptyState);
}

function showError(message) {
    loading.classList.add('hidden');
    content.classList.add('hidden');
    errorState.classList.remove('hidden');
    document.getElementById('error-message').textContent = message;
}

function updateTitle(title) {
    sectionTitle.textContent = title;
    const showHeader = state.breadcrumb.length > 0 || title !== 'Home';
    sectionHeader.classList.toggle('hidden', !showHeader);
    backBtn.classList.toggle('hidden', state.breadcrumb.length === 0);
}

// Data loading - direct API calls
async function loadHome() {
    state.breadcrumb = [];
    state.lastAction = loadHome;
    updateTitle('Home');
    showLoading();

    try {
        const [nextUpItems, recentMovies, recentEpisodes] = await Promise.all([
            loadHomeItems(5),
            loadLatestItems('Movie', 5),
            loadLatestItems('Episode', 5)
        ]);
        hideLoading();
        renderHomeSections(nextUpItems, recentMovies, recentEpisodes);
    } catch (error) {
        showError(error.message || 'Failed to load items');
    }
}

async function loadHomeItems(limit = 5) {
    const resumeItems = await loadResumeItems();
    const nextUpItems = await loadNextUpItems();
    const combined = mergeItems(resumeItems, nextUpItems);
    return combined.slice(0, limit);
}

async function loadLatestItems(itemType, limit) {
    const endpoint = `/Users/${state.userId}/Items/Latest?IncludeItemTypes=${itemType}&Limit=${limit}` +
        '&Fields=Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId';
    const data = await apiRequest('GET', endpoint);
    return (data || []).filter(item => isSupportedItem(item));
}

async function loadResumeItems() {
    const endpoint = `/Users/${state.userId}/Items/Resume?Limit=10&MediaTypes=Video` +
        '&Fields=Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId';
    const data = await apiRequest('GET', endpoint);
    return (data.Items || []).filter(item => isSupportedItem(item));
}

async function loadNextUpItems() {
    const endpoint = `/Shows/NextUp?UserId=${state.userId}&Limit=10&Fields=Overview,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId`;
    const data = await apiRequest('GET', endpoint);
    return (data.Items || []).filter(item => isSupportedItem(item));
}

function mergeItems(primary, secondary) {
    const seen = new Set();
    const combined = [];

    primary.forEach(item => {
        if (item && item.Id && !seen.has(item.Id)) {
            seen.add(item.Id);
            combined.push(item);
        }
    });

    secondary.forEach(item => {
        if (item && item.Id && !seen.has(item.Id)) {
            seen.add(item.Id);
            combined.push(item);
        }
    });

    return combined;
}

function isSupportedItem(item) {
    return item && (item.Type === 'Movie' || item.Type === 'Episode' || item.Type === 'Series');
}

function buildStreamUrl(item, context = {}) {
    if (!item || !state.serverUrl) return '';

    const itemId = item.Id || item.id;
    const runtimeTicks = item.RunTimeTicks || context.runtimeTicks || 0;
    const mediaSourceId = context.mediaSourceId || item.MediaSources?.[0]?.Id || itemId;

    const urlParams = new URLSearchParams({
        Static: 'true',
        mediaSourceId: mediaSourceId,
        playSessionId: context.playSessionId || '',
        api_key: state.accessToken,
        _jf_itemId: itemId,
        _jf_runtimeTicks: runtimeTicks.toString(),
        _jf_deviceId: getDeviceId()
    });

    if (context.seriesId) {
        urlParams.set('_jf_seriesId', context.seriesId);
    }
    if (context.seasonId) {
        urlParams.set('_jf_seasonId', context.seasonId);
    }
    if (context.episodeIndex !== undefined && context.episodeIndex !== null) {
        urlParams.set('_jf_episodeIndex', String(context.episodeIndex));
    }

    return `${state.serverUrl}/Videos/${itemId}/stream?${urlParams.toString()}`;
}

function getSearchEndpoint(query) {
    return `/Items?SearchTerm=${encodeURIComponent(query)}` +
        `&UserId=${state.userId}` +
        '&IncludeItemTypes=Movie,Series,Episode' +
        '&Fields=Overview,UserData,RunTimeTicks,SeriesName,ProductionYear,ParentIndexNumber,IndexNumber,SeriesId,SeasonId,RecursiveItemCount,ChildCount' +
        '&Recursive=true&Limit=20&SortBy=SortName&SortOrder=Ascending';
}

async function loadItems(libraryId, libraryName, collectionType) {
    state.currentLibrary = { id: libraryId, name: libraryName, type: collectionType };
    state.lastAction = () => loadItems(libraryId, libraryName, collectionType);
    updateTitle(libraryName);
    showLoading();

    const itemType = collectionType === 'movies' ? 'Movie' : 'Series';
    const breadcrumb = { type: 'library', id: libraryId, name: libraryName, collectionType };

    try {
        let endpoint = `/Users/${state.userId}/Items?ParentId=${libraryId}`;
        endpoint += '&SortBy=SortName&SortOrder=Ascending';
        endpoint += '&Fields=Overview,Genres,MediaSources,UserData,RunTimeTicks,SeriesId,SeasonId';
        endpoint += '&EnableImageTypes=Thumb';
        endpoint += `&IncludeItemTypes=${itemType}`;

        const data = await apiRequest('GET', endpoint);
        const items = data.Items || [];

        hideLoading();
        if (!state.breadcrumb.find(b => b.id === breadcrumb.id)) {
            state.breadcrumb.push(breadcrumb);
        }
        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || 'Items');

        if (items.length === 0) {
            renderEmptyState('No items found');
            return;
        }
        renderListCards(items, { showSeriesName: false });
    } catch (error) {
        showError(error.message || 'Failed to load items');
    }
}

async function loadSeasons(seriesId, seriesName) {
    state.currentSeries = { id: seriesId, name: seriesName };
    state.lastAction = () => loadSeasons(seriesId, seriesName);
    updateTitle(seriesName);
    showLoading();

    try {
        const [nextUpItem, seasons] = await Promise.all([
            loadNextUpForSeries(seriesId),
            fetchSeasons(seriesId)
        ]);

        hideLoading();
        state.breadcrumb.push({ type: 'series', id: seriesId, name: seriesName });
        updateTitle(seriesName);

        if (seasons.length === 0 && !nextUpItem) {
            renderEmptyState('No seasons found');
            return;
        }

        renderSeriesOverview(nextUpItem, seasons);
    } catch (error) {
        showError(error.message || 'Failed to load seasons');
    }
}

async function loadEpisodes(seriesId, seasonId, seasonName) {
    state.currentSeason = { id: seasonId, name: seasonName };
    state.lastAction = () => loadEpisodes(seriesId, seasonId, seasonName);
    updateTitle(seasonName);
    showLoading();

    try {
        const endpoint = `/Shows/${seriesId}/Episodes?UserId=${state.userId}&SeasonId=${seasonId}&Fields=Overview,MediaSources,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId`;
        const data = await apiRequest('GET', endpoint);
        const episodes = data.Items || [];

        hideLoading();
        state.breadcrumb.push({
            type: 'season',
            id: seasonId,
            seriesId: state.currentSeries?.id,
            name: seasonName
        });
        updateTitle(seasonName);

        if (episodes.length === 0) {
            renderEmptyState('No episodes found');
            return;
        }
        renderListCards(episodes, { showSeriesName: false, showEpisodeNumber: true, useEpisodeThumbnail: true });
    } catch (error) {
        showError(error.message || 'Failed to load episodes');
    }
}

// Render functions
function renderListCards(items, options = {}) {
    const html = `
        <div class="media-list">
            ${items.map(item => buildListCard(item, options)).join('')}
        </div>
    `;

    content.innerHTML = html;
}

function renderHomeSections(nextUpItems, recentMovies, recentEpisodes) {
    const sections = [
        { title: 'Up Next', items: nextUpItems },
        { title: 'Latest Movies', items: recentMovies },
        { title: 'Latest TV', items: recentEpisodes }
    ];

    const html = sections.map(section => {
        const items = section.items || [];
        if (items.length === 0) {
            return `
                <div class="home-section">
                    <h3>${section.title}</h3>
                    <div class="empty-state" data-empty="true">No items found</div>
                </div>
            `;
        }
        return `
            <div class="home-section">
                <h3>${section.title}</h3>
                <div class="media-list">
                    ${items.map(item => buildListCard(item, {
                        showSeriesName: section.title === 'Up Next' || section.title === 'Latest TV',
                        showEpisodeNumber: true
                    })).join('')}
                </div>
            </div>
        `;
    }).join('');

    content.innerHTML = html;
}

function renderSeriesOverview(nextUpItem, seasons) {
    const sections = [];

    if (nextUpItem) {
        sections.push(`
            <div class="home-section">
                <h3>Up Next</h3>
                <div class="media-list">
                    ${buildListCard(nextUpItem, { showSeriesName: false, showEpisodeNumber: true, useEpisodeThumbnail: true })}
                </div>
            </div>
        `);
    }

    if (seasons.length > 0) {
        sections.push(`
            <div class="season-section">
                <h3>Seasons</h3>
                <div class="season-grid">
                    ${seasons.map(season => buildSeasonCard(season)).join('')}
                </div>
            </div>
        `);
    }

    content.innerHTML = sections.join('');
}

function buildSeasonCard(season) {
    const imageUrl = getImageUrl(season.Id, 'Primary', 240);
    const seriesPosterUrl = state.currentSeries?.id
        ? getImageUrl(state.currentSeries.id, 'Primary', 240)
        : '';
    const seasonName = escapeHtml(season.Name);
    return `
        <div class="season-card list-card" data-id="${season.Id}" data-name="${seasonName}" data-type="Season" data-resume="0" data-series-id="${state.currentSeries?.id || ''}" data-season-id="${season.Id}" data-clickable tabindex="0" role="button">
            <div class="season-poster">
                <img class="season-thumb"
                     src="${imageUrl}"
                     data-fallback="${seriesPosterUrl}"
                     alt="${seasonName}"
                     loading="lazy">
            </div>
            <div class="season-title">${seasonName}</div>
        </div>
    `;
}

async function fetchSeasons(seriesId) {
    const endpoint = `/Shows/${seriesId}/Seasons?UserId=${state.userId}&Fields=Overview,UserData,RunTimeTicks`;
    const data = await apiRequest('GET', endpoint);
    return data.Items || [];
}

async function loadNextUpForSeries(seriesId) {
    try {
        const endpoint = `/Shows/NextUp?UserId=${state.userId}&SeriesId=${seriesId}&Limit=1&Fields=Overview,UserData,RunTimeTicks,SeriesName,ParentIndexNumber,IndexNumber,SeriesId,SeasonId`;
        const data = await apiRequest('GET', endpoint);
        const items = (data.Items || []).filter(item => item.Type === 'Episode');
        return items[0] || null;
    } catch (error) {
        console.warn('Failed to load series next up:', error.message || error);
        return null;
    }
}

function getCardContext(card) {
    if (!card) return null;

    const id = card.dataset.id;
    const name = card.dataset.name || '';
    const type = card.dataset.type;
    const resume = parseInt(card.dataset.resume) || 0;

    return {
        id,
        name,
        type,
        resume,
        context: {
            seriesId: card.dataset.seriesId || '',
            seasonId: card.dataset.seasonId || '',
            episodeIndex: card.dataset.episodeIndex
                ? parseInt(card.dataset.episodeIndex, 10)
                : null
        }
    };
}

function handleListCardSelection(card) {
    const details = getCardContext(card);
    if (!details || !details.id) return;

    const { id, name, type, resume, context } = details;

    if (type === 'Series') {
        loadSeasons(id, name);
        return;
    }

    if (type === 'Season') {
        loadEpisodes(state.currentSeries?.id || '', id, name);
        return;
    }

    playItem(id, name, resume, context);
}

function findListCard(target) {
    if (!target || !target.closest) return null;
    return target.closest('.list-card');
}

function handleContentClick(event) {
    const card = findListCard(event.target);
    if (!card || !content.contains(card)) return;

    handleListCardSelection(card);
}

function handleContentKeydown(event) {
    if (event.key !== 'Enter' && event.key !== ' ') return;

    const card = findListCard(event.target);
    if (!card || !content.contains(card)) return;

    event.preventDefault();
    handleListCardSelection(card);
}

function handleContentError(event) {
    const imageElement = event.target;
    if (!imageElement || imageElement.tagName !== 'IMG') return;

    if (imageElement.classList.contains('season-thumb')) {
        handleSeasonPosterError(imageElement);
        return;
    }

    if (imageElement.classList.contains('list-thumb')) {
        handleEpisodeThumbError(imageElement);
    }
}

function buildListCard(item, options) {
    const metadata = buildMetadata(item, options);
    const runtime = formatRuntime(item.RunTimeTicks);
    const durationLabel = buildDurationLabel(item, runtime, options);
    const progressBar = renderThumbProgress(item);

    const seriesId = item.SeriesId || '';
    const seasonId = item.SeasonId || item.ParentId || '';
    const episodeIndex = item.IndexNumber !== undefined && item.IndexNumber !== null
        ? item.IndexNumber
        : '';
    const thumbnailUrl = getThumbnailUrl(item, options);
    const useEpisodeFallback = options.useEpisodeThumbnail && item.Type === 'Episode' && seriesId;
    const useBackdropFallback = item.Type === 'Movie' || item.Type === 'Series';
    const fallbackThumbnailUrl = useEpisodeFallback
        ? getImageUrl(seriesId, 'Thumb', 160)
        : (useBackdropFallback ? getImageUrl(item.Id, 'Backdrop', 320) : '');

    return `
        <div class="list-card" data-id="${item.Id}" data-name="${escapeHtml(item.Name)}" data-type="${item.Type}" data-resume="${item.UserData?.PlaybackPositionTicks || 0}" data-series-id="${seriesId}" data-season-id="${seasonId}" data-episode-index="${episodeIndex}" data-clickable tabindex="0" role="button">
            <div class="thumb-wrapper">
                <img class="list-thumb"
                     src="${thumbnailUrl}"
                     data-fallback="${fallbackThumbnailUrl}"
                     data-item-id="${item.Id}"
                     data-type="${item.Type}"
                     alt="${escapeHtml(item.Name)}"
                     loading="lazy">
                <div class="play-overlay">▶</div>
                ${progressBar}
            </div>
            <div class="list-body">
                <div class="list-title">${escapeHtml(item.Name)}</div>
                <div class="list-meta">${metadata}</div>
            </div>
            ${durationLabel}
        </div>
    `;
}

function buildDurationLabel(item, runtime, options) {
    if (options.showSeriesEpisodeCounts && item.Type === 'Series') {
        const totalEpisodes = item.RecursiveItemCount || item.ChildCount || 0;
        const playedCount = item.UserData?.PlayedItemCount;
        const unplayedCount = item.UserData?.UnplayedItemCount;
        const watchedEpisodes = playedCount !== undefined && playedCount !== null
            ? playedCount
            : (unplayedCount !== undefined && unplayedCount !== null
                ? Math.max(totalEpisodes - unplayedCount, 0)
                : 0);
        if (totalEpisodes > 0) {
            return `<div class="list-duration">${watchedEpisodes}/${totalEpisodes}</div>`;
        }
        return '';
    }

    return runtime ? `<div class="list-duration">${runtime}</div>` : '';
}

function buildMetadata(item, options) {
    const metaParts = [];

    if (options.showEpisodeNumber && item.Type === 'Episode') {
        metaParts.push(formatEpisodeNumber(item.ParentIndexNumber, item.IndexNumber));
    }

    if (options.showSeriesName !== false && item.SeriesName) {
        metaParts.push(escapeHtml(item.SeriesName));
    }

    if (item.Type !== 'Episode' && item.ProductionYear) {
        metaParts.push(item.ProductionYear);
    }

    return metaParts.filter(Boolean).join(' • ');
}

function hasProgress(item) {
    return Boolean(item.UserData?.PlaybackPositionTicks && item.RunTimeTicks);
}

function renderThumbProgress(item) {
    if (!item || !item.UserData || item.Type === 'Series') return '';

    if (item.UserData.Played) {
        return `
            <div class="thumb-progress">
                <div class="thumb-progress-fill thumb-progress-fill--complete" style="width: 100%"></div>
            </div>
        `;
    }

    if (!hasProgress(item)) return '';

    const progress = (item.UserData.PlaybackPositionTicks / item.RunTimeTicks) * 100;
    if (progress < 1) return '';

    return `
        <div class="thumb-progress">
            <div class="thumb-progress-fill thumb-progress-fill--partial" style="width: ${Math.min(progress, 100)}%"></div>
        </div>
    `;
}

// Utility functions
function getImageUrl(itemId, imageType = 'Primary', maxWidth = 120) {
    if (!state.serverUrl) return '';
    return `${state.serverUrl}/Items/${itemId}/Images/${imageType}?maxWidth=${maxWidth}&quality=90`;
}

function getThumbnailUrl(item, options = {}) {
    if (!item) return '';

    if (options.useEpisodeThumbnail && item.Type === 'Episode' && item.Id) {
        return getImageUrl(item.Id, 'Primary', 160);
    }

    const imageId = item.Type === 'Episode' && item.SeriesId ? item.SeriesId : item.Id;
    return getImageUrl(imageId, 'Thumb', 160);
}

function handleEpisodeThumbError(imageElement) {
    handleImageFallback(imageElement);
}

function handleSeasonPosterError(imageElement) {
    handleImageFallback(imageElement);
}

function handleImageFallback(imageElement) {
    if (!imageElement) {
        return;
    }

    const fallbackUrl = imageElement.dataset.fallback || '';
    if (fallbackUrl && imageElement.dataset.fallbackApplied !== 'true') {
        imageElement.dataset.fallbackApplied = 'true';
        imageElement.src = fallbackUrl;
        return;
    }

    const itemId = imageElement.dataset.itemId || '';
    const type = imageElement.dataset.type || '';
    const usedBackdrop = imageElement.dataset.backdropApplied === 'true';
    if (!usedBackdrop && itemId && (type === 'Movie' || type === 'Series')) {
        imageElement.dataset.backdropApplied = 'true';
        imageElement.src = getImageUrl(itemId, 'Backdrop', 320);
        return;
    }

    imageElement.style.display = 'none';
}

function formatRuntime(ticks) {
    if (!ticks) return '';
    const totalMinutes = Math.floor(ticks / 600000000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function formatEpisodeNumber(season, episode) {
    const s = String(season || 0).padStart(2, '0');
    const e = String(episode || 0).padStart(2, '0');
    return `S${s}E${e}`;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function normalizeQuery(value) {
    return value.trim().toLowerCase();
}

function updateSearchState(query) {
    state.searchQuery = query;
    clearSearchButton.classList.toggle('hidden', !query);
}

function resetSearchState(shouldReload = true) {
    searchInput.value = '';
    updateSearchState('');

    if (shouldReload) {
        loadHome();
    }
}

function handleSearchInput(event) {
    const query = normalizeQuery(event.target.value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
    }
}

function handleClearSearch() {
    resetSearchState(true);
}

function handleSearchSubmit(event) {
    event.preventDefault();
    const query = normalizeQuery(searchInput.value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
        return;
    }

    performSearch(query);
}

async function performSearch(query) {
    state.lastAction = () => performSearch(query);
    updateTitle('Search Results');
    showLoading();

    try {
        const data = await apiRequest('GET', getSearchEndpoint(query));
        const items = (data.Items || []).filter(item => isSupportedItem(item));

        hideLoading();
        if (items.length === 0) {
            renderEmptyState('No results found');
            return;
        }
        renderSearchResults(items);
    } catch (error) {
        showError(error.message || 'Failed to search');
    }
}

function renderSearchResults(items) {
    const grouped = {
        Movie: [],
        Series: [],
        Episode: []
    };

    items.forEach(item => {
        if (grouped[item.Type]) {
            grouped[item.Type].push(item);
        }
    });

    const sections = [
        {
            title: 'Movies',
            items: grouped.Movie,
            options: { showSeriesName: false, showEpisodeNumber: false, useEpisodeThumbnail: true }
        },
        {
            title: 'Shows',
            items: grouped.Series,
            options: { showSeriesName: false, showEpisodeNumber: false, useEpisodeThumbnail: true, showSeriesEpisodeCounts: true }
        },
        {
            title: 'Episodes',
            items: grouped.Episode,
            options: { showSeriesName: true, showEpisodeNumber: true, useEpisodeThumbnail: true }
        }
    ];

    const visibleSections = sections.filter(section => section.items.length > 0);
    if (visibleSections.length === 0) {
        renderEmptyState('No results found');
        return;
    }

    const html = visibleSections.map(section => `
        <div class="result-section">
            <h3>${section.title}</h3>
            <div class="media-list">
                ${section.items.map(item => buildListCard(item, section.options)).join('')}
            </div>
        </div>
    `).join('');

    content.innerHTML = html;
}

async function fetchItemDetails(itemId) {
    const endpoint = `/Users/${state.userId}/Items/${itemId}?Fields=ProductionYear,ParentIndexNumber,IndexNumber,SeriesName,SeriesId,SeasonId,ParentId`;
    return await apiRequest('GET', endpoint);
}

async function fetchServerName() {
    try {
        const systemInfo = await apiRequest('GET', '/System/Info/Public');
        return systemInfo?.ServerName || '';
    } catch (error) {
        console.error('Failed to fetch server name:', error);
        return '';
    }
}

function buildWindowTitle(item, fallbackName) {
    if (!item) return fallbackName || '';

    const name = item.Name || fallbackName || '';
    const type = item.Type;

    if (type === 'Episode') {
        const seriesName = item.SeriesName || '';
        const seasonNumber = item.ParentIndexNumber;
        const episodeNumber = item.IndexNumber;
        const seasonLabel = seasonNumber !== null && seasonNumber !== undefined
            ? String(seasonNumber).padStart(2, '0')
            : '00';
        const episodeLabel = episodeNumber !== null && episodeNumber !== undefined
            ? String(episodeNumber).padStart(2, '0')
            : '00';
        const titleParts = [seriesName, `S${seasonLabel}E${episodeLabel}`];
        if (name) {
            titleParts.push(name);
        }
        return titleParts.filter(Boolean).join(' • ');
    }

    if (type === 'Movie') {
        const year = item.ProductionYear ? ` (${item.ProductionYear})` : '';
        return `${name}${year}`;
    }

    return name;
}

async function playItem(itemId, name, resumePositionTicks = 0, context = {}, preferredTitle = '') {
    try {
        // Get playback info to obtain PlaySessionId and MediaSourceId for session tracking
        const playbackInfo = await apiRequest('POST', `/Items/${itemId}/PlaybackInfo?UserId=${state.userId}`, {
            DeviceProfile: getDeviceProfile()
        });

        const playSessionId = playbackInfo.PlaySessionId;
        const mediaSource = playbackInfo.MediaSources?.[0];
        const mediaSourceId = mediaSource?.Id || itemId;
        const runtimeTicks = mediaSource?.RunTimeTicks || 0;
        const itemDetails = await fetchItemDetails(itemId);
        const windowTitle = preferredTitle || buildWindowTitle(itemDetails, name);

        const resolvedContext = {
            seriesId: context.seriesId || itemDetails?.SeriesId || '',
            seasonId: context.seasonId || itemDetails?.SeasonId || itemDetails?.ParentId || '',
            episodeIndex: context.episodeIndex !== undefined && context.episodeIndex !== null
                ? context.episodeIndex
                : itemDetails?.IndexNumber
        };

        // Build the streaming URL with session tracking parameters
        // Include extra params for main.js to parse for playback reporting
        const streamUrl = buildStreamUrl({
            Id: itemId,
            RunTimeTicks: runtimeTicks
        }, {
            playSessionId: playSessionId,
            mediaSourceId: mediaSourceId,
            runtimeTicks: runtimeTicks,
            seriesId: resolvedContext.seriesId,
            seasonId: resolvedContext.seasonId,
            episodeIndex: resolvedContext.episodeIndex
        });

        // Convert ticks to seconds for resume position
        const resumeSeconds = resumePositionTicks > 0 ? Math.floor(resumePositionTicks / 10000000) : 0;

        // Use IINA URL scheme to trigger playback directly
        // This bypasses the broken message passing between sidebar and main.js
        openInIINA(streamUrl, resumeSeconds, windowTitle || name);
    } catch (error) {
        console.error('Failed to get playback info:', error);
        // Fallback to direct download if playback info fails
        const streamUrl = `${state.serverUrl}/Items/${itemId}/Download?api_key=${state.accessToken}`;
        const resumeSeconds = resumePositionTicks > 0 ? Math.floor(resumePositionTicks / 10000000) : 0;

        openInIINA(streamUrl, resumeSeconds);
    }
}

// Open a URL in IINA via message to main.js
function openInIINA(url, resumeSeconds = 0, title = '') {
    iina.postMessage('playItem', { url, resumeSeconds, title });
}

// Listen for playback reporting requests from main.js
// main.js uses iina.http which is blocked by ATS for HTTP URLs
// sidebar.js uses fetch() which works in webviews, so we handle reporting here
iina.onMessage('reportPlayback', async (data) => {
    if (!state.serverUrl || !state.accessToken) {
        log('Playback reporting skipped: not authenticated');
        return;
    }

    try {
        const endpoint = data.endpoint; // e.g., '/Sessions/Playing'
        await apiRequest('POST', endpoint, data.body);
        log('Playback reported:', endpoint);
    } catch (error) {
        console.error('Failed to report playback:', error.message);
    }
});

iina.onMessage('refreshSidebar', () => {
    refreshSidebarContent('show');
});


// Device profile for playback info request (indicates direct play capability)
function getDeviceProfile() {

    return {
        MaxStreamingBitrate: 120000000,
        MaxStaticBitrate: 100000000,
        MusicStreamingTranscodingBitrate: 384000,
        DirectPlayProfiles: [
            { Container: 'mp4,m4v,mkv,webm,avi,mov', Type: 'Video' },
            { Container: 'mp3,flac,aac,m4a,ogg,opus,wav', Type: 'Audio' }
        ],
        TranscodingProfiles: [],
        ContainerProfiles: [],
        CodecProfiles: [],
        SubtitleProfiles: [
            { Format: 'srt', Method: 'External' },
            { Format: 'ass', Method: 'External' },
            { Format: 'ssa', Method: 'External' },
            { Format: 'vtt', Method: 'External' }
        ]
    };
}
