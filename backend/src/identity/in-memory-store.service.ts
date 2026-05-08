import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { WorkspaceEntity } from '../database/entities';
import {
  AuditLog,
  GeneratedArtifact,
  Project,
  Session,
  SessionUser,
  Workflow,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowExecutionStep,
  WorkflowGraph,
  WorkflowIntermediateRepresentation,
  WorkflowValidationResult,
  WorkflowVersion,
  Workspace,
  WorkspaceRole,
} from './identity.types';
import { AuditLogStore } from './stores/audit-log.store';
import { AuthStore } from './stores/auth.store';
import { ForgeMemoryState } from './stores/forge-memory-state.service';
import { GeneratedArtifactStore } from './stores/generated-artifact.store';
import type { DatabaseShape } from './stores/persistence/database-shape.types';
import { PostgresStateLoaderService } from './stores/persistence/postgres-state-loader.service';
import { PostgresStatePersisterService } from './stores/persistence/postgres-state-persister.service';
import { ProjectStore } from './stores/project.store';
import { WorkflowExecutionStore } from './stores/workflow-execution.store';
import { WorkflowStore } from './stores/workflow.store';
import { WorkflowVersionStore } from './stores/workflow-version.store';
import { WorkspaceStore } from './stores/workspace.store';

type CreateWorkspaceInput = {
  name: string;
  actorUserId: string;
};

type CreateProjectInput = {
  workspaceId: string;
  name: string;
  description?: string | null;
  actorUserId: string;
};

type CreateWorkflowInput = {
  projectId: string;
  name: string;
  description?: string | null;
  graph: WorkflowGraph;
  validation: WorkflowValidationResult;
  actorUserId: string;
};

type SaveWorkflowDraftInput = {
  projectId: string;
  workflowId: string;
  name?: string;
  description?: string | null;
  graph: WorkflowGraph;
  validation: WorkflowValidationResult;
  actorUserId: string;
};

type PublishWorkflowInput = {
  projectId: string;
  workflowId: string;
  compiledIr: WorkflowIntermediateRepresentation;
  actorUserId: string;
};

type ActivateWorkflowVersionInput = {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  actorUserId: string;
  auditAction: 'workflow.version_activated' | 'workflow.rolled_back';
};

type DeactivateWorkflowInput = {
  projectId: string;
  workflowId: string;
  actorUserId: string;
};

type CreateExecutionInput = {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  status: WorkflowExecution['status'];
  triggerType: WorkflowExecution['triggerType'];
  traceId: string;
  idempotencyKey?: string | null;
  input: Record<string, unknown>;
};

@Injectable()
export class InMemoryStoreService implements OnModuleInit {
  private readonly logger = new Logger(InMemoryStoreService.name);

  constructor(
    @Optional()
    private readonly state: ForgeMemoryState = new ForgeMemoryState(),
    @Optional()
    private readonly auditLogStore: AuditLogStore = new AuditLogStore(state),
    @Optional()
    private readonly authStore: AuthStore = new AuthStore(state, auditLogStore),
    @Optional()
    private readonly workspaceStore: WorkspaceStore = new WorkspaceStore(
      state,
      auditLogStore,
    ),
    @Optional()
    private readonly projectStore: ProjectStore = new ProjectStore(
      state,
      workspaceStore,
      auditLogStore,
    ),
    @Optional()
    private readonly workflowStore: WorkflowStore = new WorkflowStore(
      state,
      projectStore,
      auditLogStore,
    ),
    @Optional()
    private readonly workflowVersionStore: WorkflowVersionStore = new WorkflowVersionStore(
      state,
      projectStore,
      workflowStore,
      auditLogStore,
    ),
    @Optional()
    private readonly workflowExecutionStore: WorkflowExecutionStore = new WorkflowExecutionStore(
      state,
      workflowStore,
    ),
    @Optional()
    private readonly generatedArtifactStore: GeneratedArtifactStore = new GeneratedArtifactStore(
      state,
      workflowStore,
      workflowVersionStore,
    ),
    @Optional()
    private readonly statePersister: PostgresStatePersisterService = new PostgresStatePersisterService(
      state,
    ),
    @Optional()
    private readonly stateLoader: PostgresStateLoaderService = new PostgresStateLoaderService(
      state,
      this.statePersister,
    ),
    @Optional()
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository?: Repository<WorkspaceEntity>,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadDatabase();
  }

  register(
    email: string,
    password: string,
    name: string,
  ): { token: string; user: SessionUser } {
    const result = this.authStore.register(email, password, name);
    this.saveDatabase();
    return result;
  }

