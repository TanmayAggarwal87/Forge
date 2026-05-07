import type {
  WorkflowDocument,
  WorkflowNode,
} from "@/features/workflow/types";

export type CanvasGeneratedArtifact = {
  id: string;
  type: "openapi" | "endpoint_contract" | "dto_schema" | "sdk_stub" | "code_preview";
  name: string;
  contentType: "application/json" | "text/typescript";
  checksum: string;
  content: string;
};

export type CanvasArtifactIssue = {
  severity: "error" | "warning";
  message: string;
};

export type CanvasArtifactGenerationResult = {
  generatedAt: string;
  issues: CanvasArtifactIssue[];
  artifacts: CanvasGeneratedArtifact[];
};

type EndpointContract = {
  workflowId: string;
  status: WorkflowDocument["status"];
  endpoint: {
    method: string;
    path: string;
    operationId: string;
    executionMode: "sync" | "async";
    nodeCount: number;
    edgeCount: number;
    triggerNodeId: string | null;
  };
  graph: {
    nodes: Array<{
      id: string;
      label: string;
      type: string;
      config: Record<string, string | number>;
    }>;
    edges: Array<{
      id: string;
      source: string | null;
      target: string | null;
      label: string | null;
    }>;
  };
};

const requestSchema = {
  type: "object",
  additionalProperties: true,
};

const responseSchema = {
  type: "object",
  properties: {
    executionId: { type: "string" },
    status: { type: "string" },
    output: { type: "object", additionalProperties: true },
  },
  required: ["executionId", "status"],
  additionalProperties: false,
};

export function generateCanvasArtifacts(
  workflow: WorkflowDocument,
): CanvasArtifactGenerationResult {
  const issues = validateWorkflowForArtifacts(workflow);
  const contract = buildEndpointContract(workflow);
  const artifacts = [
    createArtifact("openapi", "openapi.json", buildOpenApi(contract)),
    createArtifact("endpoint_contract", "endpoint-contract.json", contract),
    createArtifact(
      "dto_schema",
      "workflow-contracts.ts",
      buildDtoSource(contract),
      "text/typescript",
    ),
    createArtifact(
      "sdk_stub",
      "workflow-client.ts",
      buildSdkSource(contract),
      "text/typescript",
    ),
    createArtifact(
      "code_preview",
      "runtime-route.preview.ts",
      buildCodePreview(contract),
      "text/typescript",
    ),
  ];

  return {
    generatedAt: new Date().toISOString(),
    issues,
    artifacts,
  };
}

function validateWorkflowForArtifacts(
  workflow: WorkflowDocument,
): CanvasArtifactIssue[] {
  const issues: CanvasArtifactIssue[] = [];
  const triggerNodes = workflow.nodes.filter(
    (node) => node.data.type === "httpTrigger",
  );

  if (workflow.nodes.length === 0) {
    issues.push({
      severity: "error",
      message: "Add at least one node before generating artifacts.",
    });
  }

  if (triggerNodes.length === 0) {
    issues.push({
      severity: "warning",
      message:
        "No HTTP Trigger exists, so the preview uses a default execution endpoint.",
    });
  }

  for (const edge of workflow.edges) {
    if (!edge.source || !edge.target) {
      issues.push({
        severity: "warning",
        message: "One or more edges are missing a source or target node.",
      });
      break;
    }
  }

  return issues;
}

function buildEndpointContract(workflow: WorkflowDocument): EndpointContract {
  const triggerNode =
    workflow.nodes.find((node) => node.data.type === "httpTrigger") ?? null;
  const path = normalizePath(readConfigString(triggerNode, "path", "/workflow/execute"));
  const method = readConfigString(triggerNode, "method", "POST").toUpperCase();
  const operationId = `${toIdentifier(path)}Workflow`;

  return {
    workflowId: workflow.workspaceId,
    status: workflow.status,
    endpoint: {
      method,
      path,
      operationId,
      executionMode: hasAsyncNode(workflow.nodes) ? "async" : "sync",
      nodeCount: workflow.nodes.length,
      edgeCount: workflow.edges.length,
      triggerNodeId: triggerNode?.id ?? null,
    },
    graph: {
      nodes: workflow.nodes
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((node) => ({
          id: node.id,
          label: node.data.label,
          type: node.data.type,
          config: sortRecord(node.data.config),
        })),
      edges: workflow.edges
        .slice()
        .sort((left, right) => left.id.localeCompare(right.id))
        .map((edge) => ({
          id: edge.id,
          source: edge.source ?? null,
          target: edge.target ?? null,
          label: edge.label ? String(edge.label) : null,
        })),
    },
  };
}

