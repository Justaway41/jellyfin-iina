import { buildMediaBrowserAuthorizationHeader } from "../shared/auth";
import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME } from "./constants";
import { buildQueryString, isHttpsUrl, normalizeServerUrl } from "./utils";

const { http } = iina;

export interface HttpContext {
    serverUrl: string;
    accessToken: string;
    deviceId: string;
}

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export interface HttpRequestOptions {
    method: HttpMethod;
    endpoint: string;
    query?: Record<string, string | number | boolean | null | undefined>;
    body?: unknown;
    headers?: Record<string, string>;
}

function buildAuthHeader(context: HttpContext): string {
    return buildMediaBrowserAuthorizationHeader({
        clientName: CLIENT_NAME,
        deviceName: DEVICE_NAME,
        deviceId: context.deviceId,
        version: CLIENT_VERSION,
        token: context.accessToken
    });
}

function buildUrl(context: HttpContext, endpoint: string, query?: HttpRequestOptions["query"]): string {
    const baseUrl = normalizeServerUrl(context.serverUrl);
    const normalizedEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const queryString = query ? buildQueryString(query) : "";
    if (!queryString) {
        return `${baseUrl}${normalizedEndpoint}`;
    }
    return `${baseUrl}${normalizedEndpoint}?${queryString}`;
}

async function sendRequest<ResData>(
    method: HttpMethod,
    url: string,
    options: IINA.HTTPRequestOption
): Promise<IINA.HTTPResponse<ResData>> {
    switch (method) {
        case "GET":
            return http.get(url, options);
        case "POST":
            return http.post(url, options);
        case "PUT":
            return http.put(url, options);
        case "PATCH":
            return http.patch(url, options);
        case "DELETE":
            return http.delete(url, options);
        default:
            return http.get(url, options);
    }
}

export async function requestJson<T>(
    context: HttpContext,
    options: HttpRequestOptions
): Promise<T | null> {
    const normalizedUrl = normalizeServerUrl(context.serverUrl);
    if (!isHttpsUrl(normalizedUrl)) {
        throw new Error("Jellyfin server URL must start with https://");
    }

    const url = buildUrl({
        ...context,
        serverUrl: normalizedUrl
    }, options.endpoint, options.query);

    const headers: Record<string, string> = {
        Authorization: buildAuthHeader(context),
        ...(options.headers || {})
    };

    const hasBody = options.body !== undefined;
    if (hasBody) {
        headers["Content-Type"] = "application/json";
    }

    const requestOptions: IINA.HTTPRequestOption = {
        params: {},
        headers: headers,
        data: hasBody ? options.body : {}
    };

    const response = await sendRequest<T>(options.method, url, requestOptions);
    const statusCode = response.statusCode || 0;
    if (statusCode < 200 || statusCode >= 300) {
        const responseText = response.text ? String(response.text) : "";
        const detail = responseText ? ` - ${responseText.slice(0, 200)}` : "";
        throw new Error(`HTTP ${statusCode} ${response.reason || ""}${detail}`.trim());
    }

    if (response.data !== undefined && response.data !== null) {
        return response.data as T;
    }

    const responseText = response.text ? String(response.text) : "";
    if (!responseText) {
        return null;
    }

    try {
        return JSON.parse(responseText) as T;
    } catch (error) {
        return responseText as unknown as T;
    }
}
