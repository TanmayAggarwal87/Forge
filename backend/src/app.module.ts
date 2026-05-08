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
import { AuditLogStore } from './identity/stores/audit-log.store';
import { AuthStore } from './identity/stores/auth.store';
import { ForgeMemoryState } from './identity/stores/forge-memory-state.service';
import { GeneratedArtifactStore } from './identity/stores/generated-artifact.store';
import { ProjectStore } from './identity/stores/project.store';
import { WorkflowExecutionStore } from './identity/stores/workflow-execution.store';
import { WorkflowStore } from './identity/stores/workflow.store';
import { WorkflowVersionStore } from './identity/stores/workflow-version.store';
import { WorkspaceStore } from './identity/stores/workspace.store';
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
    AuditLogStore,
    AuthService,
    AuthStore,
    ForgeMemoryState,
    GeneratedArtifactStore,
    InMemoryStoreService,
    ProjectStore,
    ProjectsService,
    WorkflowExecutionService,
    WorkflowPersistenceService,
    WorkflowStore,
    WorkflowVersionStore,
    WorkflowsService,
    WorkflowExecutionStore,
    WorkspacesService,
    WorkspaceStore,
  ],
})
export class AppModule {}
