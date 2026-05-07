"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useUiStore } from "@/stores/uiStore";
import { formatRelativeTime } from "@/features/workflow/utils";
import { apiRequest, getErrorMessage } from "@/lib/apiClient";
import { getStoredSessionToken } from "@/lib/sessionStorage";
import type { Workspace } from "@/features/workspace/types";

type BackendWorkspace = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt?: string;
};

export function WorkspaceDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [token] = useState<string | null>(() => getStoredSessionToken());

  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const setWorkspaces = useWorkspaceStore((state) => state.setWorkspaces);
  const upsertWorkspace = useWorkspaceStore((state) => state.upsertWorkspace);
  const renameWorkspace = useWorkspaceStore((state) => state.renameWorkspace);
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace);
  const deleteWorkflow = useWorkflowStore((state) => state.deleteWorkflow);
  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);

  const sortedWorkspaces = useMemo(
    () =>
      [...workspaces].sort(
        (left, right) =>
          new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime(),
      ),
    [workspaces],
  );

  useEffect(() => {
    if (!token) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    const timeoutId = window.setTimeout(() => {
      setIsLoading(true);
      apiRequest<{ workspaces: BackendWorkspace[] }>("/workspaces", {}, token)
        .then((payload) => {
          if (!cancelled) {
            setWorkspaces(payload.workspaces.map(normalizeWorkspace));
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
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [router, setWorkspaces, token]);

  async function handleCreateWorkspace() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (token) {
        const payload = await apiRequest<{ workspace: BackendWorkspace }>(
          "/workspaces",
          {
            method: "POST",
            body: JSON.stringify({ name: trimmed }),
          },
          token,
        );
        const workspace = normalizeWorkspace(payload.workspace);
        upsertWorkspace(workspace);
        setSelectedWorkspaceId(workspace.id);
        setName("");
        router.push(`/workspace/${workspace.id}`);
        return;
      }

      router.replace("/login");
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }

  function handleOpenWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    router.push(`/workspace/${workspaceId}`);
  }

  async function handleDeleteWorkspace(workspaceId: string) {
    setErrorMessage(null);

    try {
      if (token) {
        await apiRequest(`/workspaces/${workspaceId}`, { method: "DELETE" }, token);
      }

      deleteWorkspace(workspaceId);
      deleteWorkflow(workspaceId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    }
  }

  async function handleRenameWorkspace(workspaceId: string, nextName: string) {
    if (!nextName) {
      setEditingId(null);
      return;
    }

    setErrorMessage(null);

    try {
      if (token) {
        const payload = await apiRequest<{ workspace: BackendWorkspace }>(
          `/workspaces/${workspaceId}`,
          {
            method: "PATCH",
            body: JSON.stringify({ name: nextName }),
          },
          token,
        );
        upsertWorkspace(normalizeWorkspace(payload.workspace));
      } else {
        renameWorkspace(workspaceId, nextName);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setEditingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-[#f6f7f8] text-slate-950">
      <section className="mx-auto flex min-h-screen max-w-7xl flex-col px-6 py-8">
        <header className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Forge
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">Workspace Dashboard</h1>
          </div>
          <Link
            href="/dashboard"
            className="rounded-md border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600"
          >
            All Workspaces
          </Link>
        </header>

        {!token ? (
          <div className="mt-6 rounded-md border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
            Redirecting to login...
          </div>
        ) : null}

        <div className="mt-6 flex flex-col gap-4 border-b border-slate-200 pb-6 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-sm text-slate-600">
              Create and manage workflow workspaces. Opening a workspace takes you directly to the canvas editor.
            </p>
          </div>
          <div className="flex w-full max-w-xl gap-3">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  handleCreateWorkspace();
                }
              }}
              placeholder="New workspace name"
              className="h-10 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none ring-0 placeholder:text-slate-400 focus:border-slate-950"
            />
            <Button onClick={handleCreateWorkspace} disabled={isLoading} className="h-10 rounded-md px-4">
              <Plus />
              {isLoading ? "Working..." : "Create Workspace"}
            </Button>
          </div>
        </div>

        {errorMessage ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {errorMessage}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {sortedWorkspaces.length === 0 ? (
            <div className="col-span-full flex min-h-64 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white text-sm text-slate-500">
              No workspaces yet. Create one to start building a workflow.
            </div>
          ) : null}

          {sortedWorkspaces.map((workspace) => {
            const isEditing = editingId === workspace.id;

            return (
              <article
                key={workspace.id}
                className="flex min-h-40 flex-col justify-between rounded-lg border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]"
              >
                <div>
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={(event) => setEditingName(event.target.value)}
                      onBlur={() => {
                        const nextName = editingName.trim();
                        void handleRenameWorkspace(workspace.id, nextName);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          const nextName = editingName.trim();
                          void handleRenameWorkspace(workspace.id, nextName);
                        }

                        if (event.key === "Escape") {
                          setEditingId(null);
                        }
                      }}
                      className="h-9 w-full rounded-md border border-slate-300 px-3 text-sm font-semibold outline-none focus:border-slate-950"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleOpenWorkspace(workspace.id)}
                      className="text-left"
                    >
                      <h2 className="text-lg font-semibold tracking-tight">{workspace.name}</h2>
                    </button>
                  )}

                  <p className="mt-3 text-sm text-slate-500">
                    Last edited: {formatRelativeTime(workspace.updatedAt)}
                  </p>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <Button
                    variant="outline"
                    onClick={() => handleOpenWorkspace(workspace.id)}
                    className="rounded-md"
                  >
                    Open Workspace
                  </Button>

                  <div className="flex gap-2">
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingId(workspace.id);
                        setEditingName(workspace.name);
                      }}
                      className="rounded-md text-slate-500"
                    >
                      <Pencil />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => void handleDeleteWorkspace(workspace.id)}
                      className="rounded-md text-slate-500"
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function normalizeWorkspace(workspace: BackendWorkspace): Workspace {
  return {
    id: workspace.id,
    name: workspace.name,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt ?? workspace.createdAt,
  };
}
