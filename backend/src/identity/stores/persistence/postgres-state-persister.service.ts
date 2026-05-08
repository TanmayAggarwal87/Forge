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
  private readonly warningKeys = new Set<string>();
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

    const userEntities = database.users.flatMap((user) => {
      if (!isUuid(user.id)) {
        this.warnOnce(
          `user-invalid-${String(user.id)}`,
          `Skipping user ${String(user.id)} during PostgreSQL persistence because id is not a UUID.`,
        );
        return [];
      }

      return [
        {
          id: user.id,
          email: user.email,
          name: user.name,
          passwordHash: user.passwordHash,
          passwordSalt: user.passwordSalt,
          createdAt: new Date(user.createdAt),
        },
      ];
    });
    const persistedUserIds = new Set(userEntities.map((user) => user.id));

    await this.userRepository!.save(userEntities, { chunk: 1 });
    await this.sessionRepository!.save(
      database.sessions.flatMap((session) => {
        if (!persistedUserIds.has(session.userId)) {
          this.warnOnce(
            `session-invalid-user-${session.token}`,
            `Skipping session ${session.token} during PostgreSQL persistence because user ${session.userId} was not persisted.`,
          );
          return [];
        }

        return [
          {
            token: session.token,
            userId: session.userId,
            createdAt: new Date(session.createdAt),
            expiresAt: new Date(session.expiresAt),
          },
        ];
      }),
      { chunk: 1 },
    );
    const workspaceEntities = database.workspaces.flatMap((workspace) => {
      if (
        !isUuid(workspace.id) ||
        !persistedUserIds.has(workspace.createdByUserId)
      ) {
        this.warnOnce(
          `workspace-invalid-${workspace.id}`,
          `Skipping workspace ${workspace.id} during PostgreSQL persistence because one or more UUID references are invalid.`,
        );
        return [];
      }

      return [
        {
          id: workspace.id,
          userId: workspace.createdByUserId,
          name: workspace.name,
          slug: workspace.slug,
          description: null,
          status: 'active' as const,
          createdAt: new Date(workspace.createdAt),
          updatedAt: new Date(workspace.createdAt),
        },
      ];
    });
    const persistedWorkspaceIds = new Set(
      workspaceEntities.map((workspace) => workspace.id),
    );

    await this.workspaceRepository!.save(workspaceEntities, { chunk: 1 });
    const projectEntities = database.projects.flatMap((project) => {
      if (
        !isUuid(project.id) ||
        !persistedWorkspaceIds.has(project.workspaceId) ||
        !persistedUserIds.has(project.createdByUserId)
      ) {
        this.warnOnce(
          `project-invalid-${project.id}`,
          `Skipping project ${project.id} during PostgreSQL persistence because one or more UUID references are invalid.`,
        );
        return [];
      }

      return [
        {
          id: project.id,
          workspaceId: project.workspaceId,
          name: project.name,
          slug: project.slug,
          description: project.description,
          createdByUserId: project.createdByUserId,
          createdAt: new Date(project.createdAt),
          updatedAt: new Date(project.createdAt),
        },
      ];
    });
    const persistedProjectIds = new Set(
      projectEntities.map((project) => project.id),
    );

    await this.projectRepository!.save(projectEntities, { chunk: 1 });

    const workflowEntities = database.workflows.flatMap((workflow) => {
      const requestedProjectId = toNullableUuid(workflow.projectId);
      const project = requestedProjectId
        ? this.state.projects.get(requestedProjectId)
        : undefined;
      const projectId =
        project && persistedProjectIds.has(project.id) ? project.id : null;
      const workspaceId =
        projectId && project
          ? project.workspaceId
          : this.resolveFallbackWorkspaceId(workflow, persistedWorkspaceIds);

      if (
        !workspaceId ||
        !persistedWorkspaceIds.has(workspaceId) ||
        !isUuid(workflow.id) ||
        !persistedUserIds.has(workflow.createdByUserId)
      ) {
        this.warnOnce(
          `workflow-invalid-${workflow.id}`,
          `Skipping workflow ${workflow.id} during PostgreSQL persistence because one or more UUID references are invalid.`,
        );
        return [];
      }

      if (requestedProjectId && !project) {
        this.warnOnce(
          `workflow-missing-project-${workflow.id}`,
          `Persisting workflow ${workflow.id} without project_id because project ${requestedProjectId} does not exist in memory state.`,
        );
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
    const persistedWorkflowIds = new Set(
      workflowEntities.map((workflow) => workflow.id),
    );
    const workflowVersionEntities = database.workflowVersions.flatMap(
      (version) => {
        if (
          !isUuid(version.id) ||
          !isUuid(version.workflowId) ||
          !persistedWorkflowIds.has(version.workflowId) ||
          !persistedUserIds.has(version.createdByUserId)
        ) {
          this.warnOnce(
            `workflow-version-invalid-${version.id}`,
            `Skipping workflow version ${version.id} during PostgreSQL persistence because one or more FK references are invalid.`,
          );
          return [];
        }

        const projectId = toNullableUuid(version.projectId);
        const persistedProjectId =
          projectId && persistedProjectIds.has(projectId) ? projectId : null;

        return [
          {
            id: version.id,
            workflowId: version.workflowId,
            projectId: persistedProjectId,
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
      },
    );
    const persistedWorkflowVersionIds = new Set(
      workflowVersionEntities.map((version) => version.id),
    );

    await this.workflowVersionRepository!.save(workflowVersionEntities, {
      chunk: 1,
    });
    const workflowExecutionEntities = database.workflowExecutions.flatMap(
      (execution) => {
        if (
          !isUuid(execution.id) ||
          !persistedProjectIds.has(execution.projectId) ||
          !persistedWorkflowIds.has(execution.workflowId) ||
          !persistedWorkflowVersionIds.has(execution.workflowVersionId)
        ) {
          this.warnOnce(
            `workflow-execution-invalid-${execution.id}`,
            `Skipping workflow execution ${execution.id} during PostgreSQL persistence because one or more FK references are invalid.`,
          );
          return [];
        }

        return [
          {
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
            startedAt: execution.startedAt
              ? new Date(execution.startedAt)
              : null,
            completedAt: execution.completedAt
              ? new Date(execution.completedAt)
              : null,
            updatedAt: new Date(execution.updatedAt),
          },
        ];
      },
    );
    const persistedWorkflowExecutionIds = new Set(
      workflowExecutionEntities.map((execution) => execution.id),
    );

    await this.workflowExecutionRepository!.save(workflowExecutionEntities, {
      chunk: 1,
    });
    const workflowExecutionStepEntities =
      database.workflowExecutionSteps.flatMap((step) => {
        if (
          !persistedWorkflowExecutionIds.has(step.executionId) ||
          !persistedWorkflowVersionIds.has(step.workflowVersionId)
        ) {
          this.warnOnce(
            `workflow-execution-step-invalid-${step.id}`,
            `Skipping workflow execution step ${step.id} during PostgreSQL persistence because one or more FK references are invalid.`,
          );
          return [];
        }

        return [
          {
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
          },
        ];
      });
    const persistedWorkflowExecutionStepIds = new Set(
      workflowExecutionStepEntities.map((step) => step.id),
    );

    await this.workflowExecutionStepRepository!.save(
      workflowExecutionStepEntities,
      { chunk: 1 },
    );
    await this.workflowExecutionLogRepository!.save(
      database.workflowExecutionLogs.flatMap((log) => {
        if (!persistedWorkflowExecutionIds.has(log.executionId)) {
          this.warnOnce(
            `workflow-execution-log-invalid-${log.id}`,
            `Skipping workflow execution log ${log.id} during PostgreSQL persistence because execution ${log.executionId} was not persisted.`,
          );
          return [];
        }

        return [
          {
            id: log.id,
            executionId: log.executionId,
            stepId:
              log.stepId && persistedWorkflowExecutionStepIds.has(log.stepId)
                ? log.stepId
                : null,
            traceId: log.traceId,
            level: log.level,
            message: log.message,
            metadata: log.metadata,
            createdAt: new Date(log.createdAt),
          },
        ];
      }),
      { chunk: 1 },
    );
    await this.generatedArtifactRepository!.save(
      database.generatedArtifacts.flatMap((artifact) => {
        const projectId = this.resolveGeneratedArtifactProjectId(
          artifact,
          persistedProjectIds,
        );

        if (
          !projectId ||
          !isUuid(artifact.workflowId) ||
          !persistedWorkflowIds.has(artifact.workflowId) ||
          !persistedWorkflowVersionIds.has(artifact.workflowVersionId)
        ) {
          this.warnOnce(
            `generated-artifact-invalid-${artifact.id}`,
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
      database.auditLogs.flatMap((log) => {
        if (!isUuid(log.id) || !persistedUserIds.has(log.actorUserId)) {
          this.warnOnce(
            `audit-log-invalid-${log.id}`,
            `Skipping audit log ${log.id} during PostgreSQL persistence because one or more FK references are invalid.`,
          );
          return [];
        }

        const workspaceId =
          log.workspaceId && persistedWorkspaceIds.has(log.workspaceId)
            ? log.workspaceId
            : null;
        const workflowId =
          log.targetType === 'workflow' &&
          persistedWorkflowIds.has(log.targetId)
            ? log.targetId
            : null;

        if (log.workspaceId && !workspaceId) {
          this.warnOnce(
            `audit-log-missing-workspace-${log.id}`,
            `Persisting audit log ${log.id} without workspace_id because workspace ${log.workspaceId} was not persisted.`,
          );
        }

        return [
          {
            id: log.id,
            userId: log.actorUserId,
            workspaceId,
            workflowId,
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            metadataJson: log.metadata,
            createdAt: new Date(log.createdAt),
          },
        ];
      }),
      { chunk: 1 },
    );
  }

  private resolveFallbackWorkspaceId(
    workflow: Workflow,
    persistedWorkspaceIds: Set<string>,
  ): string | null {
    if (
      isUuid(workflow.projectId) &&
      persistedWorkspaceIds.has(workflow.projectId)
    ) {
      return workflow.projectId;
    }

    const ownerMembership = this.state.members.find(
      (member) =>
        member.userId === workflow.createdByUserId &&
        persistedWorkspaceIds.has(member.workspaceId),
    );
    const firstWorkspaceId = Array.from(persistedWorkspaceIds)[0];

    return ownerMembership?.workspaceId ?? firstWorkspaceId ?? null;
  }

  private resolveGeneratedArtifactProjectId(
    artifact: GeneratedArtifact,
    persistedProjectIds: Set<string>,
  ): string | null {
    if (
      isUuid(artifact.projectId) &&
      persistedProjectIds.has(artifact.projectId)
    ) {
      return artifact.projectId;
    }

    const workflow = this.state.workflows.get(artifact.workflowId);
    if (!workflow) {
      return null;
    }

    const projectId = toNullableUuid(workflow.projectId);

    return projectId && persistedProjectIds.has(projectId) ? projectId : null;
  }

  private warnOnce(key: string, message: string): void {
    if (this.warningKeys.has(key)) {
      return;
    }

    this.warningKeys.add(key);
    this.logger.warn(message);
  }
}
