"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, Mail, ShieldCheck, UserCircle2 } from "lucide-react";
import { ThemeToggle } from "@/components/common/themeToggle";
import { Button } from "@/components/ui/button";
import { apiRequest, getErrorMessage } from "@/lib/apiClient";
import { signOutSession } from "@/lib/authSession";
import { useIsClient, useStoredSessionToken } from "@/lib/sessionStorage";
import type { SessionUser } from "@/types/domainTypes";

export function ProfilePage() {
  const router = useRouter();
  const token = useStoredSessionToken();
  const hasLoadedToken = useIsClient();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!hasLoadedToken) {
      return;
    }

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
  }, [hasLoadedToken, router, token]);

  async function handleLogout() {
    setIsSigningOut(true);
    await signOutSession(token);
    router.replace("/login");
  }

  if (!hasLoadedToken) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f8] text-sm text-slate-600 dark:bg-stone-950 dark:text-stone-300">
        Checking session...
      </main>
    );
  }

  if (!token) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f6f7f8] text-sm text-slate-600 dark:bg-stone-950 dark:text-stone-300">
        Opening login...
      </main>
    );
  }

  return (
    <main className="forge-themed-shell min-h-screen bg-[#f6f7f8] px-6 py-8 text-slate-950 dark:bg-stone-950 dark:text-stone-50">
      <section className="mx-auto flex max-w-4xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="rounded-md border-slate-300 bg-white text-slate-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
            >
              <Link href="/dashboard">
                <ArrowLeft />
                Dashboard
              </Link>
            </Button>
            <ThemeToggle />
          </div>
          <Button
            onClick={handleLogout}
            disabled={isSigningOut}
            className="rounded-md bg-slate-950 text-white hover:bg-slate-800 dark:bg-amber-600 dark:text-stone-950 dark:hover:bg-amber-500"
          >
            <LogOut />
            {isSigningOut ? "Signing out" : "Logout"}
          </Button>
        </div>

        <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] dark:border-stone-800 dark:bg-stone-900 dark:shadow-2xl dark:shadow-black/20">
          <div className="flex items-start gap-4">
            <div className="grid size-12 place-items-center rounded-md bg-slate-950 text-white dark:bg-amber-500 dark:text-stone-950">
              <UserCircle2 className="size-6" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500 dark:text-amber-300">
                Account
              </p>
              <h1 className="mt-2 text-2xl font-semibold">
                {isLoading ? "Loading profile..." : user?.name ?? "Profile"}
              </h1>
              <p className="mt-2 text-sm text-slate-600 dark:text-stone-400">
                Read-only account details for the active FORGE session.
              </p>
            </div>
          </div>

          {errorMessage ? (
            <div className="mt-6 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-200">
              {errorMessage}
            </div>
          ) : null}

          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-stone-800 dark:bg-stone-950/50">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-stone-500">
                <UserCircle2 className="size-4 text-slate-700 dark:text-amber-400" />
                Name
              </dt>
              <dd className="mt-3 text-sm text-slate-900 dark:text-stone-100">
                {user?.name ?? "-"}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-stone-800 dark:bg-stone-950/50">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-stone-500">
                <Mail className="size-4 text-slate-700 dark:text-amber-400" />
                Email
              </dt>
              <dd className="mt-3 text-sm text-slate-900 dark:text-stone-100">
                {user?.email ?? "-"}
              </dd>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 dark:border-stone-800 dark:bg-stone-950/50 sm:col-span-2">
              <dt className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 dark:text-stone-500">
                <ShieldCheck className="size-4 text-slate-700 dark:text-amber-400" />
                Session
              </dt>
              <dd className="mt-3 text-sm text-slate-600 dark:text-stone-300">
                Authenticated with a server-side FORGE session token. Profile editing is not enabled yet.
              </dd>
            </div>
          </dl>
        </article>
      </section>
    </main>
  );
}
