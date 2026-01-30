import type { JellyfinBaseItem } from "../shared/jellyfin";

import { MESSAGE_NAMES } from "../shared/messages";
import {
    FIELDS_EPISODES,
    FIELDS_HOME_ITEMS,
    FIELDS_LIBRARY_ITEMS,
    FIELDS_SEARCH,
    FIELDS_SEASONS
} from "./constants";
import { apiRequest, authenticateUser, fetchServerName } from "./api";
import { ui } from "./dom";
import { playItem } from "./playback";
import {
    findListCard,
    getCardContext,
    handleContentError,
    hideLoading,
    renderEmptyState,
    renderHomeSections,
    renderListCards,
    renderSearchResults,
    renderSeriesOverview,
    showBrowseView,
    showError,
    showLoading,
    showLoginView,
    updateServerHeader,
    updateTitle
} from "./render";
import { state } from "./state";
import { clearSessionFromStorage, getDeviceId, loadSessionFromStorage, saveSessionToStorage } from "./storage";
import { getServerHost, isHttpsUrl, log, normalizeQuery, normalizeServerUrl } from "./utils";

let sidebarReady = false;
let pendingSidebarRefresh = false;

document.addEventListener("DOMContentLoaded", () => {
    setupEventListeners();
    state.deviceId = getDeviceId();

    const savedSession = loadSessionFromStorage();
    if (savedSession) {
        const normalizedUrl = normalizeServerUrl(savedSession.serverUrl);
        if (normalizedUrl && isHttpsUrl(normalizedUrl)) {
            state.serverUrl = normalizedUrl;
            state.accessToken = savedSession.accessToken;
            state.userId = savedSession.userId;
            state.username = savedSession.username;
            const serverHostValue = getServerHost(normalizedUrl);
            state.serverName = savedSession.serverName || serverHostValue;
            updateServerHeader(state.serverName, serverHostValue);
            ui.userName.textContent = savedSession.username;
            showBrowseView();
            resetSearchState(false);
            sendAuthUpdated();
            goHomeFresh("session-restore");
        } else {
            clearSessionFromStorage();
            sendAuthCleared();
            showLoginView();
        }
    } else {
        sendAuthCleared();
        showLoginView();
    }

    sidebarReady = true;
    if (pendingSidebarRefresh) {
        if (state.accessToken && state.userId) {
            goHomeFresh("pending");
        }
        pendingSidebarRefresh = false;
    }
});

function setupEventListeners(): void {
    ui.loginForm.addEventListener("submit", handleLogin);
    ui.backBtn.addEventListener("click", handleBack);
    ui.logoutBtn.addEventListener("click", handleLogout);
    ui.refreshBtn.addEventListener("click", handleRefresh);
    ui.retryBtn.addEventListener("click", handleRetry);
    ui.searchInput.addEventListener("input", handleSearchInput);
    ui.searchInput.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
            handleSearchSubmit(event);
        }
    });
    ui.clearSearchButton.addEventListener("click", handleClearSearch);
    ui.content.addEventListener("click", handleContentClick);
    ui.content.addEventListener("keydown", handleContentKeydown);
    ui.content.addEventListener("error", handleContentError, true);
}

function updateSearchState(query: string): void {
    state.searchQuery = query;
    ui.clearSearchButton.classList.toggle("hidden", !query);
}

function resetSearchState(shouldReload: boolean = true): void {
    ui.searchInput.value = "";
    updateSearchState("");

    if (shouldReload) {
        void loadHome();
    }
}

function normalizeAndValidateUrl(rawUrl: string): string | null {
    const normalizedUrl = normalizeServerUrl(rawUrl);
    if (!normalizedUrl) {
        ui.loginError.textContent = "Please enter a server URL.";
        return null;
    }
    if (!isHttpsUrl(normalizedUrl)) {
        ui.loginError.textContent = "Jellyfin requires an https:// server URL.";
        return null;
    }
    return normalizedUrl;
}

