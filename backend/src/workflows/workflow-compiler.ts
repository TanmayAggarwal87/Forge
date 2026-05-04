import { createHash } from 'crypto';
import type {
  NodeDefinition,
  WorkflowCompilationResult,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowIntermediateRepresentation,
  WorkflowIrNode,
  WorkflowNode,
  WorkflowValidationIssue,
} from '../identity/identity.types';

type GraphIndexes = {
  nodeById: Map<string, WorkflowNode>;
  nodeIndexById: Map<string, number>;
  definitionByNodeId: Map<string, NodeDefinition>;
  incomingByNodeId: Map<string, WorkflowEdge[]>;
  outgoingByNodeId: Map<string, WorkflowEdge[]>;
  triggerNodeIds: string[];
};

function issue(
  severity: 'error' | 'warning',
  code: string,
  message: string,
  field: string | null,
): WorkflowValidationIssue {
  return { severity, code, message, field };
}

export function compileWorkflowGraph(
  graph: WorkflowGraph,
  registryByType: Map<string, NodeDefinition>,
): WorkflowCompilationResult {
  const issues: WorkflowValidationIssue[] = [];
  const indexes = buildGraphIndexes(graph, registryByType, issues);

  validatePublishableShape(graph, indexes, issues);
  validateNodeConfigs(graph, indexes.definitionByNodeId, issues);

  if (hasErrors(issues)) {
    return {
      isValid: false,
      issues,
      ir: null,
    };
  }

  const executionOrder = getTopologicalOrder(indexes, issues);
  validateSchemaPropagation(executionOrder, indexes, issues);
  addCompileWarnings(graph, indexes, issues);

  if (hasErrors(issues)) {
    return {
      isValid: false,
      issues,
      ir: null,
    };
  }

  const ir = buildIntermediateRepresentation(graph, indexes, executionOrder);

  return {
    isValid: true,
    issues,
    ir,
  };
}

