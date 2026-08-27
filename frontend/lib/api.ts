import { API_URL } from "./config";

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token =
    typeof window !== "undefined" ? localStorage.getItem("admin_token") : null;

  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  // NEW: Catch 401 Unauthorized specifically to force a secure logout
  if (res.status === 401 && typeof window !== "undefined") {
    localStorage.removeItem("admin_token");
    window.location.href = "/admin/login"; // Adjust this if your login route is different
    throw new Error("Session expired. Redirecting to login...");
  }

  const body = await res.json().catch(() => ({}));

  if (!res.ok)
    throw new Error(body.error ? JSON.stringify(body.error) : "Request failed");

  return body as T;
}
