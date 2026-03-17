import { loadAdminSession } from "./session";

const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

function getApiBaseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
}

export async function adminFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = loadAdminSession();
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      ...(session
        ? {
            Authorization: `Bearer ${session.token}`
          }
        : {})
    },
    cache: "no-store"
  });

  const body = (await response.json().catch(() => ({}))) as
    | T
    | { error?: { code?: string; message?: string } };

  if (!response.ok) {
    const errorBody = body as { error?: { message?: string } };
    throw new Error(errorBody.error?.message ?? "Request failed.");
  }

  return body as T;
}
