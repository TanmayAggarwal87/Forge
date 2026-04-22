import { Injectable } from '@nestjs/common';
import { requireString } from '../common/validation';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Injectable()
export class WorkspacesService {
  constructor(private readonly store: InMemoryStoreService) {}

  listWorkspaces(userId: string) {
    return { workspaces: this.store.listWorkspaces(userId) };
  }

  createWorkspace(userId: string, body: Record<string, unknown>) {
    const name = requireString(body.name, 'name', 80);

    return {
      workspace: this.store.createWorkspace({
        name,
        actorUserId: userId,
      }),
    };
  }

  getWorkspace(workspaceId: string, userId: string) {
    return {
      workspace: this.store.getWorkspaceForUser(workspaceId, userId),
    };
  }

  listProjects(workspaceId: string, userId: string) {
    return {
      projects: this.store.listProjects(workspaceId, userId),
    };
  }

  createProject(
    workspaceId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    this.store.getWorkspaceForUser(workspaceId, userId);

    const name = requireString(body.name, 'name', 80);
    const description =
      body.description === undefined || body.description === null
        ? null
        : requireString(body.description, 'description', 280);

    return {
      project: this.store.createProject({
        workspaceId,
        name,
        description,
        actorUserId: userId,
      }),
    };
  }
}
