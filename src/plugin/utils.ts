export function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

export { isHttpsUrl } from "../shared/url";

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
