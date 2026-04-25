import type { XYPosition } from "@xyflow/react";
import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import type {
  WorkflowDocument,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowSnapshot,
} from "@/features/workflow/types";

export const defaultViewport = { x: 0, y: 0, zoom: 1 };

export function createEmptyWorkflow(workspaceId: string): WorkflowDocument {
  return {
    workspaceId,
    nodes: [],
    edges: [],
    viewport: defaultViewport,
    status: "Draft",
    executionState: "Idle",
    lastSavedAt: null,
    dirty: false,
    saveError: null,
    history: [],
    future: [],
  };
}

export function getSnapshot(document: WorkflowDocument): WorkflowSnapshot {
  return {
    nodes: document.nodes,
    edges: document.edges,
    viewport: document.viewport,
  };
}

export function cloneSnapshot(snapshot: WorkflowSnapshot): WorkflowSnapshot {
  return {
    nodes: structuredClone(snapshot.nodes),
    edges: structuredClone(snapshot.edges),
    viewport: structuredClone(snapshot.viewport),
  };
}

export function buildNode(type: WorkflowNodeType, position: XYPosition): WorkflowNode {
  const definition = nodeDefinitionsByType[type];

  return {
    id: crypto.randomUUID(),
    type: "workflowNode",
    position,
    data: {
      label: definition.label,
      category: definition.category,
      type: definition.type,
      config: structuredClone(definition.defaults),
    },
  };
}

export function formatRelativeTime(isoDate: string | null): string {
  if (!isoDate) {
    return "Never";
  }

  const diffMs = Date.now() - new Date(isoDate).getTime();

  if (diffMs < 30_000) {
    return "Just now";
  }

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 60) {
    return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(isoDate));
}
