import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  Optional,
  UnauthorizedException,
} from '@nestjs/common';
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
import { ForgeMemoryState } from './stores/forge-memory-state.service';

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
    const normalizedEmail = email.trim().toLowerCase();
    const existingUserId = this.state.usersByEmail.get(normalizedEmail);

    if (existingUserId !== undefined) {
      throw new ConflictException('A user with this email already exists.');
    }

    const user = this.createUser(normalizedEmail, password, name);
    this.recordAudit({
      actorUserId: user.id,
      workspaceId: null,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    });

    return this.createSession(user);
  }

  login(email: string, password: string): { token: string; user: SessionUser } {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUserId = this.state.usersByEmail.get(normalizedEmail);
    const user =
      existingUserId === undefined
        ? undefined
        : this.state.users.get(existingUserId);

    if (!user || !this.isPasswordValid(user, password)) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return this.createSession(user);
  }

  private createSession(user: User): { token: string; user: SessionUser } {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

    this.state.sessions.set(token, {
      token,
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    this.recordAudit({
      actorUserId: user.id,
      workspaceId: null,
      action: 'auth.sign_in',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    });
    this.saveDatabase();

    return { token, user: this.toSessionUser(user) };
  }

  getSession(token: string): { session: Session; user: SessionUser } {
    const session = this.state.sessions.get(token);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        this.state.sessions.delete(token);
        this.saveDatabase();
      }
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = this.state.users.get(session.userId);
    if (!user) {
      this.state.sessions.delete(token);
      this.saveDatabase();
      throw new UnauthorizedException('Authentication is required.');
    }

    return { session, user: this.toSessionUser(user) };
  }

  signOut(token: string, actorUserId: string): void {
    this.state.sessions.delete(token);
    this.recordAudit({
      actorUserId,
      workspaceId: null,
      action: 'auth.sign_out',
      targetType: 'user',
      targetId: actorUserId,
      metadata: {},
    });
    this.saveDatabase();
  }

  createWorkspace(input: CreateWorkspaceInput): Workspace {
    const workspace: Workspace = {
      id: randomUUID(),
      name: input.name,
      slug: this.slugify(input.name),
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };

    this.state.workspaces.set(workspace.id, workspace);
    this.state.members.push({
      workspaceId: workspace.id,
      userId: input.actorUserId,
      role: 'owner',
      createdAt: workspace.createdAt,
    });
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: workspace.id,
      action: 'workspace.created',
      targetType: 'workspace',
      targetId: workspace.id,
      metadata: { name: workspace.name },
    });
    this.saveDatabase();

    return workspace;
  }

  updateWorkspace(
    workspaceId: string,
    userId: string,
    patch: { name?: string; description?: string | null },
  ): Workspace & { role: WorkspaceRole } {
    const existing = this.getWorkspaceForUser(workspaceId, userId);
    const updatedWorkspace: Workspace = {
      id: existing.id,
      name: patch.name ?? existing.name,
      slug: this.slugify(patch.name ?? existing.name),
      createdByUserId: existing.createdByUserId,
      createdAt: existing.createdAt,
    };

    this.state.workspaces.set(workspaceId, updatedWorkspace);
    this.recordAudit({
      actorUserId: userId,
      workspaceId,
      action: 'workspace.updated',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: {
        name: updatedWorkspace.name,
        description: patch.description ?? null,
      },
    });
    this.saveDatabase();

    return { ...updatedWorkspace, role: existing.role };
  }

  deleteWorkspace(workspaceId: string, userId: string): void {
    this.getWorkspaceForUser(workspaceId, userId);
    this.state.workspaces.delete(workspaceId);

    for (const project of Array.from(this.state.projects.values())) {
      if (project.workspaceId !== workspaceId) {
        continue;
      }

      this.state.projects.delete(project.id);
      for (const workflow of Array.from(this.state.workflows.values())) {
        if (workflow.projectId !== project.id) {
          continue;
        }

        this.state.workflows.delete(workflow.id);
        for (const version of Array.from(
          this.state.workflowVersions.values(),
        )) {
          if (version.workflowId === workflow.id) {
            this.state.workflowVersions.delete(version.id);
          }
        }
      }
    }

    this.recordAudit({
      actorUserId: userId,
      workspaceId: null,
      action: 'workspace.deleted',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: {},
    });
    if (this.workspaceRepository) {
      void this.workspaceRepository.delete(workspaceId);
    }
    this.saveDatabase();
  }

  listWorkspaces(userId: string): Array<Workspace & { role: WorkspaceRole }> {
    return this.state.members
      .filter((member) => member.userId === userId)
      .map((member) => {
        const workspace = this.state.workspaces.get(member.workspaceId);
        if (!workspace) {
          return null;
        }
        return { ...workspace, role: member.role };
      })
      .filter((workspace): workspace is Workspace & { role: WorkspaceRole } =>
        Boolean(workspace),
      );
  }

  getWorkspaceForUser(
    workspaceId: string,
    userId: string,
  ): Workspace & { role: WorkspaceRole } {
    const workspace = this.state.workspaces.get(workspaceId);
    const member = this.getMembership(workspaceId, userId);

    if (!workspace || !member) {
      throw new NotFoundException('Workspace was not found.');
    }

    return { ...workspace, role: member.role };
  }

  createProject(input: CreateProjectInput): Project {
    const project: Project = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      slug: this.slugify(input.name),
      description: input.description?.trim() || null,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };

    this.state.projects.set(project.id, project);
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      action: 'project.created',
      targetType: 'project',
      targetId: project.id,
      metadata: { name: project.name },
    });
    this.saveDatabase();

    return project;
  }

  listProjects(workspaceId: string, userId: string): Project[] {
    this.getWorkspaceForUser(workspaceId, userId);

    return Array.from(this.state.projects.values()).filter(
      (project) => project.workspaceId === workspaceId,
    );
  }

  getProjectForUser(projectId: string, userId: string): Project {
    const project = this.state.projects.get(projectId);
    if (!project) {
      throw new NotFoundException('Project was not found.');
    }

    this.getWorkspaceForUser(project.workspaceId, userId);
    return project;
  }

  createWorkflow(input: CreateWorkflowInput): Workflow & {
    draftVersion: WorkflowVersion;
  } {
    const project = this.getProjectForUser(input.projectId, input.actorUserId);
    const now = new Date().toISOString();

    const draftVersion: WorkflowVersion = {
      id: randomUUID(),
      workflowId: '',
      projectId: input.projectId,
      versionNumber: 1,
      status: 'draft',
      graph: input.graph,
      validation: input.validation,
      compiledIr: null,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    const workflow: Workflow = {
      id: randomUUID(),
      projectId: input.projectId,
      name: input.name,
      slug: this.slugify(input.name),
      description: input.description?.trim() || null,
      status: 'draft',
      draftVersionId: draftVersion.id,
      publishedVersionId: null,
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
    };

    draftVersion.workflowId = workflow.id;
    this.state.workflows.set(workflow.id, workflow);
    this.state.workflowVersions.set(draftVersion.id, draftVersion);
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: project.workspaceId,
      action: 'workflow.created',
      targetType: 'workflow',
      targetId: workflow.id,
      metadata: {
        name: workflow.name,
        nodeCount: draftVersion.graph.nodes.length,
        edgeCount: draftVersion.graph.edges.length,
      },
    });
    this.saveDatabase();

    return {
      ...workflow,
      draftVersion,
    };
  }

  listWorkflows(
    projectId: string,
    userId: string,
  ): Array<Workflow & { draftVersion: WorkflowVersion }> {
    this.getProjectForUser(projectId, userId);

    return Array.from(this.state.workflows.values())
      .filter((workflow) => workflow.projectId === projectId)
      .map((workflow) => {
        const draftVersion = this.state.workflowVersions.get(
          workflow.draftVersionId,
        );

        if (!draftVersion) {
          throw new NotFoundException('Workflow draft version was not found.');
        }

        return {
          ...workflow,
          draftVersion,
        };
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  getWorkflowDraftForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): Workflow & { draftVersion: WorkflowVersion } {
    this.getProjectForUser(projectId, userId);

    const workflow = this.state.workflows.get(workflowId);
    if (!workflow || workflow.projectId !== projectId) {
      throw new NotFoundException('Workflow was not found.');
    }

    const draftVersion = this.state.workflowVersions.get(
      workflow.draftVersionId,
    );
    if (!draftVersion) {
      throw new NotFoundException('Workflow draft version was not found.');
    }

    return {
      ...workflow,
      draftVersion,
    };
  }

  saveWorkflowDraft(input: SaveWorkflowDraftInput): Workflow & {
    draftVersion: WorkflowVersion;
  } {
    const workflow = this.getWorkflowDraftForUser(
      input.projectId,
      input.workflowId,
      input.actorUserId,
    );
    const project = this.getProjectForUser(input.projectId, input.actorUserId);
    const nextUpdatedAt = new Date().toISOString();

    const updatedWorkflow: Workflow = {
      ...workflow,
      name: input.name ?? workflow.name,
      slug: this.slugify(input.name ?? workflow.name),
      description:
        input.description === undefined
          ? workflow.description
          : input.description,
      updatedAt: nextUpdatedAt,
    };

    const updatedDraftVersion: WorkflowVersion = {
      ...workflow.draftVersion,
      graph: input.graph,
      validation: input.validation,
      updatedAt: nextUpdatedAt,
    };

    this.state.workflows.set(updatedWorkflow.id, updatedWorkflow);
    this.state.workflowVersions.set(
      updatedDraftVersion.id,
      updatedDraftVersion,
    );
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: project.workspaceId,
      action: 'workflow.draft_saved',
      targetType: 'workflow',
      targetId: updatedWorkflow.id,
      metadata: {
        nodeCount: updatedDraftVersion.graph.nodes.length,
        edgeCount: updatedDraftVersion.graph.edges.length,
        issueCount: updatedDraftVersion.validation.issues.length,
      },
    });
    this.saveDatabase();

    return {
      ...updatedWorkflow,
      draftVersion: updatedDraftVersion,
    };
  }

  publishWorkflow(input: PublishWorkflowInput): Workflow & {
    publishedVersion: WorkflowVersion;
  } {
    const workflow = this.getWorkflowDraftForUser(
      input.projectId,
      input.workflowId,
      input.actorUserId,
    );
    const project = this.getProjectForUser(input.projectId, input.actorUserId);
    const now = new Date().toISOString();
    const nextVersionNumber =
      Math.max(
        0,
        ...Array.from(this.state.workflowVersions.values())
          .filter((version) => version.workflowId === workflow.id)
          .map((version) => version.versionNumber),
      ) + 1;

    const publishedVersion: WorkflowVersion = {
      id: randomUUID(),
      workflowId: workflow.id,
      projectId: input.projectId,
      versionNumber: nextVersionNumber,
      status: 'published',
      graph: this.cloneJson(workflow.draftVersion.graph),
      validation: this.cloneJson(workflow.draftVersion.validation),
      compiledIr: this.cloneJson(input.compiledIr),
      createdByUserId: input.actorUserId,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    };

    const updatedWorkflow: Workflow = {
      ...workflow,
      status: 'published',
      publishedVersionId: publishedVersion.id,
      updatedAt: now,
    };

    this.state.workflowVersions.set(publishedVersion.id, publishedVersion);
    this.state.workflows.set(updatedWorkflow.id, updatedWorkflow);
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: project.workspaceId,
      action: 'workflow.published',
      targetType: 'workflow',
      targetId: workflow.id,
      metadata: {
        workflowVersionId: publishedVersion.id,
        versionNumber: publishedVersion.versionNumber,
        graphHash: input.compiledIr.graphHash,
      },
    });
    this.saveDatabase();

    return {
      ...updatedWorkflow,
      publishedVersion,
    };
  }

  listWorkflowVersionsForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): WorkflowVersion[] {
    const workflow = this.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );

    return Array.from(this.state.workflowVersions.values())
      .filter((version) => version.workflowId === workflow.id)
      .sort((left, right) => right.versionNumber - left.versionNumber);
  }

  getWorkflowVersionForUser(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    userId: string,
  ): WorkflowVersion {
    const workflow = this.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );
    const version = this.state.workflowVersions.get(workflowVersionId);

    if (!version || version.workflowId !== workflow.id) {
      throw new NotFoundException('Workflow version was not found.');
    }

    return version;
  }

  activateWorkflowVersion(input: ActivateWorkflowVersionInput): Workflow & {
    activeVersion: WorkflowVersion;
    previousVersionId: string | null;
  } {
    const workflow = this.getWorkflowDraftForUser(
      input.projectId,
      input.workflowId,
      input.actorUserId,
    );
    const project = this.getProjectForUser(input.projectId, input.actorUserId);
    const version = this.state.workflowVersions.get(input.workflowVersionId);

    if (
      !version ||
      version.workflowId !== workflow.id ||
      version.status !== 'published'
    ) {
      throw new NotFoundException('Published workflow version was not found.');
    }

    const now = new Date().toISOString();
    const previousVersionId = workflow.publishedVersionId;
    const updatedWorkflow: Workflow = {
      ...workflow,
      status: 'published',
      publishedVersionId: version.id,
      updatedAt: now,
    };

    this.state.workflows.set(updatedWorkflow.id, updatedWorkflow);
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: project.workspaceId,
      action: input.auditAction,
      targetType: 'workflow',
      targetId: workflow.id,
      metadata: {
        previousVersionId,
        workflowVersionId: version.id,
        versionNumber: version.versionNumber,
        graphHash: version.compiledIr?.graphHash ?? null,
      },
    });
    this.saveDatabase();

    return {
      ...updatedWorkflow,
      activeVersion: version,
      previousVersionId,
    };
  }

  deactivateWorkflow(input: DeactivateWorkflowInput): Workflow & {
    previousVersionId: string | null;
  } {
    const workflow = this.getWorkflowDraftForUser(
      input.projectId,
      input.workflowId,
      input.actorUserId,
    );
    const project = this.getProjectForUser(input.projectId, input.actorUserId);
    const previousVersionId = workflow.publishedVersionId;
    const updatedWorkflow: Workflow = {
      ...workflow,
      status: previousVersionId ? 'inactive' : workflow.status,
      publishedVersionId: null,
      updatedAt: new Date().toISOString(),
    };

    this.state.workflows.set(updatedWorkflow.id, updatedWorkflow);
    this.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: project.workspaceId,
      action: 'workflow.deactivated',
      targetType: 'workflow',
      targetId: workflow.id,
      metadata: {
        previousVersionId,
      },
    });
    this.saveDatabase();

    return {
      ...updatedWorkflow,
      previousVersionId,
    };
  }

  replaceGeneratedArtifactsForVersion(
    workflowVersionId: string,
    artifacts: GeneratedArtifact[],
  ): GeneratedArtifact[] {
    const version = this.getWorkflowVersionById(workflowVersionId);
    for (const artifact of Array.from(this.state.generatedArtifacts.values())) {
      if (artifact.workflowVersionId === workflowVersionId) {
        this.state.generatedArtifacts.delete(artifact.id);
      }
    }

    const normalizedArtifacts = artifacts.map((artifact) => ({
      ...artifact,
      projectId: version.projectId,
      workflowId: version.workflowId,
      workflowVersionId,
    }));

    for (const artifact of normalizedArtifacts) {
      this.state.generatedArtifacts.set(artifact.id, artifact);
    }

    this.saveDatabase();
    return normalizedArtifacts;
  }

  listGeneratedArtifactsForPublishedWorkflow(
    projectId: string,
    workflowId: string,
    userId: string,
  ): GeneratedArtifact[] {
    const workflow = this.getPublishedWorkflowForUser(
      projectId,
      workflowId,
      userId,
    );

    return this.listGeneratedArtifactsForVersion(workflow.publishedVersion.id);
  }

  listGeneratedArtifactsForVersion(
    workflowVersionId: string,
  ): GeneratedArtifact[] {
    return Array.from(this.state.generatedArtifacts.values())
      .filter((artifact) => artifact.workflowVersionId === workflowVersionId)
      .sort((left, right) =>
        left.type === right.type
          ? left.name.localeCompare(right.name)
          : left.type.localeCompare(right.type),
      );
  }

  getPublishedWorkflowForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): Workflow & { publishedVersion: WorkflowVersion } {
    this.getProjectForUser(projectId, userId);

    const workflow = this.state.workflows.get(workflowId);
    if (!workflow || workflow.projectId !== projectId) {
      throw new NotFoundException('Workflow was not found.');
    }

    if (!workflow.publishedVersionId) {
      throw new NotFoundException('Workflow has no published version.');
    }

    const publishedVersion = this.state.workflowVersions.get(
      workflow.publishedVersionId,
    );
    if (!publishedVersion || publishedVersion.status !== 'published') {
      throw new NotFoundException('Published workflow version was not found.');
    }

    return {
      ...workflow,
      publishedVersion,
    };
  }

  createWorkflowExecution(input: CreateExecutionInput): WorkflowExecution {
    const now = new Date().toISOString();
    const execution: WorkflowExecution = {
      id: randomUUID(),
      projectId: input.projectId,
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      status: input.status,
      triggerType: input.triggerType,
      traceId: input.traceId,
      idempotencyKey: input.idempotencyKey ?? null,
      input: input.input,
      output: null,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    };

    this.state.workflowExecutions.set(execution.id, execution);
    this.saveDatabase();
    return execution;
  }

  findWorkflowExecutionByIdempotencyKey(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    idempotencyKey: string,
  ): WorkflowExecution | null {
    return (
      Array.from(this.state.workflowExecutions.values()).find(
        (execution) =>
          execution.projectId === projectId &&
          execution.workflowId === workflowId &&
          execution.workflowVersionId === workflowVersionId &&
          execution.idempotencyKey === idempotencyKey,
      ) ?? null
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
    const execution = this.state.workflowExecutions.get(executionId);
    if (!execution) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    const updatedExecution: WorkflowExecution = {
      ...execution,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.state.workflowExecutions.set(executionId, updatedExecution);
    this.saveDatabase();
    return updatedExecution;
  }

  upsertWorkflowExecutionStep(
    step: WorkflowExecutionStep,
  ): WorkflowExecutionStep {
    this.state.workflowExecutionSteps.set(step.id, step);
    this.saveDatabase();
    return step;
  }

  appendWorkflowExecutionLog(log: WorkflowExecutionLog): WorkflowExecutionLog {
    this.state.workflowExecutionLogs.push(log);
    this.saveDatabase();
    return log;
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
    this.getWorkflowDraftForUser(projectId, workflowId, userId);

    const execution = this.state.workflowExecutions.get(executionId);
    if (
      !execution ||
      execution.projectId !== projectId ||
      execution.workflowId !== workflowId
    ) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    return {
      ...execution,
      steps: this.listWorkflowExecutionSteps(execution.id),
      logs: this.listWorkflowExecutionLogs(execution.id),
    };
  }

  getWorkflowExecutionById(executionId: string): WorkflowExecution {
    const execution = this.state.workflowExecutions.get(executionId);
    if (!execution) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    return execution;
  }

  getWorkflowVersionById(workflowVersionId: string): WorkflowVersion {
    const version = this.state.workflowVersions.get(workflowVersionId);
    if (!version) {
      throw new NotFoundException('Workflow version was not found.');
    }

    return version;
  }

  listWorkflowExecutionsForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): WorkflowExecution[] {
    this.getWorkflowDraftForUser(projectId, workflowId, userId);

    return Array.from(this.state.workflowExecutions.values())
      .filter(
        (execution) =>
          execution.projectId === projectId &&
          execution.workflowId === workflowId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listWorkflowExecutionSteps(executionId: string): WorkflowExecutionStep[] {
    return Array.from(this.state.workflowExecutionSteps.values())
      .filter((step) => step.executionId === executionId)
      .sort(
        (left, right) =>
          left.startedAt?.localeCompare(right.startedAt ?? '') ?? 0,
      );
  }

  listWorkflowExecutionLogs(executionId: string): WorkflowExecutionLog[] {
    return this.state.workflowExecutionLogs.filter(
      (log) => log.executionId === executionId,
    );
  }

  listAuditLogs(workspaceId: string, userId: string): AuditLog[] {
    this.getWorkspaceForUser(workspaceId, userId);

    return this.state.auditLogs
      .filter((log) => log.workspaceId === workspaceId)
      .slice()
      .reverse();
  }

  private createUser(email: string, password: string, name?: string): User {
    const now = new Date().toISOString();
    const passwordSalt = randomBytes(16).toString('hex');
    const user: User = {
      id: randomUUID(),
      email,
      name: name?.trim() || email.split('@')[0],
      passwordHash: this.hashPassword(password, passwordSalt),
      passwordSalt,
      createdAt: now,
    };

    this.state.users.set(user.id, user);
    this.state.usersByEmail.set(user.email, user.id);
    this.saveDatabase();
    return user;
  }

  private getMembership(
    workspaceId: string,
    userId: string,
  ): WorkspaceMember | undefined {
    return this.state.members.find(
      (member) =>
        member.workspaceId === workspaceId && member.userId === userId,
    );
  }

  private recordAudit(input: Omit<AuditLog, 'id' | 'createdAt'>): void {
    this.state.auditLogs.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    });
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || randomUUID();
  }

  private hashPassword(password: string, salt: string): string {
    return scryptSync(password, salt, 64).toString('hex');
  }

  private isPasswordValid(user: User, password: string): boolean {
    const expectedHash = Buffer.from(user.passwordHash, 'hex');
    const providedHash = Buffer.from(
      this.hashPassword(password, user.passwordSalt),
      'hex',
    );

    return (
      expectedHash.length === providedHash.length &&
      timingSafeEqual(expectedHash, providedHash)
    );
  }

  private toSessionUser(user: User): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
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

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
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

function toIsoString(value: Date | string): string {
  return value instanceof Date
    ? value.toISOString()
    : new Date(value).toISOString();
}

function toNullableUuid(value: string | null | undefined): string | null {
  return isUuid(value) ? value : null;
}

function isUuid(value: string | null | undefined): value is string {
  return Boolean(
    value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    ),
  );
}
