import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { WorkflowPersistenceService } from './workflow-persistence.service';

@Controller('templates')
@UseGuards(AuthGuard)
export class TemplatesController {
  constructor(
    private readonly persistenceService: WorkflowPersistenceService,
  ) {}

  @Get()
  listTemplates() {
    return this.persistenceService.listTemplates();
  }

  @Get(':templateId')
  getTemplate(@Param('templateId') templateId: string) {
    return this.persistenceService.getTemplate(templateId);
  }
}
