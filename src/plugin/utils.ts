export function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

export function isHttpsUrl(url: string): boolean {
    return url.trim().toLowerCase().startsWith("https://");
}

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

export function parseEpisodeIndex(value: string | undefined | null): number | null {
    if (value === undefined || value === null || value === "") {
        return null;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isNaN(parsed) ? null : parsed;
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
