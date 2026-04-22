import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/request-context';
import { AuthGuard } from '../auth/auth.guard';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Controller('projects')
@UseGuards(AuthGuard)
export class ProjectsController {
  constructor(private readonly store: InMemoryStoreService) {}

  @Get(':projectId')
  getProject(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return {
      project: this.store.getProjectForUser(projectId, request.user.id),
    };
  }
}
