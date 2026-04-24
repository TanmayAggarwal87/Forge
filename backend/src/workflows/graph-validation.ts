import type {
  NodeDefinition,
  WorkflowGraph,
  WorkflowValidationIssue,
  WorkflowValidationResult,
} from '../identity/identity.types';

function issue(
  severity: 'error' | 'warning',
  code: string,
  message: string,
  field: string | null,
): WorkflowValidationIssue {
  return { severity, code, message, field };
}

export function validateWorkflowGraph(
  graph: WorkflowGraph,
  registryByType: Map<string, NodeDefinition>,
): WorkflowValidationResult {
  const issues: WorkflowValidationIssue[] = [];
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const adjacency = new Map<string, string[]>();
  const incoming = new Map<string, number>();
  const triggerNodeIds: string[] = [];
  const edgePairs = new Set<string>();

  if (graph.nodes.length === 0) {
    issues.push(
      issue('warning', 'graph.empty', 'Draft has no nodes yet.', 'graph.nodes'),
    );
  }

  graph.nodes.forEach((node, index) => {
    const nodeField = `graph.nodes.${index}`;
    if (nodeIds.has(node.id)) {
      issues.push(
        issue(
          'error',
          'node.duplicate_id',
          `Node id "${node.id}" is duplicated.`,
          `${nodeField}.id`,
        ),
      );
      return;
    }

    nodeIds.add(node.id);
    adjacency.set(node.id, []);
    incoming.set(node.id, 0);

    const definition = registryByType.get(node.type);
    if (!definition) {
      issues.push(
        issue(
          'error',
          'node.unknown_type',
          `Node type "${node.type}" is not registered.`,
          `${nodeField}.type`,
        ),
      );
      return;
    }

    if (definition.category === 'trigger') {
      triggerNodeIds.push(node.id);
    }
  });

  graph.edges.forEach((edge, index) => {
    const edgeField = `graph.edges.${index}`;
    if (edgeIds.has(edge.id)) {
      issues.push(
        issue(
          'error',
          'edge.duplicate_id',
          `Edge id "${edge.id}" is duplicated.`,
          `${edgeField}.id`,
        ),
      );
      return;
    }

    edgeIds.add(edge.id);

    if (!nodeIds.has(edge.sourceNodeId)) {
      issues.push(
        issue(
          'error',
          'edge.missing_source',
          `Edge source "${edge.sourceNodeId}" does not exist.`,
          `${edgeField}.sourceNodeId`,
        ),
      );
    }

    if (!nodeIds.has(edge.targetNodeId)) {
      issues.push(
        issue(
          'error',
          'edge.missing_target',
          `Edge target "${edge.targetNodeId}" does not exist.`,
          `${edgeField}.targetNodeId`,
        ),
      );
    }

    if (edge.sourceNodeId === edge.targetNodeId) {
      issues.push(
        issue(
          'error',
          'edge.self_loop',
          'Self-referential edges are not allowed.',
          edgeField,
        ),
      );
    }

    const pairKey = `${edge.sourceNodeId}::${edge.targetNodeId}`;
    if (edgePairs.has(pairKey)) {
      issues.push(
        issue(
          'error',
          'edge.duplicate_connection',
          'Duplicate source-to-target connections are not allowed.',
          edgeField,
        ),
      );
    } else {
      edgePairs.add(pairKey);
    }

    if (nodeIds.has(edge.sourceNodeId) && nodeIds.has(edge.targetNodeId)) {
      adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId);
      incoming.set(
        edge.targetNodeId,
        (incoming.get(edge.targetNodeId) ?? 0) + 1,
      );
    }
  });

  if (graph.nodes.length > 0 && triggerNodeIds.length === 0) {
    issues.push(
      issue(
        'warning',
        'graph.missing_trigger',
        'Draft should include at least one trigger node.',
        'graph.nodes',
      ),
    );
  }

  triggerNodeIds.forEach((triggerNodeId) => {
    if ((incoming.get(triggerNodeId) ?? 0) > 0) {
      issues.push(
        issue(
          'error',
          'trigger.has_incoming_edge',
          'Trigger nodes cannot have incoming edges.',
          `graph.nodes.${triggerNodeId}`,
        ),
      );
    }
  });

  const reachableNodeIds = new Set<string>();
  const queue = [...triggerNodeIds];

  while (queue.length > 0) {
    const currentNodeId = queue.shift();
    if (!currentNodeId || reachableNodeIds.has(currentNodeId)) {
      continue;
    }

    reachableNodeIds.add(currentNodeId);
    for (const nextNodeId of adjacency.get(currentNodeId) ?? []) {
      if (!reachableNodeIds.has(nextNodeId)) {
        queue.push(nextNodeId);
      }
    }
  }

  graph.nodes.forEach((node, index) => {
    if (
      triggerNodeIds.length > 0 &&
      !reachableNodeIds.has(node.id) &&
      !triggerNodeIds.includes(node.id)
    ) {
      issues.push(
        issue(
          'warning',
          'node.unreachable',
          `Node "${node.label}" is not reachable from any trigger.`,
          `graph.nodes.${index}`,
        ),
      );
    }
  });

  return {
    isValid: issues.every((currentIssue) => currentIssue.severity !== 'error'),
    issues,
  };
}
