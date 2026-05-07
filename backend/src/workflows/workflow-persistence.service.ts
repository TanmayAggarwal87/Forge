import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import {
  AuditLogEntity,
  GeneratedArtifactEntity,
  WorkflowEntity,
  WorkflowTemplateEntity,
  WorkflowVersionEntity,
  WorkspaceEntity,
} from '../database/entities';
import { requireString } from '../common/validation';
import { systemWorkflowTemplates } from '../database/seeds/system-workflow-templates';

type JsonRecord = Record<string, unknown>;

type WorkflowGraphPayload = {
  nodes: JsonRecord[];
  edges: JsonRecord[];
  viewport: JsonRecord | null;
};

@Injectable()
export class WorkflowPersistenceService {
  constructor(
    @Optional()
    @InjectRepository(WorkflowEntity)
    private readonly workflowRepository?: Repository<WorkflowEntity>,
    @Optional()
    @InjectRepository(WorkflowVersionEntity)
    private readonly workflowVersionRepository?: Repository<WorkflowVersionEntity>,
    @Optional()
    @InjectRepository(WorkflowTemplateEntity)
    private readonly templateRepository?: Repository<WorkflowTemplateEntity>,
    @Optional()
    @InjectRepository(WorkspaceEntity)
    private readonly workspaceRepository?: Repository<WorkspaceEntity>,
    @Optional()
    @InjectRepository(AuditLogEntity)
    private readonly auditLogRepository?: Repository<AuditLogEntity>,
    @Optional()
    @InjectRepository(GeneratedArtifactEntity)
    private readonly generatedArtifactRepository?: Repository<GeneratedArtifactEntity>,
  ) {}

  async listWorkspaceWorkflows(workspaceId: string, userId: string) {
    const workspace = await this.getWorkspaceForUser(workspaceId, userId);
    const workflows = await this.requireWorkflowRepository().find({
      where: { workspaceId: workspace.id },
      order: { updatedAt: 'DESC' },
    });

    return { workflows };
  }

  async createWorkspaceWorkflow(
    workspaceId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const workspace = await this.getWorkspaceForUser(workspaceId, userId);
    const name = requireString(body.name, 'name', 120);
    const description =
      body.description === undefined || body.description === null
        ? null
        : requireString(body.description, 'description', 500);
    const workflow: WorkflowEntity =
      await this.requireWorkflowRepository().save({
        workspaceId: workspace.id,
        projectId: null,
        name,
        slug: this.slugify(name),
        description,
        status: 'draft',
        draftVersionId: null,
        publishedVersionId: null,
        createdByUserId: userId,
      });

    const version = await this.createWorkflowVersion(workflow, userId, {
      nodes: [],
      edges: [],
      viewport: null,
    });
    workflow.draftVersionId = version.id;
    await this.requireWorkflowRepository().save(workflow);
    await this.recordAudit(
      userId,
      workspace.id,
      workflow.id,
      'workflow.created',
      {
        name,
        nodeCount: 0,
        edgeCount: 0,
      },
    );

    return { workflow: { ...workflow, draftVersion: version } };
  }

