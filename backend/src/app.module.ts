import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuditController } from './audit/audit.controller';
import { AuditService } from './audit/audit.service';
import { AuthController } from './auth/auth.controller';
import { AuthService } from './auth/auth.service';
import { ProjectsController } from './projects/projects.controller';
import { ProjectsService } from './projects/projects.service';
import { WorkspacesController } from './workspaces/workspaces.controller';
import { WorkspacesService } from './workspaces/workspaces.service';
import { InMemoryStoreService } from './identity/in-memory-store.service';

@Module({
  imports: [],
  controllers: [
    AppController,
    AuditController,
    AuthController,
    ProjectsController,
    WorkspacesController,
  ],
  providers: [
    AuditService,
    AuthService,
    InMemoryStoreService,
    ProjectsService,
    WorkspacesService,
  ],
})
export class AppModule {}
