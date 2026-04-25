import type { Edge, Node, Viewport } from "@xyflow/react";

export type WorkflowNodeType =
  | "httpTrigger"
  | "generateOtp"
  | "verifyOtp"
  | "sendEmail"
  | "sendSms"
  | "delay"
  | "condition"
  | "databaseWrite"
  | "databaseRead";

export type NodeConfigFieldType = "text" | "number" | "select" | "textarea";

export type NodeConfigOption = {
  label: string;
  value: string;
};

export type NodeConfigField = {
  key: string;
  label: string;
  type: NodeConfigFieldType;
  min?: number;
  step?: number;
  placeholder?: string;
  options?: NodeConfigOption[];
};

export type WorkflowNodeData = {
  label: string;
  category: string;
  type: WorkflowNodeType;
  config: Record<string, string | number>;
};

export type WorkflowNode = Node<WorkflowNodeData, "workflowNode">;

export type WorkflowEdge = Edge;

export type WorkflowSnapshot = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  viewport: Viewport;
};

export type WorkflowDocument = WorkflowSnapshot & {
  workspaceId: string;
  status: "Draft" | "Deployed";
  executionState: "Idle" | "Running" | "Failed";
  lastSavedAt: string | null;
  dirty: boolean;
  saveError: string | null;
  history: WorkflowSnapshot[];
  future: WorkflowSnapshot[];
};
