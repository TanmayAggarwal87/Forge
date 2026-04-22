"use client";

import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  FolderKanban,
  KeyRound,
  LogOut,
  Plus,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000/v1";
const sessionStorageKey = "forge.sessionToken";

type SessionUser = {
  id: string;
  email: string;
  name: string;
};

type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
};

type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
};

type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

type ApiError = {
  message?: string | string[];
};

export default function Home() {
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }

    return window.localStorage.getItem(sessionStorageKey);
  });
  const [user, setUser] = useState<SessionUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(
    null,
  );
  const [projects, setProjects] = useState<Project[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [email, setEmail] = useState("founder@forge.local");
  const [name, setName] = useState("Forge Builder");
  const [workspaceName, setWorkspaceName] = useState("Core Platform");
  const [projectName, setProjectName] = useState("Workflow API");
  const [projectDescription, setProjectDescription] = useState(
    "Backend workflow builder foundation",
  );
  const [isBusy, setIsBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedWorkspace = useMemo(
    () =>
      workspaces.find((workspace) => workspace.id === selectedWorkspaceId) ??
      null,
    [selectedWorkspaceId, workspaces],
  );

  const request = useCallback(async function request<T>(
    path: string,
    options: RequestInit = {},
    activeToken = token,
  ): Promise<T> {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(activeToken ? { Authorization: `Bearer ${activeToken}` } : {}),
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
  }, [token]);

  const clearSession = useCallback(function clearSession() {
    window.localStorage.removeItem(sessionStorageKey);
    setToken(null);
    setUser(null);
    setWorkspaces([]);
    setProjects([]);
    setAuditLogs([]);
    setSelectedWorkspaceId(null);
  }, []);

  const loadWorkspaces = useCallback(async function loadWorkspaces(
    activeToken = token,
  ) {
    const payload = await request<{ workspaces: Workspace[] }>(
      "/workspaces",
      {},
      activeToken,
    );

    setWorkspaces(payload.workspaces);
    setSelectedWorkspaceId((currentWorkspaceId) => {
      if (
        currentWorkspaceId &&
        payload.workspaces.some((workspace) => workspace.id === currentWorkspaceId)
      ) {
        return currentWorkspaceId;
      }

      return payload.workspaces[0]?.id ?? null;
    });
  }, [request, token]);

  const loadProjects = useCallback(async function loadProjects(
    activeToken: string,
    workspaceId: string,
  ) {
    const payload = await request<{ projects: Project[] }>(
      `/workspaces/${workspaceId}/projects`,
      {},
      activeToken,
    );
    setProjects(payload.projects);
  }, [request]);

  const loadAuditLogs = useCallback(async function loadAuditLogs(
    activeToken: string,
    workspaceId: string,
  ) {
    const payload = await request<{ auditLogs: AuditLog[] }>(
      `/audit-logs?workspaceId=${encodeURIComponent(workspaceId)}`,
      {},
      activeToken,
    );
    setAuditLogs(payload.auditLogs);
  }, [request]);

  const loadSession = useCallback(async function loadSession(activeToken: string) {
    try {
      const session = await request<{ user: SessionUser }>(
        "/auth/session",
        {},
        activeToken,
      );
      setUser(session.user);
      await loadWorkspaces(activeToken);
    } catch (error) {
      clearSession();
      setErrorMessage(getErrorMessage(error));
    }
  }, [clearSession, loadWorkspaces, request]);

  useEffect(() => {
    if (!token) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void loadSession(token);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadSession, token]);

  useEffect(() => {
    if (!token || !selectedWorkspaceId) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void Promise.all([
        loadProjects(token, selectedWorkspaceId),
        loadAuditLogs(token, selectedWorkspaceId),
      ]);
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [loadAuditLogs, loadProjects, selectedWorkspaceId, token]);

  async function handleSignIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsBusy(true);
    setErrorMessage(null);

    try {
      const payload = await request<{ token: string; user: SessionUser }>(
        "/auth/sign-in",
        {
          method: "POST",
          body: JSON.stringify({ email, name }),
        },
        null,
      );

      window.localStorage.setItem(sessionStorageKey, payload.token);
      setToken(payload.token);
      setUser(payload.user);
      await loadWorkspaces(payload.token);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      const payload = await request<{ workspace: Workspace }>("/workspaces", {
        method: "POST",
        body: JSON.stringify({ name: workspaceName }),
      });
      await loadWorkspaces(token);
      setSelectedWorkspaceId(payload.workspace.id);
      setWorkspaceName("");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreateProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || !selectedWorkspaceId) {
      return;
    }

    setIsBusy(true);
    setErrorMessage(null);

    try {
      await request<{ project: Project }>(
        `/workspaces/${selectedWorkspaceId}/projects`,
        {
          method: "POST",
          body: JSON.stringify({
            name: projectName,
            description: projectDescription,
          }),
        },
      );
      setProjectName("");
      setProjectDescription("");
      await Promise.all([
        loadProjects(token, selectedWorkspaceId),
        loadAuditLogs(token, selectedWorkspaceId),
      ]);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleSignOut() {
    if (token) {
      await request("/auth/sign-out", { method: "POST" }).catch(() => null);
    }
    clearSession();
  }

  if (!user) {
    return (
      <main className="grid min-h-screen bg-zinc-950 text-white lg:grid-cols-[0.95fr_1.05fr]">
        <section className="flex min-h-[42vh] flex-col justify-between border-b border-white/10 bg-zinc-900 px-6 py-8 lg:border-b-0 lg:border-r lg:px-10">
          <div className="flex items-center gap-3 text-sm font-medium text-zinc-300">
            <span className="grid size-8 place-items-center rounded-lg bg-white text-zinc-950">
              F
            </span>
            Forge
          </div>
          <div className="max-w-xl">
            <p className="mb-4 text-sm font-medium uppercase tracking-[0.18em] text-zinc-400">
              Phase 1 foundation
            </p>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              Secure workspaces for backend workflow projects.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-7 text-zinc-300">
              Sign in, create an organization space, add projects, and verify
              protected API access before the workflow builder phases begin.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-zinc-300 sm:grid-cols-3">
            <TrustSignal icon={<KeyRound />} label="Session tokens" />
            <TrustSignal icon={<Users />} label="Workspace roles" />
            <TrustSignal icon={<ShieldCheck />} label="Guarded APIs" />
          </div>
        </section>

        <section className="flex items-center justify-center px-6 py-10">
          <form
            onSubmit={handleSignIn}
            className="w-full max-w-md rounded-lg border border-zinc-800 bg-white p-6 text-zinc-950 shadow-2xl"
          >
            <div>
              <h2 className="text-2xl font-semibold">Sign in</h2>
              <p className="mt-2 text-sm leading-6 text-zinc-600">
                This phase uses a local development session flow backed by the
                NestJS API.
              </p>
            </div>
            <div className="mt-6 grid gap-4">
              <label className="grid gap-2 text-sm font-medium">
                Email
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </label>
              <label className="grid gap-2 text-sm font-medium">
                Name
                <input
                  className="h-10 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  required
                />
              </label>
            </div>
            <ErrorMessage message={errorMessage} />
            <Button className="mt-6 w-full" size="lg" disabled={isBusy}>
              <KeyRound />
              Sign in
            </Button>
          </form>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-zinc-100 text-zinc-950">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-3 text-lg font-semibold">
              <span className="grid size-8 place-items-center rounded-lg bg-zinc-950 text-sm text-white">
                F
              </span>
              Forge
            </div>
            <p className="mt-1 text-sm text-zinc-600">
              Signed in as {user.name} ({user.email})
            </p>
          </div>
          <Button variant="outline" onClick={handleSignOut}>
            <LogOut />
            Sign out
          </Button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[280px_1fr]">
        <aside className="rounded-lg border border-zinc-200 bg-white p-4">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold">
            <Users className="size-4" />
            Workspaces
          </div>
          <div className="grid gap-2">
            {workspaces.map((workspace) => (
              <button
                key={workspace.id}
                onClick={() => setSelectedWorkspaceId(workspace.id)}
                className={`rounded-md border px-3 py-2 text-left text-sm transition ${
                  workspace.id === selectedWorkspaceId
                    ? "border-zinc-950 bg-zinc-950 text-white"
                    : "border-zinc-200 bg-white hover:bg-zinc-50"
                }`}
              >
                <span className="block font-medium">{workspace.name}</span>
                <span className="text-xs opacity-70">{workspace.role}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleCreateWorkspace} className="mt-5 grid gap-2">
            <label className="grid gap-2 text-sm font-medium">
              New workspace
              <input
                className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                value={workspaceName}
                onChange={(event) => setWorkspaceName(event.target.value)}
                placeholder="Workspace name"
                required
              />
            </label>
            <Button disabled={isBusy} variant="secondary">
              <Plus />
              Create workspace
            </Button>
          </form>
        </aside>

        <section className="grid gap-5">
          <ErrorMessage message={errorMessage} />

          <div className="rounded-lg border border-zinc-200 bg-white p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-500">
                  Active workspace
                </p>
                <h1 className="mt-1 text-2xl font-semibold">
                  {selectedWorkspace?.name ?? "Create a workspace"}
                </h1>
                <p className="mt-2 text-sm text-zinc-600">
                  Projects created here are scoped by membership checks on the
                  API.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
                <Metric label="Workspaces" value={workspaces.length} />
                <Metric label="Projects" value={projects.length} />
                <Metric label="Audit logs" value={auditLogs.length} />
              </div>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1fr_360px]">
            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <FolderKanban className="size-4" />
                Projects
              </div>
              <form
                onSubmit={handleCreateProject}
                className="mb-5 grid gap-3 rounded-md border border-zinc-200 bg-zinc-50 p-3 md:grid-cols-[1fr_1.4fr_auto]"
              >
                <input
                  className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  placeholder="Project name"
                  required
                />
                <input
                  className="h-9 rounded-md border border-zinc-300 px-3 text-sm outline-none focus:border-zinc-950"
                  value={projectDescription}
                  onChange={(event) =>
                    setProjectDescription(event.target.value)
                  }
                  placeholder="Description"
                />
                <Button disabled={isBusy || !selectedWorkspaceId}>
                  <Plus />
                  Add project
                </Button>
              </form>

              <div className="grid gap-3">
                {projects.length === 0 ? (
                  <p className="rounded-md border border-dashed border-zinc-300 p-5 text-sm text-zinc-600">
                    No projects yet. Create the first project for this
                    workspace.
                  </p>
                ) : (
                  projects.map((project) => (
                    <article
                      key={project.id}
                      className="rounded-md border border-zinc-200 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <h2 className="font-semibold">{project.name}</h2>
                          <p className="mt-1 text-sm text-zinc-600">
                            {project.description ?? "No description"}
                          </p>
                        </div>
                        <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
                          {project.slug}
                        </span>
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-5">
              <div className="mb-4 flex items-center gap-2 font-semibold">
                <Activity className="size-4" />
                Audit log
              </div>
              <div className="grid gap-3">
                {auditLogs.length === 0 ? (
                  <p className="text-sm text-zinc-600">No audit events yet.</p>
                ) : (
                  auditLogs.map((log) => (
                    <article
                      key={log.id}
                      className="rounded-md border border-zinc-200 p-3"
                    >
                      <p className="text-sm font-medium">{log.action}</p>
                      <p className="mt-1 text-xs text-zinc-500">
                        {log.targetType} - {new Date(log.createdAt).toLocaleString()}
                      </p>
                    </article>
                  ))
                )}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function TrustSignal({
  icon,
  label,
}: {
  icon: ReactNode;
  label: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md border border-white/10 px-3 py-2">
      <span className="text-zinc-400 [&_svg]:size-4">{icon}</span>
      {label}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-zinc-200 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}

function ErrorMessage({ message }: { message: string | null }) {
  if (!message) {
    return null;
  }

  return (
    <p className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}
