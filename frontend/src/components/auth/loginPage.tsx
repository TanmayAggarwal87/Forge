"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LockKeyhole, Mail, ShieldCheck, Users } from "lucide-react";
import { BrandMark } from "@/components/common/brandMark";
import { TrustSignal } from "@/components/auth/trustSignal";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/errorMessage";
import { apiRequest, getErrorMessage } from "@/lib/apiClient";
import { storeSessionToken } from "@/lib/sessionStorage";
import type { AuthPayload } from "@/types/domainTypes";

type AuthMode = "login" | "register";

export function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const isRegistering = mode === "register";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const payload = await apiRequest<AuthPayload>(
        isRegistering ? "/auth/register" : "/auth/login",
        {
          method: "POST",
          body: JSON.stringify({
            email,
            password,
            ...(isRegistering ? { name } : {}),
          }),
        },
      );

      storeSessionToken(payload.token);
      router.push("/dashboard");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen overflow-hidden bg-stone-950 text-white lg:grid-cols-[1fr_0.92fr]">
      <section className="relative flex min-h-[44vh] flex-col justify-between border-b border-white/10 px-6 py-8 lg:border-b-0 lg:border-r lg:px-12">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(245,158,11,0.24),transparent_28%),radial-gradient(circle_at_78%_12%,rgba(20,184,166,0.16),transparent_25%),linear-gradient(135deg,#1c1917,#0c0a09_70%)]" />
        <div className="relative">
          <BrandMark inverse />
        </div>
        <div className="relative max-w-2xl py-14">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.24em] text-amber-200">
            Workspace command center
          </p>
          <h1 className="max-w-xl text-5xl font-semibold tracking-tight text-stone-50 sm:text-6xl">
            Secure access for focused project teams.
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-stone-300">
            Login with your email and password. New accounts are stored with
            per-user salts and server-side password hashes.
          </p>
        </div>
        <div className="relative grid gap-3 sm:grid-cols-3">
          <TrustSignal icon={<KeyRound />} label="Salted hashes" />
          <TrustSignal icon={<Users />} label="Team spaces" />
          <TrustSignal icon={<ShieldCheck />} label="Audit history" />
        </div>
      </section>

      <section className="flex items-center justify-center bg-[linear-gradient(180deg,#fafaf9,#e7e5e4)] px-6 py-10 text-stone-950">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-md rounded-3xl border border-stone-200 bg-white/95 p-6 shadow-2xl shadow-stone-950/10 backdrop-blur"
        >
          <div className="mb-6 flex rounded-2xl bg-stone-100 p-1 text-sm font-semibold">
            <button
              type="button"
              onClick={() => setMode("login")}
              className={`h-10 flex-1 rounded-xl transition ${
                mode === "login" ? "bg-white shadow-sm" : "text-stone-500"
              }`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => setMode("register")}
              className={`h-10 flex-1 rounded-xl transition ${
                mode === "register" ? "bg-white shadow-sm" : "text-stone-500"
              }`}
            >
              Create account
            </button>
          </div>

          <h2 className="text-2xl font-semibold">
            {isRegistering ? "Create your Forge account" : "Welcome back"}
          </h2>
          <p className="mt-2 text-sm leading-6 text-stone-600">
            {isRegistering
              ? "Start with a named account, then create workspaces from the dashboard."
              : "Use your registered email and password to continue."}
          </p>

          <div className="mt-6 grid gap-4">
            {isRegistering ? (
              <label className="grid gap-2 text-sm font-medium">
                Name
                <input
                  className="h-11 rounded-xl border border-stone-300 px-3 text-sm outline-none transition focus:border-stone-950"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  required
                />
              </label>
            ) : null}
            <label className="grid gap-2 text-sm font-medium">
              Email
              <span className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <input
                  className="h-11 w-full rounded-xl border border-stone-300 px-10 text-sm outline-none transition focus:border-stone-950"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </span>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              Password
              <span className="relative">
                <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-stone-400" />
                <input
                  className="h-11 w-full rounded-xl border border-stone-300 px-10 text-sm outline-none transition focus:border-stone-950"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="At least 8 characters"
                  minLength={8}
                  required
                />
              </span>
            </label>
          </div>

          <ErrorMessage message={errorMessage} />
          <Button className="mt-6 h-11 w-full rounded-xl" size="lg" disabled={isBusy}>
            <KeyRound />
            {isBusy ? "Please wait" : isRegistering ? "Create account" : "Login"}
          </Button>
        </form>
      </section>
    </main>
  );
}
