import { applySplashIcon, getSplashUrl, logDebug } from "./utils";

const { console, global, menu } = iina;

logDebug("Jellyfin: Global entry loaded");
applySplashIcon();

let activePlayerId: number | string | null = null;

// createPlayerInstance returns a bare counter ("1") while message callbacks
// receive the player label ("1-<plugin id>"); compare on the counter part.
function playerIdsMatch(a: number | string, b: number | string): boolean {
    return String(a).split("-")[0] === String(b).split("-")[0];
}

global.onMessage("playerReady", (data, playerId) => {
    const resolvedPlayerId = playerId ?? null;
    logDebug("Jellyfin: Player registered:", resolvedPlayerId);
    if (resolvedPlayerId === null) {
        return;
    }
    activePlayerId = resolvedPlayerId;
});

global.onMessage("sidebarShown", (data, playerId) => {
    logDebug("Jellyfin: Sidebar shown in player:", playerId);
});

global.onMessage("playerClosed", (data, playerId) => {
    logDebug("Jellyfin: Player closed:", playerId);
    if (playerId === undefined || playerId === null) {
        return;
    }
    if (activePlayerId !== null && playerIdsMatch(playerId, activePlayerId)) {
        activePlayerId = null;
    }
});

async function handleMenuAction(): Promise<void> {
    logDebug("Jellyfin: Menu item clicked, activePlayerId =", activePlayerId);

    if (activePlayerId !== null) {
        logDebug("Jellyfin: Sending showSidebar to existing player:", activePlayerId);
        global.postMessage(activePlayerId, "showJellyfinSidebar", {});
        return;
    }

    logDebug("Jellyfin: No active player, creating with splash image");

    // disableUI hides the on-screen controls from the first frame; the main
    // entry re-enables them once real media loads (setPlayerUIHidden(false)).
    const playerId = global.createPlayerInstance({
        url: getSplashUrl(),
        enablePlugins: true,
        disableUI: true
    });

    logDebug("Jellyfin: Created player instance:", playerId);

    activePlayerId = playerId;
    // No explicit show message needed: the splash file load triggers the
    // sidebar via the file-loaded handler in the player's main entry.
}

const menuItem = menu.item(
    "Jellyfin",
    () => {
        handleMenuAction().catch((error) => {
            console.error(`Jellyfin: Error in menu handler: ${error instanceof Error ? error.message : String(error)}`);
        });
    },
    { keyBinding: "Shift+j" }
);
menu.addItem(menuItem);
logDebug("Jellyfin: Menu item registered (Shift+J)");
