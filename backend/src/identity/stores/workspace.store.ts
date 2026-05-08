import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  Workspace,
  WorkspaceMember,
  WorkspaceRole,
} from '../identity.types';
import { AuditLogStore } from './audit-log.store';
import { ForgeMemoryState } from './forge-memory-state.service';
import { slugify } from './utils/slug.util';

type CreateWorkspaceInput = {
  name: string;
  actorUserId: string;
};

@Injectable()
export class WorkspaceStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly auditLogStore: AuditLogStore,
  ) {}

  createWorkspace(input: CreateWorkspaceInput): Workspace {
    const workspace: Workspace = {
      id: randomUUID(),
      name: input.name,
      slug: slugify(input.name),
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
    this.auditLogStore.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: workspace.id,
      action: 'workspace.created',
      targetType: 'workspace',
      targetId: workspace.id,
      metadata: { name: workspace.name },
    });

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
      slug: slugify(patch.name ?? existing.name),
      createdByUserId: existing.createdByUserId,
      createdAt: existing.createdAt,
    };

    this.state.workspaces.set(workspaceId, updatedWorkspace);
    this.auditLogStore.recordAudit({
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

    this.auditLogStore.recordAudit({
      actorUserId: userId,
      workspaceId: null,
      action: 'workspace.deleted',
      targetType: 'workspace',
      targetId: workspaceId,
      metadata: {},
    });
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

  getMembership(
    workspaceId: string,
    userId: string,
  ): WorkspaceMember | undefined {
    return this.state.members.find(
      (member) =>
        member.workspaceId === workspaceId && member.userId === userId,
    );
  }
}
