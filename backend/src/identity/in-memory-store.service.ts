import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { shouldRunDatabaseMigrations } from '../database/database.config';
import {
  AuditLogEntity,
  GeneratedArtifactEntity,
  ProjectEntity,
  SessionEntity,
  UserEntity,
  WorkflowEntity,
  WorkflowExecutionEntity,
  WorkflowExecutionLogEntity,
  WorkflowExecutionStepEntity,
  WorkflowVersionEntity,
  WorkspaceEntity,
} from '../database/entities';
import {
  AuditLog,
  GeneratedArtifact,
  Project,
  Session,
  SessionUser,
  User,
  Workflow,
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowExecutionStep,
  WorkflowGraph,
  WorkflowIntermediateRepresentation,
  WorkflowValidationResult,
  WorkflowVersion,
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from './identity.types';
import { AuditLogStore } from './stores/audit-log.store';
import { AuthStore } from './stores/auth.store';
import { ForgeMemoryState } from './stores/forge-memory-state.service';
import { GeneratedArtifactStore } from './stores/generated-artifact.store';
import { ProjectStore } from './stores/project.store';
import { toIsoString } from './stores/utils/date.util';
import { isUuid, toNullableUuid } from './stores/utils/uuid.util';
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

type DatabaseShape = {
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

@Injectable()
export class InMemoryStoreService implements OnModuleInit {
  private readonly logger = new Logger(InMemoryStoreService.name);
  private persistQueue = Promise.resolve();

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
    @InjectRepository(UserEntity)
    private readonly userRepository?: Repository<UserEntity>,
    @Optional()
    @InjectRepository(SessionEntity)
    private readonly sessionRepository?: Repository<SessionEntity>,
    @Optional()
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository?: Repository<WorkspaceEntity>,
    @Optional()
    @InjectRepository(ProjectEntity)
    private readonly projectRepository?: Repository<ProjectEntity>,
    @Optional()
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepository?: Repository<WorkflowEntity>,
    @Optional()
    @InjectRepository(WorkflowVersionEntity)
    private readonly workflowVersionRepository?: Repository<WorkflowVersionEntity>,
    @Optional()
    @InjectRepository(WorkflowExecutionEntity)
    private readonly workflowExecutionRepository?: Repository<WorkflowExecutionEntity>,
    @Optional()
    @InjectRepository(WorkflowExecutionStepEntity)
    private readonly workflowExecutionStepRepository?: Repository<WorkflowExecutionStepEntity>,
    @Optional()
    @InjectRepository(WorkflowExecutionLogEntity)
    private readonly workflowExecutionLogRepository?: Repository<WorkflowExecutionLogEntity>,
    @Optional()
    @InjectRepository(GeneratedArtifactEntity)
    private readonly generatedArtifactRepository?: Repository<GeneratedArtifactEntity>,
    @Optional()
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository?: Repository<AuditLogEntity>,
    @Optional()
    @InjectDataSource()
    private readonly dataSource?: DataSource,
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
    if (!this.isDatabaseConfigured()) {
      return;
    }

    await this.ensureDatabaseSchema();

    const [
      users,
      sessions,
      workspaces,
      projects,
      workflows,
      workflowVersions,
      workflowExecutions,
      workflowExecutionSteps,
      workflowExecutionLogs,
      generatedArtifacts,
      auditLogs,
    ] = await Promise.all([
      this.userRepository!.find(),
      this.sessionRepository!.find(),
      this.workspaceRepository!.find(),
      this.projectRepository!.find(),
      this.workflowRepository!.find(),
      this.workflowVersionRepository!.find(),
      this.workflowExecutionRepository!.find(),
      this.workflowExecutionStepRepository!.find(),
      this.workflowExecutionLogRepository!.find(),
      this.generatedArtifactRepository!.find(),
      this.auditLogRepository!.find(),
    ]);

    for (const userEntity of users) {
      const user: User = {
        id: userEntity.id,
        email: userEntity.email,
        name: userEntity.name,
        passwordHash: userEntity.passwordHash,
        passwordSalt: userEntity.passwordSalt,
        createdAt: toIsoString(userEntity.createdAt),
      };
      this.state.users.set(user.id, user);
      this.state.usersByEmail.set(user.email, user.id);
    }

    for (const sessionEntity of sessions) {
      const session: Session = {
        token: sessionEntity.token,
        userId: sessionEntity.userId,
        createdAt: toIsoString(sessionEntity.createdAt),
        expiresAt: toIsoString(sessionEntity.expiresAt),
      };
      this.state.sessions.set(session.token, session);
    }

    for (const workspaceEntity of workspaces) {
      const workspace: Workspace = {
        id: workspaceEntity.id,
        name: workspaceEntity.name,
        slug: workspaceEntity.slug,
        createdByUserId: workspaceEntity.userId,
        createdAt: toIsoString(workspaceEntity.createdAt),
      };
      this.state.workspaces.set(workspace.id, workspace);
      this.state.members.push({
        workspaceId: workspace.id,
        userId: workspace.createdByUserId,
        role: 'owner',
        createdAt: workspace.createdAt,
      });
    }

    for (const projectEntity of projects) {
      const project: Project = {
        id: projectEntity.id,
        workspaceId: projectEntity.workspaceId,
        name: projectEntity.name,
        slug: projectEntity.slug,
        description: projectEntity.description,
        createdByUserId: projectEntity.createdByUserId,
        createdAt: toIsoString(projectEntity.createdAt),
      };
      this.state.projects.set(project.id, project);
    }

    for (const workflowEntity of workflows) {
      const workflow: Workflow = {
        id: workflowEntity.id,
        projectId: workflowEntity.projectId ?? '',
        name: workflowEntity.name,
        slug: workflowEntity.slug,
        description: workflowEntity.description,
        status: workflowEntity.status,
        draftVersionId: workflowEntity.draftVersionId ?? '',
        publishedVersionId: workflowEntity.publishedVersionId,
        createdByUserId: workflowEntity.createdByUserId,
        createdAt: toIsoString(workflowEntity.createdAt),
        updatedAt: toIsoString(workflowEntity.updatedAt),
      };
      this.state.workflows.set(workflow.id, workflow);
    }

    for (const versionEntity of workflowVersions) {
      const version: WorkflowVersion = {
        id: versionEntity.id,
        workflowId: versionEntity.workflowId,
        projectId: versionEntity.projectId ?? '',
        versionNumber: versionEntity.versionNumber,
        status: versionEntity.status,
        graph: {
          nodes: versionEntity.nodesJson,
          edges: versionEntity.edgesJson,
        },
        validation: versionEntity.validation,
        compiledIr: versionEntity.compiledIr ?? null,
        createdByUserId: versionEntity.createdBy,
        createdAt: toIsoString(versionEntity.createdAt),
        updatedAt: toIsoString(versionEntity.updatedAt),
        publishedAt: versionEntity.publishedAt
          ? toIsoString(versionEntity.publishedAt)
          : null,
      };
      this.state.workflowVersions.set(version.id, version);
    }

    for (const executionEntity of workflowExecutions) {
      const execution: WorkflowExecution = {
        id: executionEntity.id,
        projectId: executionEntity.projectId,
        workflowId: executionEntity.workflowId,
        workflowVersionId: executionEntity.workflowVersionId,
        status: executionEntity.status,
        triggerType: executionEntity.triggerType,
        traceId: executionEntity.traceId,
        idempotencyKey: executionEntity.idempotencyKey,
        input: executionEntity.input,
        output: executionEntity.output,
        error: executionEntity.error,
        createdAt: toIsoString(executionEntity.createdAt),
        startedAt: executionEntity.startedAt
          ? toIsoString(executionEntity.startedAt)
          : null,
        completedAt: executionEntity.completedAt
          ? toIsoString(executionEntity.completedAt)
          : null,
        updatedAt: toIsoString(executionEntity.updatedAt),
      };
      this.state.workflowExecutions.set(execution.id, execution);
    }

    for (const stepEntity of workflowExecutionSteps) {
      const step: WorkflowExecutionStep = {
        id: stepEntity.id,
        executionId: stepEntity.executionId,
        workflowVersionId: stepEntity.workflowVersionId,
        nodeId: stepEntity.nodeId,
        nodeType: stepEntity.nodeType,
        label: stepEntity.label,
        status: stepEntity.status,
        attempt: stepEntity.attempt,
        maxAttempts: stepEntity.maxAttempts,
        input: stepEntity.input,
        output: stepEntity.output,
        error: stepEntity.error,
        startedAt: stepEntity.startedAt
          ? toIsoString(stepEntity.startedAt)
          : null,
        completedAt: stepEntity.completedAt
          ? toIsoString(stepEntity.completedAt)
          : null,
        durationMs: stepEntity.durationMs,
        updatedAt: toIsoString(stepEntity.updatedAt),
      };
      this.state.workflowExecutionSteps.set(step.id, step);
    }

    this.state.workflowExecutionLogs.push(
      ...workflowExecutionLogs.map(
        (logEntity): WorkflowExecutionLog => ({
          id: logEntity.id,
          executionId: logEntity.executionId,
          stepId: logEntity.stepId,
          traceId: logEntity.traceId,
          level: logEntity.level,
          message: logEntity.message,
          metadata: logEntity.metadata,
          createdAt: toIsoString(logEntity.createdAt),
        }),
      ),
    );

    for (const artifactEntity of generatedArtifacts) {
      const artifact: GeneratedArtifact = {
        id: artifactEntity.id,
        projectId: artifactEntity.projectId,
        workflowId: artifactEntity.workflowId,
        workflowVersionId: artifactEntity.workflowVersionId,
        type: artifactEntity.type,
        name: artifactEntity.name,
        contentType: artifactEntity.contentType,
        checksum: artifactEntity.checksum,
        content: artifactEntity.content,
        createdAt: toIsoString(artifactEntity.createdAt),
      };
      this.state.generatedArtifacts.set(artifact.id, artifact);
    }

    this.state.auditLogs.push(
      ...auditLogs.map(
        (auditEntity): AuditLog => ({
          id: auditEntity.id,
          actorUserId: auditEntity.userId,
          workspaceId: auditEntity.workspaceId,
          action: auditEntity.action,
          targetType: auditEntity.targetType,
          targetId: auditEntity.targetId,
          metadata: auditEntity.metadataJson,
          createdAt: toIsoString(auditEntity.createdAt),
        }),
      ),
    );
  }

  private saveDatabase(): void {
    if (!this.isDatabaseConfigured()) {
      return;
    }

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

    this.persistQueue = this.persistQueue
      .then(() => this.persistDatabase(database))
      .catch((error: unknown) => {
        this.logger.error(
          'Failed to persist FORGE state to PostgreSQL.',
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  private resolveFallbackWorkspaceId(workflow: Workflow): string | null {
    if (isUuid(workflow.projectId)) {
      return workflow.projectId;
    }

    const ownerMembership = this.state.members.find(
      (member) => member.userId === workflow.createdByUserId,
    );
    const firstWorkspaceId = Array.from(this.state.workspaces.keys())[0];

    return ownerMembership?.workspaceId ?? firstWorkspaceId ?? null;
  }

  private resolveGeneratedArtifactProjectId(
    artifact: GeneratedArtifact,
  ): string | null {
    if (isUuid(artifact.projectId)) {
      return artifact.projectId;
    }

    const workflow = this.state.workflows.get(artifact.workflowId);
    if (!workflow) {
      return null;
    }

    return (
      toNullableUuid(workflow.projectId) ??
      this.resolveFallbackWorkspaceId(workflow)
    );
  }

  private isDatabaseConfigured(): boolean {
    return Boolean(
      this.userRepository &&
      this.sessionRepository &&
      this.workspaceRepository &&
      this.projectRepository &&
      this.workflowRepository &&
      this.workflowVersionRepository &&
      this.workflowExecutionRepository &&
      this.workflowExecutionStepRepository &&
      this.workflowExecutionLogRepository &&
      this.generatedArtifactRepository &&
      this.auditLogRepository,
    );
  }

  private async persistDatabase(database: DatabaseShape): Promise<void> {
    if (!this.isDatabaseConfigured()) {
      return;
    }

    await this.userRepository!.save(
      database.users.map((user) => ({
        id: user.id,
        email: user.email,
        name: user.name,
        passwordHash: user.passwordHash,
        passwordSalt: user.passwordSalt,
        createdAt: new Date(user.createdAt),
      })),
      { chunk: 1 },
    );
    await this.sessionRepository!.save(
      database.sessions.map((session) => ({
        token: session.token,
        userId: session.userId,
        createdAt: new Date(session.createdAt),
        expiresAt: new Date(session.expiresAt),
      })),
      { chunk: 1 },
    );
    await this.workspaceRepository!.save(
      database.workspaces.map((workspace) => ({
        id: workspace.id,
        userId: workspace.createdByUserId,
        name: workspace.name,
        slug: workspace.slug,
        description: null,
        status: 'active' as const,
        createdAt: new Date(workspace.createdAt),
        updatedAt: new Date(workspace.createdAt),
      })),
      { chunk: 1 },
    );
    await this.projectRepository!.save(
      database.projects.map((project) => ({
        id: project.id,
        workspaceId: project.workspaceId,
        name: project.name,
        slug: project.slug,
        description: project.description,
        createdByUserId: project.createdByUserId,
        createdAt: new Date(project.createdAt),
        updatedAt: new Date(project.createdAt),
      })),
      { chunk: 1 },
    );
    const workflowEntities = database.workflows.flatMap((workflow) => {
      const projectId = toNullableUuid(workflow.projectId);
      const project = projectId
        ? this.state.projects.get(projectId)
        : undefined;
      const workspaceId =
        project?.workspaceId ?? this.resolveFallbackWorkspaceId(workflow);

      if (!workspaceId || !isUuid(workflow.id)) {
        this.logger.warn(
          `Skipping workflow ${workflow.id} during PostgreSQL persistence because one or more UUID references are invalid.`,
        );
        return [];
      }

      return [
        {
          id: workflow.id,
          workspaceId,
          projectId,
          name: workflow.name,
          slug: workflow.slug,
          description: workflow.description,
          status: workflow.status,
          draftVersionId: toNullableUuid(workflow.draftVersionId),
          publishedVersionId: toNullableUuid(workflow.publishedVersionId),
          createdByUserId: workflow.createdByUserId,
          createdAt: new Date(workflow.createdAt),
          updatedAt: new Date(workflow.updatedAt),
        },
      ];
    });

    await this.workflowRepository!.save(workflowEntities, { chunk: 1 });
    await this.workflowVersionRepository!.save(
      database.workflowVersions.flatMap((version) => {
        if (!isUuid(version.workflowId)) {
          this.logger.warn(
            `Skipping workflow version ${version.id} during PostgreSQL persistence because workflowId is not a UUID.`,
          );
          return [];
        }

        return [
          {
            id: version.id,
            workflowId: version.workflowId,
            projectId: toNullableUuid(version.projectId),
            versionNumber: version.versionNumber,
            status: version.status,
            nodesJson: version.graph.nodes,
            edgesJson: version.graph.edges,
            viewportJson: null,
            validation: version.validation,
            compiledIr: version.compiledIr,
            createdBy: version.createdByUserId,
            createdAt: new Date(version.createdAt),
            updatedAt: new Date(version.updatedAt),
            publishedAt: version.publishedAt
              ? new Date(version.publishedAt)
              : null,
          },
        ];
      }),
      { chunk: 1 },
    );
    await this.workflowExecutionRepository!.save(
      database.workflowExecutions.map((execution) => ({
        id: execution.id,
        projectId: execution.projectId,
        workflowId: execution.workflowId,
        workflowVersionId: execution.workflowVersionId,
        status: execution.status,
        triggerType: execution.triggerType,
        traceId: execution.traceId,
        idempotencyKey: execution.idempotencyKey,
        input: execution.input,
        output: execution.output,
        error: execution.error,
        createdAt: new Date(execution.createdAt),
        startedAt: execution.startedAt ? new Date(execution.startedAt) : null,
        completedAt: execution.completedAt
          ? new Date(execution.completedAt)
          : null,
        updatedAt: new Date(execution.updatedAt),
      })),
      { chunk: 1 },
    );
    await this.workflowExecutionStepRepository!.save(
      database.workflowExecutionSteps.map((step) => ({
        id: step.id,
        executionId: step.executionId,
        workflowVersionId: step.workflowVersionId,
        nodeId: step.nodeId,
        nodeType: step.nodeType,
        label: step.label,
        status: step.status,
        attempt: step.attempt,
        maxAttempts: step.maxAttempts,
        input: step.input,
        output: step.output,
        error: step.error,
        startedAt: step.startedAt ? new Date(step.startedAt) : null,
        completedAt: step.completedAt ? new Date(step.completedAt) : null,
        durationMs: step.durationMs,
        updatedAt: new Date(step.updatedAt),
      })),
      { chunk: 1 },
    );
    await this.workflowExecutionLogRepository!.save(
      database.workflowExecutionLogs.map((log) => ({
        id: log.id,
        executionId: log.executionId,
        stepId: log.stepId,
        traceId: log.traceId,
        level: log.level,
        message: log.message,
        metadata: log.metadata,
        createdAt: new Date(log.createdAt),
      })),
      { chunk: 1 },
    );
    await this.generatedArtifactRepository!.save(
      database.generatedArtifacts.flatMap((artifact) => {
        const projectId = this.resolveGeneratedArtifactProjectId(artifact);

        if (
          !projectId ||
          !isUuid(artifact.workflowId) ||
          !isUuid(artifact.workflowVersionId)
        ) {
          this.logger.warn(
            `Skipping generated artifact ${artifact.id} during PostgreSQL persistence because one or more UUID references are invalid.`,
          );
          return [];
        }

        return [
          {
            id: artifact.id,
            projectId,
            workflowId: artifact.workflowId,
            workflowVersionId: artifact.workflowVersionId,
            type: artifact.type,
            name: artifact.name,
            contentType: artifact.contentType,
            checksum: artifact.checksum,
            content: artifact.content,
            createdAt: new Date(artifact.createdAt),
          },
        ];
      }),
      { chunk: 1 },
    );
    await this.auditLogRepository!.save(
      database.auditLogs.map((log) => ({
        id: log.id,
        userId: log.actorUserId,
        workspaceId: log.workspaceId,
        workflowId: log.targetType === 'workflow' ? log.targetId : null,
        action: log.action,
        targetType: log.targetType,
        targetId: log.targetId,
        metadataJson: log.metadata,
        createdAt: new Date(log.createdAt),
      })),
      { chunk: 1 },
    );
  }

  private async ensureDatabaseSchema(): Promise<void> {
    if (!this.dataSource?.isInitialized || !shouldRunDatabaseMigrations()) {
      return;
    }

    await this.dataSource.runMigrations({ transaction: 'all' });
  }
}
