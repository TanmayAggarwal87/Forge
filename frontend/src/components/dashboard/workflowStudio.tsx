import { FormEvent, useMemo, useState } from "react";
import {
  Cable,
  CircleAlert,
  Code2,
  GitBranch,
  Layers3,
  Play,
  Plus,
  Save,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  NodeDefinition,
  Project,
  Workflow,
  WorkflowCompilationResult,
} from "@/types/domainTypes";

type WorkflowStudioProps = {
  autosaveState: "idle" | "pending" | "saving" | "saved" | "error";
  compilationResult: WorkflowCompilationResult | null;
  isBusy: boolean;
  isCompilingDraft: boolean;
  isSavingDraft: boolean;
  nodeDefinitions: NodeDefinition[];
  onAddEdge: (sourceNodeId: string, targetNodeId: string, label: string) => void;
  onAddNode: (definition: NodeDefinition) => void;
  onCompileDraft: () => void;
  onCreateWorkflow: (event: FormEvent<HTMLFormElement>) => void;
  onRemoveEdge: (edgeId: string) => void;
  onRemoveNode: (nodeId: string) => void;
  onSelectWorkflow: (workflowId: string) => void;
  onSetWorkflowDescription: (value: string) => void;
  onSetWorkflowName: (value: string) => void;
  onUpdateNodeConfig: (nodeId: string, rawConfig: string) => void;
  onUpdateNodeLabel: (nodeId: string, label: string) => void;
  onWorkflowDraftDescriptionChange: (value: string) => void;
  onWorkflowDraftNameChange: (value: string) => void;
  selectedProject: Project | null;
  selectedWorkflowId: string | null;
  workflowDescription: string;
  workflowDraft: Workflow | null;
  workflowName: string;
  workflows: Workflow[];
};

function getAutosaveLabel(state: WorkflowStudioProps["autosaveState"]) {
  switch (state) {
    case "pending":
      return "Changes pending";
    case "saving":
      return "Autosaving";
    case "saved":
      return "All changes saved";
    case "error":
      return "Autosave failed";
    default:
      return "Draft ready";
  }
}

