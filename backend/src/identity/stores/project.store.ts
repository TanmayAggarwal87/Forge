import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Project } from '../identity.types';
import { AuditLogStore } from './audit-log.store';
import { ForgeMemoryState } from './forge-memory-state.service';
import type { CreateProjectInput } from './store-input.types';
import { WorkspaceStore } from './workspace.store';
import { slugify } from './utils/slug.util';

@Injectable()
export class ProjectStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly workspaceStore: WorkspaceStore,
    private readonly auditLogStore: AuditLogStore,
  ) {}

  createProject(input: CreateProjectInput): Project {
    const project: Project = {
      id: randomUUID(),
      workspaceId: input.workspaceId,
      name: input.name,
      slug: slugify(input.name),
      description: input.description?.trim() || null,
      createdByUserId: input.actorUserId,
      createdAt: new Date().toISOString(),
    };

    this.state.projects.set(project.id, project);
    this.auditLogStore.recordAudit({
      actorUserId: input.actorUserId,
      workspaceId: input.workspaceId,
      action: 'project.created',
      targetType: 'project',
      targetId: project.id,
      metadata: { name: project.name },
    });

    return project;
  }

  listProjects(workspaceId: string, userId: string): Project[] {
    this.workspaceStore.getWorkspaceForUser(workspaceId, userId);

    return Array.from(this.state.projects.values()).filter(
      (project) => project.workspaceId === workspaceId,
    );
  }

  getProjectForUser(projectId: string, userId: string): Project {
    const project = this.state.projects.get(projectId);
    if (!project) {
      throw new NotFoundException('Project was not found.');
    }

    this.workspaceStore.getWorkspaceForUser(project.workspaceId, userId);
    return project;
  }
}
