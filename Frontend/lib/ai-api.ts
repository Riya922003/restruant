// Typed client for the FastAPI AI service. Reuses the same Bearer token as the
// Express client (lib/api.ts) so login state is shared; only the base URL differs.
// Unwraps the { data } envelope and throws the same ApiError on failure.

import { ApiError, getToken, setToken, type PageMeta, type Paginated } from "@/lib/api";

export const AI_BASE_URL = process.env.NEXT_PUBLIC_AI_URL || "http://localhost:8000";

type RequestOptions = { method?: string; body?: unknown; headers?: Record<string, string> };

function authHeader(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function aiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${AI_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: { "Content-Type": "application/json", ...authHeader(), ...options.headers },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(payload?.message || "Request failed", res.status, payload?.errors);
  }
  return payload?.data as T;
}

export const aiApi = {
  get: <T>(path: string) => aiFetch<T>(path),
  post: <T>(path: string, body?: unknown) => aiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => aiFetch<T>(path, { method: "PATCH", body }),
};

// List endpoints return the full { data, meta } envelope.
export async function aiList<T>(path: string): Promise<Paginated<T>> {
  const res = await fetch(`${AI_BASE_URL}${path}`, { headers: authHeader() });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(payload?.message || "Request failed", res.status, payload?.errors);
  }
  return { data: (payload?.data ?? []) as T[], meta: payload?.meta as PageMeta };
}

// Multipart upload: do NOT set Content-Type (the browser sets the boundary).
export async function aiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(`${AI_BASE_URL}${path}`, {
    method: "POST",
    headers: authHeader(),
    body: formData,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(payload?.message || "Upload failed", res.status, payload?.errors);
  }
  return payload?.data as T;
}

// Fetch a binary response (e.g. the original invoice file) as an object URL.
export async function aiObjectUrl(path: string): Promise<string> {
  const res = await fetch(`${AI_BASE_URL}${path}`, { headers: authHeader() });
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError("Failed to load file", res.status);
  }
  return URL.createObjectURL(await res.blob());
}

// Trigger a browser download of a binary endpoint (e.g. the Excel register).
export async function aiDownload(path: string, filename: string): Promise<void> {
  const res = await fetch(`${AI_BASE_URL}${path}`, { headers: authHeader() });
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    const payload = await res.json().catch(() => null);
    throw new ApiError(payload?.message || "Download failed", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
