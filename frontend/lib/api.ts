import { API_URL } from "./config";

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ? JSON.stringify(body.error) : "Request failed");
  return body as T;
}
