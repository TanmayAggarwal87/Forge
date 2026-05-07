import { BadRequestException, Injectable } from '@nestjs/common';
import { requireString } from '../common/validation';
import type {
  GeneratedArtifact,
  NodeDefinition,
  Workflow,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowVersion,
  WorkflowVersionMigrationReport,
  WorkflowNode,
  WorkflowValidationIssue,
} from '../identity/identity.types';
import { InMemoryStoreService } from '../identity/in-memory-store.service';
import { validateWorkflowGraph } from './graph-validation';
import { nodeRegistry } from './node-registry';
import { generateWorkflowArtifacts } from './workflow-artifact-generator';
import { compileWorkflowGraph } from './workflow-compiler';

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

type WorkflowVersionSummary = WorkflowVersion & {
  isActive: boolean;
  migrationReport: WorkflowVersionMigrationReport;
  generatedArtifactCount: number;
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

  compileDraft(projectId: string, workflowId: string, userId: string) {
    const workflow = this.store.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );

    return {
      compilation: compileWorkflowGraph(
        workflow.draftVersion.graph,
        this.registryByType,
      ),
    };
  }

  publishDraft(projectId: string, workflowId: string, userId: string) {
    const workflow = this.store.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );
    const compilation = compileWorkflowGraph(
      workflow.draftVersion.graph,
      this.registryByType,
    );

    if (!compilation.isValid || !compilation.ir) {
      throw new BadRequestException({
        message:
          'Workflow draft cannot be published until compile errors are fixed.',
        issues: compilation.issues,
      });
    }

    const published = this.store.publishWorkflow({
      projectId,
      workflowId,
      actorUserId: userId,
      compiledIr: compilation.ir,
    });
    const generatedArtifacts = this.store.replaceGeneratedArtifactsForVersion(
      published.publishedVersion.id,
      generateWorkflowArtifacts({
        workflow: published,
        version: published.publishedVersion,
        ir: compilation.ir,
      }),
    );

    return {
      workflow: {
        ...published,
        publishedVersion: {
          ...published.publishedVersion,
          generatedArtifacts,
        },
      },
      compilation,
      generatedArtifacts,
    };
  }

  listVersions(projectId: string, workflowId: string, userId: string) {
    const workflow = this.store.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );
    const versions = this.store.listWorkflowVersionsForUser(
      projectId,
      workflowId,
      userId,
    );

    return {
      versions: versions.map(
        (version): WorkflowVersionSummary => ({
          ...version,
          isActive: workflow.publishedVersionId === version.id,
          migrationReport: this.getMigrationReport(version),
          generatedArtifactCount: this.store.listGeneratedArtifactsForVersion(
            version.id,
          ).length,
        }),
      ),
    };
  }

  activateVersion(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    userId: string,
  ) {
    const version = this.store.getWorkflowVersionForUser(
      projectId,
      workflowId,
      workflowVersionId,
      userId,
    );
    const migrationReport = this.getMigrationReport(version);
    this.assertVersionCanGoLive(version, migrationReport);

    const workflow = this.store.activateWorkflowVersion({
      projectId,
      workflowId,
      workflowVersionId,
      actorUserId: userId,
      auditAction: 'workflow.version_activated',
    });
    const generatedArtifacts = this.ensureGeneratedArtifacts(
      workflow,
      workflow.activeVersion,
    );

    return {
      workflow: {
        ...workflow,
        activeVersion: {
          ...workflow.activeVersion,
          generatedArtifacts,
        },
      },
      migrationReport,
      generatedArtifacts,
    };
  }

  rollbackToVersion(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    userId: string,
  ) {
    const workflow = this.store.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );

    if (workflow.publishedVersionId === workflowVersionId) {
      throw new BadRequestException(
        'Workflow version is already the active published version.',
      );
    }

    const version = this.store.getWorkflowVersionForUser(
      projectId,
      workflowId,
      workflowVersionId,
      userId,
    );
    const migrationReport = this.getMigrationReport(version);
    this.assertVersionCanGoLive(version, migrationReport);

    const rolledBackWorkflow = this.store.activateWorkflowVersion({
      projectId,
      workflowId,
      workflowVersionId,
      actorUserId: userId,
      auditAction: 'workflow.rolled_back',
    });
    const generatedArtifacts = this.ensureGeneratedArtifacts(
      rolledBackWorkflow,
      rolledBackWorkflow.activeVersion,
    );

    return {
      workflow: {
        ...rolledBackWorkflow,
        activeVersion: {
          ...rolledBackWorkflow.activeVersion,
          generatedArtifacts,
        },
      },
      migrationReport,
      generatedArtifacts,
    };
  }

  deactivateWorkflow(projectId: string, workflowId: string, userId: string) {
    const workflow = this.store.getWorkflowDraftForUser(
      projectId,
      workflowId,
      userId,
    );
    if (!workflow.publishedVersionId) {
      throw new BadRequestException(
        'Workflow does not have an active published version to deactivate.',
      );
    }

    return {
      workflow: this.store.deactivateWorkflow({
        projectId,
        workflowId,
        actorUserId: userId,
      }),
    };
  }

  listGeneratedArtifacts(
    projectId: string,
    workflowId: string,
    userId: string,
  ) {
    return {
      generatedArtifacts: this.store.listGeneratedArtifactsForPublishedWorkflow(
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

  private ensureGeneratedArtifacts(
    workflow: Pick<Workflow, 'id' | 'name' | 'slug'>,
    version: WorkflowVersion,
  ): GeneratedArtifact[] {
    const existingArtifacts = this.store.listGeneratedArtifactsForVersion(
      version.id,
    );
    if (existingArtifacts.length > 0) {
      return existingArtifacts;
    }

    if (!version.compiledIr) {
      return [];
    }

    return this.store.replaceGeneratedArtifactsForVersion(
      version.id,
      generateWorkflowArtifacts({
        workflow,
        version,
        ir: version.compiledIr,
      }),
    );
  }

  private assertVersionCanGoLive(
    version: WorkflowVersion,
    migrationReport: WorkflowVersionMigrationReport,
  ): void {
    if (version.status !== 'published') {
      throw new BadRequestException('Only published versions can go live.');
    }

    if (!version.compiledIr) {
      throw new BadRequestException(
        'Published workflow version does not have a compiled runtime plan.',
      );
    }

    if (!migrationReport.isCompatible) {
      throw new BadRequestException({
        message:
          'Workflow version cannot go live until node definition migration issues are resolved.',
        issues: migrationReport.issues,
      });
    }
  }

  private getMigrationReport(
    version: WorkflowVersion,
  ): WorkflowVersionMigrationReport {
    const issues: WorkflowValidationIssue[] = [];

    if (version.status === 'published' && !version.compiledIr) {
      issues.push(
        this.migrationIssue(
          'error',
          'version.missing_ir',
          'Published version is missing its compiled runtime plan.',
        ),
      );
    }

    for (const node of version.compiledIr?.nodes ?? []) {
      const currentDefinition = this.registryByType.get(node.type);

      if (!currentDefinition) {
        issues.push(
          this.migrationIssue(
            'error',
            'node_definition.missing',
            `Node definition "${node.type}" is no longer registered.`,
          ),
        );
        continue;
      }

      if (currentDefinition.version < node.definitionVersion) {
        issues.push(
          this.migrationIssue(
            'error',
            'node_definition.downgraded',
            `Node definition "${node.type}" is older than the published version requires.`,
          ),
        );
      }

      if (currentDefinition.version > node.definitionVersion) {
        issues.push(
          this.migrationIssue(
            'warning',
            'node_definition.newer_available',
            `Node definition "${node.type}" has a newer registry version; this published version keeps using v${node.definitionVersion}.`,
          ),
        );
      }
    }

    return {
      isCompatible: !issues.some((issue) => issue.severity === 'error'),
      issues,
    };
  }

  private migrationIssue(
    severity: WorkflowValidationIssue['severity'],
    code: string,
    message: string,
  ): WorkflowValidationIssue {
    return {
      severity,
      code,
      message,
      field: null,
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
