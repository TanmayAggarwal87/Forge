import { Injectable, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
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
} from '../../../database/entities';
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
} from '../../identity.types';
import { ForgeMemoryState } from '../forge-memory-state.service';
import { toIsoString } from '../utils/date.util';
import { PostgresStatePersisterService } from './postgres-state-persister.service';

@Injectable()
export class PostgresStateLoaderService {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly statePersister: PostgresStatePersisterService,
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
  ) {}

  async loadDatabase(): Promise<void> {
    if (!this.isDatabaseConfigured()) {
      return;
    }

    await this.statePersister.ensureDatabaseSchema();

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
        projectId: workflowEntity.projectId ?? workflowEntity.workspaceId,
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
        compiledIr: versionEntity.compiledIr,
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
}
