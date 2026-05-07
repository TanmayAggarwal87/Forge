import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { InMemoryStoreService } from '../identity/in-memory-store.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowsService', () => {
  let previousDatabasePath: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    previousDatabasePath = process.env.FORGE_DATABASE_PATH;
    tempDir = mkdtempSync(join(tmpdir(), 'forge-workflows-'));
    process.env.FORGE_DATABASE_PATH = join(tempDir, 'forge-database.json');
  });

  afterEach(() => {
    if (previousDatabasePath === undefined) {
      delete process.env.FORGE_DATABASE_PATH;
    } else {
      process.env.FORGE_DATABASE_PATH = previousDatabasePath;
    }

    rmSync(tempDir, { force: true, recursive: true });
  });

  it('creates and saves workflow drafts for an authorized project', () => {
    const store = new InMemoryStoreService();
    const workflowsService = new WorkflowsService(store);

    const registration = store.register(
      'builder@example.com',
      'password123',
      'Builder',
    );
    const workspace = store.createWorkspace({
      actorUserId: registration.user.id,
      name: 'Platform',
    });
    const project = store.createProject({
      actorUserId: registration.user.id,
      workspaceId: workspace.id,
      name: 'API Builder',
      description: 'Workflow host',
    });

    const created = workflowsService.createWorkflow(
      project.id,
      registration.user.id,
      {
        name: 'Inbound approvals',
        description: 'Initial intake',
      },
    );

    expect(created.workflow.name).toBe('Inbound approvals');
    expect(created.workflow.draftVersion.graph.nodes).toHaveLength(0);
    expect(created.workflow.draftVersion.validation.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'graph.empty', severity: 'warning' }),
      ]),
    );

    const updated = workflowsService.saveDraft(
      project.id,
      created.workflow.id,
      registration.user.id,
      {
        name: 'Inbound approval flow',
        description: 'HTTP intake with a response node',
        graph: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger.http',
              label: 'HTTP Trigger',
              position: { x: 0, y: 0 },
              config: {},
            },
            {
              id: 'response-1',
              type: 'utility.response_builder',
              label: 'Response',
              position: { x: 180, y: 0 },
              config: {},
            },
          ],
          edges: [
            {
              id: 'edge-1',
              sourceNodeId: 'trigger-1',
              targetNodeId: 'response-1',
              label: null,
            },
          ],
        },
      },
    );

    expect(updated.workflow.name).toBe('Inbound approval flow');
    expect(updated.workflow.draftVersion.validation.isValid).toBe(true);

    const listed = workflowsService.listWorkflows(
      project.id,
      registration.user.id,
    );
    expect(listed.workflows).toHaveLength(1);
    expect(listed.workflows[0]?.name).toBe('Inbound approval flow');
  });

  it('stores generated artifacts when publishing a compiled workflow', () => {
    const store = new InMemoryStoreService();
    const workflowsService = new WorkflowsService(store);

    const registration = store.register(
      'publisher@example.com',
      'password123',
      'Publisher',
    );
    const workspace = store.createWorkspace({
      actorUserId: registration.user.id,
      name: 'Publishing',
    });
    const project = store.createProject({
      actorUserId: registration.user.id,
      workspaceId: workspace.id,
      name: 'Contracts',
      description: null,
    });
    const created = workflowsService.createWorkflow(
      project.id,
      registration.user.id,
      {
        name: 'Generated API',
        graph: {
          nodes: [
            {
              id: 'trigger-1',
              type: 'trigger.http',
              label: 'HTTP Trigger',
              position: { x: 0, y: 0 },
              config: {
                method: 'POST',
                path: '/generated-api',
              },
            },
            {
              id: 'response-1',
              type: 'utility.response_builder',
              label: 'Response',
              position: { x: 180, y: 0 },
              config: {},
            },
          ],
          edges: [
            {
              id: 'edge-1',
              sourceNodeId: 'trigger-1',
              targetNodeId: 'response-1',
              label: null,
            },
          ],
        },
      },
    );

    const published = workflowsService.publishDraft(
      project.id,
      created.workflow.id,
      registration.user.id,
    );
    const artifacts = workflowsService.listGeneratedArtifacts(
      project.id,
      created.workflow.id,
      registration.user.id,
    );

    expect(published.generatedArtifacts).toHaveLength(5);
    expect(artifacts.generatedArtifacts).toHaveLength(5);
    expect(artifacts.generatedArtifacts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          workflowVersionId: published.workflow.publishedVersion.id,
          type: 'openapi',
          name: 'openapi.json',
        }),
        expect.objectContaining({
          workflowVersionId: published.workflow.publishedVersion.id,
          type: 'sdk_stub',
          contentType: 'text/typescript',
        }),
      ]),
    );
  });

  it('lists versions, rolls back the active version, and deactivates without mutating published versions', () => {
    const store = new InMemoryStoreService();
    const workflowsService = new WorkflowsService(store);

    const registration = store.register(
      'release@example.com',
      'password123',
      'Release Manager',
    );
    const workspace = store.createWorkspace({
      actorUserId: registration.user.id,
      name: 'Release Workspace',
    });
    const project = store.createProject({
      actorUserId: registration.user.id,
      workspaceId: workspace.id,
      name: 'Release Project',
      description: null,
    });
    const created = workflowsService.createWorkflow(
      project.id,
      registration.user.id,
      {
        name: 'Release workflow',
        graph: publishableGraph('/release-v1', 201),
      },
    );
    const firstPublish = workflowsService.publishDraft(
      project.id,
      created.workflow.id,
      registration.user.id,
    );

    workflowsService.saveDraft(
      project.id,
      created.workflow.id,
      registration.user.id,
      {
        graph: publishableGraph('/release-v2', 202),
      },
    );
    const secondPublish = workflowsService.publishDraft(
      project.id,
      created.workflow.id,
      registration.user.id,
    );

    const listedAfterPublish = workflowsService.listVersions(
      project.id,
      created.workflow.id,
      registration.user.id,
    );
    expect(listedAfterPublish.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstPublish.workflow.publishedVersion.id,
          status: 'published',
          isActive: false,
        }),
        expect.objectContaining({
          id: secondPublish.workflow.publishedVersion.id,
          status: 'published',
          isActive: true,
        }),
      ]),
    );

    const rollback = workflowsService.rollbackToVersion(
      project.id,
      created.workflow.id,
      firstPublish.workflow.publishedVersion.id,
      registration.user.id,
    );
    expect(rollback.workflow.publishedVersionId).toBe(
      firstPublish.workflow.publishedVersion.id,
    );
    expect(rollback.workflow.previousVersionId).toBe(
      secondPublish.workflow.publishedVersion.id,
    );

    const listedAfterRollback = workflowsService.listVersions(
      project.id,
      created.workflow.id,
      registration.user.id,
    );
    expect(listedAfterRollback.versions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: firstPublish.workflow.publishedVersion.id,
          status: 'published',
          isActive: true,
        }),
        expect.objectContaining({
          id: secondPublish.workflow.publishedVersion.id,
          status: 'published',
          isActive: false,
        }),
      ]),
    );

    const deactivated = workflowsService.deactivateWorkflow(
      project.id,
      created.workflow.id,
      registration.user.id,
    );
    expect(deactivated.workflow.status).toBe('inactive');
    expect(deactivated.workflow.publishedVersionId).toBeNull();

    const auditLogs = store.listAuditLogs(workspace.id, registration.user.id);
    expect(auditLogs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ action: 'workflow.published' }),
        expect.objectContaining({ action: 'workflow.rolled_back' }),
        expect.objectContaining({ action: 'workflow.deactivated' }),
      ]),
    );
  });
});

function publishableGraph(path: string, statusCode: number) {
  return {
    nodes: [
      {
        id: 'trigger-1',
        type: 'trigger.http',
        label: 'HTTP Trigger',
        position: { x: 0, y: 0 },
        config: {
          method: 'POST',
          path,
        },
      },
      {
        id: 'response-1',
        type: 'utility.response_builder',
        label: 'Response',
        position: { x: 180, y: 0 },
        config: {
          statusCode,
        },
      },
    ],
    edges: [
      {
        id: 'edge-1',
        sourceNodeId: 'trigger-1',
        targetNodeId: 'response-1',
        label: null,
      },
    ],
  };
}
