import type { ApiError } from "@/types/domainTypes";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/v1";

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token: string | null = null,
): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiError;
    const message = Array.isArray(payload.message)
      ? payload.message.join(", ")
      : payload.message;

    throw new Error(message ?? `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
