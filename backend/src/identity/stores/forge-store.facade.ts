import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { WorkspaceEntity } from '../../database/entities';
import type {
  AuditLog,
  GeneratedArtifact,
  Project,
  Session,
  SessionUser,
  Workflow,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowExecutionStep,
  WorkflowVersion,
  Workspace,
  WorkspaceRole,
} from '../identity.types';
import { AuditLogStore } from './audit-log.store';
import { AuthStore } from './auth.store';
import { ForgeMemoryState } from './forge-memory-state.service';
import { GeneratedArtifactStore } from './generated-artifact.store';
import { createDatabaseShape } from './persistence/database-shape.types';
import { PostgresStateLoaderService } from './persistence/postgres-state-loader.service';
import { PostgresStatePersisterService } from './persistence/postgres-state-persister.service';
import { ProjectStore } from './project.store';
import type {
  ActivateWorkflowVersionInput,
  CreateExecutionInput,
  CreateProjectInput,
  CreateWorkflowInput,
  CreateWorkspaceInput,
  DeactivateWorkflowInput,
  PublishWorkflowInput,
  SaveWorkflowDraftInput,
} from './store-input.types';
import { WorkflowExecutionStore } from './workflow-execution.store';
import { WorkflowStore } from './workflow.store';
import { WorkflowVersionStore } from './workflow-version.store';
import { WorkspaceStore } from './workspace.store';

@Injectable()
export class ForgeStoreFacade implements OnModuleInit {
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
    await this.stateLoader.loadDatabase();
  }

  register(
    email: string,
    password: string,
    name: string,
  ): { token: string; user: SessionUser } {
    return this.persistChange(this.authStore.register(email, password, name));
  }

  login(email: string, password: string): { token: string; user: SessionUser } {
    return this.persistChange(this.authStore.login(email, password));
  }

  getSession(token: string): { session: Session; user: SessionUser } {
    return this.persistChange(this.authStore.getSession(token));
  }

  signOut(token: string, actorUserId: string): void {
    this.authStore.signOut(token, actorUserId);
    this.saveDatabase();
  }

  createWorkspace(input: CreateWorkspaceInput): Workspace {
    return this.persistChange(this.workspaceStore.createWorkspace(input));
  }

  updateWorkspace(
    workspaceId: string,
    userId: string,
    patch: { name?: string; description?: string | null },
  ): Workspace & { role: WorkspaceRole } {
    return this.persistChange(
      this.workspaceStore.updateWorkspace(workspaceId, userId, patch),
    );
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
    return this.persistChange(this.projectStore.createProject(input));
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
    return this.persistChange(this.workflowStore.createWorkflow(input));
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
    return this.persistChange(this.workflowStore.saveWorkflowDraft(input));
  }

  publishWorkflow(input: PublishWorkflowInput): Workflow & {
    publishedVersion: WorkflowVersion;
  } {
    return this.persistChange(this.workflowStore.publishWorkflow(input));
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
    return this.persistChange(
      this.workflowVersionStore.activateWorkflowVersion(input),
    );
  }

  deactivateWorkflow(input: DeactivateWorkflowInput): Workflow & {
    previousVersionId: string | null;
  } {
    return this.persistChange(this.workflowStore.deactivateWorkflow(input));
  }

  replaceGeneratedArtifactsForVersion(
    workflowVersionId: string,
    artifacts: GeneratedArtifact[],
  ): GeneratedArtifact[] {
    return this.persistChange(
      this.generatedArtifactStore.replaceGeneratedArtifactsForVersion(
        workflowVersionId,
        artifacts,
      ),
    );
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
    return this.persistChange(
      this.workflowExecutionStore.createWorkflowExecution(input),
    );
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
    return this.persistChange(
      this.workflowExecutionStore.updateWorkflowExecution(executionId, patch),
    );
  }

  upsertWorkflowExecutionStep(
    step: WorkflowExecutionStep,
  ): WorkflowExecutionStep {
    return this.persistChange(
      this.workflowExecutionStore.upsertWorkflowExecutionStep(step),
    );
  }

  appendWorkflowExecutionLog(log: WorkflowExecutionLog): WorkflowExecutionLog {
    return this.persistChange(
      this.workflowExecutionStore.appendWorkflowExecutionLog(log),
    );
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

  private saveDatabase(): void {
    this.statePersister.scheduleSave(createDatabaseShape(this.state));
  }

  private persistChange<T>(value: T): T {
    this.saveDatabase();
    return value;
  }
}
