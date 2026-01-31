import { JELLYFIN_SPLASH_URL } from "./constants";
import { logDebug } from "./utils";

const { console, global, menu } = iina;

logDebug("Jellyfin: Global entry loaded");

let activePlayerId: number | string | null = null;
let pendingShowSidebar = false;
let pendingPlayerId: number | string | null = null;

global.onMessage("playerReady", (data, playerId) => {
    const resolvedPlayerId = playerId ?? null;
    logDebug("Jellyfin: Player registered:", resolvedPlayerId);
    if (resolvedPlayerId === null) {
        return;
    }
    activePlayerId = resolvedPlayerId;

    if (pendingShowSidebar && pendingPlayerId !== null && String(pendingPlayerId) === String(resolvedPlayerId)) {
        logDebug("Jellyfin: Sending pending showSidebar to:", resolvedPlayerId);
        global.postMessage(resolvedPlayerId, "showJellyfinSidebar", {});
        pendingShowSidebar = false;
        pendingPlayerId = null;
    }
});

global.onMessage("sidebarShown", (data, playerId) => {
    logDebug("Jellyfin: Sidebar shown in player:", playerId);
});

async function handleMenuAction(): Promise<void> {
    logDebug("Jellyfin: Menu item clicked, activePlayerId =", activePlayerId);

    if (activePlayerId !== null) {
        logDebug("Jellyfin: Sending showSidebar to existing player:", activePlayerId);
        global.postMessage(activePlayerId, "showJellyfinSidebar", {});
        return;
    }

    logDebug("Jellyfin: No active player, creating with splash image");

    const playerId = global.createPlayerInstance({
        url: JELLYFIN_SPLASH_URL,
        enablePlugins: true
    });

    logDebug("Jellyfin: Created player instance:", playerId);

    activePlayerId = playerId;
    pendingShowSidebar = true;
    pendingPlayerId = playerId;

    global.postMessage(null, "showJellyfinSidebar", {});
}

const menuItem = menu.item(
    "Jellyfin",
    () => {
        handleMenuAction().catch((error) => {
            console.error(`Jellyfin: Error in menu handler: ${error instanceof Error ? error.message : String(error)}`);
        });
    },
    { keyBinding: "Shift+J" }
);
menu.addItem(menuItem);
logDebug("Jellyfin: Menu item registered (Shift+J)");
