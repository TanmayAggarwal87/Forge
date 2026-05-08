import { apiRequest } from "@/lib/apiClient";
import { clearStoredSessionToken } from "@/lib/sessionStorage";

export async function signOutSession(token: string | null): Promise<void> {
  if (token) {
    await apiRequest("/auth/sign-out", { method: "POST" }, token).catch(
      () => null,
    );
  }

  clearStoredSessionToken();
}
