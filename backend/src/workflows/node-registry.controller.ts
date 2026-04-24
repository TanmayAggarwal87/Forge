import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WorkflowsService } from './workflows.service';

@Controller('node-definitions')
@UseGuards(AuthGuard)
export class NodeRegistryController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Get()
  listNodeDefinitions() {
    return this.workflowsService.listNodeDefinitions();
  }
}
