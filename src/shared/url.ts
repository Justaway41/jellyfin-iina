export function isHttpsUrl(url: string): boolean {
    return url.trim().toLowerCase().startsWith("https://");
}