  async getWorkflow(workflowId: string, userId: string) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);
    const draftVersion = workflow.draftVersionId
      ? await this.requireWorkflowVersionRepository().findOne({
          where: { id: workflow.draftVersionId },
        })
      : null;

    return { workflow: { ...workflow, draftVersion } };
  }

  async updateWorkflow(
    workflowId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);

    if (body.name !== undefined) {
      workflow.name = requireString(body.name, 'name', 120);
      workflow.slug = this.slugify(workflow.name);
    }

    if (body.description !== undefined) {
      workflow.description =
        body.description === null
          ? null
          : requireString(body.description, 'description', 500);
    }

    const savedWorkflow = await this.requireWorkflowRepository().save(workflow);
    await this.recordAudit(
      userId,
      savedWorkflow.workspaceId,
      savedWorkflow.id,
      'workflow.updated',
      { name: savedWorkflow.name },
    );

    return { workflow: savedWorkflow };
  }

  async deleteWorkflow(workflowId: string, userId: string) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);
    await this.requireWorkflowRepository().delete(workflow.id);
    await this.recordAudit(
      userId,
      workflow.workspaceId,
      workflow.id,
      'workflow.deleted',
      { name: workflow.name },
    );

    return { ok: true };
  }

  async saveWorkflowGraph(
    workflowId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);
    const graph = this.parseGraphPayload(body);
    this.validateGraph(graph);

    const version = await this.createWorkflowVersion(workflow, userId, graph);
    workflow.draftVersionId = version.id;
    await this.requireWorkflowRepository().save(workflow);
    await this.recordAudit(
      userId,
      workflow.workspaceId,
      workflow.id,
      'workflow.saved',
      {
        versionNumber: version.versionNumber,
        nodeCount: graph.nodes.length,
        edgeCount: graph.edges.length,
      },
    );

    return {
      version,
      graph,
    };
  }

  async applyTemplate(workflowId: string, templateId: string, userId: string) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);
    const template = await this.getTemplateRecord(templateId);
    const draftVersion = workflow.draftVersionId
      ? await this.requireWorkflowVersionRepository().findOne({
          where: { id: workflow.draftVersionId },
        })
      : null;
    const currentGraph: WorkflowGraphPayload = {
      nodes: draftVersion?.nodesJson ?? [],
      edges: draftVersion?.edgesJson ?? [],
      viewport: draftVersion?.viewportJson ?? null,
    };
    const graph = this.mergeTemplate(currentGraph, template);
    const version = await this.createWorkflowVersion(workflow, userId, graph);
    workflow.draftVersionId = version.id;
    await this.requireWorkflowRepository().save(workflow);
    await this.recordAudit(
      userId,
      workflow.workspaceId,
      workflow.id,
      'workflow.template_applied',
      { templateId, templateName: template.name },
    );

    return {
      version,
      graph,
    };
  }

  async generateArtifacts(workflowId: string, userId: string) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);
    const draftVersion = workflow.draftVersionId
      ? await this.requireWorkflowVersionRepository().findOne({
          where: { id: workflow.draftVersionId },
        })
      : null;

    if (!draftVersion) {
      throw new NotFoundException('Workflow draft version was not found.');
    }

    const generatedArtifacts = buildWorkflowArtifacts(workflow, draftVersion);

    if (this.generatedArtifactRepository) {
      await this.generatedArtifactRepository.delete({
        workflowVersionId: draftVersion.id,
      });
      await this.generatedArtifactRepository.save(generatedArtifacts);
    }

    await this.recordAudit(
      userId,
      workflow.workspaceId,
      workflow.id,
      'workflow.artifacts_generated',
      {
        workflowVersionId: draftVersion.id,
        artifactCount: generatedArtifacts.length,
      },
    );

    return { generatedArtifacts };
  }

  async listTemplates() {
    if (!this.templateRepository) {
      return {
        templates: systemWorkflowTemplates,
      };
    }

    return {
      templates: await this.templateRepository.find({
        order: { category: 'ASC', name: 'ASC' },
      }),
    };
  }

  async getTemplate(templateId: string) {
    return {
      template: await this.getTemplateRecord(templateId),
    };
  }

  private async createWorkflowVersion(
    workflow: WorkflowEntity,
    userId: string,
    graph: WorkflowGraphPayload,
  ) {
    const repository = this.requireWorkflowVersionRepository();
    const latest = await repository.findOne({
      where: { workflowId: workflow.id },
      order: { versionNumber: 'DESC' },
    });

    return repository.save({
      workflowId: workflow.id,
      projectId: workflow.projectId,
      versionNumber: (latest?.versionNumber ?? 0) + 1,
      status: 'draft',
      nodesJson: graph.nodes,
      edgesJson: graph.edges,
      viewportJson: graph.viewport,
      validation: { isValid: true, issues: [] },
      compiledIr: null,
      createdBy: userId,
      publishedAt: null,
    });
  }

  private async getWorkflowForUser(workflowId: string, userId: string) {
    const workflow = await this.requireWorkflowRepository().findOne({
      where: { id: workflowId },
    });

    if (!workflow) {
      throw new NotFoundException('Workflow was not found.');
    }

    await this.getWorkspaceForUser(workflow.workspaceId, userId);
    return workflow;
  }

  private async getWorkspaceForUser(workspaceId: string, userId: string) {
    const workspace = await this.requireWorkspaceRepository().findOne({
      where: { id: workspaceId, userId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace was not found.');
    }

    return workspace;
  }

  private async getTemplateRecord(templateId: string) {
    if (!this.templateRepository) {
      const template = systemWorkflowTemplates.find(
        (candidate) => candidate.name === templateId,
      );

      if (!template) {
        throw new NotFoundException('Workflow template was not found.');
      }

      return {
        id: template.name,
        ...template,
        isSystemTemplate: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as WorkflowTemplateEntity;
    }

    const template = await this.templateRepository.findOne({
      where: { id: templateId },
    });

    if (!template) {
      throw new NotFoundException('Workflow template was not found.');
    }

    return template;
  }

  private parseGraphPayload(
    body: Record<string, unknown>,
  ): WorkflowGraphPayload {
    if (!Array.isArray(body.nodes)) {
      throw new BadRequestException('nodes must be an array.');
    }

    if (!Array.isArray(body.edges)) {
      throw new BadRequestException('edges must be an array.');
    }

    if (
      body.viewport !== undefined &&
      body.viewport !== null &&
      !this.isRecord(body.viewport)
    ) {
      throw new BadRequestException('viewport must be an object.');
    }

    return {
      nodes: body.nodes.map((node, index) =>
        this.parseGraphRecord(node, `nodes.${index}`),
      ),
      edges: body.edges.map((edge, index) =>
        this.parseGraphRecord(edge, `edges.${index}`),
      ),
      viewport: body.viewport === undefined ? null : body.viewport,
    };
  }

  private validateGraph(graph: WorkflowGraphPayload): void {
    const nodeIds = new Set(
      graph.nodes.map((node, index) => {
        const nodeId = requireString(node.id, `nodes.${index}.id`, 160);
        return nodeId;
      }),
    );

    graph.edges.forEach((edge, index) => {
      const source = this.edgeEndpoint(edge, 'source', 'sourceNodeId');
      const target = this.edgeEndpoint(edge, 'target', 'targetNodeId');

      if (!source || !target) {
        throw new BadRequestException(
          `edges.${index} is missing source or target.`,
        );
      }

      if (!nodeIds.has(source) || !nodeIds.has(target)) {
        throw new BadRequestException(
          `edges.${index} references a missing node.`,
        );
      }
    });
  }

  private mergeTemplate(
    currentGraph: WorkflowGraphPayload,
    template: WorkflowTemplateEntity,
  ): WorkflowGraphPayload {
    const idMap = new Map<string, string>();
    const offset = this.getTemplateOffset(currentGraph.nodes);
    const nodes = template.nodesJson.map((node) => {
      const templateNode = this.parseGraphRecord(node, 'template.nodes');
      const nextId = randomUUID();
      idMap.set(
        requireString(templateNode.id, 'template.nodes.id', 160),
        nextId,
      );
      const position = this.isRecord(templateNode.position)
        ? templateNode.position
        : { x: 0, y: 0 };

      return {
        ...templateNode,
        id: nextId,
        position: {
          x: typeof position.x === 'number' ? position.x + offset.x : offset.x,
          y: typeof position.y === 'number' ? position.y + offset.y : offset.y,
        },
      };
    });
    const edges = template.edgesJson.map((edge) => {
      const templateEdge = this.parseGraphRecord(edge, 'template.edges');
      const source = this.edgeEndpoint(templateEdge, 'source', 'sourceNodeId');
      const target = this.edgeEndpoint(templateEdge, 'target', 'targetNodeId');

      return {
        ...templateEdge,
        id: randomUUID(),
        source: source ? (idMap.get(source) ?? source) : source,
        target: target ? (idMap.get(target) ?? target) : target,
      };
    });

    return {
      nodes: [...currentGraph.nodes, ...nodes],
      edges: [...currentGraph.edges, ...edges],
      viewport: currentGraph.viewport,
    };
  }

  private getTemplateOffset(nodes: JsonRecord[]) {
    if (nodes.length === 0) {
      return { x: 0, y: 0 };
    }

    const maxX = Math.max(
      ...nodes.map((node) => {
        const position = this.isRecord(node.position) ? node.position : null;
        return typeof position?.x === 'number' ? position.x : 0;
      }),
    );

    return { x: maxX + 360, y: 0 };
  }

  private edgeEndpoint(
    edge: JsonRecord,
    reactFlowKey: 'source' | 'target',
    backendKey: 'sourceNodeId' | 'targetNodeId',
  ) {
    const value = edge[reactFlowKey] ?? edge[backendKey];
    return typeof value === 'string' && value.trim() ? value.trim() : null;
  }

  private parseGraphRecord(value: unknown, fieldName: string): JsonRecord {
    if (!this.isRecord(value)) {
      throw new BadRequestException(`${fieldName} must be an object.`);
    }

    return value;
  }

  private isRecord(value: unknown): value is JsonRecord {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private async recordAudit(
    userId: string,
    workspaceId: string,
    workflowId: string,
    action: string,
    metadata: Record<string, unknown>,
  ) {
    if (!this.auditLogRepository) {
      return;
    }

    await this.auditLogRepository.save({
      userId,
      workspaceId,
      workflowId,
      action,
      targetType: 'workflow',
      targetId: workflowId,
      metadataJson: metadata,
    });
  }

  private requireWorkflowRepository() {
    if (!this.workflowRepository) {
      throw new ServiceUnavailableException('Database is not configured.');
    }

    return this.workflowRepository;
  }

  private requireWorkflowVersionRepository() {
    if (!this.workflowVersionRepository) {
      throw new ServiceUnavailableException('Database is not configured.');
    }

    return this.workflowVersionRepository;
  }

  private requireWorkspaceRepository() {
    if (!this.workspaceRepository) {
      throw new ServiceUnavailableException('Database is not configured.');
    }

    return this.workspaceRepository;
  }

  private slugify(value: string): string {
    const slug = value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');

    return slug || randomUUID();
  }
}

type CanvasNode = {
  id: string;
  label: string;
  nodeType: string;
  config: Record<string, unknown>;
};

type CanvasEdge = {
  id: string;
  source: string | null;
  target: string | null;
  label: string | null;
};

function buildWorkflowArtifacts(
  workflow: WorkflowEntity,
  version: WorkflowVersionEntity,
): GeneratedArtifactEntity[] {
  const nodes = version.nodesJson.map(readCanvasNode);
  const edges = version.edgesJson.map(readCanvasEdge);
  const triggerNode =
    nodes.find((node) => node.nodeType === 'httpTrigger') ?? null;
  const method = readConfigString(triggerNode, 'method', 'POST').toUpperCase();
  const path = normalizePath(
    readConfigString(triggerNode, 'path', '/workflow/execute'),
  );
  const operationId = `${toIdentifier(path)}Workflow`;
  const projectId = workflow.projectId ?? workflow.workspaceId;
  const artifacts = [
    createArtifact({
      projectId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      type: 'openapi',
      name: 'openapi.json',
      contentType: 'application/json',
      value: buildOpenApi({
        workflow,
        version,
        nodes,
        edges,
        method,
        path,
        operationId,
      }),
    }),
    createArtifact({
      projectId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      type: 'endpoint_contract',
      name: 'workflow-graph.json',
      contentType: 'application/json',
      value: {
        workflow: {
          id: workflow.id,
          name: workflow.name,
          status: workflow.status,
          versionNumber: version.versionNumber,
        },
        endpoint: {
          method,
          path,
          operationId,
        },
        graph: { nodes, edges },
      },
    }),
    createArtifact({
      projectId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      type: 'dto_schema',
      name: 'workflow-types.ts',
      contentType: 'text/typescript',
      value: buildTypesSource(workflow, nodes, edges),
    }),
    createArtifact({
      projectId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      type: 'sdk_stub',
      name: 'workflow-client.ts',
      contentType: 'text/typescript',
      value: buildClientSource(operationId, method, path),
    }),
    createArtifact({
      projectId,
      workflowId: workflow.id,
      workflowVersionId: version.id,
      type: 'code_preview',
      name: 'nest-route.ts',
      contentType: 'text/typescript',
      value: buildRouteSource(operationId, method, path, nodes),
    }),
  ];

  return artifacts;
}

function buildOpenApi(input: {
  workflow: WorkflowEntity;
  version: WorkflowVersionEntity;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  method: string;
  path: string;
  operationId: string;
}) {
  return {
    openapi: '3.1.0',
    info: {
      title: `${input.workflow.name} API`,
      version: `v${input.version.versionNumber}`,
    },
    paths: {
      [input.path]: {
        [input.method.toLowerCase()]: {
          operationId: input.operationId,
          summary: `Generated endpoint for ${input.workflow.name}.`,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { type: 'object', additionalProperties: true },
              },
            },
          },
          responses: {
            '200': {
              description: 'Workflow response.',
              content: {
                'application/json': {
                  schema: { type: 'object', additionalProperties: true },
                },
              },
            },
          },
          'x-forge': {
            workflowId: input.workflow.id,
            workflowVersionId: input.version.id,
            nodes: input.nodes.map((node) => ({
              id: node.id,
              type: node.nodeType,
              label: node.label,
            })),
            edges: input.edges,
          },
        },
      },
    },
  };
}