export function WorkflowStudio({
  autosaveState,
  compilationResult,
  isBusy,
  isCompilingDraft,
  isSavingDraft,
  nodeDefinitions,
  onAddEdge,
  onAddNode,
  onCompileDraft,
  onCreateWorkflow,
  onRemoveEdge,
  onRemoveNode,
  onSelectWorkflow,
  onSetWorkflowDescription,
  onSetWorkflowName,
  onUpdateNodeConfig,
  onUpdateNodeLabel,
  onWorkflowDraftDescriptionChange,
  onWorkflowDraftNameChange,
  selectedProject,
  selectedWorkflowId,
  workflowDescription,
  workflowDraft,
  workflowName,
  workflows,
}: WorkflowStudioProps) {
  const [sourceNodeId, setSourceNodeId] = useState("");
  const [targetNodeId, setTargetNodeId] = useState("");
  const [edgeLabel, setEdgeLabel] = useState("");

  const validationIssues = workflowDraft?.draftVersion.validation.issues ?? [];
  const validationTone =
    workflowDraft?.draftVersion.validation.isValid === false
      ? "border-amber-200 bg-amber-50"
      : "border-emerald-200 bg-emerald-50";

  const groupedDefinitions = useMemo(() => {
    return nodeDefinitions.reduce<Record<string, NodeDefinition[]>>(
      (currentGroups, definition) => {
        const currentGroup = currentGroups[definition.category] ?? [];
        currentGroup.push(definition);
        currentGroups[definition.category] = currentGroup;
        return currentGroups;
      },
      {},
    );
  }, [nodeDefinitions]);

  function handleCreateEdge(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sourceNodeId || !targetNodeId) {
      return;
    }

    onAddEdge(sourceNodeId, targetNodeId, edgeLabel);
    setEdgeLabel("");
    setSourceNodeId("");
    setTargetNodeId("");
  }

  if (!selectedProject) {
    return (
      <section className="rounded-3xl border border-dashed border-stone-300 bg-white/80 p-6 text-sm text-stone-600 shadow-sm">
        Create or select a project to start storing workflow drafts.
      </section>
    );
  }

  return (
    <section className="grid gap-5 xl:grid-cols-[320px_1fr]">
      <div className="grid gap-5">
        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <GitBranch className="size-4 text-amber-600" />
            Workflows in {selectedProject.name}
          </div>
          <form
            onSubmit={onCreateWorkflow}
            className="grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3"
          >
            <input
              className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
              value={workflowName}
              placeholder="Workflow name"
              onChange={(event) => onSetWorkflowName(event.target.value)}
              required
            />
            <textarea
              className="min-h-24 rounded-2xl border border-stone-300 px-3 py-2 text-sm outline-none focus:border-stone-950"
              value={workflowDescription}
              placeholder="What this workflow is meant to do"
              onChange={(event) => onSetWorkflowDescription(event.target.value)}
            />
            <Button disabled={isBusy} className="rounded-xl">
              <Plus />
              Create workflow draft
            </Button>
          </form>

          <div className="mt-4 grid gap-3">
            {workflows.length === 0 ? (
              <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-600">
                No workflow drafts yet for this project.
              </p>
            ) : (
              workflows.map((workflow) => (
                <button
                  key={workflow.id}
                  onClick={() => onSelectWorkflow(workflow.id)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    workflow.id === selectedWorkflowId
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-200 bg-white hover:border-amber-300 hover:bg-amber-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold">{workflow.name}</p>
                      <p className="mt-1 text-sm opacity-80">
                        {workflow.description ?? "No description"}
                      </p>
                    </div>
                    <span className="rounded-xl bg-black/5 px-2 py-1 text-[11px] uppercase tracking-[0.12em]">
                      {workflow.status}
                    </span>
                  </div>
                  <p className="mt-3 text-xs opacity-70">
                    {workflow.draftVersion.graph.nodes.length} nodes ·{" "}
                    {workflow.draftVersion.graph.edges.length} edges
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2 font-semibold">
            <Layers3 className="size-4 text-amber-600" />
            Node registry
          </div>
          <div className="grid gap-4">
            {Object.entries(groupedDefinitions).map(([category, definitions]) => (
              <div key={category} className="grid gap-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">
                  {category}
                </p>
                {definitions.map((definition) => (
                  <button
                    key={definition.type}
                    onClick={() => onAddNode(definition)}
                    disabled={!workflowDraft}
                    className="rounded-2xl border border-stone-200 p-3 text-left transition hover:border-stone-950 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-stone-950">
                          {definition.title}
                        </p>
                        <p className="mt-1 text-sm text-stone-600">
                          {definition.description}
                        </p>
                      </div>
                      <span className="rounded-xl bg-stone-100 px-2 py-1 text-xs text-stone-600">
                        {definition.executionMode}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-5">
        {!workflowDraft ? (
          <div className="rounded-3xl border border-dashed border-stone-300 bg-white p-6 text-sm text-stone-600 shadow-sm">
            Select a workflow draft to inspect and edit its stored graph.
          </div>
        ) : (
          <>
            <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="grid flex-1 gap-3">
                  <input
                    className="h-11 rounded-2xl border border-stone-300 px-4 text-lg font-semibold outline-none focus:border-stone-950"
                    value={workflowDraft.name}
                    onChange={(event) =>
                      onWorkflowDraftNameChange(event.target.value)
                    }
                  />
                  <textarea
                    className="min-h-24 rounded-2xl border border-stone-300 px-4 py-3 text-sm outline-none focus:border-stone-950"
                    value={workflowDraft.description ?? ""}
                    onChange={(event) =>
                      onWorkflowDraftDescriptionChange(event.target.value)
                    }
                  />
                </div>
                <div className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm text-stone-600">
                  <div className="flex items-center gap-2 font-medium text-stone-950">
                    <Save className="size-4 text-amber-600" />
                    {getAutosaveLabel(autosaveState)}
                  </div>
                  <p className="mt-1 text-xs text-stone-500">
                    {isSavingDraft
                      ? "Saving latest graph changes to the backend."
                      : `Draft version ${workflowDraft.draftVersion.versionNumber}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="grid gap-5 2xl:grid-cols-[1.1fr_0.9fr]">
              <div className="grid gap-5">
                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2 font-semibold">
                    <Layers3 className="size-4 text-amber-600" />
                    Draft nodes
                  </div>
                  <div className="grid gap-3">
                    {workflowDraft.draftVersion.graph.nodes.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-600">
                        Add nodes from the registry to start building the graph.
                      </p>
                    ) : (
                      workflowDraft.draftVersion.graph.nodes.map((node) => (
                        <article
                          key={node.id}
                          className="rounded-2xl border border-stone-200 p-4"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <div className="grid flex-1 gap-3">
                              <input
                                className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
                                value={node.label}
                                onChange={(event) =>
                                  onUpdateNodeLabel(node.id, event.target.value)
                                }
                              />
                              <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500">
                                <span className="rounded-xl bg-stone-100 px-2 py-1">
                                  {node.type}
                                </span>
                                <span>
                                  {Math.round(node.position.x)},{Math.round(node.position.y)}
                                </span>
                              </div>
                              <textarea
                                className="min-h-28 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-mono text-xs outline-none focus:border-stone-950"
                                defaultValue={JSON.stringify(node.config, null, 2)}
                                spellCheck={false}
                                onBlur={(event) =>
                                  onUpdateNodeConfig(node.id, event.target.value)
                                }
                              />
                            </div>
                            <Button
                              variant="outline"
                              size="icon-sm"
                              onClick={() => onRemoveNode(node.id)}
                            >
                              <Trash2 />
                            </Button>
                          </div>
                        </article>
                      ))
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-stone-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2 font-semibold">
                    <Cable className="size-4 text-amber-600" />
                    Draft edges
                  </div>
                  <form
                    onSubmit={handleCreateEdge}
                    className="mb-4 grid gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3 md:grid-cols-[1fr_1fr_1fr_auto]"
                  >
                    <select
                      className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
                      value={sourceNodeId}
                      onChange={(event) => setSourceNodeId(event.target.value)}
                      required
                    >
                      <option value="">Source node</option>
                      {workflowDraft.draftVersion.graph.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                    <select
                      className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
                      value={targetNodeId}
                      onChange={(event) => setTargetNodeId(event.target.value)}
                      required
                    >
                      <option value="">Target node</option>
                      {workflowDraft.draftVersion.graph.nodes.map((node) => (
                        <option key={node.id} value={node.id}>
                          {node.label}
                        </option>
                      ))}
                    </select>
                    <input
                      className="h-10 rounded-xl border border-stone-300 px-3 text-sm outline-none focus:border-stone-950"
                      value={edgeLabel}
                      placeholder="Label (optional)"
                      onChange={(event) => setEdgeLabel(event.target.value)}
                    />
                    <Button
                      disabled={workflowDraft.draftVersion.graph.nodes.length < 2}
                      className="rounded-xl"
                    >
                      <Plus />
                      Add edge
                    </Button>
                  </form>

                  <div className="grid gap-3">
                    {workflowDraft.draftVersion.graph.edges.length === 0 ? (
                      <p className="rounded-2xl border border-dashed border-stone-300 p-4 text-sm text-stone-600">
                        No edges yet. Connect stored nodes to define execution flow.
                      </p>
                    ) : (
                      workflowDraft.draftVersion.graph.edges.map((edge) => (
                        <article
                          key={edge.id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 p-4"
                        >
                          <div>
                            <p className="font-medium text-stone-950">
                              {edge.sourceNodeId} → {edge.targetNodeId}
                            </p>
                            <p className="mt-1 text-sm text-stone-600">
                              {edge.label ?? "Unlabeled connection"}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            size="icon-sm"
                            onClick={() => onRemoveEdge(edge.id)}
                          >
                            <Trash2 />
                          </Button>
                        </article>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div
                className={`rounded-3xl border p-5 shadow-sm ${validationTone}`}
              >
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-2 font-semibold text-stone-950">
                    <CircleAlert className="size-4 text-amber-700" />
                    Draft validation
                  </div>
                  <Button
                    variant="outline"
                    className="rounded-xl"
                    disabled={isCompilingDraft || autosaveState === "saving"}
                    onClick={onCompileDraft}
                  >
                    <Play />
                    {isCompilingDraft ? "Compiling" : "Compile draft"}
                  </Button>
                </div>
                <div className="rounded-2xl border border-white/80 bg-white/70 p-4 text-sm text-stone-700">
                  <p className="font-medium text-stone-950">
                    {workflowDraft.draftVersion.validation.isValid
                      ? "No structural errors detected."
                      : "Draft has structural issues that block publish later."}
                  </p>
                  <p className="mt-2 text-stone-600">
                    Phase 2 saves drafts even when warnings or validation errors exist.
                  </p>
                </div>
                <div className="mt-4 grid gap-3">
                  {validationIssues.length === 0 ? (
                    <p className="rounded-2xl border border-white/80 bg-white/70 p-4 text-sm text-stone-600">
                      This draft has no warnings yet.
                    </p>
                  ) : (
                    validationIssues.map((issue, index) => (
                      <article
                        key={`${issue.code}-${index}`}
                        className="rounded-2xl border border-white/80 bg-white/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <p className="font-medium text-stone-950">
                            {issue.message}
                          </p>
                          <span className="rounded-xl bg-stone-100 px-2 py-1 text-xs uppercase tracking-[0.12em] text-stone-600">
                            {issue.severity}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-stone-500">
                          {issue.code}
                          {issue.field ? ` · ${issue.field}` : ""}
                        </p>
                      </article>
                    ))
                  )}
                </div>

                {compilationResult ? (
                  <div className="mt-4 rounded-2xl border border-white/80 bg-white/80 p-4">
                    <div className="flex items-center gap-2 font-semibold text-stone-950">
                      <Code2 className="size-4 text-amber-700" />
                      Compiler readiness
                    </div>
                    <p className="mt-2 text-sm text-stone-700">
                      {compilationResult.isValid
                        ? "Draft compiles to executable IR."
                        : "Compiler found hard errors that block publish."}
                    </p>
                    {compilationResult.ir ? (
                      <div className="mt-3 grid gap-2 rounded-xl bg-stone-950 p-3 font-mono text-xs text-stone-100">
                        <p>hash {compilationResult.ir.graphHash.slice(0, 16)}</p>
                        <p>
                          order {compilationResult.ir.executionOrder.join(" -> ")}
                        </p>
                      </div>
                    ) : null}
                    {compilationResult.issues.length > 0 ? (
                      <div className="mt-3 grid gap-2">
                        {compilationResult.issues.map((issue, index) => (
                          <article
                            key={`compile-${issue.code}-${index}`}
                            className="rounded-xl border border-stone-200 bg-white p-3"
                          >
                            <div className="flex items-center justify-between gap-3">
                              <p className="text-sm font-medium text-stone-950">
                                {issue.message}
                              </p>
                              <span className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-stone-600">
                                {issue.severity}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-stone-500">
                              {issue.code}
                              {issue.field ? ` - ${issue.field}` : ""}
                            </p>
                          </article>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
