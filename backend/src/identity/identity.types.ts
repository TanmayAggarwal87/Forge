export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type User = {
  id: string;
  email: string;
  name: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: string;
};

export type SessionUser = Pick<User, 'id' | 'email' | 'name'>;

export type Session = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  createdByUserId: string;
  createdAt: string;
};

export type WorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  workspaceId: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type WorkflowStatus = 'draft' | 'published';

export type Workflow = {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  description: string | null;
  status: WorkflowStatus;
  draftVersionId: string;
  publishedVersionId: string | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowVersionStatus = 'draft' | 'published';

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

export type WorkflowValidationSeverity = 'error' | 'warning';

export type WorkflowValidationIssue = {
  code: string;
  message: string;
  severity: WorkflowValidationSeverity;
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
  executionMode: 'sync' | 'async';
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

export type WorkflowVersion = {
  id: string;
  workflowId: string;
  projectId: string;
  versionNumber: number;
  status: WorkflowVersionStatus;
  graph: WorkflowGraph;
  validation: WorkflowValidationResult;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};

export type NodeCategory =
  | 'trigger'
  | 'logic'
  | 'data'
  | 'integration'
  | 'utility';

export type NodeDefinition = {
  type: string;
  version: number;
  title: string;
  description: string;
  category: NodeCategory;
  capabilityTags: string[];
  executionMode: 'sync' | 'async';
  retryable: boolean;
  defaultTimeoutMs: number;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  configSchema: Record<string, unknown>;
};