function buildTypesSource(
  workflow: WorkflowEntity,
  nodes: CanvasNode[],
  edges: CanvasEdge[],
) {
  return [
    `// Generated from workflow: ${workflow.name}`,
    'export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };',
    'export type JsonObject = { [key: string]: JsonValue };',
    '',
    `export const workflowId = ${JSON.stringify(workflow.id)};`,
    `export const workflowNodes = ${stableStringify(nodes, 2)} as const;`,
    `export const workflowEdges = ${stableStringify(edges, 2)} as const;`,
  ].join('\n');
}

function buildClientSource(operationId: string, method: string, path: string) {
  return [
    'export type JsonObject = { [key: string]: unknown };',
    '',
    'export class ForgeWorkflowClient {',
    '  constructor(private readonly baseUrl: string) {}',
    '',
    `  async ${operationId}(input: JsonObject): Promise<JsonObject> {`,
    `    const response = await fetch(\`\${this.baseUrl}${path}\`, {`,
    `      method: ${JSON.stringify(method)},`,
    '      headers: { "Content-Type": "application/json" },',
    '      body: JSON.stringify(input),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new Error(`Workflow request failed with ${response.status}`);',
    '    }',
    '',
    '    return (await response.json()) as JsonObject;',
    '  }',
    '}',
  ].join('\n');
}

