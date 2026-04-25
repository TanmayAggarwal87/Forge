"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  CloudUpload,
  Redo2,
  Save,
  Undo2,
  UserCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { NodeConfigPanel } from "@/features/workflow/components/nodeConfigPanel";
import { NodeLibrarySidebar } from "@/features/workflow/components/nodeLibrarySidebar";
import { StatusBar } from "@/features/workflow/components/statusBar";
import { WorkflowCanvas } from "@/features/workflow/components/workflowCanvas";
import { useUiStore } from "@/stores/uiStore";
import { useWorkflowStore } from "@/stores/workflowStore";
import { useWorkspaceStore } from "@/stores/workspaceStore";

type WorkspaceEditorProps = {
  workspaceId: string;
};

export function WorkspaceEditor({ workspaceId }: WorkspaceEditorProps) {
  const router = useRouter();

  const ensureWorkflow = useWorkflowStore((state) => state.ensureWorkflow);
  const saveWorkflow = useWorkflowStore((state) => state.saveWorkflow);
  const deployWorkflow = useWorkflowStore((state) => state.deployWorkflow);
  const undo = useWorkflowStore((state) => state.undo);
  const redo = useWorkflowStore((state) => state.redo);
  const failSave = useWorkflowStore((state) => state.failSave);
  const clearSaveError = useWorkflowStore((state) => state.clearSaveError);
  const workflow = useWorkflowStore((state) => state.workflows[workspaceId]);

  const setSelectedWorkspaceId = useUiStore((state) => state.setSelectedWorkspaceId);
  const selectedNodeId = useUiStore((state) => state.selectedNodeId);

  const workspace = useWorkspaceStore((state) =>
    state.workspaces.find((candidate) => candidate.id === workspaceId),
  );
  const touchWorkspace = useWorkspaceStore((state) => state.touchWorkspace);

  useEffect(() => {
    ensureWorkflow(workspaceId);
    setSelectedWorkspaceId(workspaceId);
  }, [ensureWorkflow, setSelectedWorkspaceId, workspaceId]);

  useEffect(() => {
    if (!workspace) {
      router.replace("/dashboard");
    }
  }, [router, workspace]);

  useEffect(() => {
    if (!workflow || !workspace) {
      return;
    }

    if (!workflow.dirty) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      try {
        saveWorkflow(workspaceId);
        touchWorkspace(workspaceId);
      } catch {
        failSave(workspaceId, "Unable to save workflow");
      }
    }, 600);

    return () => window.clearTimeout(timeoutId);
  }, [failSave, saveWorkflow, touchWorkspace, workflow, workspace, workspaceId]);

  const selectedNode = useMemo(
    () => workflow?.nodes.find((node) => node.id === selectedNodeId) ?? null,
    [selectedNodeId, workflow?.nodes],
  );

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
            onClick={() => {
              clearSaveError(workspaceId);
              saveWorkflow(workspaceId);
              touchWorkspace(workspaceId);
            }}
            className="rounded-md"
          >
            <Save />
            Save
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
          <div className="flex items-center gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-600">
            <UserCircle2 className="size-4" />
            Profile
          </div>
        </div>
      </header>

      <section
        className={`grid min-h-0 flex-1 overflow-hidden ${
          selectedNode
            ? "grid-cols-[280px_minmax(0,1fr)_340px]"
            : "grid-cols-[280px_minmax(0,1fr)]"
        }`}
      >
        <NodeLibrarySidebar />
        <div className="min-w-0">
          <WorkflowCanvas workspaceId={workspaceId} workflow={workflow} />
        </div>
        {selectedNode ? <NodeConfigPanel workspaceId={workspaceId} node={selectedNode} /> : null}
      </section>

      <StatusBar
        workflow={workflow}
        onRetry={() => {
          clearSaveError(workspaceId);
          saveWorkflow(workspaceId);
          touchWorkspace(workspaceId);
        }}
      />
    </main>
  );
}
