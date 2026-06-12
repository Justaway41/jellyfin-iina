import type { AuthUpdatedPayload, PlayItemPayload } from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";
import {
    PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY,
    SHOW_SIDEBAR_DELAY_MS
} from "./constants";
import { handlePlayItem, initializePlaybackHandlers } from "./playback";
import { clearAuthState, updateAuthState } from "./state";
import { isSupportedServerUrl, logDebug, normalizeServerUrl } from "./utils";

const { console, core, event, global, preferences, sidebar, utils } = iina;

logDebug("Jellyfin: Plugin loaded");

let windowReady = false;
let pendingShowSidebar = false;
let sidebarVisible = false;

function getSidebarVisibility(): boolean {
    const sidebarWithVisibility = sidebar as typeof sidebar & { isVisible?: () => boolean };
    if (typeof sidebarWithVisibility.isVisible === "function") {
        return sidebarWithVisibility.isVisible();
    }

    try {
        const currentSidebar = core.window.sidebar;
        if (currentSidebar !== undefined) {
            return typeof currentSidebar === "string" && currentSidebar.includes("jellyfin");
        }
    } catch (error) {
        logDebug("Jellyfin: Failed to read window sidebar state:", error);
    }

    return sidebarVisible;
}

function showSidebarWithNotification(): void {
    sidebar.show();
    sidebarVisible = true;
    global.postMessage("sidebarShown", {});
}

function showSidebarWithDelay(): void {
    setTimeout(() => {
        showSidebarWithNotification();
    }, SHOW_SIDEBAR_DELAY_MS);
}

function hideSidebar(): void {
    sidebar.hide();
    sidebarVisible = false;
}

function showInvalidUrlAlert(): void {
    utils.ask("Jellyfin server URL must start with http:// or https://.");
}

function getPreferEpisodeImagesInNextUp(): boolean {
    const value = preferences.get(PREFER_EPISODE_IMAGES_IN_NEXT_UP_PREF_KEY);
    return Boolean(value);
}

function postSidebarPreferences(): void {
    sidebar.postMessage(MESSAGE_NAMES.SidebarPreferences, {
        preferEpisodeImagesInNextUp: getPreferEpisodeImagesInNextUp()
    });
}

function toggleSidebarFromHotkey(): void {
    if (!windowReady) {
        pendingShowSidebar = true;
        return;
    }

    if (getSidebarVisibility()) {
        logDebug("Jellyfin: Sidebar already open, hiding it");
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

global.onMessage("showJellyfinSidebar", () => {
    logDebug("Jellyfin: Received showJellyfinSidebar message");
    toggleSidebarFromHotkey();
});

initializePlaybackHandlers({
    showSidebar: showSidebarWithNotification,
    refreshSidebar: () => {
        sidebar.postMessage(MESSAGE_NAMES.RefreshSidebar, {});
    }
});

event.on("iina.window-loaded", () => {
    logDebug("Jellyfin: Window loaded");

    sidebar.loadFile("ui/sidebar.html");

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        logDebug("Jellyfin: Received playItem");
        handlePlayItem(data, {
            hideSidebar: hideSidebar,
            showInvalidUrlAlert: showInvalidUrlAlert
        });
    });

    sidebar.onMessage(MESSAGE_NAMES.AuthUpdated, (data: AuthUpdatedPayload) => {
        if (!data || !data.serverUrl) {
            return;
        }
        const normalizedUrl = normalizeServerUrl(data.serverUrl);
        if (!isSupportedServerUrl(normalizedUrl)) {
            showInvalidUrlAlert();
            return;
        }
        updateAuthState({
            ...data,
            serverUrl: normalizedUrl
        });
        postSidebarPreferences();
    });

    sidebar.onMessage(MESSAGE_NAMES.AuthCleared, () => {
        clearAuthState();
    });

    windowReady = true;

    global.postMessage("playerReady", {});

    event.on("iina.window-will-close", () => {
        logDebug("Jellyfin: Window closing, notifying global entry");
        global.postMessage("playerClosed", {});
    });

    if (pendingShowSidebar) {
        logDebug("Jellyfin: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    logDebug("Jellyfin: Ready");
});
