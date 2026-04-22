import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../common/request-context';
import { AuthGuard } from '../auth/auth.guard';
import { WorkspacesService } from './workspaces.service';

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Get()
  listWorkspaces(@Req() request: AuthenticatedRequest) {
    return this.workspacesService.listWorkspaces(request.user.id);
  }

  @Post()
  createWorkspace(
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspacesService.createWorkspace(request.user.id, body);
  }

  @Get(':workspaceId')
  getWorkspace(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.getWorkspace(workspaceId, request.user.id);
  }

  @Get(':workspaceId/projects')
  listProjects(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.workspacesService.listProjects(workspaceId, request.user.id);
  }

  @Post(':workspaceId/projects')
  createProject(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workspacesService.createProject(
      workspaceId,
      request.user.id,
      body,
    );
  }
}
