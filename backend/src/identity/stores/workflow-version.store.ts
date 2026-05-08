import { Injectable, NotFoundException } from '@nestjs/common';
import type { Workflow, WorkflowVersion } from '../identity.types';
import { AuditLogStore } from './audit-log.store';
import { ForgeMemoryState } from './forge-memory-state.service';
import { ProjectStore } from './project.store';
import { WorkflowStore } from './workflow.store';

type ActivateWorkflowVersionInput = {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  actorUserId: string;
  auditAction: 'workflow.version_activated' | 'workflow.rolled_back';
};

@Injectable()
export class WorkflowVersionStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly projectStore: ProjectStore,
    private readonly workflowStore: WorkflowStore,
    private readonly auditLogStore: AuditLogStore,
  ) {}

  listWorkflowVersionsForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): WorkflowVersion[] {
    const workflow = this.workflowStore.getWorkflowDraftForUser(
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
    const workflow = this.workflowStore.getWorkflowDraftForUser(
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
    const workflow = this.workflowStore.getWorkflowDraftForUser(
      input.projectId,
      input.workflowId,
      input.actorUserId,
    );
    const project = this.projectStore.getProjectForUser(
      input.projectId,
      input.actorUserId,
    );
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
    this.auditLogStore.recordAudit({
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

    return {
      ...updatedWorkflow,
      activeVersion: version,
      previousVersionId,
    };
  }

  getWorkflowVersionById(workflowVersionId: string): WorkflowVersion {
    const version = this.state.workflowVersions.get(workflowVersionId);

    if (!version) {
      throw new NotFoundException('Workflow version was not found.');
    }

    return version;
  }
}
