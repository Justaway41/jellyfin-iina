import type { AuthUpdatedPayload, PlayItemPayload } from "../shared/messages";

import { MESSAGE_NAMES } from "../shared/messages";
import { SHOW_SIDEBAR_DELAY_MS } from "./constants";
import { handlePlayItem, initializePlaybackHandlers } from "./playback";
import { clearAuthState, updateAuthState } from "./state";
import { isHttpsUrl, normalizeServerUrl } from "./utils";

const { console, event, global, sidebar, utils } = iina;

console.log("Jellyfin: Plugin loaded");

let windowReady = false;
let pendingShowSidebar = false;
let sidebarVisible = false;

function getSidebarVisibility(): boolean {
    const sidebarWithVisibility = sidebar as typeof sidebar & { isVisible?: () => boolean };
    if (typeof sidebarWithVisibility.isVisible === "function") {
        return sidebarWithVisibility.isVisible();
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

function showHttpsAlert(): void {
    utils.ask("Jellyfin requires an https:// server URL. HTTP is not supported.");
}

function toggleSidebarFromHotkey(): void {
    if (!windowReady) {
        pendingShowSidebar = true;
        return;
    }

    if (getSidebarVisibility()) {
        console.log("Jellyfin: Sidebar already open, hiding it");
        hideSidebar();
        return;
    }

    showSidebarWithDelay();
}

global.onMessage("showJellyfinSidebar", () => {
    console.log("Jellyfin: Received showJellyfinSidebar message");
    toggleSidebarFromHotkey();
});

initializePlaybackHandlers({
    showSidebar: showSidebarWithNotification,
    refreshSidebar: () => {
        sidebar.postMessage(MESSAGE_NAMES.RefreshSidebar, {});
    }
});

event.on("iina.window-loaded", () => {
    console.log("Jellyfin: Window loaded");

    sidebar.loadFile("ui/sidebar.html");

    sidebar.onMessage(MESSAGE_NAMES.PlayItem, (data: PlayItemPayload) => {
        console.log("Jellyfin: Received playItem");
        handlePlayItem(data, {
            hideSidebar: hideSidebar,
            showHttpsAlert: showHttpsAlert
        });
    });

    sidebar.onMessage(MESSAGE_NAMES.AuthUpdated, (data: AuthUpdatedPayload) => {
        if (!data || !data.serverUrl) {
            return;
        }
        const normalizedUrl = normalizeServerUrl(data.serverUrl);
        if (!isHttpsUrl(normalizedUrl)) {
            showHttpsAlert();
            return;
        }
        updateAuthState({
            ...data,
            serverUrl: normalizedUrl
        });
    });

    sidebar.onMessage(MESSAGE_NAMES.AuthCleared, () => {
        clearAuthState();
    });

    windowReady = true;

    global.postMessage("playerReady", {});

    if (pendingShowSidebar) {
        console.log("Jellyfin: Showing sidebar (pending request)");
        showSidebarWithDelay();
        pendingShowSidebar = false;
    }

    console.log("Jellyfin: Ready");
});
