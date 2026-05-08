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
import { ForgeMemoryState } from '../forge-memory-state.service';

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

export function createDatabaseShape(state: ForgeMemoryState): DatabaseShape {
  return {
    users: Array.from(state.users.values()),
    sessions: Array.from(state.sessions.values()),
    workspaces: Array.from(state.workspaces.values()),
    members: state.members,
    projects: Array.from(state.projects.values()),
    workflows: Array.from(state.workflows.values()),
    workflowVersions: Array.from(state.workflowVersions.values()),
    workflowExecutions: Array.from(state.workflowExecutions.values()),
    workflowExecutionSteps: Array.from(state.workflowExecutionSteps.values()),
    workflowExecutionLogs: state.workflowExecutionLogs,
    generatedArtifacts: Array.from(state.generatedArtifacts.values()),
    auditLogs: state.auditLogs,
  };
}
