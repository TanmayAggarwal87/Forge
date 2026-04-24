import type { WorkflowGraph } from '../identity/identity.types';
import { validateWorkflowGraph } from './graph-validation';
import { nodeRegistryByType } from './node-registry';

describe('validateWorkflowGraph', () => {
  it('flags malformed graph structures but allows drafts to remain unsaved as warnings only', () => {
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
          label: 'Transform',
          position: { x: 160, y: 0 },
          config: {},
        },
        {
          id: 'orphan-1',
          type: 'logic.transform',
          label: 'Orphan',
          position: { x: 320, y: 0 },
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
          targetNodeId: 'missing-node',
          label: null,
        },
      ],
    };

    const result = validateWorkflowGraph(graph, nodeRegistryByType);

    expect(result.isValid).toBe(false);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'edge.missing_target',
          severity: 'error',
        }),
        expect.objectContaining({
          code: 'node.unreachable',
          severity: 'warning',
        }),
      ]),
    );
  });

  it('accepts a minimal valid trigger-driven draft', () => {
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
          id: 'response-1',
          type: 'utility.response_builder',
          label: 'Build Response',
          position: { x: 160, y: 0 },
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
    };

    const result = validateWorkflowGraph(graph, nodeRegistryByType);

    expect(result.isValid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });
});
