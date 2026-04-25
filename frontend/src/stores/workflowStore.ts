"use client";

import type { OnEdgesChange, OnNodesChange, Viewport } from "@xyflow/react";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  reconnectEdge,
} from "@xyflow/react";
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { createEmptyWorkflow, cloneSnapshot, getSnapshot } from "@/features/workflow/utils";
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowSnapshot,
} from "@/features/workflow/types";

type WorkflowStore = {
  workflows: Record<string, WorkflowDocument>;
  ensureWorkflow: (workspaceId: string) => void;
  deleteWorkflow: (workspaceId: string) => void;
  getWorkflow: (workspaceId: string) => WorkflowDocument;
  setViewport: (workspaceId: string, viewport: Viewport) => void;
  replaceSnapshot: (workspaceId: string, snapshot: WorkflowSnapshot, options?: { pushHistory?: boolean }) => void;
  onNodesChange: (workspaceId: string, changes: Parameters<OnNodesChange<WorkflowNode>>[0]) => void;
  onEdgesChange: (workspaceId: string, changes: Parameters<OnEdgesChange<WorkflowEdge>>[0]) => void;
  setNodes: (workspaceId: string, nodes: WorkflowNode[], options?: { pushHistory?: boolean }) => void;
  setEdges: (workspaceId: string, edges: WorkflowEdge[], options?: { pushHistory?: boolean }) => void;
  addConnection: (workspaceId: string, edge: WorkflowEdge) => void;
  reconnectConnection: (workspaceId: string, oldEdge: WorkflowEdge, newConnection: Partial<WorkflowEdge>) => void;
  updateNodeData: (workspaceId: string, nodeId: string, updater: (node: WorkflowNode) => WorkflowNode) => void;
  removeSelectedNodes: (workspaceId: string) => void;
  saveWorkflow: (workspaceId: string) => void;
  failSave: (workspaceId: string, message: string) => void;
  clearSaveError: (workspaceId: string) => void;
  deployWorkflow: (workspaceId: string) => void;
  undo: (workspaceId: string) => void;
  redo: (workspaceId: string) => void;
};

function withHistory(
  document: WorkflowDocument,
  next: Partial<WorkflowDocument>,
  options?: { pushHistory?: boolean; markDirty?: boolean },
) {
  const pushHistory = options?.pushHistory ?? true;
  const markDirty = options?.markDirty ?? true;
  const history = pushHistory
    ? [...document.history.slice(-39), cloneSnapshot(getSnapshot(document))]
    : document.history;

  return {
    ...document,
    ...next,
    history,
    future: pushHistory ? [] : document.future,
    dirty: markDirty ? true : document.dirty,
    saveError: markDirty ? null : document.saveError,
  };
}

export const useWorkflowStore = create<WorkflowStore>()(
  persist(
    (set, get) => ({
      workflows: {},
      ensureWorkflow: (workspaceId) => {
        const existing = get().workflows[workspaceId];
        if (existing) {
          return;
        }

        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: createEmptyWorkflow(workspaceId),
          },
        }));
      },
      deleteWorkflow: (workspaceId) => {
        set((state) => {
          const next = { ...state.workflows };
          delete next[workspaceId];
          return { workflows: next };
        });
      },
      getWorkflow: (workspaceId) => {
        return get().workflows[workspaceId] ?? createEmptyWorkflow(workspaceId);
      },
      setViewport: (workspaceId, viewport) => {
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...get().getWorkflow(workspaceId),
              viewport,
            },
          },
        }));
      },
      replaceSnapshot: (workspaceId, snapshot, options) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(
              document,
              {
                nodes: snapshot.nodes,
                edges: snapshot.edges,
                viewport: snapshot.viewport,
              },
              { pushHistory: options?.pushHistory ?? true },
            ),
          },
        }));
      },
      onNodesChange: (workspaceId, changes) => {
        const document = get().getWorkflow(workspaceId);
        const shouldPushHistory = changes.some((change) =>
          ["remove", "add", "replace"].includes(change.type),
        );
        const shouldMarkDirty = changes.some((change) =>
          ["remove", "add", "replace"].includes(change.type),
        );
        const nodes = applyNodeChanges(changes, document.nodes);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, { nodes }, {
              pushHistory: shouldPushHistory,
              markDirty: shouldMarkDirty,
            }),
          },
        }));
      },
      onEdgesChange: (workspaceId, changes) => {
        const document = get().getWorkflow(workspaceId);
        const shouldPushHistory = changes.some((change) =>
          ["remove", "add", "replace"].includes(change.type),
        );
        const shouldMarkDirty = changes.some((change) =>
          ["remove", "add", "replace"].includes(change.type),
        );
        const edges = applyEdgeChanges(changes, document.edges);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, { edges }, {
              pushHistory: shouldPushHistory,
              markDirty: shouldMarkDirty,
            }),
          },
        }));
      },
      setNodes: (workspaceId, nodes, options) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, { nodes }, {
              pushHistory: options?.pushHistory ?? true,
            }),
          },
        }));
      },
      setEdges: (workspaceId, edges, options) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, { edges }, {
              pushHistory: options?.pushHistory ?? true,
            }),
          },
        }));
      },
      addConnection: (workspaceId, edge) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, { edges: addEdge(edge, document.edges) }),
          },
        }));
      },
      reconnectConnection: (workspaceId, oldEdge, newConnection) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, {
              edges: reconnectEdge(oldEdge, newConnection, document.edges),
            }),
          },
        }));
      },
      updateNodeData: (workspaceId, nodeId, updater) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, {
              nodes: document.nodes.map((node) => (node.id === nodeId ? updater(node) : node)),
            }),
          },
        }));
      },
      removeSelectedNodes: (workspaceId) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: withHistory(document, {
              nodes: document.nodes.filter((node) => !node.selected),
              edges: document.edges.filter((edge) => !edge.selected),
            }),
          },
        }));
      },
      saveWorkflow: (workspaceId) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...document,
              dirty: false,
              saveError: null,
              lastSavedAt: new Date().toISOString(),
            },
          },
        }));
      },
      failSave: (workspaceId, message) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...document,
              saveError: message,
            },
          },
        }));
      },
      clearSaveError: (workspaceId) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...document,
              saveError: null,
            },
          },
        }));
      },
      deployWorkflow: (workspaceId) => {
        const document = get().getWorkflow(workspaceId);
        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...document,
              status: "Deployed",
              executionState: "Idle",
              dirty: false,
              lastSavedAt: new Date().toISOString(),
              saveError: null,
            },
          },
        }));
      },
      undo: (workspaceId) => {
        const document = get().getWorkflow(workspaceId);
        const previous = document.history.at(-1);
        if (!previous) {
          return;
        }

        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...document,
              ...cloneSnapshot(previous),
              history: document.history.slice(0, -1),
              future: [cloneSnapshot(getSnapshot(document)), ...document.future].slice(0, 40),
              dirty: true,
            },
          },
        }));
      },
      redo: (workspaceId) => {
        const document = get().getWorkflow(workspaceId);
        const next = document.future[0];
        if (!next) {
          return;
        }

        set((state) => ({
          workflows: {
            ...state.workflows,
            [workspaceId]: {
              ...document,
              ...cloneSnapshot(next),
              history: [...document.history, cloneSnapshot(getSnapshot(document))].slice(-40),
              future: document.future.slice(1),
              dirty: true,
            },
          },
        }));
      },
    }),
    {
      name: "forge-workflows",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
