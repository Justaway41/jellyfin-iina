import { JELLYFIN_SPLASH_URL } from "./constants";

const { console, global, menu } = iina;

console.log("Jellyfin: Global entry loaded");

let activePlayerId: number | string | null = null;
let pendingShowSidebar = false;
let pendingPlayerId: number | string | null = null;

global.onMessage("playerReady", (data, playerId) => {
    const resolvedPlayerId = playerId ?? null;
    console.log("Jellyfin: Player registered:", resolvedPlayerId);
    if (resolvedPlayerId === null) {
        return;
    }
    activePlayerId = resolvedPlayerId;

    if (pendingShowSidebar && pendingPlayerId !== null && String(pendingPlayerId) === String(resolvedPlayerId)) {
        console.log("Jellyfin: Sending pending showSidebar to:", resolvedPlayerId);
        global.postMessage(resolvedPlayerId, "showJellyfinSidebar", {});
        pendingShowSidebar = false;
        pendingPlayerId = null;
    }
});

global.onMessage("sidebarShown", (data, playerId) => {
    console.log("Jellyfin: Sidebar shown in player:", playerId);
});

async function handleMenuAction(): Promise<void> {
    console.log("Jellyfin: Menu item clicked, activePlayerId =", activePlayerId);

    if (activePlayerId !== null) {
        console.log("Jellyfin: Sending showSidebar to existing player:", activePlayerId);
        global.postMessage(activePlayerId, "showJellyfinSidebar", {});
        return;
    }

    console.log("Jellyfin: No active player, creating with splash image");

    const playerId = global.createPlayerInstance({
        url: JELLYFIN_SPLASH_URL,
        enablePlugins: true
    });

    console.log("Jellyfin: Created player instance:", playerId);

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
console.log("Jellyfin: Menu item registered (Shift+J)");
