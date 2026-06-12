export function isSupportedServerUrl(url: string): boolean {
    const normalized = url.trim().toLowerCase();
    return normalized.startsWith("https://") || normalized.startsWith("http://");
}
