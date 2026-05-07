"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeType } from "@/features/workflow/types";

type UiStore = {
  selectedWorkspaceId: string | null;
  selectedNodeId: string | null;
  configNodeId: string | null;
  nodeSearch: string;
  collapsedCategories: string[];
  activeNodeCategory: string | null;
  recentlyUsedNodeTypes: WorkflowNodeType[];
  dragNodeType: WorkflowNodeType | null;
  setSelectedWorkspaceId: (workspaceId: string | null) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setConfigNodeId: (nodeId: string | null) => void;
  setNodeSearch: (value: string) => void;
  toggleCategory: (category: string) => void;
  setActiveNodeCategory: (category: string | null) => void;
  recordRecentlyUsedNode: (type: WorkflowNodeType) => void;
  setDragNodeType: (type: WorkflowNodeType | null) => void;
  syncSelection: (nodes: Node[], edges: Edge[]) => void;
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      selectedWorkspaceId: null,
      selectedNodeId: null,
      configNodeId: null,
      nodeSearch: "",
      collapsedCategories: [],
      activeNodeCategory: null,
      recentlyUsedNodeTypes: [],
      dragNodeType: null,
      setSelectedWorkspaceId: (selectedWorkspaceId) => set({ selectedWorkspaceId }),
      setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
      setConfigNodeId: (configNodeId) => set({ configNodeId }),
      setNodeSearch: (nodeSearch) => set({ nodeSearch }),
      toggleCategory: (category) =>
        set((state) => ({
          collapsedCategories: state.collapsedCategories.includes(category)
            ? state.collapsedCategories.filter((item) => item !== category)
            : [...state.collapsedCategories, category],
        })),
      setActiveNodeCategory: (activeNodeCategory) => set({ activeNodeCategory }),
      recordRecentlyUsedNode: (type) =>
        set((state) => ({
          recentlyUsedNodeTypes: [
            type,
            ...state.recentlyUsedNodeTypes.filter((item) => item !== type),
          ].slice(0, 5),
        })),
      setDragNodeType: (dragNodeType) => set({ dragNodeType }),
      syncSelection: (nodes) => {
        const selectedNode = nodes.find((node) => node.selected);
        set({ selectedNodeId: selectedNode?.id ?? null });
      },
    }),
    {
      name: "forge-ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        collapsedCategories: state.collapsedCategories,
        recentlyUsedNodeTypes: state.recentlyUsedNodeTypes,
        selectedWorkspaceId: state.selectedWorkspaceId,
      }),
    },
  ),
);
