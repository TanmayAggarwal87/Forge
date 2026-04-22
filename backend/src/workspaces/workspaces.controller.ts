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
import { requireString } from '../common/validation';
import { AuthGuard } from '../auth/auth.guard';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Controller('workspaces')
@UseGuards(AuthGuard)
export class WorkspacesController {
  constructor(private readonly store: InMemoryStoreService) {}

  @Get()
  listWorkspaces(@Req() request: AuthenticatedRequest) {
    return { workspaces: this.store.listWorkspaces(request.user.id) };
  }

  @Post()
  createWorkspace(
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ) {
    const name = requireString(body.name, 'name', 80);
    return {
      workspace: this.store.createWorkspace({
        name,
        actorUserId: request.user.id,
      }),
    };
  }

  @Get(':workspaceId')
  getWorkspace(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      workspace: this.store.getWorkspaceForUser(workspaceId, request.user.id),
    };
  }

  @Get(':workspaceId/projects')
  listProjects(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      projects: this.store.listProjects(workspaceId, request.user.id),
    };
  }

  @Post(':workspaceId/projects')
  createProject(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
  ) {
    this.store.getWorkspaceForUser(workspaceId, request.user.id);

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
        actorUserId: request.user.id,
      }),
    };
  }
}
