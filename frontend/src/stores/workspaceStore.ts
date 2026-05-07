"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Workspace } from "@/features/workspace/types";

type WorkspaceStore = {
  workspaces: Workspace[];
  setWorkspaces: (workspaces: Workspace[]) => void;
  upsertWorkspace: (workspace: Workspace) => void;
  createWorkspace: (name: string) => string;
  renameWorkspace: (id: string, name: string) => void;
  deleteWorkspace: (id: string) => void;
  touchWorkspace: (id: string) => void;
  getWorkspaceById: (id: string) => Workspace | undefined;
};

export const useWorkspaceStore = create<WorkspaceStore>()(
  persist(
    (set, get) => ({
      workspaces: [],
      setWorkspaces: (workspaces) => set({ workspaces }),
      upsertWorkspace: (workspace) => {
        set((state) => {
          const existingIndex = state.workspaces.findIndex(
            (candidate) => candidate.id === workspace.id,
          );

          if (existingIndex === -1) {
            return { workspaces: [workspace, ...state.workspaces] };
          }

          const nextWorkspaces = state.workspaces.slice();
          nextWorkspaces.splice(existingIndex, 1, workspace);

          return { workspaces: nextWorkspaces };
        });
      },
      createWorkspace: (name) => {
        const now = new Date().toISOString();
        const workspace: Workspace = {
          id: crypto.randomUUID(),
          name: name.trim(),
          createdAt: now,
          updatedAt: now,
        };

        set((state) => ({
          workspaces: [workspace, ...state.workspaces],
        }));

        return workspace.id;
      },
      renameWorkspace: (id, name) => {
        const nextName = name.trim();
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id
              ? { ...workspace, name: nextName, updatedAt: new Date().toISOString() }
              : workspace,
          ),
        }));
      },
      deleteWorkspace: (id) => {
        set((state) => ({
          workspaces: state.workspaces.filter((workspace) => workspace.id !== id),
        }));
      },
      touchWorkspace: (id) => {
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === id
              ? { ...workspace, updatedAt: new Date().toISOString() }
              : workspace,
          ),
        }));
      },
      getWorkspaceById: (id) => get().workspaces.find((workspace) => workspace.id === id),
    }),
    {
      name: "forge-workspaces",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
