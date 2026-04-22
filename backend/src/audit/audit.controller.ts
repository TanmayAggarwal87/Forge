import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/request-context';
import { requireString } from '../common/validation';
import { AuthGuard } from '../auth/auth.guard';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Controller('audit-logs')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly store: InMemoryStoreService) {}

  @Get()
  listAuditLogs(
    @Req() request: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: unknown,
  ) {
    const resolvedWorkspaceId = requireString(workspaceId, 'workspaceId');

    return {
      auditLogs: this.store.listAuditLogs(resolvedWorkspaceId, request.user.id),
    };
  }
}