async function handleLogin(event: Event): Promise<void> {
    event.preventDefault();

    const serverUrlInput = ui.serverUrlInput.value.trim();
    const username = ui.usernameInput.value.trim();
    const password = ui.passwordInput.value;

    ui.connectBtn.disabled = true;
    ui.connectBtn.textContent = "Connecting...";
    ui.loginError.textContent = "";

    const normalizedUrl = normalizeAndValidateUrl(serverUrlInput);
    if (!normalizedUrl) {
        ui.connectBtn.disabled = false;
        ui.connectBtn.textContent = "Connect";
        return;
    }

    try {
        const authData = await authenticateUser(normalizedUrl, username, password);
        state.serverUrl = normalizedUrl;
        state.accessToken = authData.AccessToken || "";
        state.userId = authData.User?.Id || "";
        state.username = authData.User?.Name || "";

        const serverDisplayName = await fetchServerName();
        const serverHostValue = getServerHost(state.serverUrl);
        state.serverName = serverDisplayName || serverHostValue;

        saveSessionToStorage({
            serverUrl: state.serverUrl,
            serverName: state.serverName,
            accessToken: state.accessToken,
            userId: state.userId,
            username: state.username,
            savedAt: Date.now()
        });

        ui.connectBtn.disabled = false;
        ui.connectBtn.textContent = "Connect";
        updateServerHeader(state.serverName, serverHostValue);
        ui.userName.textContent = state.username;
        showBrowseView();
        resetSearchState(false);
        sendAuthUpdated();
        goHomeFresh("login");
    } catch (error) {
        ui.connectBtn.disabled = false;
        ui.connectBtn.textContent = "Connect";
        const message = error instanceof Error ? error.message : "Connection failed";
        ui.loginError.textContent = message || "Connection failed";
    }
}

function handleLogout(): void {
    state.serverUrl = "";
    state.serverName = "";
    state.accessToken = "";
    state.userId = "";
    state.username = "";
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.searchQuery = "";
    state.lastAction = null;

    clearSessionFromStorage();
    sendAuthCleared();

    showLoginView();
    ui.passwordInput.value = "";
    ui.searchInput.value = "";
    ui.clearSearchButton.classList.add("hidden");
}

function handleBack(): void {
    if (state.breadcrumb.length === 0) {
        return;
    }

    state.breadcrumb.pop();

    if (state.breadcrumb.length === 0) {
        state.currentLibrary = null;
        state.currentSeries = null;
        state.currentSeason = null;
        updateSearchState("");
        void loadHome();
        return;
    }

    const prev = state.breadcrumb[state.breadcrumb.length - 1];
    switch (prev.type) {
        case "library":
            state.currentSeries = null;
            state.currentSeason = null;
            void reloadItems(prev);
            break;
        case "series":
            state.currentSeason = null;
            void reloadSeasons(prev);
            break;
        case "season":
            void reloadEpisodes(prev);
            break;
    }
}

function handleRetry(): void {
    if (state.lastAction) {
        void state.lastAction();
    }
}

function goHomeFresh(reason: string = ""): void {
    state.breadcrumb = [];
    state.currentLibrary = null;
    state.currentSeries = null;
    state.currentSeason = null;
    state.lastAction = null;
    resetSearchState(false);
    if (reason) {
        log("Returning home:", reason);
    }
    void loadHome();
}

function handleRefresh(): void {
    goHomeFresh("home-button");
}

function handleSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    const query = normalizeQuery(value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
    }
}

function handleClearSearch(): void {
    resetSearchState(true);
}

function handleSearchSubmit(event: Event): void {
    event.preventDefault();
    const query = normalizeQuery(ui.searchInput.value);
    updateSearchState(query);

    if (!query) {
        resetSearchState(true);
        return;
    }

    void performSearch(query);
}

function handleContentClick(event: MouseEvent): void {
    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    handleListCardSelection(card);
}

function handleContentKeydown(event: KeyboardEvent): void {
    if (event.key !== "Enter" && event.key !== " ") {
        return;
    }

    const card = findListCard(event.target);
    if (!card || !ui.content.contains(card)) {
        return;
    }

    event.preventDefault();
    handleListCardSelection(card);
}

function handleListCardSelection(card: HTMLElement): void {
    const details = getCardContext(card);
    if (!details || !details.id) {
        return;
    }

    const { id, name, type, resume, context } = details;

    if (type === "Series") {
        void loadSeasons(id, name);
        return;
    }

    if (type === "Season") {
        void loadEpisodes(state.currentSeries?.id || "", id, name);
        return;
    }

    void playItem(id, name, resume, context);
}

function buildLibraryItemsEndpoint(libraryId: string, collectionType: string): string {
    const itemType = collectionType === "movies" ? "Movie" : "Series";
    let endpoint = `/Users/${state.userId}/Items?ParentId=${libraryId}`;
    endpoint += "&SortBy=SortName&SortOrder=Ascending";
    endpoint += `&Fields=${FIELDS_LIBRARY_ITEMS}`;
    endpoint += "&EnableImageTypes=Primary,Backdrop,Thumb";
    endpoint += `&IncludeItemTypes=${itemType}`;
    return endpoint;
}

function buildEpisodesEndpoint(seriesId: string, seasonId: string): string {
    return `/Shows/${seriesId}/Episodes?UserId=${state.userId}&SeasonId=${seasonId}` +
        `&Fields=${FIELDS_EPISODES}`;
}