function buildRouteSource(
  operationId: string,
  method: string,
  path: string,
  nodes: CanvasNode[],
) {
  return [
    "import { Body, Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common';",
    '',
    "@Controller('generated')",
    'export class GeneratedWorkflowController {',
    `  @${toNestMethodDecorator(method)}(${JSON.stringify(path)})`,
    `  async ${operationId}(@Body() body: Record<string, unknown>) {`,
    '    return {',
    '      input: body,',
    `      nodeCount: ${nodes.length},`,
    '      status: "accepted",',
    '    };',
    '  }',
    '}',
  ].join('\n');
}

function createArtifact(input: {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  type: GeneratedArtifactEntity['type'];
  name: string;
  contentType: GeneratedArtifactEntity['contentType'];
  value: unknown;
}): GeneratedArtifactEntity {
  const content =
    input.contentType === 'application/json'
      ? `${stableStringify(input.value, 2)}\n`
      : `${String(input.value).trimEnd()}\n`;

  return {
    id: randomUUID(),
    projectId: input.projectId,
    workflowId: input.workflowId,
    workflowVersionId: input.workflowVersionId,
    type: input.type,
    name: input.name,
    contentType: input.contentType,
    checksum: createStableHash(content),
    content,
    createdAt: new Date(),
  };
}

