const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
let accessToken = "";

type ApiMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type ApiErrorPayload = {
  message?: string;
  code?: string;
  details?: unknown;
};

export class ApiError extends Error {
  status: number;
  method: ApiMethod;
  path: string;
  code?: string;
  details?: unknown;

  constructor(input: { message: string; status: number; method: ApiMethod; path: string; code?: string; details?: unknown }) {
    super(input.message);
    this.name = "ApiError";
    this.status = input.status;
    this.method = input.method;
    this.path = input.path;
    this.code = input.code;
    this.details = input.details;
  }
}

export function setApiAccessToken(token: string | null | undefined) {
  accessToken = token ?? "";
}

function getHeaders(includeContentType = true) {
  const headers: Record<string, string> = {};
  if (includeContentType) headers["content-type"] = "application/json";
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  if (!accessToken && import.meta.env.DEV) {
    const localUserId = window.localStorage.getItem("ai-agent-hub-user-id");
    if (localUserId) {
      headers["x-user-id"] = localUserId;
      headers["x-user-email"] = `${localUserId}@local.test`;
    }
  }
  return headers;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

async function parseApiError(response: globalThis.Response): Promise<ApiErrorPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await response.json().catch(() => null) as unknown;
    if (isRecord(body)) {
      const error = body.error;
      if (isRecord(error)) {
        return {
          message: typeof error.message === "string" ? error.message : undefined,
          code: typeof error.code === "string" ? error.code : undefined,
          details: error
        };
      }
      return {
        message: typeof body.message === "string" ? body.message : undefined,
        code: typeof body.code === "string" ? body.code : undefined,
        details: body
      };
    }
    return {};
  }

  const text = await response.text().catch(() => "");
  return { message: text.trim() || undefined };
}

async function parseApiResponse<T>(response: globalThis.Response, method: ApiMethod, path: string): Promise<T> {
  if (response.status === 204) return undefined as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) return response.json() as Promise<T>;
  // Every application API endpoint is JSON. Returning bundled HTML (for
  // example after a desktop base-URL mistake) as a typed object lets the
  // invalid value travel deep into React and causes unrelated startup errors.
  throw new ApiError({
    message: "The agent service returned an unexpected response. Check the configured API address.",
    status: response.status,
    method,
    path
  });
}

async function apiRequest<T>(method: ApiMethod, path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: getHeaders(method !== "GET" && method !== "DELETE"),
    ...(method === "GET" || method === "DELETE" ? {} : { body: JSON.stringify(body ?? {}) })
  });
  if (!response.ok) {
    const payload = await parseApiError(response);
    throw new ApiError({
      message: payload.message || `${method} request failed with status ${response.status}`,
      status: response.status,
      method,
      path,
      code: payload.code,
      details: payload.details
    });
  }
  return parseApiResponse<T>(response, method, path);
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>("GET", path);
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>("POST", path, body);
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>("PUT", path, body);
}

export async function apiPatch<T>(path: string, body?: unknown): Promise<T> {
  return apiRequest<T>("PATCH", path, body);
}

export async function apiDelete<T>(path: string): Promise<T> {
  return apiRequest<T>("DELETE", path);
}
