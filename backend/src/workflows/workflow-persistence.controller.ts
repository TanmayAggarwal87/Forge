import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../common/request-context';
import type { ArtifactGenerationMode } from './workflow-code-generator';
import { WorkflowPersistenceService } from './workflow-persistence.service';

@Controller()
@UseGuards(AuthGuard)
export class WorkflowPersistenceController {
  constructor(
    private readonly persistenceService: WorkflowPersistenceService,
  ) {}

  @Get('workspaces/:workspaceId/workflows')
  listWorkspaceWorkflows(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.persistenceService.listWorkspaceWorkflows(
      workspaceId,
      request.user.id,
    );
  }

  @Post('workspaces/:workspaceId/workflows')
  createWorkspaceWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.persistenceService.createWorkspaceWorkflow(
      workspaceId,
      request.user.id,
      body,
    );
  }

  @Get('workflows/:workflowId')
  getWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
  ) {
    return this.persistenceService.getWorkflow(workflowId, request.user.id);
  }

  @Patch('workflows/:workflowId')
  updateWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.persistenceService.updateWorkflow(
      workflowId,
      request.user.id,
      body,
    );
  }

  @Delete('workflows/:workflowId')
  deleteWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
  ) {
    return this.persistenceService.deleteWorkflow(workflowId, request.user.id);
  }

  @Post('workflows/:workflowId/save')
  saveWorkflowGraph(
    @Req() request: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.persistenceService.saveWorkflowGraph(
      workflowId,
      request.user.id,
      body,
    );
  }

  @Post('workflows/:workflowId/artifacts')
  generateArtifacts(
    @Req() request: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
    @Body() body: Record<string, unknown> | undefined,
  ) {
    return this.persistenceService.generateArtifacts(
      workflowId,
      request.user.id,
      readArtifactGenerationMode(body?.mode),
    );
  }

  @Post('workflows/:workflowId/apply-template/:templateId')
  applyTemplate(
    @Req() request: AuthenticatedRequest,
    @Param('workflowId') workflowId: string,
    @Param('templateId') templateId: string,
  ) {
    return this.persistenceService.applyTemplate(
      workflowId,
      templateId,
      request.user.id,
    );
  }
}

function readArtifactGenerationMode(value: unknown): ArtifactGenerationMode {
  return value === 'workflow_definition'
    ? 'workflow_definition'
    : 'backend_module';
}
