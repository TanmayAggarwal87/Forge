import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  AuditLog,
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
  auditLogs: AuditLog[];
};

@Injectable()
export class InMemoryStoreService {
  private readonly users = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private readonly workspaces = new Map<string, Workspace>();
  private readonly members: WorkspaceMember[] = [];
  private readonly projects = new Map<string, Project>();
  private readonly workflows = new Map<string, Workflow>();
  private readonly workflowVersions = new Map<string, WorkflowVersion>();
  private readonly workflowExecutions = new Map<string, WorkflowExecution>();
  private readonly workflowExecutionSteps = new Map<
    string,
    WorkflowExecutionStep
  >();
  private readonly workflowExecutionLogs: WorkflowExecutionLog[] = [];
  private readonly auditLogs: AuditLog[] = [];
  private readonly databasePath =
    process.env.FORGE_DATABASE_PATH ??
    join(process.cwd(), 'data', 'forgeDatabase.json');

  constructor() {
    this.loadDatabase();
  }

  register(
    email: string,
    password: string,
    name: string,
  ): { token: string; user: SessionUser } {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUserId = this.usersByEmail.get(normalizedEmail);

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
    const existingUserId = this.usersByEmail.get(normalizedEmail);
    const user =
      existingUserId === undefined ? undefined : this.users.get(existingUserId);

    if (!user || !this.isPasswordValid(user, password)) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return this.createSession(user);
  }

