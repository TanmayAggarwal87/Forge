import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { InMemoryStoreService } from '../identity/in-memory-store.service';
import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowsService } from './workflows.service';

describe('WorkflowExecutionService', () => {
  let previousBackoffMs: string | undefined;
  let previousDatabasePath: string | undefined;
  let tempDir: string;

  beforeEach(() => {
    previousBackoffMs = process.env.FORGE_EXECUTION_BACKOFF_MS;
    previousDatabasePath = process.env.FORGE_DATABASE_PATH;
    tempDir = mkdtempSync(join(tmpdir(), 'forge-executions-'));
    process.env.FORGE_EXECUTION_BACKOFF_MS = '1';
    process.env.FORGE_DATABASE_PATH = join(tempDir, 'forge-database.json');
  });

  afterEach(() => {
    restoreEnv('FORGE_EXECUTION_BACKOFF_MS', previousBackoffMs);
    restoreEnv('FORGE_DATABASE_PATH', previousDatabasePath);
    rmSync(tempDir, { force: true, recursive: true });
  });

  it('executes a published sync workflow and persists traceable step logs', async () => {
    const { executionService, projectId, userId, workflowId } =
      createPublishedWorkflow({
        nodes: [
          httpTriggerNode(),
          {
            id: 'transform-1',
            type: 'logic.transform',
            label: 'Normalize Payload',
            position: { x: 180, y: 0 },
            config: {
              template: {
                customer: '$input.request.body.customer',
                token: '$input.request.headers.authorization',
              },
            },
          },
          responseNode(201),
        ],
        edges: [
          edge('edge-1', 'trigger-1', 'transform-1'),
          edge('edge-2', 'transform-1', 'response-1'),
        ],
      });

    const result = await executionService.executePublishedWorkflow(
      projectId,
      workflowId,
      userId,
      {
        triggerType: 'http',
        idempotencyKey: 'event-1',
        input: {
          request: {
            body: { customer: 'Ada' },
            headers: { authorization: 'Bearer private-token' },
          },
        },
      },
    );

    expect(result.mode).toBe('sync');
    expect(result.execution.status).toBe('succeeded');
    expect(result.execution.traceId).toEqual(expect.any(String));
    expect(result.execution.output).toEqual({
      statusCode: 201,
      body: {
        customer: 'Ada',
        token: '[Redacted]',
      },
    });

    const replay = await executionService.executePublishedWorkflow(
      projectId,
      workflowId,
      userId,
      {
        triggerType: 'http',
        idempotencyKey: 'event-1',
        input: {
          request: {
            body: { customer: 'Grace' },
          },
        },
      },
    );
    expect(replay.execution.id).toBe(result.execution.id);
    expect(replay.idempotentReplay).toBe(true);

    const detailed = executionService.getExecution(
      projectId,
      workflowId,
      result.execution.id,
      userId,
    );

    expect(detailed.execution.steps).toHaveLength(3);
    expect(detailed.execution.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'transform-1',
          status: 'succeeded',
          output: {
            customer: 'Ada',
            token: '[Redacted]',
          },
        }),
      ]),
    );
    expect(detailed.execution.logs.length).toBeGreaterThanOrEqual(4);
    expect(
      detailed.execution.logs.every(
        (log) => log.traceId === result.execution.traceId,
      ),
    ).toBe(true);
  });

  it('runs async nodes through retries and dead-letters unrecoverable attempts', async () => {
    const { executionService, projectId, userId, workflowId } =
      createPublishedWorkflow({
        nodes: [
          httpTriggerNode(),
          {
            id: 'rest-1',
            type: 'integration.rest_request',
            label: 'Call Partner',
            position: { x: 180, y: 0 },
            config: {
              method: 'POST',
              url: 'http://partner.example.test/insecure',
            },
          },
          responseNode(200),
        ],
        edges: [
          edge('edge-1', 'trigger-1', 'rest-1'),
          edge('edge-2', 'rest-1', 'response-1'),
        ],
      });

    const accepted = await executionService.executePublishedWorkflow(
      projectId,
      workflowId,
      userId,
      {
        triggerType: 'http',
        input: { request: { body: { event: 'created' } } },
      },
    );

    expect(accepted.mode).toBe('async');
    expect(['queued', 'running', 'dead_lettered']).toContain(
      accepted.execution.status,
    );

    const settled = await executionService.waitForExecutionToSettle(
      accepted.execution.id,
      1000,
    );
    expect(settled.status).toBe('dead_lettered');
    expect(settled.error).toEqual(
      expect.objectContaining({
        code: 'integration.insecure_url',
        retryable: true,
      }),
    );

    const detailed = executionService.getExecution(
      projectId,
      workflowId,
      accepted.execution.id,
      userId,
    );
    expect(detailed.execution.steps).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'rest-1',
          attempt: 3,
          status: 'failed',
        }),
      ]),
    );
    expect(detailed.execution.logs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          level: 'error',
          message: 'Workflow execution failed.',
        }),
      ]),
    );
  });
});

function createPublishedWorkflow(graph: {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
    position: { x: number; y: number };
    config: Record<string, unknown>;
  }>;
  edges: Array<{
    id: string;
    sourceNodeId: string;
    targetNodeId: string;
    label: string | null;
  }>;
}) {
  const store = new InMemoryStoreService();
  const workflowsService = new WorkflowsService(store);
  const executionService = new WorkflowExecutionService(store);
  const registration = store.register(
    'runtime@example.com',
    'password123',
    'Runtime Tester',
  );
  const workspace = store.createWorkspace({
    actorUserId: registration.user.id,
    name: 'Runtime Workspace',
  });
  const project = store.createProject({
    actorUserId: registration.user.id,
    workspaceId: workspace.id,
    name: 'Runtime Project',
    description: null,
  });
  const created = workflowsService.createWorkflow(
    project.id,
    registration.user.id,
    {
      name: 'Runtime workflow',
      graph,
    },
  );

  workflowsService.publishDraft(
    project.id,
    created.workflow.id,
    registration.user.id,
  );

  return {
    executionService,
    projectId: project.id,
    userId: registration.user.id,
    workflowId: created.workflow.id,
  };
}

function httpTriggerNode() {
  return {
    id: 'trigger-1',
    type: 'trigger.http',
    label: 'HTTP Trigger',
    position: { x: 0, y: 0 },
    config: {
      method: 'POST',
      path: '/events',
    },
  };
}

function responseNode(statusCode: number) {
  return {
    id: 'response-1',
    type: 'utility.response_builder',
    label: 'Build Response',
    position: { x: 360, y: 0 },
    config: {
      statusCode,
    },
  };
}

function edge(id: string, sourceNodeId: string, targetNodeId: string) {
  return {
    id,
    sourceNodeId,
    targetNodeId,
    label: null,
  };
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
