import { MESSAGE_NAMES } from "../../shared/messages";
import { state } from "../state";
import { getDeviceId } from "../storage";
import { setupEventListeners } from "./events";
import { goHomeFresh } from "./navigation";
import { restoreSessionFromStorage } from "./session";

export function initSidebar(): void {
    let sidebarReady = false;
    let pendingSidebarRefresh = false;

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

    document.addEventListener("DOMContentLoaded", () => {
        setupEventListeners();
        state.deviceId = getDeviceId();

        const restored = restoreSessionFromStorage();
        if (restored) {
            goHomeFresh("session-restore");
        }

        sidebarReady = true;
        if (pendingSidebarRefresh) {
            if (state.accessToken && state.userId) {
                goHomeFresh("pending");
            }
            pendingSidebarRefresh = false;
        }
    });
}
