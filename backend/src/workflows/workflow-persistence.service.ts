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
import {
  buildWorkflowArtifacts,
  type ArtifactGenerationMode,
} from './workflow-code-generator';

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

  async generateArtifacts(
    workflowId: string,
    userId: string,
    mode: ArtifactGenerationMode,
  ) {
    const workflow = await this.getWorkflowForUser(workflowId, userId);
    const draftVersion = workflow.draftVersionId
      ? await this.requireWorkflowVersionRepository().findOne({
          where: { id: workflow.draftVersionId },
        })
      : null;

    if (!draftVersion) {
      throw new NotFoundException('Workflow draft version was not found.');
    }

    const generatedArtifacts = buildWorkflowArtifacts(
      workflow,
      draftVersion,
      mode,
    );

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
        mode,
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
