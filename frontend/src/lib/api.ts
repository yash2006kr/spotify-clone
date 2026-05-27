const productionApiUrl = "https://spotify-clone-rt8l.onrender.com";
const rawApiUrl = process.env.NEXT_PUBLIC_API_URL || productionApiUrl;

export const apiBaseUrl = rawApiUrl.replace(/\/$/, "");
const sessionTokenKey = "spotify:session-token";

export function storeSessionToken(token: string | null | undefined) {
  if (typeof window === "undefined" || !token) {
    return;
  }

  window.localStorage.setItem(sessionTokenKey, token);
}

export function clearSessionToken() {
  if (typeof window === "undefined") {
    return;
  }

  window.localStorage.removeItem(sessionTokenKey);
}

function sessionHeaders(headers?: HeadersInit) {
  const nextHeaders = new Headers(headers);
  const token = typeof window === "undefined" ? "" : window.localStorage.getItem(sessionTokenKey);

  if (token && !nextHeaders.has("Authorization")) {
    nextHeaders.set("Authorization", `Bearer ${token}`);
  }

  return nextHeaders;
}

export function apiUrl(path: string) {
  if (/^https?:\/\//.test(path)) {
    return path;
  }

  return `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

export function apiFetch(input: string, init: RequestInit = {}) {
  return fetch(apiUrl(input), {
    ...init,
    headers: sessionHeaders(init.headers),
    credentials: "include"
  });
}

export function mediaUrl(path: string | null | undefined) {
  return path ? apiUrl(path) : null;
}
