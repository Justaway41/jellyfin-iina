import type { JellyfinBaseItem } from "./jellyfin";

export interface StreamUrlOptions {
    serverUrl: string;
    accessToken: string;
    deviceId: string;
    userId: string;
    itemId: string;
    runtimeTicks: number;
    mediaSourceId?: string;
    playSessionId?: string;
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
}

const EPISODE_TITLE_SEPARATOR = " \u2022 ";

export function buildJellyfinStreamUrl(options: StreamUrlOptions): string {
    if (!options.serverUrl || !options.itemId) {
        return "";
    }

    const baseUrl = normalizeServerUrl(options.serverUrl);
    const mediaSourceId = options.mediaSourceId || options.itemId;

    const params: Record<string, string | number | boolean> = {
        Static: "true",
        mediaSourceId: mediaSourceId,
        playSessionId: options.playSessionId || "",
        api_key: options.accessToken,
        _jf_itemId: options.itemId,
        _jf_runtimeTicks: options.runtimeTicks || 0,
        _jf_deviceId: options.deviceId,
        _jf_userId: options.userId
    };

    if (options.seriesId) {
        params._jf_seriesId = options.seriesId;
    }
    if (options.seasonId) {
        params._jf_seasonId = options.seasonId;
    }
    if (options.episodeIndex !== undefined && options.episodeIndex !== null) {
        params._jf_episodeIndex = options.episodeIndex;
    }

    const queryString = buildQueryString(params);
    return `${baseUrl}/Videos/${options.itemId}/stream?${queryString}`;
}

export function buildJellyfinWindowTitle(item: JellyfinBaseItem | null, fallbackName: string): string {
    if (!item) {
        return fallbackName || "";
    }

    const name = item.Name || fallbackName || "";
    const type = item.Type;

    if (type === "Episode") {
        const seriesName = item.SeriesName || "";
        const seasonNumber = item.ParentIndexNumber;
        const episodeNumber = item.IndexNumber;
        const seasonLabel = seasonNumber !== null && seasonNumber !== undefined
            ? String(seasonNumber).padStart(2, "0")
            : "00";
        const episodeLabel = episodeNumber !== null && episodeNumber !== undefined
            ? String(episodeNumber).padStart(2, "0")
            : "00";
        const titleParts = [seriesName, `S${seasonLabel}E${episodeLabel}`];
        if (name) {
            titleParts.push(name);
        }
        return titleParts.filter(Boolean).join(EPISODE_TITLE_SEPARATOR);
    }

    if (type === "Movie") {
        const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
        return `${name}${year}`;
    }

    return name;
}


function normalizeServerUrl(url: string): string {
    return url.trim().replace(/\/+$/, "");
}

function buildQueryString(params: Record<string, string | number | boolean>): string {
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
