import type {
  AuditLog,
  GeneratedArtifact,
  Project,
  Session,
  User,
  Workflow,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowExecutionStep,
  WorkflowVersion,
  Workspace,
  WorkspaceMember,
} from '../../identity.types';

export type DatabaseShape = {
  users: User[];
  sessions: Session[];
  workspaces: Workspace[];
  members: WorkspaceMember[];
  projects: Project[];
  workflows: Workflow[];
  workflowVersions: WorkflowVersion[];
  workflowExecutions: WorkflowExecution[];
  workflowExecutionSteps: WorkflowExecutionStep[];
  workflowExecutionLogs: WorkflowExecutionLog[];
  generatedArtifacts: GeneratedArtifact[];
  auditLogs: AuditLog[];
};
