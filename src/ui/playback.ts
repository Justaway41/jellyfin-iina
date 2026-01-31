import { MESSAGE_NAMES } from "../shared/messages";
import { buildJellyfinStreamUrl, buildJellyfinWindowTitle } from "../shared/playback";
import { TICKS_PER_SECOND } from "./constants";
import { fetchItemDetails, fetchPlaybackInfo } from "./api";
import { state } from "./state";
import { getDeviceId } from "./storage";

export interface PlaybackContext {
    seriesId?: string;
    seasonId?: string;
    episodeIndex?: number | null;
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
        if (!playbackInfo) {
            throw new Error("Missing playback info");
        }
        const playSessionId = playbackInfo?.PlaySessionId || "";
        const mediaSource = playbackInfo?.MediaSources?.[0];
        const mediaSourceId = mediaSource?.Id || itemId;
        const runtimeTicks = mediaSource?.RunTimeTicks || 0;
        const itemDetails = await fetchItemDetails(itemId);
        const windowTitle = preferredTitle || buildJellyfinWindowTitle(itemDetails, name);

        const resolvedContext = {
            seriesId: context.seriesId || itemDetails?.SeriesId || "",
            seasonId: context.seasonId || itemDetails?.SeasonId || itemDetails?.ParentId || "",
            episodeIndex: context.episodeIndex !== undefined && context.episodeIndex !== null
                ? context.episodeIndex
                : itemDetails?.IndexNumber
        };

        const streamUrl = buildJellyfinStreamUrl({
            serverUrl: state.serverUrl,
            accessToken: state.accessToken,
            deviceId: getDeviceId(),
            userId: state.userId,
            itemId: itemId,
            runtimeTicks: runtimeTicks,
            mediaSourceId: mediaSourceId,
            playSessionId: playSessionId,
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
