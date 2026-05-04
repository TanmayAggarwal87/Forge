export type SessionUser = {
  id: string;
  email: string;
  name: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  role: "owner" | "admin" | "member";
  createdAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  metadata: Record<string, unknown>;
};

export type AuthPayload = {
  token: string;
  user: SessionUser;
};

export type ApiError = {
  message?: string | string[];
};

export type WorkflowNodePosition = {
  x: number;
  y: number;
};

export type WorkflowNode = {
  id: string;
  type: string;
  label: string;
  position: WorkflowNodePosition;
  config: Record<string, unknown>;
};

export type WorkflowEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
};

export type WorkflowGraph = {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
};

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  severity: "error" | "warning";
  field: string | null;
};

export type WorkflowValidationResult = {
  isValid: boolean;
  issues: WorkflowValidationIssue[];
};

export type WorkflowIrNode = {
  id: string;
  type: string;
  definitionVersion: number;
  label: string;
  executionMode: "sync" | "async";
  retryable: boolean;
  timeoutMs: number;
  dependsOn: string[];
  nextNodeIds: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  config: Record<string, unknown>;
};

export type WorkflowIrEdge = {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  label: string | null;
  condition: string | null;
};

export type WorkflowIntermediateRepresentation = {
  formatVersion: 1;
  graphHash: string;
  triggerNodeIds: string[];
  executionOrder: string[];
  nodes: WorkflowIrNode[];
  edges: WorkflowIrEdge[];
};

export type WorkflowCompilationResult = {
  isValid: boolean;
  issues: WorkflowValidationIssue[];
  ir: WorkflowIntermediateRepresentation | null;
};

export type WorkflowDraftVersion = {
  id: string;
  workflowId: string;
  projectId: string;
  versionNumber: number;
  status: "draft" | "published";
  graph: WorkflowGraph;
  validation: WorkflowValidationResult;
  createdAt: string;
  updatedAt: string;
};

export type Workflow = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  draftVersion: WorkflowDraftVersion;
};

export type NodeDefinition = {
  type: string;
  version: number;
  title: string;
  description: string;
  category: "trigger" | "logic" | "data" | "integration" | "utility";
  capabilityTags: string[];
  executionMode: "sync" | "async";
  retryable: boolean;
  defaultTimeoutMs: number;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  configSchema: Record<string, unknown>;
};
