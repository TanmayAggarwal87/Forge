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
});
