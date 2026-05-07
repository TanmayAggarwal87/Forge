"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  CloudUpload,
  FileCode2,
  Redo2,
  Save,
  Undo2,
  UserCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ArtifactDrawer } from "@/features/workflow/components/artifactDrawer";
import { NodeConfigPanel } from "@/features/workflow/components/nodeConfigPanel";
import { NodeLibrarySidebar } from "@/features/workflow/components/nodeLibrarySidebar";
import { StatusBar } from "@/features/workflow/components/statusBar";
import { WorkflowCanvas } from "@/features/workflow/components/workflowCanvas";
import {
  backendWorkflowToSnapshot,
  createBackendWorkflow,
  getBackendWorkflow,
  listBackendTemplates,
  listBackendWorkflows,
  saveBackendWorkflowSnapshot,
} from "@/features/workflow/backendWorkflowApi";
import { getErrorMessage } from "@/lib/apiClient";
import { getStoredSessionToken } from "@/lib/sessionStorage";
import { useUiStore } from "@/stores/uiStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";
import {
  workflowTemplates,
  type WorkflowTemplate,
} from "@/features/workflow/workflowTemplates";

type WorkspaceEditorProps = {
  workspaceId: string;
};

export function WorkspaceEditor({ workspaceId }: WorkspaceEditorProps) {
  const router = useRouter();
  const [artifactDrawerOpen, setArtifactDrawerOpen] = useState(false);
  const [token] = useState<string | null>(() => getStoredSessionToken());
  const [backendWorkflowId, setBackendWorkflowId] = useState<string | null>(null);
  const [isLoadingWorkspace, setIsLoadingWorkspace] = useState(false);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(false);
  const [isSavingRemote, setIsSavingRemote] = useState(false);
  const [remoteStatus, setRemoteStatus] = useState<string | null>(null);
  const [templateError, setTemplateError] = useState<string | null>(null);
  const [templates, setTemplates] = useState<WorkflowTemplate[]>(workflowTemplates);

  const ensureWorkflow = useWorkflowStore((state) => state.ensureWorkflow);
  const replaceSnapshot = useWorkflowStore((state) => state.replaceSnapshot);
  const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
  const deployWorkflow = useWorkflowStore((state) => state.deployWorkflow);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const failSave = useWorkflowStore((state) => state.failSave);
  const clearSaveError = useWorkflowStore((state) => state.clearSaveError);
  const workflow = useWorkflowStore((state) => state.workflows[workspaceId]);

  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const configNodeId = useUiStore((state) => state.configNodeId);
  const setConfigNodeId = useUiStore((state) => state.setConfigNodeId);

  const workspace = useWorkspaceStore((state) =>
    state.workspaces.find((candidate) => candidate.id === workspaceId),
  );
  const touchWorkspace = useWorkspaceStore((state) => state.touchWorkspace);

  useEffect(() => {
    ensureWorkflow(workspaceId);
    setSelectedWorkspaceId(workspaceId);
  }, [ensureWorkflow, setSelectedWorkspaceId, workspaceId]);

  useEffect(() => {
    if (!token) {
      router.replace("/login");
    }
  }, [router, token]);

  useEffect(() => {
    if (!token || !workspace) {
      return;
    }

    let cancelled = false;
    const activeToken = token;
    const activeWorkspace = workspace;

    async function hydrateWorkflow() {
      setIsLoadingWorkspace(true);
      setRemoteStatus("Loading workspace...");

      try {
        const listed = await listBackendWorkflows(workspaceId, activeToken);
        const existingWorkflow =
          listed.workflows.find((candidate) => candidate.name === activeWorkspace.name) ??
          listed.workflows[0];
        const backendWorkflow = existingWorkflow
          ? await getBackendWorkflow(existingWorkflow.id, activeToken)
          : await createBackendWorkflow(workspaceId, activeWorkspace.name, activeToken);

        if (cancelled) {
          return;
        }

        setBackendWorkflowId(backendWorkflow.workflow.id);
        replaceSnapshot(
          workspaceId,
          backendWorkflowToSnapshot(backendWorkflow.workflow),
          { pushHistory: false },
        );
        saveWorkflow(workspaceId);
        setRemoteStatus("Saved");
      } catch (error) {
        if (!cancelled) {
          setBackendWorkflowId(null);
          setRemoteStatus("Backend unavailable. Using local draft.");
          failSave(workspaceId, getErrorMessage(error));
        }
      } finally {
        if (!cancelled) {
          setIsLoadingWorkspace(false);
        }
      }
    }

    void hydrateWorkflow();

    return () => {
      cancelled = true;
    };
  }, [
    failSave,
    replaceSnapshot,
    saveWorkflow,
    token,
    workspace,
    workspaceId,
  ]);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    const activeToken = token;
    const timeoutId = window.setTimeout(() => {
      setIsLoadingTemplates(true);
      setTemplateError(null);

      listBackendTemplates(activeToken)
        .then((nextTemplates) => {
          if (!cancelled) {
            setTemplates(nextTemplates);
          }
        })
        .catch((error) => {
          if (!cancelled) {
            setTemplateError("Unable to load templates");
            setTemplates(workflowTemplates);
            setRemoteStatus(getErrorMessage(error));
          }
        })
        .finally(() => {
          if (!cancelled) {
            setIsLoadingTemplates(false);
          }
        });
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
    };
  }, [token]);

  useEffect(() => {
    if (!workspace) {
      router.replace("/dashboard");
    }
  }, [router, workspace]);

  const saveCurrentWorkflow = useCallback(async () => {
    if (!workflow || !workspace) {
      return;
    }

    clearSaveError(workspaceId);

    if (!token || !backendWorkflowId) {
      saveWorkflow(workspaceId);
      touchWorkspace(workspaceId);
      return;
    }

    setIsSavingRemote(true);
    setRemoteStatus("Saving...");

    try {
      await saveBackendWorkflowSnapshot(
        backendWorkflowId,
        {
          nodes: workflow.nodes,
          edges: workflow.edges,
          viewport: workflow.viewport,
        },
        token,
      );
      saveWorkflow(workspaceId);
      touchWorkspace(workspaceId);
      setRemoteStatus("Saved");
    } catch (error) {
      const message = getErrorMessage(error);
      failSave(workspaceId, message);
      setRemoteStatus("Unable to save");
    } finally {
      setIsSavingRemote(false);
    }
  }, [
    backendWorkflowId,
    clearSaveError,
    failSave,
    saveWorkflow,
    token,
    touchWorkspace,
    workflow,
    workspace,
    workspaceId,
  ]);

  useEffect(() => {
    if (!workflow || !workspace || !workflow.dirty) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void saveCurrentWorkflow();
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [saveCurrentWorkflow, workflow, workspace]);

  const selectedNode = useMemo(
    () => workflow?.nodes.find((node) => node.id === configNodeId) ?? null,
    [configNodeId, workflow?.nodes],
  );

  useEffect(() => {
    if (!configNodeId || selectedNode) {
      return;
    }

    setConfigNodeId(null);
  }, [configNodeId, selectedNode, setConfigNodeId]);

  if (!token) {
    return (
      <main className="grid h-screen place-items-center bg-[#f6f7f8] text-sm text-slate-600">
        Redirecting to login...
      </main>
    );
  }

  if (!workspace || !workflow) {
    return null;
  }

  return (
    <main className="flex h-screen min-h-screen flex-col overflow-hidden bg-[#f6f7f8] text-slate-950">
      <header className="flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="inline-flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-600"
          >
            <ChevronLeft className="size-4" />
          </Link>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
              Workspace
            </p>
            <h1 className="text-sm font-semibold text-slate-900">{workspace.name}</h1>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => undo(workspaceId)} className="rounded-md">
            <Undo2 />
            Undo
          </Button>
          <Button variant="outline" onClick={() => redo(workspaceId)} className="rounded-md">
            <Redo2 />
            Redo
          </Button>
          <Button
            variant="outline"
            onClick={() => void saveCurrentWorkflow()}
            disabled={isSavingRemote}
            className="rounded-md"
          >
            <Save />
            {isSavingRemote ? "Saving" : "Save"}
          </Button>
          <Button
            onClick={() => {
              deployWorkflow(workspaceId);
              touchWorkspace(workspaceId);
            }}
            className="rounded-md"
          >
            <CloudUpload />
            Deploy
          </Button>
          <Button
            variant={artifactDrawerOpen ? "default" : "outline"}
            onClick={() => setArtifactDrawerOpen((open) => !open)}
            className="rounded-md"
          >
            <FileCode2 />
            Artifacts
          </Button>
          <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <UserCircle2 className="size-4" />
            Profile
          </div>
        </div>
      </header>

      <section
        className={`grid min-h-0 flex-1 overflow-hidden ${
          artifactDrawerOpen || selectedNode
            ? "grid-cols-[280px_minmax(0,1fr)_420px]"
            : "grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <NodeLibrarySidebar
          workspaceId={workspaceId}
          workflow={workflow}
          templates={templates}
          templatesError={templateError}
          templatesLoading={isLoadingTemplates}
        />
        <div className="min-w-0">
          {isLoadingWorkspace ? (
            <div className="grid h-full place-items-center bg-[#fbfbfc] text-sm text-slate-500">
              Loading workspace...
            </div>
          ) : (
            <WorkflowCanvas workspaceId={workspaceId} workflow={workflow} />
          )}
        </div>
        {artifactDrawerOpen ? (
          <ArtifactDrawer
            workflow={workflow}
            backendWorkflowId={backendWorkflowId}
            token={token}
            onClose={() => setArtifactDrawerOpen(false)}
          />
        ) : selectedNode ? (
          <NodeConfigPanel workspaceId={workspaceId} node={selectedNode} />
        ) : null}
      </section>

      <StatusBar
        workflow={workflow}
        syncLabel={remoteStatus}
        onRetry={() => {
          void saveCurrentWorkflow();
        }}
      />
    </main>
  );
}
