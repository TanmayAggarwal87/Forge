import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { AuditLog } from '../identity.types';
import { ForgeMemoryState } from './forge-memory-state.service';

@Injectable()
export class AuditLogStore {
  constructor(private readonly state: ForgeMemoryState) {}

  recordAudit(input: Omit<AuditLog, 'id' | 'createdAt'>): void {
    this.state.auditLogs.push({
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      ...input,
    });
  }

  listAuditLogs(workspaceId: string, userId: string): AuditLog[] {
    const workspace = this.state.workspaces.get(workspaceId);
    const member = this.state.members.find(
      (workspaceMember) =>
        workspaceMember.workspaceId === workspaceId &&
        workspaceMember.userId === userId,
    );

    if (!workspace || !member) {
      throw new NotFoundException('Workspace was not found.');
    }

    return this.state.auditLogs
      .filter((log) => log.workspaceId === workspaceId)
      .slice()
      .reverse();
  }
}
