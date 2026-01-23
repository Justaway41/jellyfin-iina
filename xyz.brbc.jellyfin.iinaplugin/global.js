// IINA Jellyfin Plugin - global.js
// Global entry point - runs when IINA starts, before any player window opens

const { menu, global, console } = iina;

console.log('Jellyfin: Global entry loaded');

// Track active player instances
let activePlayerId = null;
let pendingShowSidebar = false;
let pendingPlayerId = null;

const SPLASH_URL = '~/Library/Application Support/com.colliderli.iina/plugins/xyz.brbc.jellyfin.iinaplugin/assets/Jellyfin.png';

// Listen for player registration
global.onMessage('playerReady', (data, playerId) => {
    console.log('Jellyfin: Player registered:', playerId);
    activePlayerId = playerId;

    if (pendingShowSidebar && pendingPlayerId === playerId) {
        console.log('Jellyfin: Sending pending showSidebar to:', playerId);
        global.postMessage(playerId, 'showJellyfinSidebar', {});
        pendingShowSidebar = false;
        pendingPlayerId = null;
    }
});

// Listen for sidebar shown confirmation
global.onMessage('sidebarShown', (data, playerId) => {
    console.log('Jellyfin: Sidebar shown in player:', playerId);
});

async function handleMenuAction() {
    console.log('Jellyfin: Menu item clicked, activePlayerId =', activePlayerId);

    // First, try to show sidebar in existing player
    if (activePlayerId !== null) {
        console.log('Jellyfin: Sending showSidebar to existing player:', activePlayerId);
        global.postMessage(activePlayerId, 'showJellyfinSidebar', {});
        return;
    }

    // No active player, create one with splash image
    console.log('Jellyfin: No active player, creating with splash image');

    const playerId = global.createPlayerInstance({
        url: SPLASH_URL,
        enablePlugins: true
    });

    console.log('Jellyfin: Created player instance:', playerId);

    activePlayerId = playerId;
    pendingShowSidebar = true;
    pendingPlayerId = playerId;

    // Also broadcast to any player that might be opening without reporting yet
    global.postMessage(null, 'showJellyfinSidebar', {});
}

// Add menu item with Shift+J hotkey
const menuItem = menu.item('Jellyfin', () => {
    handleMenuAction().catch((err) => {
        console.error('Jellyfin: Error in menu handler:', err);
    });
}, { keyBinding: 'Shift+J' });
menu.addItem(menuItem);
console.log('Jellyfin: Menu item registered (Shift+J)');
