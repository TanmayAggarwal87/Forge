import type { Viewport } from "@xyflow/react";
import { apiRequest } from "@/lib/apiClient";
import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import {
  workflowTemplates,
  type WorkflowTemplate,
  type WorkflowTemplateDifficulty,
} from "@/features/workflow/workflowTemplates";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowSnapshot,
} from "@/features/workflow/types";

type BackendWorkflow = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  draftVersionId: string | null;
  updatedAt: string;
  draftVersion?: BackendWorkflowVersion | null;
};

type BackendWorkflowVersion = {
  id: string;
  workflowId: string;
  versionNumber: number;
  nodesJson?: unknown;
  edgesJson?: unknown;
  viewportJson?: unknown;
  createdAt: string;
  updatedAt: string;
};

type BackendTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: WorkflowTemplateDifficulty;
  nodesJson?: unknown;
  edgesJson?: unknown;
  previewJson?: unknown;
};

type SaveWorkflowResponse = {
  version: BackendWorkflowVersion;
  graph: {
    nodes: unknown[];
    edges: unknown[];
    viewport: unknown;
  };
};

export type BackendGeneratedArtifact = {
  id: string;
  type: "openapi" | "endpoint_contract" | "dto_schema" | "sdk_stub" | "code_preview";
  name: string;
  contentType: "application/json" | "text/typescript";
  checksum: string;
  content: string;
  createdAt: string;
};

export async function listBackendWorkflows(workspaceId: string, token: string) {
  return apiRequest<{ workflows: BackendWorkflow[] }>(
    `/workspaces/${workspaceId}/workflows`,
    {},
    token,
  );
}

export async function createBackendWorkflow(
  workspaceId: string,
  name: string,
  token: string,
) {
  return apiRequest<{ workflow: BackendWorkflow }>(
    `/workspaces/${workspaceId}/workflows`,
    {
      method: "POST",
      body: JSON.stringify({
        name,
      }),
    },
    token,
  );
}

export async function getBackendWorkflow(workflowId: string, token: string) {
  return apiRequest<{ workflow: BackendWorkflow }>(`/workflows/${workflowId}`, {}, token);
}

export async function saveBackendWorkflowSnapshot(
  workflowId: string,
  snapshot: WorkflowSnapshot,
  token: string,
) {
  return apiRequest<SaveWorkflowResponse>(
    `/workflows/${workflowId}/save`,
    {
      method: "POST",
      body: JSON.stringify(snapshot),
    },
    token,
  );
}

export async function listBackendTemplates(token: string) {
  const payload = await apiRequest<{ templates: BackendTemplate[] }>(
    "/templates",
    {},
    token,
  );
  const templates = payload.templates
    .map(mapBackendTemplate)
    .filter((template): template is WorkflowTemplate => Boolean(template));

  return templates.length > 0 ? templates : workflowTemplates;
}

export async function generateBackendWorkflowArtifacts(
  workflowId: string,
  token: string,
) {
  return apiRequest<{ generatedArtifacts: BackendGeneratedArtifact[] }>(
    `/workflows/${workflowId}/artifacts`,
    { method: "POST" },
    token,
  );
}

export function backendWorkflowToSnapshot(
  workflow: BackendWorkflow,
): WorkflowSnapshot {
  const version = workflow.draftVersion;

  return {
    nodes: parseNodes(version?.nodesJson),
    edges: parseEdges(version?.edgesJson),
    viewport: parseViewport(version?.viewportJson),
  };
}

function mapBackendTemplate(template: BackendTemplate): WorkflowTemplate | null {
  const nodes = parseTemplateNodes(template.nodesJson);

  if (nodes.length === 0) {
    return null;
  }

  const preview = parseTemplatePreview(template.previewJson);

  return {
    id: template.id,
    name: template.name.replace(/\s+Flow$/i, ""),
    description: template.description,
    category: template.category as WorkflowTemplate["category"],
    difficulty: template.difficulty,
    useCase:
      parseTemplateUseCase(template.previewJson) ?? template.description,
    preview: preview.length > 0 ? preview : nodes.slice(0, 3).map((node) => node.label),
    nodes,
    edges: parseTemplateEdges(template.edgesJson),
  };
}

function parseNodes(value: unknown): WorkflowNode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isWorkflowNode);
}

function parseEdges(value: unknown): WorkflowEdge[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isWorkflowEdge);
}

function parseViewport(value: unknown): Viewport {
  if (!isRecord(value)) {
    return { x: 0, y: 0, zoom: 1 };
  }

  return {
    x: typeof value.x === "number" ? value.x : 0,
    y: typeof value.y === "number" ? value.y : 0,
    zoom: typeof value.zoom === "number" ? value.zoom : 1,
  };
}

function parseTemplateNodes(value: unknown): WorkflowTemplate["nodes"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((node) => {
    if (!isRecord(node) || typeof node.id !== "string" || !isWorkflowNodeType(node.type)) {
      return [];
    }

    const definition = nodeDefinitionsByType[node.type];
    const position = isRecord(node.position) ? node.position : {};
    const rawConfig = node.config;
    const config: Record<string, string | number> = isConfigRecord(rawConfig)
      ? rawConfig
      : {};

    return [
      {
        id: node.id,
        type: node.type,
        label: typeof node.label === "string" ? node.label : definition.label,
        position: {
          x: typeof position.x === "number" ? position.x : 0,
          y: typeof position.y === "number" ? position.y : 0,
        },
        config,
      },
    ];
  });
}

function parseTemplateEdges(value: unknown): WorkflowTemplate["edges"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((edge) => {
    if (
      !isRecord(edge) ||
      typeof edge.source !== "string" ||
      typeof edge.target !== "string"
    ) {
      return [];
    }

    return [
      {
        id: typeof edge.id === "string" ? edge.id : `${edge.source}-${edge.target}`,
        source: edge.source,
        target: edge.target,
        label:
          typeof edge.label === "string" && edge.label.trim()
            ? edge.label.trim()
            : undefined,
      },
    ];
  });
}

function parseTemplatePreview(value: unknown): string[] {
  if (!isRecord(value) || !Array.isArray(value.steps)) {
    return [];
  }

  return value.steps.filter((step): step is string => typeof step === "string");
}

function parseTemplateUseCase(value: unknown): string | null {
  if (!isRecord(value) || typeof value.useCase !== "string") {
    return null;
  }

  return value.useCase;
}

function isWorkflowNode(value: unknown): value is WorkflowNode {
  if (!isRecord(value) || value.type !== "workflowNode" || !isRecord(value.data)) {
    return false;
  }

  return (
    typeof value.id === "string" &&
    isWorkflowNodeType(value.data.type) &&
    typeof value.data.label === "string" &&
    isRecord(value.position)
  );
}

function isWorkflowEdge(value: unknown): value is WorkflowEdge {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.source === "string" &&
    typeof value.target === "string"
  );
}

function isWorkflowNodeType(value: unknown): value is WorkflowNodeType {
  return typeof value === "string" && value in nodeDefinitionsByType;
}

function isConfigRecord(value: unknown): value is Record<string, string | number> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.values(value).every(
    (item) => typeof item === "string" || typeof item === "number",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
