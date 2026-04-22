import { Injectable } from '@nestjs/common';
import { InMemoryStoreService } from '../identity/in-memory-store.service';

@Injectable()
export class ProjectsService {
  constructor(private readonly store: InMemoryStoreService) {}

  getProject(projectId: string, userId: string) {
    return {
      project: this.store.getProjectForUser(projectId, userId),
    };
  }
}
