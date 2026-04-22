import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AuditController } from './audit/audit.controller';
import { AuthController } from './auth/auth.controller';
import { ProjectsController } from './projects/projects.controller';
import { WorkspacesController } from './workspaces/workspaces.controller';
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
  providers: [InMemoryStoreService],
})
export class AppModule {}
