export type WorkspaceRole = 'owner' | 'admin' | 'member';

export type User = {
  id: string;
  email: string;
  name: string;
  createdAt: string;
};

export type SessionUser = Pick<User, 'id' | 'email' | 'name'>;

export type Session = {
  token: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  createdByUserId: string;
  createdAt: string;
};

export type WorkspaceMember = {
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  createdAt: string;
};

export type Project = {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  description: string | null;
  createdByUserId: string;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  workspaceId: string | null;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
