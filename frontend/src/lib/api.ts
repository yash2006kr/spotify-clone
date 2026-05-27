const productionApiUrl = "https://spotify-clone-backend-6jgx.onrender.com";
const rawApiUrl =
  process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? productionApiUrl : "");

export const apiBaseUrl = rawApiUrl.replace(/\/$/, "");

export function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function apiFetch(input: string, init: RequestInit = {}) {
  return fetch(apiUrl(input), {
    ...init,
    credentials: "include"
  });
}

export function mediaUrl(path: string | null | undefined) {
  return path ? apiUrl(path) : null;
}
