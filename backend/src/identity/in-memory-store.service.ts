import { randomBytes, randomUUID } from 'crypto';
import {
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

@Injectable()
export class InMemoryStoreService {
  private readonly users = new Map<string, User>();
  private readonly usersByEmail = new Map<string, string>();
  private readonly sessions = new Map<string, Session>();
  private readonly workspaces = new Map<string, Workspace>();
  private readonly members: WorkspaceMember[] = [];
  private readonly projects = new Map<string, Project>();
  private readonly auditLogs: AuditLog[] = [];

  signIn(email: string, name?: string): { token: string; user: SessionUser } {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUserId = this.usersByEmail.get(normalizedEmail);
    const user =
      existingUserId !== undefined
        ? this.users.get(existingUserId)
        : this.createUser(normalizedEmail, name);

    if (!user) {
      throw new UnauthorizedException('Unable to resolve user account.');
    }

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

    return { token, user: this.toSessionUser(user) };
  }

  getSession(token: string): { session: Session; user: SessionUser } {
    const session = this.sessions.get(token);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        this.sessions.delete(token);
      }
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = this.users.get(session.userId);
    if (!user) {
      this.sessions.delete(token);
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

  listAuditLogs(workspaceId: string, userId: string): AuditLog[] {
    this.getWorkspaceForUser(workspaceId, userId);

    return this.auditLogs
      .filter((log) => log.workspaceId === workspaceId)
      .slice()
      .reverse();
  }

  private createUser(email: string, name?: string): User {
    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email,
      name: name?.trim() || email.split('@')[0],
      createdAt: now,
    };

    this.users.set(user.id, user);
    this.usersByEmail.set(user.email, user.id);
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

  private toSessionUser(user: User): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
