import { BadRequestException, Injectable } from '@nestjs/common';
import { requireString } from '../common/validation';
import type {
  NodeDefinition,
  Workflow,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowNode,
} from '../identity/identity.types';
import { InMemoryStoreService } from '../identity/in-memory-store.service';
import { validateWorkflowGraph } from './graph-validation';
import { nodeRegistry } from './node-registry';

type WorkflowSummary = Pick<
  Workflow,
  | 'id'
  | 'projectId'
  | 'name'
  | 'slug'
  | 'description'
  | 'status'
  | 'createdAt'
  | 'updatedAt'
>;

type WorkflowWithDraft = WorkflowSummary & {
  draftVersion: ReturnType<
    InMemoryStoreService['getWorkflowDraftForUser']
  >['draftVersion'];
};

@Injectable()
export class WorkflowsService {
  private readonly nodeRegistry = nodeRegistry;
  private readonly registryByType = new Map(
    this.nodeRegistry.map((definition) => [definition.type, definition]),
  );

  constructor(private readonly store: InMemoryStoreService) {}

  listNodeDefinitions(): { nodeDefinitions: NodeDefinition[] } {
    return { nodeDefinitions: this.nodeRegistry };
  }

  listWorkflows(projectId: string, userId: string) {
    return {
      workflows: this.store.listWorkflows(projectId, userId),
    };
  }

  createWorkflow(
    projectId: string,
    userId: string,
    body: Record<string, unknown>,
  ): { workflow: WorkflowWithDraft } {
    const name = requireString(body.name, 'name', 80);
    const description = this.parseOptionalString(
      body.description,
      'description',
      280,
    );
    const graph =
      body.graph === undefined
        ? this.createEmptyGraph()
        : this.parseGraph(body.graph);
    const validation = validateWorkflowGraph(graph, this.registryByType);

    return {
      workflow: this.store.createWorkflow({
        projectId,
        name,
        description,
        graph,
        validation,
        actorUserId: userId,
      }),
    };
  }

  getWorkflow(
    projectId: string,
    workflowId: string,
    userId: string,
  ): { workflow: WorkflowWithDraft } {
    return {
      workflow: this.store.getWorkflowDraftForUser(
        projectId,
        workflowId,
        userId,
      ),
    };
  }

  saveDraft(
    projectId: string,
    workflowId: string,
    userId: string,
    body: Record<string, unknown>,
  ): { workflow: WorkflowWithDraft } {
    const graph = this.parseGraph(body.graph);
    const validation = validateWorkflowGraph(graph, this.registryByType);

    const name =
      body.name === undefined
        ? undefined
        : requireString(body.name, 'name', 80);
    const description =
      body.description === undefined
        ? undefined
        : this.parseOptionalString(body.description, 'description', 280);

    return {
      workflow: this.store.saveWorkflowDraft({
        projectId,
        workflowId,
        actorUserId: userId,
        name,
        description,
        graph,
        validation,
      }),
    };
  }

  private createEmptyGraph(): WorkflowGraph {
    return {
      nodes: [],
      edges: [],
    };
  }

  private parseOptionalString(
    value: unknown,
    fieldName: string,
    maxLength: number,
  ): string | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (typeof value === 'string' && value.trim().length === 0) {
      return null;
    }

    return requireString(value, fieldName, maxLength);
  }

  private parseGraph(value: unknown): WorkflowGraph {
    if (!this.isRecord(value)) {
      throw new BadRequestException('graph must be an object.');
    }

    if (value.nodes !== undefined && !Array.isArray(value.nodes)) {
      throw new BadRequestException('graph.nodes must be an array.');
    }

    if (value.edges !== undefined && !Array.isArray(value.edges)) {
      throw new BadRequestException('graph.edges must be an array.');
    }

    const nodes = Array.isArray(value.nodes)
      ? value.nodes.map((node, index) => this.parseNode(node, index))
      : [];
    const edges = Array.isArray(value.edges)
      ? value.edges.map((edge, index) => this.parseEdge(edge, index))
      : [];

    return { nodes, edges };
  }

  private parseNode(value: unknown, index: number): WorkflowNode {
    if (!this.isRecord(value)) {
      throw new BadRequestException(`graph.nodes.${index} must be an object.`);
    }

    const position = this.parsePosition(value.position, index);

    return {
      id: requireString(value.id, `graph.nodes.${index}.id`, 120),
      type: requireString(value.type, `graph.nodes.${index}.type`, 120),
      label: requireString(value.label, `graph.nodes.${index}.label`, 120),
      position,
      config: this.isRecord(value.config) ? value.config : {},
    };
  }

  private parsePosition(value: unknown, index: number) {
    if (!this.isRecord(value)) {
      return { x: 0, y: index * 96 };
    }

    return {
      x: typeof value.x === 'number' ? value.x : 0,
      y: typeof value.y === 'number' ? value.y : index * 96,
    };
  }

  private parseEdge(value: unknown, index: number): WorkflowEdge {
    if (!this.isRecord(value)) {
      throw new BadRequestException(`graph.edges.${index} must be an object.`);
    }

    const rawLabel = value.label;

    return {
      id: requireString(value.id, `graph.edges.${index}.id`, 120),
      sourceNodeId: requireString(
        value.sourceNodeId,
        `graph.edges.${index}.sourceNodeId`,
        120,
      ),
      targetNodeId: requireString(
        value.targetNodeId,
        `graph.edges.${index}.targetNodeId`,
        120,
      ),
      label:
        rawLabel === null || rawLabel === undefined
          ? null
          : requireString(rawLabel, `graph.edges.${index}.label`, 120),
    };
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
}
