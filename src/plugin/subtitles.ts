import type { JellyfinMediaStream, JellyfinPlaybackInfoResponse } from "../shared/jellyfin";
import type { PlaybackState } from "./state";

import { IINA_DEVICE_PROFILE } from "../shared/deviceProfile";
import { requestJson } from "./http";
import { getCurrentPlayback } from "./state";
import { formatError, logDebug } from "./utils";

const { console, mpv } = iina;

export async function loadExternalSubtitles(playback: PlaybackState): Promise<void> {
    try {
        const response = await requestJson<JellyfinPlaybackInfoResponse>(
            {
                serverUrl: playback.serverUrl,
                accessToken: playback.accessToken,
                deviceId: playback.deviceId
            },
            {
                method: "POST",
                endpoint: `/Items/${playback.itemId}/PlaybackInfo`,
                query: { UserId: playback.userId || undefined },
                body: { DeviceProfile: IINA_DEVICE_PROFILE }
            }
        );

        const mediaSources = response?.MediaSources || [];
        const mediaSource = mediaSources.find((source) => source.Id === playback.mediaSourceId)
            || mediaSources[0];
        const streams = mediaSource?.MediaStreams || [];
        const externalSubtitles = streams.filter(isExternalSubtitleStream);

        if (externalSubtitles.length === 0) {
            logDebug("Jellyfin: No external subtitles for item", playback.itemId);
            return;
        }

        const current = getCurrentPlayback();
        if (!current || current.playSessionId !== playback.playSessionId) {
            logDebug("Jellyfin: Playback changed, skipping external subtitles");
            return;
        }

        for (const stream of externalSubtitles) {
            addSubtitle(playback, stream);
        }
    } catch (error) {
        console.error(`Jellyfin: Failed to load external subtitles: ${formatError(error)}`);
    }
}

function isExternalSubtitleStream(stream: JellyfinMediaStream): boolean {
    return stream.Type === "Subtitle"
        && stream.IsExternal === true
        && stream.DeliveryMethod === "External"
        && Boolean(stream.DeliveryUrl);
}

function addSubtitle(playback: PlaybackState, stream: JellyfinMediaStream): void {
    const url = buildSubtitleUrl(playback, stream);
    if (!url) {
        return;
    }

    const title = stream.DisplayTitle || stream.Title || stream.Language || "External subtitle";
    const flag = stream.IsDefault || stream.IsForced ? "select" : "auto";
    const args = [url, flag, title];
    if (stream.Language) {
        args.push(stream.Language);
    }

    try {
        mpv.command("sub-add", args);
        logDebug("Jellyfin: Added external subtitle:", title);
    } catch (error) {
        console.error(`Jellyfin: Failed to add subtitle "${title}": ${formatError(error)}`);
    }
}

function buildSubtitleUrl(playback: PlaybackState, stream: JellyfinMediaStream): string {
    const deliveryUrl = stream.DeliveryUrl || "";
    if (!deliveryUrl) {
        return "";
    }

    const absoluteUrl = deliveryUrl.startsWith("http")
        ? deliveryUrl
        : `${playback.serverUrl}${deliveryUrl.startsWith("/") ? "" : "/"}${deliveryUrl}`;

    if (absoluteUrl.includes("api_key=")) {
        return absoluteUrl;
    }
    const separator = absoluteUrl.includes("?") ? "&" : "?";
    return `${absoluteUrl}${separator}api_key=${encodeURIComponent(playback.accessToken)}`;
}
