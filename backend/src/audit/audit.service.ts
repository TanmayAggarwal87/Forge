import { Injectable } from '@nestjs/common';
import { requireString } from '../common/validation';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Injectable()
export class AuditService {
  constructor(private readonly store: InMemoryStoreService) {}

  listAuditLogs(workspaceId: unknown, userId: string) {
    const resolvedWorkspaceId = requireString(workspaceId, 'workspaceId');

    return {
      auditLogs: this.store.listAuditLogs(resolvedWorkspaceId, userId),
    };
  }
}
