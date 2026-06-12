import { DEBUG_LOGS, JELLYFIN_SPLASH_CANDIDATES } from "./constants";

const { console } = iina;

export function getSplashUrl(): string {
    const { file } = iina;
    for (const candidate of JELLYFIN_SPLASH_CANDIDATES) {
        try {
            if (file.exists(candidate)) {
                return candidate;
            }
        } catch (error) {
            logDebug("Jellyfin: Splash existence check failed:", error);
        }
    }
    return JELLYFIN_SPLASH_CANDIDATES[0];
}

// The splash file's Finder icon doubles as the window's title-bar proxy icon.
// Set it to the Jellyfin logo via NSWorkspace (osascript ObjC bridge) so the
// title bar doesn't show a blank document icon. Idempotent; runs per launch.
export function applySplashIcon(): void {
    const { utils } = iina;
    const splashPath = getSplashUrl();
    const iconPath = splashPath.replace("/assets/Jellyfin", "/ui/assets/jellyfin-icon.png");
    const lines = [
        'use framework "AppKit"',
        `set iconPath to (current application's NSString's stringWithString:"${iconPath}")'s stringByExpandingTildeInPath()`,
        `set filePath to (current application's NSString's stringWithString:"${splashPath}")'s stringByExpandingTildeInPath()`,
        "set img to current application's NSImage's alloc()'s initWithContentsOfFile:iconPath",
        "current application's NSWorkspace's sharedWorkspace()'s setIcon:img forFile:filePath options:0"
    ];
    const args = ["-l", "AppleScript"];
    for (const line of lines) {
        args.push("-e", line);
    }
    utils.exec("osascript", args)
        .then((result) => {
            if (result.status !== 0) {
                logDebug("Jellyfin: Splash icon script failed:", result.stderr);
            }
        })
        .catch((error) => {
            logDebug("Jellyfin: Splash icon exec failed:", error);
        });
}

export function logDebug(...args: unknown[]): void {
    if (DEBUG_LOGS) {
        console.log(...args);
    }
}

export function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

export { isSupportedServerUrl } from "../shared/url";

export function parseUrlParams(url: string): Record<string, string> {
    const params: Record<string, string> = {};
    const queryStart = url.indexOf("?");
    if (queryStart === -1) {
        return params;
    }

    const queryString = url.substring(queryStart + 1);
    const pairs = queryString.split("&");
    for (const pair of pairs) {
        const eqIndex = pair.indexOf("=");
        if (eqIndex > 0) {
            const key = decodeURIComponent(pair.substring(0, eqIndex));
            const value = decodeURIComponent(pair.substring(eqIndex + 1));
            params[key] = value;
        }
    }
    return params;
}

export function getUrlOrigin(url: string): string {
    const schemeEnd = url.indexOf("://");
    if (schemeEnd === -1) {
        return "";
    }

    const hostStart = schemeEnd + 3;
    const pathStart = url.indexOf("/", hostStart);
    if (pathStart === -1) {
        return url;
    }
    return url.substring(0, pathStart);
}

const SENSITIVE_QUERY_KEYS = new Set([
    "api_key",
    "access_token",
    "token",
    "x-emby-token"
]);

export function redactUrlForLog(url: string, maxLength: number = 120): string {
    if (!url) {
        return "";
    }

    const queryIndex = url.indexOf("?");
    if (queryIndex === -1) {
        return truncateLogValue(url, maxLength);
    }

    const base = url.substring(0, queryIndex);
    const query = url.substring(queryIndex + 1);
    const parts = query.split("&");
    const redactedParts = parts.map((part) => {
        const eqIndex = part.indexOf("=");
        if (eqIndex === -1) {
            return part;
        }
        const key = part.substring(0, eqIndex);
        if (isSensitiveQueryKey(key)) {
            return `${key}=REDACTED`;
        }
        return part;
    });

    return truncateLogValue(`${base}?${redactedParts.join("&")}`, maxLength);
}

export function parseEpisodeIndex(value: string | undefined | null): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
}

function isSensitiveQueryKey(key: string): boolean {
    const normalizedKey = normalizeQueryKey(key);
    return SENSITIVE_QUERY_KEYS.has(normalizedKey);
}

function normalizeQueryKey(key: string): string {
    const trimmedKey = key.trim();
    if (!trimmedKey) {
        return "";
    }
    try {
        return decodeURIComponent(trimmedKey).trim().toLowerCase();
    } catch (error) {
        return trimmedKey.toLowerCase();
    }
}

export function sanitizeMediaTitle(title: string): string {
    return String(title).replace(/[\n\r,=]/g, " ");
}

export function formatError(error: unknown): string {
    if (error instanceof Error) {
        return error.message;
    }
    return String(error);
}

function truncateLogValue(value: string, maxLength: number): string {
    if (maxLength <= 0 || value.length <= maxLength) {
        return value;
    }
    return `${value.substring(0, maxLength)}...`;
}

export function buildQueryString(
    params: Record<string, string | number | boolean | null | undefined>
): string {
    const parts: string[] = [];
    Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value === undefined || value === null) {
            return;
        }
        parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`);
    });
    return parts.join("&");
}