function buildGraphIndexes(
  graph: WorkflowGraph,
  registryByType: Map<string, NodeDefinition>,
  issues: WorkflowValidationIssue[],
): GraphIndexes {
  const nodeById = new Map<string, WorkflowNode>();
  const nodeIndexById = new Map<string, number>();
  const definitionByNodeId = new Map<string, NodeDefinition>();
  const incomingByNodeId = new Map<string, WorkflowEdge[]>();
  const outgoingByNodeId = new Map<string, WorkflowEdge[]>();
  const edgeIds = new Set<string>();
  const edgePairs = new Set<string>();
  const triggerNodeIds: string[] = [];

  graph.nodes.forEach((node, index) => {
    const nodeField = `graph.nodes.${index}`;

    if (nodeById.has(node.id)) {
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

    const definition = registryByType.get(node.type);
    nodeById.set(node.id, node);
    nodeIndexById.set(node.id, index);
    incomingByNodeId.set(node.id, []);
    outgoingByNodeId.set(node.id, []);

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

    definitionByNodeId.set(node.id, definition);
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

    if (!nodeById.has(edge.sourceNodeId)) {
      issues.push(
        issue(
          'error',
          'edge.missing_source',
          `Edge source "${edge.sourceNodeId}" does not exist.`,
          `${edgeField}.sourceNodeId`,
        ),
      );
    }

    if (!nodeById.has(edge.targetNodeId)) {
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
    }
    edgePairs.add(pairKey);

    if (nodeById.has(edge.sourceNodeId) && nodeById.has(edge.targetNodeId)) {
      outgoingByNodeId.get(edge.sourceNodeId)?.push(edge);
      incomingByNodeId.get(edge.targetNodeId)?.push(edge);
    }
  });

  sortEdges(outgoingByNodeId, nodeIndexById, 'targetNodeId');
  sortEdges(incomingByNodeId, nodeIndexById, 'sourceNodeId');

  return {
    nodeById,
    nodeIndexById,
    definitionByNodeId,
    incomingByNodeId,
    outgoingByNodeId,
    triggerNodeIds,
  };
}

function validatePublishableShape(
  graph: WorkflowGraph,
  indexes: GraphIndexes,
  issues: WorkflowValidationIssue[],
): void {
  if (graph.nodes.length === 0) {
    issues.push(
      issue(
        'error',
        'graph.empty',
        'Add at least one trigger node before compiling.',
        'graph.nodes',
      ),
    );
    return;
  }

  if (indexes.triggerNodeIds.length === 0) {
    issues.push(
      issue(
        'error',
        'graph.missing_trigger',
        'Add a trigger node so the workflow has a clear entry point.',
        'graph.nodes',
      ),
    );
  }

  for (const triggerNodeId of indexes.triggerNodeIds) {
    if ((indexes.incomingByNodeId.get(triggerNodeId)?.length ?? 0) > 0) {
      issues.push(
        issue(
          'error',
          'trigger.has_incoming_edge',
          'Trigger nodes cannot have incoming edges.',
          fieldForNode(indexes, triggerNodeId),
        ),
      );
    }
  }

  const reachableNodeIds = getReachableNodeIds(indexes);
  for (const node of graph.nodes) {
    if (
      indexes.triggerNodeIds.length > 0 &&
      !reachableNodeIds.has(node.id) &&
      !indexes.triggerNodeIds.includes(node.id)
    ) {
      issues.push(
        issue(
          'error',
          'node.orphaned',
          `Node "${node.label}" is not reachable from any trigger.`,
          fieldForNode(indexes, node.id),
        ),
      );
    }
  }
}

function validateNodeConfigs(
  graph: WorkflowGraph,
  definitionByNodeId: Map<string, NodeDefinition>,
  issues: WorkflowValidationIssue[],
): void {
  graph.nodes.forEach((node, index) => {
    const definition = definitionByNodeId.get(node.id);
    if (!definition) {
      return;
    }

    validateJsonSchemaValue(
      node.config,
      definition.configSchema,
      `graph.nodes.${index}.config`,
      issues,
    );
  });
}

function validateJsonSchemaValue(
  value: unknown,
  schema: Record<string, unknown>,
  field: string,
  issues: WorkflowValidationIssue[],
): void {
  const expectedType = schema.type;

  if (
    typeof expectedType === 'string' &&
    !matchesJsonSchemaType(value, expectedType)
  ) {
    issues.push(
      issue(
        'error',
        'schema.invalid_type',
        `${field} must be ${expectedType}.`,
        field,
      ),
    );
    return;
  }

  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  if (enumValues && !enumValues.includes(value)) {
    issues.push(
      issue(
        'error',
        'schema.invalid_enum',
        `${field} must be one of: ${enumValues.join(', ')}.`,
        field,
      ),
    );
  }

  if (
    schema.type === 'object' &&
    isRecord(value) &&
    isRecord(schema.properties)
  ) {
    const requiredFields = Array.isArray(schema.required)
      ? schema.required.filter(
          (requiredField): requiredField is string =>
            typeof requiredField === 'string',
        )
      : [];

    for (const requiredField of requiredFields) {
      if (value[requiredField] === undefined) {
        issues.push(
          issue(
            'error',
            'schema.required',
            `${field}.${requiredField} is required.`,
            `${field}.${requiredField}`,
          ),
        );
      }
    }

    if (schema.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (schema.properties[key] === undefined) {
          issues.push(
            issue(
              'error',
              'schema.unknown_property',
              `${field}.${key} is not allowed for this node type.`,
              `${field}.${key}`,
            ),
          );
        }
      }
    }

    for (const [propertyName, propertySchema] of Object.entries(
      schema.properties,
    )) {
      if (value[propertyName] !== undefined && isRecord(propertySchema)) {
        validateJsonSchemaValue(
          value[propertyName],
          propertySchema,
          `${field}.${propertyName}`,
          issues,
        );
      }
    }
  }
}

function getTopologicalOrder(
  indexes: GraphIndexes,
  issues: WorkflowValidationIssue[],
): string[] {
  const indegreeByNodeId = new Map<string, number>();
  const nodeIds = Array.from(indexes.nodeById.keys());

  for (const nodeId of nodeIds) {
    indegreeByNodeId.set(
      nodeId,
      indexes.incomingByNodeId.get(nodeId)?.length ?? 0,
    );
  }

  const queue = nodeIds
    .filter((nodeId) => indegreeByNodeId.get(nodeId) === 0)
    .sort((left, right) => compareNodeOrder(indexes, left, right));
  const executionOrder: string[] = [];

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId) {
      continue;
    }

    executionOrder.push(nodeId);

    for (const edge of indexes.outgoingByNodeId.get(nodeId) ?? []) {
      const nextIndegree = (indegreeByNodeId.get(edge.targetNodeId) ?? 0) - 1;
      indegreeByNodeId.set(edge.targetNodeId, nextIndegree);

      if (nextIndegree === 0) {
        queue.push(edge.targetNodeId);
        queue.sort((left, right) => compareNodeOrder(indexes, left, right));
      }
    }
  }

  if (executionOrder.length !== nodeIds.length) {
    const cyclicNodeLabels = nodeIds
      .filter((nodeId) => !executionOrder.includes(nodeId))
      .map((nodeId) => indexes.nodeById.get(nodeId)?.label ?? nodeId)
      .sort();

    issues.push(
      issue(
        'error',
        'graph.cycle',
        `Workflow graph contains a cycle involving: ${cyclicNodeLabels.join(', ')}.`,
        'graph.edges',
      ),
    );
  }

  return executionOrder;
}