  login(email: string, password: string): { token: string; user: SessionUser } {
    const result = this.authStore.login(email, password);
    this.saveDatabase();
    return result;
  }

  getSession(token: string): { session: Session; user: SessionUser } {
    const result = this.authStore.getSession(token);
    this.saveDatabase();
    return result;
  }

  signOut(token: string, actorUserId: string): void {
    this.authStore.signOut(token, actorUserId);
    this.saveDatabase();
  }

  createWorkspace(input: CreateWorkspaceInput): Workspace {
    const workspace = this.workspaceStore.createWorkspace(input);
    this.saveDatabase();
    return workspace;
  }

  updateWorkspace(
    workspaceId: string,
    userId: string,
    patch: { name?: string; description?: string | null },
  ): Workspace & { role: WorkspaceRole } {
    const workspace = this.workspaceStore.updateWorkspace(
      workspaceId,
      userId,
      patch,
    );
    this.saveDatabase();
    return workspace;
  }

  deleteWorkspace(workspaceId: string, userId: string): void {
    this.workspaceStore.deleteWorkspace(workspaceId, userId);
    if (this.workspaceRepository) {
      void this.workspaceRepository.delete(workspaceId);
    }
    this.saveDatabase();
  }

  listWorkspaces(userId: string): Array<Workspace & { role: WorkspaceRole }> {
    return this.workspaceStore.listWorkspaces(userId);
  }

  getWorkspaceForUser(
    workspaceId: string,
    userId: string,
  ): Workspace & { role: WorkspaceRole } {
    return this.workspaceStore.getWorkspaceForUser(workspaceId, userId);
  }

  createProject(input: CreateProjectInput): Project {
    const project = this.projectStore.createProject(input);
    this.saveDatabase();
    return project;
  }

  listProjects(workspaceId: string, userId: string): Project[] {
    return this.projectStore.listProjects(workspaceId, userId);
  }

  getProjectForUser(projectId: string, userId: string): Project {
    return this.projectStore.getProjectForUser(projectId, userId);
  }

  createWorkflow(input: CreateWorkflowInput): Workflow & {
    draftVersion: WorkflowVersion;
  } {
    const workflow = this.workflowStore.createWorkflow(input);
    this.saveDatabase();
    return workflow;
  }

  listWorkflows(
    projectId: string,
    userId: string,
  ): Array<Workflow & { draftVersion: WorkflowVersion }> {
    return this.workflowStore.listWorkflows(projectId, userId);
  }

  getWorkflowDraftForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): Workflow & { draftVersion: WorkflowVersion } {
    return this.workflowStore.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );
  }

  saveWorkflowDraft(input: SaveWorkflowDraftInput): Workflow & {
    draftVersion: WorkflowVersion;
  } {
    const workflow = this.workflowStore.saveWorkflowDraft(input);
    this.saveDatabase();
    return workflow;
  }

  publishWorkflow(input: PublishWorkflowInput): Workflow & {
    publishedVersion: WorkflowVersion;
  } {
    const workflow = this.workflowStore.publishWorkflow(input);
    this.saveDatabase();
    return workflow;
  }

  listWorkflowVersionsForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): WorkflowVersion[] {
    return this.workflowVersionStore.listWorkflowVersionsForUser(
      projectId,
      workflowId,
      userId,
    );
  }

  getWorkflowVersionForUser(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    userId: string,
  ): WorkflowVersion {
    return this.workflowVersionStore.getWorkflowVersionForUser(
      projectId,
      workflowId,
      workflowVersionId,
      userId,
    );
  }

  activateWorkflowVersion(input: ActivateWorkflowVersionInput): Workflow & {
    activeVersion: WorkflowVersion;
    previousVersionId: string | null;
  } {
    const workflow = this.workflowVersionStore.activateWorkflowVersion(input);
    this.saveDatabase();
    return workflow;
  }

  deactivateWorkflow(input: DeactivateWorkflowInput): Workflow & {
    previousVersionId: string | null;
  } {
    const workflow = this.workflowStore.deactivateWorkflow(input);
    this.saveDatabase();
    return workflow;
  }

  replaceGeneratedArtifactsForVersion(
    workflowVersionId: string,
    artifacts: GeneratedArtifact[],
  ): GeneratedArtifact[] {
    const normalizedArtifacts =
      this.generatedArtifactStore.replaceGeneratedArtifactsForVersion(
        workflowVersionId,
        artifacts,
      );
    this.saveDatabase();
    return normalizedArtifacts;
  }

  listGeneratedArtifactsForPublishedWorkflow(
    projectId: string,
    workflowId: string,
    userId: string,
  ): GeneratedArtifact[] {
    return this.generatedArtifactStore.listGeneratedArtifactsForPublishedWorkflow(
      projectId,
      workflowId,
      userId,
    );
  }

  listGeneratedArtifactsForVersion(
    workflowVersionId: string,
  ): GeneratedArtifact[] {
    return this.generatedArtifactStore.listGeneratedArtifactsForVersion(
      workflowVersionId,
    );
  }

  getPublishedWorkflowForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): Workflow & { publishedVersion: WorkflowVersion } {
    return this.workflowStore.getPublishedWorkflowForUser(
      projectId,
      workflowId,
      userId,
    );
  }

  createWorkflowExecution(input: CreateExecutionInput): WorkflowExecution {
    const execution =
      this.workflowExecutionStore.createWorkflowExecution(input);
    this.saveDatabase();
    return execution;
  }

  findWorkflowExecutionByIdempotencyKey(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    idempotencyKey: string,
  ): WorkflowExecution | null {
    return this.workflowExecutionStore.findWorkflowExecutionByIdempotencyKey(
      projectId,
      workflowId,
      workflowVersionId,
      idempotencyKey,
    );
  }

  updateWorkflowExecution(
    executionId: string,
    patch: Partial<
      Pick<
        WorkflowExecution,
        'status' | 'output' | 'error' | 'startedAt' | 'completedAt'
      >
    >,
  ): WorkflowExecution {
    const updatedExecution =
      this.workflowExecutionStore.updateWorkflowExecution(executionId, patch);
    this.saveDatabase();
    return updatedExecution;
  }

  upsertWorkflowExecutionStep(
    step: WorkflowExecutionStep,
  ): WorkflowExecutionStep {
    const updatedStep =
      this.workflowExecutionStore.upsertWorkflowExecutionStep(step);
    this.saveDatabase();
    return updatedStep;
  }

  appendWorkflowExecutionLog(log: WorkflowExecutionLog): WorkflowExecutionLog {
    const appendedLog =
      this.workflowExecutionStore.appendWorkflowExecutionLog(log);
    this.saveDatabase();
    return appendedLog;
  }

  getWorkflowExecutionForUser(
    projectId: string,
    workflowId: string,
    executionId: string,
    userId: string,
  ): WorkflowExecution & {
    steps: WorkflowExecutionStep[];
    logs: WorkflowExecutionLog[];
  } {
    return this.workflowExecutionStore.getWorkflowExecutionForUser(
      projectId,
      workflowId,
      executionId,
      userId,
    );
  }

  getWorkflowExecutionById(executionId: string): WorkflowExecution {
    return this.workflowExecutionStore.getWorkflowExecutionById(executionId);
  }

  getWorkflowVersionById(workflowVersionId: string): WorkflowVersion {
    return this.workflowVersionStore.getWorkflowVersionById(workflowVersionId);
  }

  listWorkflowExecutionsForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): WorkflowExecution[] {
    return this.workflowExecutionStore.listWorkflowExecutionsForUser(
      projectId,
      workflowId,
      userId,
    );
  }

  listWorkflowExecutionSteps(executionId: string): WorkflowExecutionStep[] {
    return this.workflowExecutionStore.listWorkflowExecutionSteps(executionId);
  }

  listWorkflowExecutionLogs(executionId: string): WorkflowExecutionLog[] {
    return this.workflowExecutionStore.listWorkflowExecutionLogs(executionId);
  }

  listAuditLogs(workspaceId: string, userId: string): AuditLog[] {
    return this.auditLogStore.listAuditLogs(workspaceId, userId);
  }

  private recordAudit(input: Omit<AuditLog, 'id' | 'createdAt'>): void {
    this.auditLogStore.recordAudit(input);
  }

  private async loadDatabase(): Promise<void> {
    await this.stateLoader.loadDatabase();
  }

  private saveDatabase(): void {
    const database: DatabaseShape = {
      users: Array.from(this.state.users.values()),
      sessions: Array.from(this.state.sessions.values()),
      workspaces: Array.from(this.state.workspaces.values()),
      members: this.state.members,
      projects: Array.from(this.state.projects.values()),
      workflows: Array.from(this.state.workflows.values()),
      workflowVersions: Array.from(this.state.workflowVersions.values()),
      workflowExecutions: Array.from(this.state.workflowExecutions.values()),
      workflowExecutionSteps: Array.from(
        this.state.workflowExecutionSteps.values(),
      ),
      workflowExecutionLogs: this.state.workflowExecutionLogs,
      generatedArtifacts: Array.from(this.state.generatedArtifacts.values()),
      auditLogs: this.state.auditLogs,
    };

    this.statePersister.scheduleSave(database);
  }
}
