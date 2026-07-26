// Typed fetch wrapper around the Express API. Injects the Bearer token, unwraps
// the { data } envelope, and throws a typed ApiError from the { message, errors }
// envelope. On 401 it clears the stored token so the app falls back to login.

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

const TOKEN_KEY = "restaurantos_token";

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  errors?: FieldError[];
  constructor(message: string, status: number, errors?: FieldError[]) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.errors = errors;
  }
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) window.localStorage.setItem(TOKEN_KEY, token);
  else window.localStorage.removeItem(TOKEN_KEY);
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string>;
};

export async function apiFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    if (res.status === 401) setToken(null);
    const message = payload?.message || "Request failed";
    throw new ApiError(message, res.status, payload?.errors);
  }

  return payload?.data as T;
}

export type PageMeta = { page: number; limit: number; total: number; totalPages: number };
export type Paginated<T> = { data: T[]; meta: PageMeta };

// Like apiFetch but returns the full { data, meta } envelope for list endpoints.
export async function apiList<T>(path: string): Promise<Paginated<T>> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(payload?.message || "Request failed", res.status, payload?.errors);
  }
  return { data: (payload?.data ?? []) as T[], meta: payload?.meta as PageMeta };
}

// POST a multipart form (e.g. a CSV file upload). Do NOT set Content-Type; the
// browser adds the multipart boundary. Unwraps { data } like apiFetch.
export async function uploadForm<T>(path: string, formData: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) setToken(null);
    throw new ApiError(payload?.message || "Upload failed", res.status, payload?.errors);
  }
  return payload?.data as T;
}

// Trigger a browser download of a file endpoint (e.g. a CSV export), sending the
// Bearer token and naming the saved file. Mirrors aiDownload in ai-api.ts.
export async function downloadFile(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
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

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  list: <T>(path: string) => apiList<T>(path),
  post: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "POST", body }),
  patch: <T>(path: string, body?: unknown) => apiFetch<T>(path, { method: "PATCH", body }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