function buildOpenApi(contract: EndpointContract): Record<string, unknown> {
  return {
    openapi: "3.1.0",
    info: {
      title: "Forge Canvas Workflow API",
      version: "preview",
    },
    paths: {
      [contract.endpoint.path]: {
        [contract.endpoint.method.toLowerCase()]: {
          operationId: contract.endpoint.operationId,
          summary: "Generated from the visible Forge canvas workflow.",
          tags: ["Canvas Preview"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: requestSchema,
              },
            },
          },
          responses: {
            "200": {
              description: "Workflow execution response.",
              content: {
                "application/json": {
                  schema: responseSchema,
                },
              },
            },
          },
          "x-forge": {
            workflowId: contract.workflowId,
            executionMode: contract.endpoint.executionMode,
            nodeCount: contract.endpoint.nodeCount,
            edgeCount: contract.endpoint.edgeCount,
          },
        },
      },
    },
  };
}

function buildDtoSource(contract: EndpointContract): string {
  return [
    "// Generated preview from the visible Forge canvas workflow.",
    "export type JsonPrimitive = string | number | boolean | null;",
    "export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };",
    "export type JsonObject = { [key: string]: JsonValue };",
    "",
    `export const ${contract.endpoint.operationId}RequestSchema = ${stableStringify(
      requestSchema,
      2,
    )} as const;`,
    "",
    `export const ${contract.endpoint.operationId}ResponseSchema = ${stableStringify(
      responseSchema,
      2,
    )} as const;`,
  ].join("\n");
}

function buildSdkSource(contract: EndpointContract): string {
  return [
    "// Generated preview from the visible Forge canvas workflow.",
    "export type JsonObject = { [key: string]: unknown };",
    "",
    "export class ForgeCanvasWorkflowClient {",
    "  constructor(private readonly baseUrl: string) {}",
    "",
    `  async ${contract.endpoint.operationId}(input: JsonObject): Promise<JsonObject> {`,
    `    const response = await fetch(\`\${this.baseUrl}${contract.endpoint.path}\`, {`,
    `      method: ${JSON.stringify(contract.endpoint.method)},`,
    '      headers: { "Content-Type": "application/json" },',
    "      body: JSON.stringify(input),",
    "    });",
    "",
    "    if (!response.ok) {",
    "      throw new Error(`Forge workflow request failed with ${response.status}`);",
    "    }",
    "",
    "    return (await response.json()) as JsonObject;",
    "  }",
    "}",
  ].join("\n");
}

function buildCodePreview(contract: EndpointContract): string {
  return [
    "// Read-only runtime route preview generated from the canvas.",
    "import { Body, Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common';",
    "",
    "@Controller('generated')",
    "export class CanvasWorkflowController {",
    `  @${toNestMethodDecorator(contract.endpoint.method)}(${JSON.stringify(
      contract.endpoint.path,
    )})`,
    `  async ${contract.endpoint.operationId}(@Body() body: Record<string, unknown>) {`,
    "    return {",
    "      executionId: crypto.randomUUID(),",
    "      status: 'accepted',",
    "      output: body,",
    "    };",
    "  }",
    "}",
  ].join("\n");
}

function createArtifact(
  type: CanvasGeneratedArtifact["type"],
  name: string,
  value: unknown,
  contentType: CanvasGeneratedArtifact["contentType"] = "application/json",
): CanvasGeneratedArtifact {
  const content =
    contentType === "application/json"
      ? `${stableStringify(value, 2)}\n`
      : `${String(value).trimEnd()}\n`;

  return {
    id: `${type}:${name}`,
    type,
    name,
    contentType,
    checksum: createStableHash(content),
    content,
  };
}

function toNestMethodDecorator(method: string): string {
  switch (method.toUpperCase()) {
    case "GET":
      return "Get";
    case "PUT":
      return "Put";
    case "PATCH":
      return "Patch";
    case "DELETE":
      return "Delete";
    default:
      return "Post";
  }
}

function hasAsyncNode(nodes: WorkflowNode[]): boolean {
  return nodes.some((node) =>
    ["sendEmail", "sendSms", "delay", "databaseWrite", "databaseRead"].includes(
      node.data.type,
    ),
  );
}

function readConfigString(
  node: WorkflowNode | null,
  key: string,
  fallback: string,
): string {
  const value = node?.data.config[key];
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length === 0) {
    return "/workflow/execute";
  }

  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

function toIdentifier(path: string): string {
  const identifier = path
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");

  return identifier.length > 0 ? identifier : "Generated";
}

function sortRecord<T extends Record<string, string | number>>(value: T): T {
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, value[key]]),
  ) as T;
}

function stableStringify(value: unknown, space = 0): string {
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

function createStableHash(value: string): string {
  let hash = 0x811c9dc5;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
