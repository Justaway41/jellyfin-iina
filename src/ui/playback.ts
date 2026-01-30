import type { JellyfinBaseItem } from "../shared/jellyfin";

import { MESSAGE_NAMES } from "../shared/messages";
import { TICKS_PER_SECOND } from "./constants";
import { fetchItemDetails, fetchPlaybackInfo } from "./api";
import { state } from "./state";
import { getDeviceId } from "./storage";

export interface PlaybackContext {
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
}

function buildStreamUrl(
    item: { Id: string; RunTimeTicks?: number | null },
    context: {
        playSessionId: string;
        mediaSourceId: string;
        runtimeTicks: number;
        seriesId?: string;
        seasonId?: string;
        episodeIndex?: number | null;
    }
): string {
    if (!item || !state.serverUrl) {
        return "";
    }

    const itemId = item.Id;
    const runtimeTicks = item.RunTimeTicks || context.runtimeTicks || 0;
    const mediaSourceId = context.mediaSourceId || itemId;

    const urlParams = new URLSearchParams({
        Static: "true",
        mediaSourceId: mediaSourceId,
        playSessionId: context.playSessionId || "",
        api_key: state.accessToken,
        _jf_itemId: itemId,
        _jf_runtimeTicks: runtimeTicks.toString(),
        _jf_deviceId: getDeviceId(),
        _jf_userId: state.userId
    });

    if (context.seriesId) {
        urlParams.set("_jf_seriesId", context.seriesId);
    }
    if (context.seasonId) {
        urlParams.set("_jf_seasonId", context.seasonId);
    }
    if (context.episodeIndex !== undefined && context.episodeIndex !== null) {
        urlParams.set("_jf_episodeIndex", String(context.episodeIndex));
    }

    return `${state.serverUrl}/Videos/${itemId}/stream?${urlParams.toString()}`;
}

function buildWindowTitle(item: JellyfinBaseItem | null, fallbackName: string): string {
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
        return titleParts.filter(Boolean).join(" - ");
    }

    if (type === "Movie") {
        const year = item.ProductionYear ? ` (${item.ProductionYear})` : "";
        return `${name}${year}`;
    }

    return name;
}

function openInIINA(url: string, resumeSeconds: number = 0, title: string = ""): void {
    iina.postMessage(MESSAGE_NAMES.PlayItem, { url, resumeSeconds, title });
}

export async function playItem(
    itemId: string,
    name: string,
    resumePositionTicks: number = 0,
    context: PlaybackContext = {},
    preferredTitle: string = ""
): Promise<void> {
    try {
        const playbackInfo = await fetchPlaybackInfo(itemId);
        const playSessionId = playbackInfo?.PlaySessionId || "";
        const mediaSource = playbackInfo?.MediaSources?.[0];
        const mediaSourceId = mediaSource?.Id || itemId;
        const runtimeTicks = mediaSource?.RunTimeTicks || 0;
        const itemDetails = await fetchItemDetails(itemId);
        const windowTitle = preferredTitle || buildWindowTitle(itemDetails, name);

        const resolvedContext = {
            seriesId: context.seriesId || itemDetails?.SeriesId || "",
            seasonId: context.seasonId || itemDetails?.SeasonId || itemDetails?.ParentId || "",
            episodeIndex: context.episodeIndex !== undefined && context.episodeIndex !== null
                ? context.episodeIndex
                : itemDetails?.IndexNumber
        };

        const streamUrl = buildStreamUrl({
            Id: itemId,
            RunTimeTicks: runtimeTicks
        }, {
            playSessionId: playSessionId,
            mediaSourceId: mediaSourceId,
            runtimeTicks: runtimeTicks,
            seriesId: resolvedContext.seriesId,
            seasonId: resolvedContext.seasonId,
            episodeIndex: resolvedContext.episodeIndex
        });

        const resumeSeconds = resumePositionTicks > 0
            ? Math.floor(resumePositionTicks / TICKS_PER_SECOND)
            : 0;

        openInIINA(streamUrl, resumeSeconds, windowTitle || name);
    } catch (error) {
        console.error("Failed to get playback info:", error);
        const streamUrl = `${state.serverUrl}/Items/${itemId}/Download?api_key=${state.accessToken}`;
        const resumeSeconds = resumePositionTicks > 0
            ? Math.floor(resumePositionTicks / TICKS_PER_SECOND)
            : 0;

        openInIINA(streamUrl, resumeSeconds);
    }
}
