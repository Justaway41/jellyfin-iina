const DEVICE_ID_KEY = "jellyfin-device-id";
const SESSION_KEY = "jellyfin-session";

export interface StoredSession {
    serverUrl: string;
    serverName: string;
    accessToken: string;
    userId: string;
    username: string;
    savedAt: number;
}

let cachedDeviceId = "";

export function getDeviceId(): string {
    if (cachedDeviceId) {
        return cachedDeviceId;
    }

    let deviceId = localStorage.getItem(DEVICE_ID_KEY);
    if (!deviceId) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        deviceId = "iina-jellyfin-";
        for (let i = 0; i < 16; i += 1) {
            deviceId += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }

    cachedDeviceId = deviceId;
    return deviceId;
}

export function saveSessionToStorage(session: StoredSession): void {
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function loadSessionFromStorage(): StoredSession | null {
    try {
        const stored = localStorage.getItem(SESSION_KEY);
        if (!stored) {
            return null;
        }
        const sessionData = JSON.parse(stored) as StoredSession;
        if (sessionData.serverUrl && sessionData.accessToken && sessionData.userId) {
            return sessionData;
        }
    } catch (error) {
        console.error("Failed to load session from localStorage:", error);
    }
    return null;
}

export function clearSessionFromStorage(): void {
    localStorage.removeItem(SESSION_KEY);
}