  private createSession(user: User): { token: string; user: SessionUser } {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

    this.sessions.set(token, {
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
    const session = this.sessions.get(token);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        this.sessions.delete(token);
        this.saveDatabase();
      }
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = this.users.get(session.userId);
    if (!user) {
      this.sessions.delete(token);
      this.saveDatabase();
      throw new UnauthorizedException('Authentication is required.');
    }

    return { session, user: this.toSessionUser(user) };
  }

  signOut(token: string, actorUserId: string): void {
    this.sessions.delete(token);
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

    this.workspaces.set(workspace.id, workspace);
    this.members.push({
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

  listWorkspaces(userId: string): Array<Workspace & { role: WorkspaceRole }> {
    return this.members
      .filter((member) => member.userId === userId)
      .map((member) => {
        const workspace = this.workspaces.get(member.workspaceId);
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
    const workspace = this.workspaces.get(workspaceId);
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

    this.projects.set(project.id, project);
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

    return Array.from(this.projects.values()).filter(
      (project) => project.workspaceId === workspaceId,
    );
  }

  getProjectForUser(projectId: string, userId: string): Project {
    const project = this.projects.get(projectId);
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
    this.workflows.set(workflow.id, workflow);
    this.workflowVersions.set(draftVersion.id, draftVersion);
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

    return Array.from(this.workflows.values())
      .filter((workflow) => workflow.projectId === projectId)
      .map((workflow) => {
        const draftVersion = this.workflowVersions.get(workflow.draftVersionId);

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

    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.projectId !== projectId) {
      throw new NotFoundException('Workflow was not found.');
    }

    const draftVersion = this.workflowVersions.get(workflow.draftVersionId);
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

    this.workflows.set(updatedWorkflow.id, updatedWorkflow);
    this.workflowVersions.set(updatedDraftVersion.id, updatedDraftVersion);
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
        ...Array.from(this.workflowVersions.values())
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

    this.workflowVersions.set(publishedVersion.id, publishedVersion);
    this.workflows.set(updatedWorkflow.id, updatedWorkflow);
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

  getPublishedWorkflowForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): Workflow & { publishedVersion: WorkflowVersion } {
    this.getProjectForUser(projectId, userId);

    const workflow = this.workflows.get(workflowId);
    if (!workflow || workflow.projectId !== projectId) {
      throw new NotFoundException('Workflow was not found.');
    }

    if (!workflow.publishedVersionId) {
      throw new NotFoundException('Workflow has no published version.');
    }

    const publishedVersion = this.workflowVersions.get(
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

    this.workflowExecutions.set(execution.id, execution);
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
      Array.from(this.workflowExecutions.values()).find(
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
    const execution = this.workflowExecutions.get(executionId);
    if (!execution) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    const updatedExecution: WorkflowExecution = {
      ...execution,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.workflowExecutions.set(executionId, updatedExecution);
    this.saveDatabase();
    return updatedExecution;
  }

  upsertWorkflowExecutionStep(
    step: WorkflowExecutionStep,
  ): WorkflowExecutionStep {
    this.workflowExecutionSteps.set(step.id, step);
    this.saveDatabase();
    return step;
  }

  appendWorkflowExecutionLog(log: WorkflowExecutionLog): WorkflowExecutionLog {
    this.workflowExecutionLogs.push(log);
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

    const execution = this.workflowExecutions.get(executionId);
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
    const execution = this.workflowExecutions.get(executionId);
    if (!execution) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    return execution;
  }

  getWorkflowVersionById(workflowVersionId: string): WorkflowVersion {
    const version = this.workflowVersions.get(workflowVersionId);
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

    return Array.from(this.workflowExecutions.values())
      .filter(
        (execution) =>
          execution.projectId === projectId &&
          execution.workflowId === workflowId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listWorkflowExecutionSteps(executionId: string): WorkflowExecutionStep[] {
    return Array.from(this.workflowExecutionSteps.values())
      .filter((step) => step.executionId === executionId)
      .sort(
        (left, right) =>
          left.startedAt?.localeCompare(right.startedAt ?? '') ?? 0,
      );
  }

  listWorkflowExecutionLogs(executionId: string): WorkflowExecutionLog[] {
    return this.workflowExecutionLogs.filter(
      (log) => log.executionId === executionId,
    );
  }

  listAuditLogs(workspaceId: string, userId: string): AuditLog[] {
    this.getWorkspaceForUser(workspaceId, userId);

    return this.auditLogs
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

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
    this.saveDatabase();
    return user;
  }

  private getMembership(
    workspaceId: string,
    userId: string,
  ): WorkspaceMember | undefined {
    return this.members.find(
      (member) =>
        member.workspaceId === workspaceId && member.userId === userId,
    );
  }

  private recordAudit(input: Omit<AuditLog, 'id' | 'createdAt'>): void {
    this.auditLogs.push({
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

  private loadDatabase(): void {
    if (!existsSync(this.databasePath)) {
      return;
    }

    const rawDatabase = readFileSync(this.databasePath, 'utf8');
    const database = JSON.parse(rawDatabase) as Partial<DatabaseShape>;

    for (const user of database.users ?? []) {
      this.users.set(user.id, user);
      this.usersByEmail.set(user.email, user.id);
    }

    for (const session of database.sessions ?? []) {
      this.sessions.set(session.token, session);
    }

    for (const workspace of database.workspaces ?? []) {
      this.workspaces.set(workspace.id, workspace);
    }

    this.members.push(...(database.members ?? []));

    for (const project of database.projects ?? []) {
      this.projects.set(project.id, project);
    }

    for (const workflow of database.workflows ?? []) {
      this.workflows.set(workflow.id, workflow);
    }

    for (const workflowVersion of database.workflowVersions ?? []) {
      this.workflowVersions.set(workflowVersion.id, {
        ...workflowVersion,
        compiledIr: workflowVersion.compiledIr ?? null,
        publishedAt: workflowVersion.publishedAt ?? null,
      });
    }

    for (const execution of database.workflowExecutions ?? []) {
      this.workflowExecutions.set(execution.id, execution);
    }

    for (const step of database.workflowExecutionSteps ?? []) {
      this.workflowExecutionSteps.set(step.id, step);
    }

    this.workflowExecutionLogs.push(...(database.workflowExecutionLogs ?? []));

    this.auditLogs.push(...(database.auditLogs ?? []));
  }

  private saveDatabase(): void {
    mkdirSync(dirname(this.databasePath), { recursive: true });
    const database: DatabaseShape = {
      users: Array.from(this.users.values()),
      sessions: Array.from(this.sessions.values()),
      workspaces: Array.from(this.workspaces.values()),
      members: this.members,
      projects: Array.from(this.projects.values()),
      workflows: Array.from(this.workflows.values()),
      workflowVersions: Array.from(this.workflowVersions.values()),
      workflowExecutions: Array.from(this.workflowExecutions.values()),
      workflowExecutionSteps: Array.from(this.workflowExecutionSteps.values()),
      workflowExecutionLogs: this.workflowExecutionLogs,
      auditLogs: this.auditLogs,
    };

    writeFileSync(this.databasePath, JSON.stringify(database, null, 2));
  }

  private cloneJson<T>(value: T): T {
    return JSON.parse(JSON.stringify(value)) as T;
  }
}
