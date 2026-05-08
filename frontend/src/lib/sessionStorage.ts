"use client";

import { useSyncExternalStore } from "react";

const sessionStorageKey = "forge.sessionToken";
const sessionStorageChangeEvent = "forge.sessionTokenChanged";

function notifySessionTokenChanged(): void {
  window.dispatchEvent(new Event(sessionStorageChangeEvent));
}

export function getStoredSessionToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(sessionStorageKey);
}

export function storeSessionToken(token: string): void {
  window.localStorage.setItem(sessionStorageKey, token);
  notifySessionTokenChanged();
}

export function clearStoredSessionToken(): void {
  window.localStorage.removeItem(sessionStorageKey);
  notifySessionTokenChanged();
}

export function useStoredSessionToken(): string | null {
  return useSyncExternalStore(
    subscribeStoredSessionToken,
    getStoredSessionToken,
    () => null,
  );
}

export function useIsClient(): boolean {
  return useSyncExternalStore(
    subscribeToClientReady,
    () => true,
    () => false,
  );
}

function subscribeStoredSessionToken(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(sessionStorageChangeEvent, onChange);

  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(sessionStorageChangeEvent, onChange);
  };
}

function subscribeToClientReady(): () => void {
  return () => undefined;
}