function readCanvasNode(value: unknown): CanvasNode {
  const node = isRecord(value) ? value : {};
  const data = isRecord(node.data) ? node.data : {};

  return {
    id: typeof node.id === 'string' ? node.id : randomUUID(),
    label: typeof data.label === 'string' ? data.label : 'Untitled Node',
    nodeType: typeof data.type === 'string' ? data.type : 'unknown',
    config: isRecord(data.config) ? data.config : {},
  };
}

function readCanvasEdge(value: unknown): CanvasEdge {
  const edge = isRecord(value) ? value : {};

  return {
    id: typeof edge.id === 'string' ? edge.id : randomUUID(),
    source: typeof edge.source === 'string' ? edge.source : null,
    target: typeof edge.target === 'string' ? edge.target : null,
    label: typeof edge.label === 'string' ? edge.label : null,
  };
}

function readConfigString(
  node: CanvasNode | null,
  key: string,
  fallback: string,
) {
  const value = node?.config[key];
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizePath(path: string) {
  return path.startsWith('/') ? path : `/${path}`;
}

function toIdentifier(path: string) {
  const identifier = path
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return identifier || 'Generated';
}

function toNestMethodDecorator(method: string) {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'Get';
    case 'PUT':
      return 'Put';
    case 'PATCH':
      return 'Patch';
    case 'DELETE':
      return 'Delete';
    default:
      return 'Post';
  }
}

function stableStringify(value: unknown, space = 0) {
  return JSON.stringify(sortJson(value), null, space);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sortJson(item));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortJson(value[key])]),
    );
  }

  return value;
}

function createStableHash(value: string) {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