function validateSchemaPropagation(
  executionOrder: string[],
  indexes: GraphIndexes,
  issues: WorkflowValidationIssue[],
): void {
  for (const nodeId of executionOrder) {
    const definition = indexes.definitionByNodeId.get(nodeId);
    if (!definition) {
      continue;
    }

    const incomingSchemas = (indexes.incomingByNodeId.get(nodeId) ?? [])
      .map(
        (edge) =>
          indexes.definitionByNodeId.get(edge.sourceNodeId)?.outputSchema,
      )
      .filter((schema): schema is Record<string, unknown> => Boolean(schema));

    for (const requiredProperty of getSchemaRequiredProperties(
      definition.inputSchema,
    )) {
      if (
        incomingSchemas.length > 0 &&
        !incomingSchemas.every((schema) =>
          schemaMayProvideProperty(schema, requiredProperty),
        )
      ) {
        issues.push(
          issue(
            'error',
            'schema.missing_input',
            `Node "${indexes.nodeById.get(nodeId)?.label ?? nodeId}" requires input property "${requiredProperty}" that upstream nodes do not provide.`,
            fieldForNode(indexes, nodeId),
          ),
        );
      }
    }
  }
}

function addCompileWarnings(
  graph: WorkflowGraph,
  indexes: GraphIndexes,
  issues: WorkflowValidationIssue[],
): void {
  for (const node of graph.nodes) {
    const definition = indexes.definitionByNodeId.get(node.id);
    if (!definition) {
      continue;
    }

    const outgoingCount = indexes.outgoingByNodeId.get(node.id)?.length ?? 0;
    const isTerminalResponseNode = node.type === 'utility.response_builder';

    if (outgoingCount === 0 && !isTerminalResponseNode) {
      issues.push(
        issue(
          'warning',
          'node.terminal_without_response',
          `Node "${node.label}" ends execution without an explicit response builder.`,
          fieldForNode(indexes, node.id),
        ),
      );
    }

    if (definition.executionMode === 'async' && !definition.retryable) {
      issues.push(
        issue(
          'warning',
          'node.async_without_retry',
          `Node "${node.label}" runs asynchronously without retry support.`,
          fieldForNode(indexes, node.id),
        ),
      );
    }
  }
}

function buildIntermediateRepresentation(
  graph: WorkflowGraph,
  indexes: GraphIndexes,
  executionOrder: string[],
): WorkflowIntermediateRepresentation {
  const irNodes = executionOrder
    .map((nodeId): WorkflowIrNode | null => {
      const node = indexes.nodeById.get(nodeId);
      const definition = indexes.definitionByNodeId.get(nodeId);

      if (!node || !definition) {
        return null;
      }

      return {
        id: node.id,
        type: node.type,
        definitionVersion: definition.version,
        label: node.label,
        executionMode: definition.executionMode,
        retryable: definition.retryable,
        timeoutMs: definition.defaultTimeoutMs,
        dependsOn: (indexes.incomingByNodeId.get(node.id) ?? []).map(
          (edge) => edge.sourceNodeId,
        ),
        nextNodeIds: (indexes.outgoingByNodeId.get(node.id) ?? []).map(
          (edge) => edge.targetNodeId,
        ),
        inputSchema: stableClone(definition.inputSchema),
        outputSchema: stableClone(definition.outputSchema),
        config: stableClone(node.config),
      };
    })
    .filter((node): node is WorkflowIrNode => Boolean(node));

  const irEdges = graph.edges
    .slice()
    .sort((left, right) => compareEdgeByGraphOrder(indexes, left, right))
    .map((edge) => ({
      id: edge.id,
      sourceNodeId: edge.sourceNodeId,
      targetNodeId: edge.targetNodeId,
      label: edge.label,
      condition: normalizeCondition(edge.label),
    }));

  const irWithoutHash = {
    formatVersion: 1 as const,
    graphHash: '',
    triggerNodeIds: indexes.triggerNodeIds
      .slice()
      .sort((left, right) => compareNodeOrder(indexes, left, right)),
    executionOrder,
    nodes: irNodes,
    edges: irEdges,
  };

  return {
    ...irWithoutHash,
    graphHash: hashStableObject({
      triggerNodeIds: irWithoutHash.triggerNodeIds,
      executionOrder: irWithoutHash.executionOrder,
      nodes: irWithoutHash.nodes,
      edges: irWithoutHash.edges,
    }),
  };
}