async function fetchAndRenderLibraryItems(options: {
    libraryId: string;
    libraryName: string;
    collectionType: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    updateTitle(options.libraryName);
    showLoading();

    try {
        const endpoint = buildLibraryItemsEndpoint(options.libraryId, options.collectionType);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        const items = data.Items || [];

        state.currentLibrary = {
            id: options.libraryId,
            name: options.libraryName,
            type: options.collectionType
        };
        state.lastAction = () => fetchAndRenderLibraryItems({
            libraryId: options.libraryId,
            libraryName: options.libraryName,
            collectionType: options.collectionType,
            addBreadcrumb: false
        });

        if (options.addBreadcrumb) {
            const breadcrumb = {
                type: "library" as const,
                id: options.libraryId,
                name: options.libraryName,
                collectionType: options.collectionType
            };
            if (!state.breadcrumb.find(entry => entry.id === breadcrumb.id)) {
                state.breadcrumb.push(breadcrumb);
            }
        }

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.libraryName);
        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No items found");
            return;
        }
        renderListCards(items, { showSeriesName: false });
    } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to load items");
    }
}

async function fetchAndRenderSeasons(options: {
    seriesId: string;
    seriesName: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    updateTitle(options.seriesName);
    showLoading();

    try {
        const [nextUpItem, seasons] = await Promise.all([
            loadNextUpForSeries(options.seriesId),
            fetchSeasons(options.seriesId)
        ]);

        state.currentSeries = { id: options.seriesId, name: options.seriesName };
        state.lastAction = () => fetchAndRenderSeasons({
            seriesId: options.seriesId,
            seriesName: options.seriesName,
            addBreadcrumb: false
        });

        if (options.addBreadcrumb) {
            state.breadcrumb.push({ type: "series", id: options.seriesId, name: options.seriesName });
        }

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.seriesName);
        hideLoading();
        if (seasons.length === 0 && !nextUpItem) {
            renderEmptyState("No seasons found");
            return;
        }
        renderSeriesOverview(nextUpItem, seasons);
    } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to load seasons");
    }
}

async function fetchAndRenderEpisodes(options: {
    seriesId: string;
    seasonId: string;
    seasonName: string;
    addBreadcrumb: boolean;
}): Promise<void> {
    updateTitle(options.seasonName);
    showLoading();

    try {
        const endpoint = buildEpisodesEndpoint(options.seriesId, options.seasonId);
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        const episodes = data.Items || [];

        state.currentSeason = { id: options.seasonId, name: options.seasonName };
        state.lastAction = () => fetchAndRenderEpisodes({
            seriesId: options.seriesId,
            seasonId: options.seasonId,
            seasonName: options.seasonName,
            addBreadcrumb: false
        });

        if (options.addBreadcrumb) {
            state.breadcrumb.push({
                type: "season",
                id: options.seasonId,
                seriesId: options.seriesId,
                name: options.seasonName
            });
        }

        updateTitle(state.breadcrumb[state.breadcrumb.length - 1]?.name || options.seasonName);
        hideLoading();
        if (episodes.length === 0) {
            renderEmptyState("No episodes found");
            return;
        }
        renderListCards(episodes, {
            showSeriesName: false,
            showEpisodeNumber: true,
            useEpisodeThumbnail: true
        });
    } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to load episodes");
    }
}

async function reloadItems(breadcrumb: { id: string; name: string; collectionType: string }): Promise<void> {
    await fetchAndRenderLibraryItems({
        libraryId: breadcrumb.id,
        libraryName: breadcrumb.name,
        collectionType: breadcrumb.collectionType,
        addBreadcrumb: false
    });
}

async function reloadSeasons(breadcrumb: { id: string; name: string }): Promise<void> {
    await fetchAndRenderSeasons({
        seriesId: breadcrumb.id,
        seriesName: breadcrumb.name,
        addBreadcrumb: false
    });
}

async function reloadEpisodes(breadcrumb: { id: string; name: string; seriesId: string }): Promise<void> {
    await fetchAndRenderEpisodes({
        seriesId: breadcrumb.seriesId,
        seasonId: breadcrumb.id,
        seasonName: breadcrumb.name,
        addBreadcrumb: false
    });
}

async function loadHome(): Promise<void> {
    state.breadcrumb = [];
    state.lastAction = loadHome;
    updateTitle("Home");
    showLoading();

    try {
        const [nextUpItems, recentMovies, recentEpisodes] = await Promise.all([
            loadHomeItems(5),
            loadLatestItems("Movie", 5),
            loadLatestItems("Episode", 5)
        ]);
        renderHomeSections(nextUpItems, recentMovies, recentEpisodes);
        hideLoading();
    } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to load items");
    }
}

async function loadHomeItems(limit: number = 5): Promise<JellyfinBaseItem[]> {
    const resumeItems = await loadResumeItems();
    const nextUpItems = await loadNextUpItems();
    const combined = mergeItems(resumeItems, nextUpItems);
    return combined.slice(0, limit);
}

