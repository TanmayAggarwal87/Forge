import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import type { DatabaseShape } from './database-shape.types';
import { createDatabaseShape } from './database-shape.types';
import { PostgresStatePersisterService } from './postgres-state-persister.service';
import { ForgeMemoryState } from '../forge-memory-state.service';
import type { Workflow, WorkflowVersion } from '../../identity.types';

type RepositoryHarness<T extends object> = {
  repository: Repository<T>;
  save: jest.Mock<Promise<unknown>, [unknown, unknown?]>;
};

function createRepositoryHarness<T extends object>(): RepositoryHarness<T> {
  const save = jest.fn((entities: unknown) => Promise.resolve(entities));

  return {
    repository: { save } as unknown as Repository<T>,
    save,
  };
}

describe('PostgresStatePersisterService', () => {
  it('does not persist a workflow project_id when the project is missing', async () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const workflowId = randomUUID();
    const workflowVersionId = randomUUID();
    const now = new Date().toISOString();
    const state = new ForgeMemoryState();
    const workflowRepository = createRepositoryHarness<object>();
    const workflowVersionRepository = createRepositoryHarness<object>();
    const repositories = Array.from({ length: 9 }, () =>
      createRepositoryHarness<object>(),
    );
    const service = new PostgresStatePersisterService(
      state,
      repositories[0].repository,
      repositories[1].repository,
      repositories[2].repository,
      repositories[3].repository,
      workflowRepository.repository,
      workflowVersionRepository.repository,
      repositories[4].repository,
      repositories[5].repository,
      repositories[6].repository,
      repositories[7].repository,
      repositories[8].repository,
    );
    const workflow: Workflow = {
      id: workflowId,
      projectId: workspaceId,
      name: 'Legacy workspace workflow',
      slug: 'legacy-workspace-workflow',
      description: null,
      status: 'draft',
      draftVersionId: workflowVersionId,
      publishedVersionId: null,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    };
    const version: WorkflowVersion = {
      id: workflowVersionId,
      workflowId,
      projectId: workspaceId,
      versionNumber: 1,
      status: 'draft',
      graph: { nodes: [], edges: [] },
      validation: { isValid: true, issues: [] },
      compiledIr: null,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    };

    state.users.set(userId, {
      id: userId,
      email: 'legacy@example.com',
      name: 'Legacy User',
      passwordHash: 'hash',
      passwordSalt: 'salt',
      createdAt: now,
    });
    state.workspaces.set(workspaceId, {
      id: workspaceId,
      name: 'Legacy Workspace',
      slug: 'legacy-workspace',
      createdByUserId: userId,
      createdAt: now,
    });
    state.members.push({
      workspaceId,
      userId,
      role: 'owner',
      createdAt: now,
    });
    state.workflows.set(workflow.id, workflow);
    state.workflowVersions.set(version.id, version);

    await callPersistDatabase(service, createDatabaseShape(state));

    expect(workflowRepository.save).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: workflowId,
          workspaceId,
          projectId: null,
        }),
      ],
      { chunk: 1 },
    );
    expect(workflowVersionRepository.save).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: workflowVersionId,
          workflowId,
          projectId: null,
        }),
      ],
      { chunk: 1 },
    );
  });

  it('skips workflows when their resolved workspace was not persisted', async () => {
    const userId = randomUUID();
    const workspaceId = randomUUID();
    const workflowId = randomUUID();
    const workflowVersionId = randomUUID();
    const now = new Date().toISOString();
    const state = new ForgeMemoryState();
    const workflowRepository = createRepositoryHarness<object>();
    const repositories = Array.from({ length: 10 }, () =>
      createRepositoryHarness<object>(),
    );
    const service = new PostgresStatePersisterService(
      state,
      repositories[0].repository,
      repositories[1].repository,
      repositories[2].repository,
      repositories[3].repository,
      workflowRepository.repository,
      repositories[4].repository,
      repositories[5].repository,
      repositories[6].repository,
      repositories[7].repository,
      repositories[8].repository,
      repositories[9].repository,
    );

    state.workspaces.set(workspaceId, {
      id: workspaceId,
      name: 'Orphaned Workspace',
      slug: 'orphaned-workspace',
      createdByUserId: userId,
      createdAt: now,
    });
    state.workflows.set(workflowId, {
      id: workflowId,
      projectId: workspaceId,
      name: 'Orphaned workflow',
      slug: 'orphaned-workflow',
      description: null,
      status: 'draft',
      draftVersionId: workflowVersionId,
      publishedVersionId: null,
      createdByUserId: userId,
      createdAt: now,
      updatedAt: now,
    });

    await callPersistDatabase(service, createDatabaseShape(state));

    expect(workflowRepository.save).toHaveBeenCalledWith([], { chunk: 1 });
  });

  it('nulls audit workspace and workflow references that were not persisted', async () => {
    const userId = randomUUID();
    const missingWorkspaceId = randomUUID();
    const missingWorkflowId = randomUUID();
    const auditLogId = randomUUID();
    const now = new Date().toISOString();
    const state = new ForgeMemoryState();
    const auditLogRepository = createRepositoryHarness<object>();
    const repositories = Array.from({ length: 10 }, () =>
      createRepositoryHarness<object>(),
    );
    const service = new PostgresStatePersisterService(
      state,
      repositories[0].repository,
      repositories[1].repository,
      repositories[2].repository,
      repositories[3].repository,
      repositories[4].repository,
      repositories[5].repository,
      repositories[6].repository,
      repositories[7].repository,
      repositories[8].repository,
      repositories[9].repository,
      auditLogRepository.repository,
    );

    state.users.set(userId, {
      id: userId,
      email: 'auditor@example.com',
      name: 'Auditor',
      passwordHash: 'hash',
      passwordSalt: 'salt',
      createdAt: now,
    });
    state.auditLogs.push({
      id: auditLogId,
      actorUserId: userId,
      workspaceId: missingWorkspaceId,
      action: 'workflow.created',
      targetType: 'workflow',
      targetId: missingWorkflowId,
      metadata: {},
      createdAt: now,
    });

    await callPersistDatabase(service, createDatabaseShape(state));

    expect(auditLogRepository.save).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          id: auditLogId,
          workspaceId: null,
          workflowId: null,
        }),
      ],
      { chunk: 1 },
    );
  });
});

async function callPersistDatabase(
  service: PostgresStatePersisterService,
  database: DatabaseShape,
): Promise<void> {
  await (
    service as unknown as {
      persistDatabase(database: DatabaseShape): Promise<void>;
    }
  ).persistDatabase(database);
}
