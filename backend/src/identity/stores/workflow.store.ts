import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  Workflow,
  WorkflowGraph,
  WorkflowIntermediateRepresentation,
  WorkflowValidationResult,
  WorkflowVersion,
} from '../identity.types';
import { AuditLogStore } from './audit-log.store';
import { ForgeMemoryState } from './forge-memory-state.service';
import { ProjectStore } from './project.store';
import { slugify } from './utils/slug.util';

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

type DeactivateWorkflowInput = {
  projectId: string;
  workflowId: string;
  actorUserId: string;
};

@Injectable()
export class WorkflowStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly projectStore: ProjectStore,
    private readonly auditLogStore: AuditLogStore,
  ) {}

  createWorkflow(input: CreateWorkflowInput): Workflow & {
    draftVersion: WorkflowVersion;
  } {
    const project = this.projectStore.getProjectForUser(
      input.projectId,
      input.actorUserId,
    );
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
      slug: slugify(input.name),
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
    this.auditLogStore.recordAudit({
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

    return {
      ...workflow,
      draftVersion,
    };
  }

  listWorkflows(
    projectId: string,
    userId: string,
  ): Array<Workflow & { draftVersion: WorkflowVersion }> {
    this.projectStore.getProjectForUser(projectId, userId);

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
    this.projectStore.getProjectForUser(projectId, userId);

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
    const project = this.projectStore.getProjectForUser(
      input.projectId,
      input.actorUserId,
    );
    const nextUpdatedAt = new Date().toISOString();

    const updatedWorkflow: Workflow = {
      ...workflow,
      name: input.name ?? workflow.name,
      slug: slugify(input.name ?? workflow.name),
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
    this.auditLogStore.recordAudit({
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
    const project = this.projectStore.getProjectForUser(
      input.projectId,
      input.actorUserId,
    );
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
      graph: cloneJson(workflow.draftVersion.graph),
      validation: cloneJson(workflow.draftVersion.validation),
      compiledIr: cloneJson(input.compiledIr),
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
    this.auditLogStore.recordAudit({
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

    return {
      ...updatedWorkflow,
      publishedVersion,
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
    const project = this.projectStore.getProjectForUser(
      input.projectId,
      input.actorUserId,
    );
    const previousVersionId = workflow.publishedVersionId;
    const updatedWorkflow: Workflow = {
      ...workflow,
      status: previousVersionId ? 'inactive' : workflow.status,
      publishedVersionId: null,
      updatedAt: new Date().toISOString(),
    };

    this.state.workflows.set(updatedWorkflow.id, updatedWorkflow);
    this.auditLogStore.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: project.workspaceId,
      action: 'workflow.deactivated',
      targetType: 'workflow',
      targetId: workflow.id,
      metadata: {
        previousVersionId,
      },
    });

    return {
      ...updatedWorkflow,
      previousVersionId,
    };
  }

  getPublishedWorkflowForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): Workflow & { publishedVersion: WorkflowVersion } {
    this.projectStore.getProjectForUser(projectId, userId);

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
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
