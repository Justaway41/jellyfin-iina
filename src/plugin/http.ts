import { buildMediaBrowserAuthorizationHeader } from "../shared/auth";
import { CLIENT_NAME, CLIENT_VERSION, DEVICE_NAME } from "./constants";
import { buildQueryString, isSupportedServerUrl, normalizeServerUrl } from "./utils";

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
    options: IINA.HTTPRequestOption<unknown>
): Promise<IINA.HTTPResponse<ResData>> {
    switch (method) {
        case "GET":
            return http.get<unknown, ResData>(url, options);
        case "POST":
            return http.post<unknown, ResData>(url, options);
        case "PUT":
            return http.put<unknown, ResData>(url, options);
        case "PATCH":
            return http.patch<unknown, ResData>(url, options);
        case "DELETE":
            return http.delete<unknown, ResData>(url, options);
        default:
            throw new Error(`Unsupported HTTP method: ${method}`);
    }
}

function resolveRequest(context: HttpContext, options: HttpRequestOptions): {
    url: string;
    requestOptions: IINA.HTTPRequestOption<unknown>;
} {
    const normalizedUrl = normalizeServerUrl(context.serverUrl);
    if (!isSupportedServerUrl(normalizedUrl)) {
        throw new Error("Jellyfin server URL must start with http:// or https://");
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

    const requestOptions: IINA.HTTPRequestOption<unknown> = {
        params: {},
        headers: headers,
        data: hasBody ? options.body : null
    };

    return {
        url: url,
        requestOptions: requestOptions
    };
}

function assertOkResponse(response: IINA.HTTPResponse<unknown>): void {
    const statusCode = response.statusCode || 0;
    if (statusCode < 200 || statusCode >= 300) {
        const responseText = response.text ? String(response.text) : "";
        const detail = responseText ? ` - ${responseText.slice(0, 200)}` : "";
        throw new Error(`HTTP ${statusCode} ${response.reason || ""}${detail}`.trim());
    }
}

function parseJsonResponse<T>(responseText: string): T {
    try {
        return JSON.parse(responseText) as T;
    } catch (error) {
        const snippet = responseText.slice(0, 200);
        throw new Error(`Expected JSON response but got: ${snippet}`.trim());
    }
}

export async function requestJson<T>(
    context: HttpContext,
    options: HttpRequestOptions
): Promise<T | null> {
    const { url, requestOptions } = resolveRequest(context, options);

    const response = await sendRequest<unknown>(options.method, url, requestOptions);
    assertOkResponse(response);

    if (response.data !== undefined && response.data !== null) {
        if (typeof response.data === "string") {
            return parseJsonResponse<T>(response.data);
        }
        return response.data as T;
    }

    const responseText = response.text ? String(response.text) : "";
    if (!responseText) {
        return null;
    }

    return parseJsonResponse<T>(responseText);
}

export async function requestText(
    context: HttpContext,
    options: HttpRequestOptions
): Promise<string | null> {
    const { url, requestOptions } = resolveRequest(context, options);
    const response = await sendRequest<unknown>(options.method, url, requestOptions);
    assertOkResponse(response);

    if (response.text !== undefined && response.text !== null) {
        const textValue = String(response.text);
        return textValue ? textValue : null;
    }

    if (response.data !== undefined && response.data !== null) {
        if (typeof response.data === "string") {
            return response.data;
        }
        return JSON.stringify(response.data);
    }

    return null;
}
