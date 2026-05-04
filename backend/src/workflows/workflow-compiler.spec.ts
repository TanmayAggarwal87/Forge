import type { NodeDefinition, WorkflowGraph } from '../identity/identity.types';
import { compileWorkflowGraph } from './workflow-compiler';
import { nodeRegistryByType } from './node-registry';

describe('compileWorkflowGraph', () => {
  it('compiles a publishable workflow into deterministic IR', () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger.http',
          label: 'HTTP Trigger',
          position: { x: 0, y: 0 },
          config: {
            method: 'POST',
            path: '/approvals',
          },
        },
        {
          id: 'transform-1',
          type: 'logic.transform',
          label: 'Normalize Payload',
          position: { x: 180, y: 0 },
          config: {
            template: {
              status: 'received',
            },
          },
        },
        {
          id: 'response-1',
          type: 'utility.response_builder',
          label: 'Build Response',
          position: { x: 360, y: 0 },
          config: {
            statusCode: 202,
          },
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'trigger-1',
          targetNodeId: 'transform-1',
          label: null,
        },
        {
          id: 'edge-2',
          sourceNodeId: 'transform-1',
          targetNodeId: 'response-1',
          label: null,
        },
      ],
    };

    const result = compileWorkflowGraph(graph, nodeRegistryByType);

    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.ir).toMatchSnapshot();
  });

  it('returns actionable hard errors for non-publishable graphs', () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger.http',
          label: 'HTTP Trigger',
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'transform-1',
          type: 'logic.transform',
          label: 'Normalize Payload',
          position: { x: 180, y: 0 },
          config: {},
        },
        {
          id: 'orphan-1',
          type: 'utility.response_builder',
          label: 'Orphan Response',
          position: { x: 360, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'trigger-1',
          targetNodeId: 'transform-1',
          label: null,
        },
      ],
    };

    const result = compileWorkflowGraph(graph, nodeRegistryByType);

    expect(result.isValid).toBe(false);
    expect(result.ir).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'node.orphaned',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'schema.required',
          field: 'graph.nodes.0.config.method',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'schema.required',
          field: 'graph.nodes.0.config.path',
          severity: 'error',
        }),
      ]),
    );
  });

  it('detects cycles before IR generation', () => {
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: 'trigger-1',
          type: 'trigger.http',
          label: 'HTTP Trigger',
          position: { x: 0, y: 0 },
          config: {
            method: 'POST',
            path: '/loop',
          },
        },
        {
          id: 'transform-1',
          type: 'logic.transform',
          label: 'Transform',
          position: { x: 180, y: 0 },
          config: {},
        },
        {
          id: 'response-1',
          type: 'utility.response_builder',
          label: 'Response',
          position: { x: 360, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'trigger-1',
          targetNodeId: 'transform-1',
          label: null,
        },
        {
          id: 'edge-2',
          sourceNodeId: 'transform-1',
          targetNodeId: 'response-1',
          label: null,
        },
        {
          id: 'edge-3',
          sourceNodeId: 'response-1',
          targetNodeId: 'transform-1',
          label: null,
        },
      ],
    };

    const result = compileWorkflowGraph(graph, nodeRegistryByType);

    expect(result.isValid).toBe(false);
    expect(result.ir).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'graph.cycle',
          severity: 'error',
        }),
      ]),
    );
  });

  it('validates required upstream schema properties', () => {
    const sourceDefinition: NodeDefinition = {
      type: 'trigger.custom',
      version: 1,
      title: 'Custom Trigger',
      description: 'Starts a test workflow.',
      category: 'trigger',
      capabilityTags: ['trigger'],
      executionMode: 'sync',
      retryable: false,
      defaultTimeoutMs: 1000,
      inputSchema: { type: 'object', additionalProperties: true },
      outputSchema: {
        type: 'object',
        properties: {
          accountId: { type: 'string' },
        },
        additionalProperties: false,
      },
      configSchema: { type: 'object', additionalProperties: false },
    };
    const targetDefinition: NodeDefinition = {
      type: 'data.requires_user',
      version: 1,
      title: 'Requires User',
      description: 'Requires a user id from upstream.',
      category: 'data',
      capabilityTags: ['database'],
      executionMode: 'sync',
      retryable: false,
      defaultTimeoutMs: 1000,
      inputSchema: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' },
        },
        additionalProperties: false,
      },
      outputSchema: { type: 'object', additionalProperties: true },
      configSchema: { type: 'object', additionalProperties: false },
    };
    const registryByType = new Map([
      [sourceDefinition.type, sourceDefinition],
      [targetDefinition.type, targetDefinition],
    ]);
    const graph: WorkflowGraph = {
      nodes: [
        {
          id: 'trigger-1',
          type: sourceDefinition.type,
          label: sourceDefinition.title,
          position: { x: 0, y: 0 },
          config: {},
        },
        {
          id: 'requires-user-1',
          type: targetDefinition.type,
          label: targetDefinition.title,
          position: { x: 180, y: 0 },
          config: {},
        },
      ],
      edges: [
        {
          id: 'edge-1',
          sourceNodeId: 'trigger-1',
          targetNodeId: 'requires-user-1',
          label: null,
        },
      ],
    };

    const result = compileWorkflowGraph(graph, registryByType);

    expect(result.isValid).toBe(false);
    expect(result.ir).toBeNull();
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'schema.missing_input',
          field: 'graph.nodes.1',
          severity: 'error',
        }),
      ]),
    );
  });
});
