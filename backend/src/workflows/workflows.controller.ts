import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import type { AuthenticatedRequest } from '../common/request-context';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowsService } from './workflows.service';

@Controller('projects/:projectId/workflows')
@UseGuards(AuthGuard)
export class WorkflowsController {
  constructor(
    private readonly workflowsService: WorkflowsService,
    private readonly executionService: WorkflowExecutionService,
  ) {}

  @Get()
  listWorkflows(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
  ) {
    return this.workflowsService.listWorkflows(projectId, request.user.id);
  }

  @Post()
  createWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workflowsService.createWorkflow(
      projectId,
      request.user.id,
      body,
    );
  }

  @Get(':workflowId')
  getWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.getWorkflow(
      projectId,
      workflowId,
      request.user.id,
    );
  }

  @Post(':workflowId/compile')
  compileDraft(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.compileDraft(
      projectId,
      workflowId,
      request.user.id,
    );
  }

  @Post(':workflowId/publish')
  publishDraft(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.workflowsService.publishDraft(
      projectId,
      workflowId,
      request.user.id,
    );
  }

  @Post(':workflowId/executions')
  executeWorkflow(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.executionService.executePublishedWorkflow(
      projectId,
      workflowId,
      request.user.id,
      body,
    );
  }

  @Get(':workflowId/executions')
  listExecutions(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
  ) {
    return this.executionService.listExecutions(
      projectId,
      workflowId,
      request.user.id,
    );
  }

  @Get(':workflowId/executions/:executionId')
  getExecution(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Param('executionId') executionId: string,
  ) {
    return this.executionService.getExecution(
      projectId,
      workflowId,
      executionId,
      request.user.id,
    );
  }

  @Put(':workflowId/draft')
  saveDraft(
    @Req() request: AuthenticatedRequest,
    @Param('projectId') projectId: string,
    @Param('workflowId') workflowId: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.workflowsService.saveDraft(
      projectId,
      workflowId,
      request.user.id,
      body,
    );
  }
}
