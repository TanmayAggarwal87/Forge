import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import type { Session, SessionUser, User } from '../identity.types';
import { AuditLogStore } from './audit-log.store';
import { ForgeMemoryState } from './forge-memory-state.service';
import { hashPassword, isPasswordValid } from './utils/password.util';

@Injectable()
export class AuthStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly auditLogStore: AuditLogStore,
  ) {}

  register(
    email: string,
    password: string,
    name: string,
  ): { token: string; user: SessionUser } {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUserId = this.state.usersByEmail.get(normalizedEmail);

    if (existingUserId !== undefined) {
      throw new ConflictException('A user with this email already exists.');
    }

    const user = this.createUser(normalizedEmail, password, name);
    this.auditLogStore.recordAudit({
      actorUserId: user.id,
      workspaceId: null,
      action: 'auth.register',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    });

    return this.createSession(user);
  }

  login(email: string, password: string): { token: string; user: SessionUser } {
    const normalizedEmail = email.trim().toLowerCase();
    const existingUserId = this.state.usersByEmail.get(normalizedEmail);
    const user =
      existingUserId === undefined
        ? undefined
        : this.state.users.get(existingUserId);

    if (!user || !isPasswordValid(user, password)) {
      throw new UnauthorizedException('Email or password is incorrect.');
    }

    return this.createSession(user);
  }

  getSession(token: string): { session: Session; user: SessionUser } {
    const session = this.state.sessions.get(token);
    if (!session || new Date(session.expiresAt).getTime() <= Date.now()) {
      if (session) {
        this.state.sessions.delete(token);
      }
      throw new UnauthorizedException('Authentication is required.');
    }

    const user = this.state.users.get(session.userId);
    if (!user) {
      this.state.sessions.delete(token);
      throw new UnauthorizedException('Authentication is required.');
    }

    return { session, user: this.toSessionUser(user) };
  }

  signOut(token: string, actorUserId: string): void {
    this.state.sessions.delete(token);
    this.auditLogStore.recordAudit({
      actorUserId,
      workspaceId: null,
      action: 'auth.sign_out',
      targetType: 'user',
      targetId: actorUserId,
      metadata: {},
    });
  }

  private createSession(user: User): { token: string; user: SessionUser } {
    const token = randomBytes(32).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 1000 * 60 * 60 * 24 * 7);

    this.state.sessions.set(token, {
      token,
      userId: user.id,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    this.auditLogStore.recordAudit({
      actorUserId: user.id,
      workspaceId: null,
      action: 'auth.sign_in',
      targetType: 'user',
      targetId: user.id,
      metadata: { email: user.email },
    });

    return { token, user: this.toSessionUser(user) };
  }

  private createUser(email: string, password: string, name?: string): User {
    const now = new Date().toISOString();
    const passwordSalt = randomBytes(16).toString('hex');
    const user: User = {
      id: randomUUID(),
      email,
      name: name?.trim() || email.split('@')[0],
      passwordHash: hashPassword(password, passwordSalt),
      passwordSalt,
      createdAt: now,
    };

    this.state.users.set(user.id, user);
    this.state.usersByEmail.set(user.email, user.id);
    return user;
  }

  private toSessionUser(user: User): SessionUser {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
    };
  }
}
