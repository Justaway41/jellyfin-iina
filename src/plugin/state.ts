import type { AuthUpdatedPayload } from "../shared/messages";
import type { PlaybackContext } from "../shared/jellyfin";

import { normalizeServerUrl } from "./utils";

export interface AuthState extends AuthUpdatedPayload {}

export interface NormalizedSegment {
    type: "Intro" | "Outro";
    startSeconds: number | null;
    endSeconds: number | null;
}

export interface PlaybackState extends PlaybackContext {
    isEpisode: boolean;
    autoplayQueued: boolean;
    autoplayRequestId: number;
    nextItemId: string;
    segments: NormalizedSegment[];
}

let authState: AuthState | null = null;
let currentPlayback: PlaybackState | null = null;

export function updateAuthState(payload: AuthUpdatedPayload): AuthState {
    authState = {
        ...payload,
        serverUrl: normalizeServerUrl(payload.serverUrl)
    };
    return authState;
}

export function clearAuthState(): void {
    authState = null;
}

export function getAuthState(): AuthState | null {
    return authState;
}

export function setCurrentPlayback(playback: PlaybackState | null): void {
    currentPlayback = playback;
}

export function getCurrentPlayback(): PlaybackState | null {
    return currentPlayback;
}
