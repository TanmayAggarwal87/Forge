"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Edge, Node } from "@xyflow/react";
import type { WorkflowNodeType } from "@/features/workflow/types";

type UiStore = {
  selectedWorkspaceId: string | null;
  selectedNodeId: string | null;
  nodeSearch: string;
  collapsedCategories: string[];
  dragNodeType: WorkflowNodeType | null;
  setSelectedWorkspaceId: (workspaceId: string | null) => void;
  setSelectedNodeId: (nodeId: string | null) => void;
  setNodeSearch: (value: string) => void;
  toggleCategory: (category: string) => void;
  setDragNodeType: (type: WorkflowNodeType | null) => void;
  syncSelection: (nodes: Node[], edges: Edge[]) => void;
};

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      selectedWorkspaceId: null,
      selectedNodeId: null,
      nodeSearch: "",
      collapsedCategories: [],
      dragNodeType: null,
      setSelectedWorkspaceId: (selectedWorkspaceId) => set({ selectedWorkspaceId }),
      setSelectedNodeId: (selectedNodeId) => set({ selectedNodeId }),
      setNodeSearch: (nodeSearch) => set({ nodeSearch }),
      toggleCategory: (category) =>
        set((state) => ({
          collapsedCategories: state.collapsedCategories.includes(category)
            ? state.collapsedCategories.filter((item) => item !== category)
            : [...state.collapsedCategories, category],
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
        selectedWorkspaceId: state.selectedWorkspaceId,
      }),
    },
  ),
);
