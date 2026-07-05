const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
let accessToken = "";

export function setApiAccessToken(token: string | null | undefined) {
  accessToken = token ?? "";
}

function getHeaders() {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  return headers;
}

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
  });
  if (!response.ok) throw new Error(`GET ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) throw new Error(`POST ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiPut<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "PUT",
    headers: getHeaders(),
    body: JSON.stringify(body ?? {})
  });
  if (!response.ok) throw new Error(`PUT ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function apiDelete<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "DELETE",
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : undefined
  });
  if (!response.ok) throw new Error(`DELETE ${path} failed: ${response.status}`);
  return response.json() as Promise<T>;
}
