import { Injectable } from '@nestjs/common';
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
} from '../identity.types';

@Injectable()
export class ForgeMemoryState {
  readonly users = new Map<string, User>();
  readonly usersByEmail = new Map<string, string>();
  readonly sessions = new Map<string, Session>();
  readonly workspaces = new Map<string, Workspace>();
  readonly members: WorkspaceMember[] = [];
  readonly projects = new Map<string, Project>();
  readonly workflows = new Map<string, Workflow>();
  readonly workflowVersions = new Map<string, WorkflowVersion>();
  readonly workflowExecutions = new Map<string, WorkflowExecution>();
  readonly workflowExecutionSteps = new Map<string, WorkflowExecutionStep>();
  readonly workflowExecutionLogs: WorkflowExecutionLog[] = [];
  readonly generatedArtifacts = new Map<string, GeneratedArtifact>();
  readonly auditLogs: AuditLog[] = [];
}
