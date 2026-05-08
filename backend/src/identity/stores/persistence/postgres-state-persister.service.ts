import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import type { DataSource, Repository } from 'typeorm';
import { shouldRunDatabaseMigrations } from '../../../database/database.config';
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
import type { GeneratedArtifact, Workflow } from '../../identity.types';
import { ForgeMemoryState } from '../forge-memory-state.service';
import { isUuid, toNullableUuid } from '../utils/uuid.util';
import type { DatabaseShape } from './database-shape.types';

@Injectable()
export class PostgresStatePersisterService {
  private readonly logger = new Logger(PostgresStatePersisterService.name);
  private persistQueue = Promise.resolve();

  constructor(
    private readonly state: ForgeMemoryState,
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

  isDatabaseConfigured(): boolean {
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

  scheduleSave(database: DatabaseShape): void {
    if (!this.isDatabaseConfigured()) {
      return;
    }

    this.persistQueue = this.persistQueue
      .then(() => this.persistDatabase(database))
      .catch((error: unknown) => {
        this.logger.error(
          'Failed to persist FORGE state to PostgreSQL.',
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  async ensureDatabaseSchema(): Promise<void> {
    if (!this.dataSource?.isInitialized || !shouldRunDatabaseMigrations()) {
      return;
    }

    await this.dataSource.runMigrations({ transaction: 'all' });
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
}
