import type { JellyfinDeviceProfile } from "./jellyfin";

export const IINA_DEVICE_PROFILE = {
    MaxStreamingBitrate: 120000000,
    MaxStaticBitrate: 100000000,
    MusicStreamingTranscodingBitrate: 384000,
    DirectPlayProfiles: [
        { Container: "mp4,m4v,mkv,webm,avi,mov", Type: "Video" },
        { Container: "mp3,flac,aac,m4a,ogg,opus,wav", Type: "Audio" }
    ],
    TranscodingProfiles: [],
    ContainerProfiles: [],
    CodecProfiles: [],
    SubtitleProfiles: [
        { Format: "srt", Method: "External" },
        { Format: "ass", Method: "External" },
        { Format: "ssa", Method: "External" },
        { Format: "vtt", Method: "External" }
    ]
} satisfies JellyfinDeviceProfile;
