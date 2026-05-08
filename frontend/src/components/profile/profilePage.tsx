"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiRequest, getErrorMessage } from "@/lib/apiClient";
import { signOutSession } from "@/lib/authSession";
import { getStoredSessionToken } from "@/lib/sessionStorage";
import type { SessionUser } from "@/types/domainTypes";

export function ProfilePage() {
  const router = useRouter();
  const [token] = useState<string | null>(() => getStoredSessionToken());
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    apiRequest<{ user: SessionUser }>("/auth/session", {}, token)
      .then((payload) => {
        if (!cancelled) {
          setUser(payload.user);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(getErrorMessage(error));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [router, token]);

  async function handleLogout() {
    setIsSigningOut(true);
    await signOutSession(token);
    router.replace("/login");
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-950 text-sm text-stone-300">
        Redirecting to login...
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-950 px-6 py-8 text-stone-50">
      <section className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <Button asChild variant="outline" className="rounded-md border-stone-700 bg-stone-900 text-stone-100">
            <Link href="/dashboard">
              <ArrowLeft />
              Dashboard
            </Link>
          </Button>
          <Button
            onClick={handleLogout}
            disabled={isSigningOut}
            className="rounded-md bg-amber-600 text-stone-950 hover:bg-amber-500"
          >
            <LogOut />
            {isSigningOut ? "Signing out" : "Logout"}
          </Button>
        </div>

        <article className="rounded-lg border border-stone-800 bg-stone-900 p-6 shadow-2xl shadow-black/20">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-md bg-amber-500 text-stone-950">
              <UserCircle2 className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-amber-300">
                Account
              </p>
              <h1 className="mt-2 text-2xl font-semibold">
                {isLoading ? "Loading profile..." : user?.name ?? "Profile"}
              </h1>
              <p className="mt-2 text-sm text-stone-400">
                Read-only account details for the active FORGE session.
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-md border border-red-800 bg-red-950/40 px-4 py-3 text-sm text-red-200">
              {errorMessage}
            </div>
          ) : null}

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-stone-800 bg-stone-950/50 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                <UserCircle2 className="size-4 text-amber-400" />
                Name
              </dt>
              <dd className="mt-3 text-sm text-stone-100">{user?.name ?? "-"}</dd>
            </div>
            <div className="rounded-md border border-stone-800 bg-stone-950/50 p-4">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                <Mail className="size-4 text-amber-400" />
                Email
              </dt>
              <dd className="mt-3 text-sm text-stone-100">{user?.email ?? "-"}</dd>
            </div>
            <div className="rounded-md border border-stone-800 bg-stone-950/50 p-4 sm:col-span-2">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                <ShieldCheck className="size-4 text-amber-400" />
                Session
              </dt>
              <dd className="mt-3 text-sm text-stone-300">
                Authenticated with a server-side FORGE session token. Profile editing is not enabled yet.
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
