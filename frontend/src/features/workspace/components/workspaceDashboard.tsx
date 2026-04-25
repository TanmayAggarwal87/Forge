"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useUiStore } from "@/stores/uiStore";
import { formatRelativeTime } from "@/features/workflow/utils";

export function WorkspaceDashboard() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  const workspaces = useWorkspaceStore((state) => state.workspaces);
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace);
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

  function handleCreateWorkspace() {
    const trimmed = name.trim();
    if (!trimmed) {
      return;
    }

    const workspaceId = createWorkspace(trimmed);
    setSelectedWorkspaceId(workspaceId);
    setName("");
    router.push(`/workspace/${workspaceId}`);
  }

  function handleOpenWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId);
    router.push(`/workspace/${workspaceId}`);
  }

  function handleDeleteWorkspace(workspaceId: string) {
    deleteWorkspace(workspaceId);
    deleteWorkflow(workspaceId);
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
            <Button onClick={handleCreateWorkspace} className="h-10 rounded-md px-4">
              <Plus />
              Create Workspace
            </Button>
          </div>
        </div>

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
                        if (nextName) {
                          renameWorkspace(workspace.id, nextName);
                        }
                        setEditingId(null);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          const nextName = editingName.trim();
                          if (nextName) {
                            renameWorkspace(workspace.id, nextName);
                          }
                          setEditingId(null);
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
                      onClick={() => handleDeleteWorkspace(workspace.id)}
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
