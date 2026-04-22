import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/request-context';
import { AuthGuard } from '../auth/auth.guard';
import { AuditService } from './audit.service';

@Controller('audit-logs')
@UseGuards(AuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  listAuditLogs(
    @Req() request: AuthenticatedRequest,
    @Query('workspaceId') workspaceId: unknown,
  ) {
    return this.auditService.listAuditLogs(workspaceId, request.user.id);
  }
}