function sortEdges(
  edgeMap: Map<string, WorkflowEdge[]>,
  nodeIndexById: Map<string, number>,
  compareNodeField: 'sourceNodeId' | 'targetNodeId',
): void {
  for (const edges of edgeMap.values()) {
    edges.sort((left, right) => {
      const nodeDiff =
        (nodeIndexById.get(left[compareNodeField]) ?? Number.MAX_SAFE_INTEGER) -
        (nodeIndexById.get(right[compareNodeField]) ?? Number.MAX_SAFE_INTEGER);

      return nodeDiff === 0 ? left.id.localeCompare(right.id) : nodeDiff;
    });
  }
}

function getReachableNodeIds(indexes: GraphIndexes): Set<string> {
  const reachableNodeIds = new Set<string>();
  const queue = indexes.triggerNodeIds
    .slice()
    .sort((left, right) => compareNodeOrder(indexes, left, right));

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || reachableNodeIds.has(nodeId)) {
      continue;
    }

    reachableNodeIds.add(nodeId);
    for (const edge of indexes.outgoingByNodeId.get(nodeId) ?? []) {
      if (!reachableNodeIds.has(edge.targetNodeId)) {
        queue.push(edge.targetNodeId);
      }
    }
  }

  return reachableNodeIds;
}

function getSchemaRequiredProperties(
  schema: Record<string, unknown>,
): string[] {
  return Array.isArray(schema.required)
    ? schema.required.filter(
        (property): property is string => typeof property === 'string',
      )
    : [];
}

function schemaMayProvideProperty(
  schema: Record<string, unknown>,
  propertyName: string,
): boolean {
  if (schema.additionalProperties === true) {
    return true;
  }

  if (!isRecord(schema.properties)) {
    return false;
  }

  return schema.properties[propertyName] !== undefined;
}

function fieldForNode(indexes: GraphIndexes, nodeId: string): string {
  const index = indexes.nodeIndexById.get(nodeId);
  return index === undefined ? 'graph.nodes' : `graph.nodes.${index}`;
}

function normalizeCondition(label: string | null): string | null {
  const trimmedLabel = label?.trim();
  return trimmedLabel ? trimmedLabel : null;
}

function hasErrors(issues: WorkflowValidationIssue[]): boolean {
  return issues.some((currentIssue) => currentIssue.severity === 'error');
}

function matchesJsonSchemaType(value: unknown, expectedType: string): boolean {
  switch (expectedType) {
    case 'array':
      return Array.isArray(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value);
    case 'null':
      return value === null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'object':
      return isRecord(value);
    case 'string':
      return typeof value === 'string';
    default:
      return true;
  }
}

function compareNodeOrder(
  indexes: GraphIndexes,
  leftNodeId: string,
  rightNodeId: string,
): number {
  const indexDiff =
    (indexes.nodeIndexById.get(leftNodeId) ?? Number.MAX_SAFE_INTEGER) -
    (indexes.nodeIndexById.get(rightNodeId) ?? Number.MAX_SAFE_INTEGER);

  return indexDiff === 0 ? leftNodeId.localeCompare(rightNodeId) : indexDiff;
}

function compareEdgeByGraphOrder(
  indexes: GraphIndexes,
  left: WorkflowEdge,
  right: WorkflowEdge,
): number {
  const sourceDiff = compareNodeOrder(
    indexes,
    left.sourceNodeId,
    right.sourceNodeId,
  );
  if (sourceDiff !== 0) {
    return sourceDiff;
  }

  const targetDiff = compareNodeOrder(
    indexes,
    left.targetNodeId,
    right.targetNodeId,
  );
  return targetDiff === 0 ? left.id.localeCompare(right.id) : targetDiff;
}

function stableClone<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
}

function hashStableObject(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (isRecord(value)) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
