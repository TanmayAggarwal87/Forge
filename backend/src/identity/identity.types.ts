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
  compiledIr: WorkflowIntermediateRepresentation | null;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
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

export type WorkflowExecutionStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'timed_out'
  | 'dead_lettered';

export type WorkflowExecutionTriggerType = 'http' | 'manual' | 'schedule';

export type WorkflowExecution = {
  id: string;
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  status: WorkflowExecutionStatus;
  triggerType: WorkflowExecutionTriggerType;
  traceId: string;
  idempotencyKey: string | null;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  error: WorkflowExecutionError | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  updatedAt: string;
};

export type WorkflowExecutionStepStatus =
  | 'pending'
  | 'running'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'skipped'
  | 'timed_out';

export type WorkflowExecutionStep = {
  id: string;
  executionId: string;
  workflowVersionId: string;
  nodeId: string;
  nodeType: string;
  label: string;
  status: WorkflowExecutionStepStatus;
  attempt: number;
  maxAttempts: number;
  input: Record<string, unknown> | null;
  output: Record<string, unknown> | null;
  error: WorkflowExecutionError | null;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  updatedAt: string;
};

export type WorkflowExecutionLogLevel = 'debug' | 'info' | 'warn' | 'error';

export type WorkflowExecutionLog = {
  id: string;
  executionId: string;
  stepId: string | null;
  traceId: string;
  level: WorkflowExecutionLogLevel;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type WorkflowExecutionError = {
  code: string;
  message: string;
  retryable: boolean;
};
