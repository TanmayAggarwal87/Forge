import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { DatabaseModule } from './database/database.module';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { WorkspacesService } from './workspaces/workspaces.service';
import { InMemoryStoreService } from './identity/in-memory-store.service';
import { NodeRegistryController } from './workflows/node-registry.controller';
import { TemplatesController } from './workflows/templates.controller';
import { WorkflowExecutionService } from './workflows/workflow-execution.service';
import { WorkflowPersistenceController } from './workflows/workflow-persistence.controller';
import { WorkflowPersistenceService } from './workflows/workflow-persistence.service';
import { WorkflowsController } from './workflows/workflows.controller';
import { WorkflowsService } from './workflows/workflows.service';

@Module({
  imports: [DatabaseModule],
  controllers: [
    AppController,
    AuditController,
    AuthController,
    NodeRegistryController,
    ProjectsController,
    TemplatesController,
    WorkflowPersistenceController,
    WorkflowsController,
    WorkspacesController,
  ],
  providers: [
    AuditService,
    AuthService,
    InMemoryStoreService,
    ProjectsService,
    WorkflowExecutionService,
    WorkflowPersistenceService,
    WorkflowsService,
    WorkspacesService,
  ],
})
export class AppModule {}
