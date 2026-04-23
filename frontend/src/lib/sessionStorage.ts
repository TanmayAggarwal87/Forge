const sessionStorageKey = "forge.sessionToken";

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(sessionStorageKey);
}

export function storeSessionToken(token: string): void {
  window.localStorage.setItem(sessionStorageKey, token);
}

export function clearStoredSessionToken(): void {
  window.localStorage.removeItem(sessionStorageKey);
}