async function loadLatestItems(itemType: string, limit: number): Promise<JellyfinBaseItem[]> {
    const endpoint = `/Users/${state.userId}/Items/Latest?IncludeItemTypes=${itemType}&Limit=${limit}` +
        `&Fields=${FIELDS_HOME_ITEMS}`;
    const data = await apiRequest<JellyfinBaseItem[]>("GET", endpoint);
    return (data || []).filter(item => isSupportedItem(item));
}

async function loadResumeItems(): Promise<JellyfinBaseItem[]> {
    const endpoint = `/Users/${state.userId}/Items/Resume?Limit=10&MediaTypes=Video` +
        `&Fields=${FIELDS_HOME_ITEMS}`;
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
    return (data.Items || []).filter(item => isSupportedItem(item));
}

async function loadNextUpItems(): Promise<JellyfinBaseItem[]> {
    const endpoint = `/Shows/NextUp?UserId=${state.userId}&Limit=10&Fields=${FIELDS_HOME_ITEMS}`;
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
    return (data.Items || []).filter(item => isSupportedItem(item));
}

function mergeItems(primary: JellyfinBaseItem[], secondary: JellyfinBaseItem[]): JellyfinBaseItem[] {
    const seen = new Set<string>();
    const combined: JellyfinBaseItem[] = [];

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

function isSupportedItem(item: JellyfinBaseItem | null | undefined): boolean {
    return Boolean(item && (item.Type === "Movie" || item.Type === "Episode" || item.Type === "Series"));
}

function getSearchEndpoint(query: string): string {
    return `/Items?SearchTerm=${encodeURIComponent(query)}` +
        `&UserId=${state.userId}` +
        "&IncludeItemTypes=Movie,Series,Episode" +
        `&Fields=${FIELDS_SEARCH}` +
        "&Recursive=true&Limit=20&SortBy=SortName&SortOrder=Ascending";
}

async function loadItems(libraryId: string, libraryName: string, collectionType: string): Promise<void> {
    await fetchAndRenderLibraryItems({
        libraryId,
        libraryName,
        collectionType,
        addBreadcrumb: true
    });
}

async function loadSeasons(seriesId: string, seriesName: string): Promise<void> {
    await fetchAndRenderSeasons({
        seriesId,
        seriesName,
        addBreadcrumb: true
    });
}

async function loadEpisodes(seriesId: string, seasonId: string, seasonName: string): Promise<void> {
    await fetchAndRenderEpisodes({
        seriesId,
        seasonId,
        seasonName,
        addBreadcrumb: true
    });
}

async function performSearch(query: string): Promise<void> {
    state.lastAction = () => performSearch(query);
    updateTitle("Search Results");
    showLoading();

    try {
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", getSearchEndpoint(query));
        const items = (data.Items || []).filter(item => isSupportedItem(item));

        hideLoading();
        if (items.length === 0) {
            renderEmptyState("No results found");
            return;
        }
        renderSearchResults(items);
    } catch (error) {
        showError(error instanceof Error ? error.message : "Failed to search");
    }
}

async function fetchSeasons(seriesId: string): Promise<JellyfinBaseItem[]> {
    const endpoint = `/Shows/${seriesId}/Seasons?UserId=${state.userId}&Fields=${FIELDS_SEASONS}`;
    const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
    return data.Items || [];
}

async function loadNextUpForSeries(seriesId: string): Promise<JellyfinBaseItem | null> {
    try {
        const endpoint = `/Shows/NextUp?UserId=${state.userId}&SeriesId=${seriesId}&Limit=1&Fields=${FIELDS_HOME_ITEMS}`;
        const data = await apiRequest<{ Items?: JellyfinBaseItem[] }>("GET", endpoint);
        const items = (data.Items || []).filter(item => item.Type === "Episode");
        return items[0] || null;
    } catch (error) {
        console.warn("Failed to load series next up:", error instanceof Error ? error.message : error);
        return null;
    }
}

function sendAuthUpdated(): void {
    if (!state.serverUrl || !state.accessToken || !state.userId) {
        return;
    }

    iina.postMessage(MESSAGE_NAMES.AuthUpdated, {
        serverUrl: state.serverUrl,
        accessToken: state.accessToken,
        userId: state.userId,
        username: state.username,
        deviceId: state.deviceId,
        serverName: state.serverName
    });
}

function sendAuthCleared(): void {
    iina.postMessage(MESSAGE_NAMES.AuthCleared, {});
}

iina.onMessage(MESSAGE_NAMES.RefreshSidebar, () => {
    if (!sidebarReady) {
        pendingSidebarRefresh = true;
        return;
    }
    if (!state.accessToken || !state.userId) {
        return;
    }
    pendingSidebarRefresh = false;
    goHomeFresh("refreshSidebar");
});
