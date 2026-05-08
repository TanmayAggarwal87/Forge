import type {
  WorkflowExecution,
  WorkflowGraph,
  WorkflowIntermediateRepresentation,
  WorkflowValidationResult,
} from '../identity.types';

export type CreateWorkspaceInput = {
  name: string;
  actorUserId: string;
};

export type CreateProjectInput = {
  workspaceId: string;
  name: string;
  description?: string | null;
  actorUserId: string;
};

export type CreateWorkflowInput = {
  projectId: string;
  name: string;
  description?: string | null;
  graph: WorkflowGraph;
  validation: WorkflowValidationResult;
  actorUserId: string;
};

export type SaveWorkflowDraftInput = {
  projectId: string;
  workflowId: string;
  name?: string;
  description?: string | null;
  graph: WorkflowGraph;
  validation: WorkflowValidationResult;
  actorUserId: string;
};

export type PublishWorkflowInput = {
  projectId: string;
  workflowId: string;
  compiledIr: WorkflowIntermediateRepresentation;
  actorUserId: string;
};

export type ActivateWorkflowVersionInput = {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  actorUserId: string;
  auditAction: 'workflow.version_activated' | 'workflow.rolled_back';
};

export type DeactivateWorkflowInput = {
  projectId: string;
  workflowId: string;
  actorUserId: string;
};

export type CreateExecutionInput = {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  status: WorkflowExecution['status'];
  triggerType: WorkflowExecution['triggerType'];
  traceId: string;
  idempotencyKey?: string | null;
  input: Record<string, unknown>;
};
