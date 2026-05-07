import { createHash, randomUUID } from 'crypto';
import type {
  GeneratedArtifact,
  GeneratedArtifactContentType,
  GeneratedArtifactType,
  Workflow,
  WorkflowIntermediateRepresentation,
  WorkflowIrNode,
  WorkflowVersion,
} from '../identity/identity.types';

type GenerateWorkflowArtifactsInput = {
  workflow: Pick<Workflow, 'id' | 'name' | 'slug'>;
  version: Pick<WorkflowVersion, 'id' | 'projectId' | 'versionNumber'>;
  ir: WorkflowIntermediateRepresentation;
};

type EndpointContract = {
  workflowId: string;
  workflowVersionId: string;
  versionNumber: number;
  graphHash: string;
  endpoints: EndpointContractItem[];
};

type EndpointContractItem = {
  operationId: string;
  method: string;
  path: string;
  authStrategy: string;
  executionMode: 'sync' | 'async';
  timeoutMs: number;
  idempotencyKeySupported: boolean;
  requestSchema: Record<string, unknown>;
  responseSchema: Record<string, unknown>;
};

export function generateWorkflowArtifacts(
  input: GenerateWorkflowArtifactsInput,
): GeneratedArtifact[] {
  const createdAt = new Date().toISOString();
  const contract = buildEndpointContract(input);
  const openApiSpec = buildOpenApiSpec(input, contract);
  const dtoSource = buildDtoSource(input, contract);
  const sdkSource = buildSdkSource(input, contract);
  const codePreview = buildCodePreview(input, contract);

  return [
    createArtifact(input, createdAt, 'openapi', 'openapi.json', openApiSpec),
    createArtifact(
      input,
      createdAt,
      'endpoint_contract',
      'endpoint-contract.json',
      contract,
    ),
    createArtifact(
      input,
      createdAt,
      'dto_schema',
      'workflow-contracts.ts',
      dtoSource,
      'text/typescript',
    ),
    createArtifact(
      input,
      createdAt,
      'sdk_stub',
      'workflow-client.ts',
      sdkSource,
      'text/typescript',
    ),
    createArtifact(
      input,
      createdAt,
      'code_preview',
      'runtime-route.preview.ts',
      codePreview,
      'text/typescript',
    ),
  ];
}

function buildEndpointContract(
  input: GenerateWorkflowArtifactsInput,
): EndpointContract {
  const asyncWorkflow = input.ir.nodes.some(
    (node) => node.executionMode === 'async',
  );
  const httpTriggers = input.ir.nodes.filter(
    (node) => node.type === 'trigger.http',
  );
  const triggerNodes =
    httpTriggers.length > 0 ? httpTriggers : getTriggerNodes(input.ir);
  const responseSchema = getWorkflowResponseSchema(input.ir);

  return {
    workflowId: input.workflow.id,
    workflowVersionId: input.version.id,
    versionNumber: input.version.versionNumber,
    graphHash: input.ir.graphHash,
    endpoints: triggerNodes.map((node, index) => {
      const method =
        node.type === 'trigger.http'
          ? readString(node.config.method, 'POST').toUpperCase()
          : 'POST';
      const path =
        node.type === 'trigger.http'
          ? normalizePath(
              readString(node.config.path, `/workflows/${input.workflow.slug}`),
            )
          : `/workflows/${input.workflow.slug}/executions`;

      return {
        operationId: `${toIdentifier(input.workflow.slug)}V${input.version.versionNumber}${index + 1}`,
        method,
        path,
        authStrategy:
          node.type === 'trigger.http'
            ? readString(node.config.authStrategy, 'workspace_session')
            : 'workspace_session',
        executionMode: asyncWorkflow ? 'async' : 'sync',
        timeoutMs: Math.max(
          ...input.ir.nodes.map((irNode) => irNode.timeoutMs),
        ),
        idempotencyKeySupported: true,
        requestSchema: stableClone(node.inputSchema),
        responseSchema,
      };
    }),
  };
}

function buildOpenApiSpec(
  input: GenerateWorkflowArtifactsInput,
  contract: EndpointContract,
): Record<string, unknown> {
  const paths = Object.fromEntries(
    contract.endpoints.map((endpoint) => [
      endpoint.path,
      {
        [endpoint.method.toLowerCase()]: {
          operationId: endpoint.operationId,
          summary: `${input.workflow.name} v${input.version.versionNumber}`,
          tags: ['Generated Workflows'],
          security:
            endpoint.authStrategy === 'public'
              ? []
              : [{ [endpoint.authStrategy]: [] }],
          parameters: endpoint.idempotencyKeySupported
            ? [
                {
                  name: 'Idempotency-Key',
                  in: 'header',
                  required: false,
                  schema: { type: 'string', maxLength: 160 },
                },
              ]
            : [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: endpoint.requestSchema,
              },
            },
          },
          responses: {
            '200': {
              description:
                endpoint.executionMode === 'async'
                  ? 'Accepted workflow execution handle.'
                  : 'Workflow execution result.',
              content: {
                'application/json': {
                  schema: endpoint.responseSchema,
                },
              },
            },
            '400': { description: 'Invalid request payload.' },
            '401': { description: 'Authentication required.' },
            '429': { description: 'Rate limit exceeded.' },
          },
          'x-forge': {
            workflowId: input.workflow.id,
            workflowVersionId: input.version.id,
            graphHash: input.ir.graphHash,
            executionMode: endpoint.executionMode,
            timeoutMs: endpoint.timeoutMs,
          },
        },
      },
    ]),
  );

  return {
    openapi: '3.1.0',
    info: {
      title: `${input.workflow.name} API`,
      version: `${input.version.versionNumber}`,
    },
    paths,
    components: {
      securitySchemes: {
        workspace_session: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'session-token',
        },
        api_key: {
          type: 'apiKey',
          in: 'header',
          name: 'X-Forge-Api-Key',
        },
      },
    },
  };
}

function buildDtoSource(
  input: GenerateWorkflowArtifactsInput,
  contract: EndpointContract,
): string {
  const requestSchemas = contract.endpoints
    .map(
      (endpoint) =>
        `export const ${endpoint.operationId}RequestSchema = ${stableStringify(
          endpoint.requestSchema,
          2,
        )} as const;`,
    )
    .join('\n\n');
  const responseSchemas = contract.endpoints
    .map(
      (endpoint) =>
        `export const ${endpoint.operationId}ResponseSchema = ${stableStringify(
          endpoint.responseSchema,
          2,
        )} as const;`,
    )
    .join('\n\n');

  return [
    `// Generated by Forge for ${input.workflow.name} v${input.version.versionNumber}.`,
    'export type JsonPrimitive = string | number | boolean | null;',
    'export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };',
    'export type JsonObject = { [key: string]: JsonValue };',
    '',
    requestSchemas,
    '',
    responseSchemas,
  ].join('\n');
}

function buildSdkSource(
  input: GenerateWorkflowArtifactsInput,
  contract: EndpointContract,
): string {
  const methods = contract.endpoints
    .map(
      (endpoint) => `  async ${endpoint.operationId}(
    input: JsonObject,
    options: { idempotencyKey?: string } = {},
  ): Promise<JsonObject> {
    return this.request(${JSON.stringify(endpoint.method)}, ${JSON.stringify(
      endpoint.path,
    )}, input, options.idempotencyKey);
  }`,
    )
    .join('\n\n');

  return [
    `// Generated by Forge for ${input.workflow.name} v${input.version.versionNumber}.`,
    'export type JsonPrimitive = string | number | boolean | null;',
    'export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };',
    'export type JsonObject = { [key: string]: JsonValue };',
    '',
    'export class ForgeWorkflowClient {',
    '  constructor(',
    '    private readonly baseUrl: string,',
    '    private readonly token?: string,',
    '  ) {}',
    '',
    methods,
    '',
    '  private async request(',
    '    method: string,',
    '    path: string,',
    '    input: JsonObject,',
    '    idempotencyKey?: string,',
    '  ): Promise<JsonObject> {',
    '    const response = await fetch(`${this.baseUrl}${path}`, {',
    '      method,',
    '      headers: {',
    '        "Content-Type": "application/json",',
    '        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),',
    '        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),',
    '      },',
    '      body: JSON.stringify(input),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new Error(`Forge workflow request failed with ${response.status}`);',
    '    }',
    '',
    '    return (await response.json()) as JsonObject;',
    '  }',
    '}',
  ].join('\n');
}

function buildCodePreview(
  input: GenerateWorkflowArtifactsInput,
  contract: EndpointContract,
): string {
  const routes = contract.endpoints
    .map(
      (
        endpoint,
      ) => `  @${toNestMethodDecorator(endpoint.method)}(${JSON.stringify(
        endpoint.path,
      )})
  async ${endpoint.operationId}(@Body() body: Record<string, unknown>) {
    return this.runner.execute({
      workflowId: ${JSON.stringify(input.workflow.id)},
      workflowVersionId: ${JSON.stringify(input.version.id)},
      graphHash: ${JSON.stringify(input.ir.graphHash)},
      triggerType: 'http',
      input: body,
    });
  }`,
    )
    .join('\n\n');

  return [
    `// Read-only preview generated by Forge for ${input.workflow.name}.`,
    "import { Body, Controller, Delete, Get, Patch, Post, Put } from '@nestjs/common';",
    '',
    "@Controller('generated')",
    'export class GeneratedWorkflowController {',
    '  constructor(private readonly runner: PublishedWorkflowRunner) {}',
    '',
    routes,
    '}',
  ].join('\n');
}

function createArtifact(
  input: GenerateWorkflowArtifactsInput,
  createdAt: string,
  type: GeneratedArtifactType,
  name: string,
  value: unknown,
  contentType: GeneratedArtifactContentType = 'application/json',
): GeneratedArtifact {
  const content =
    contentType === 'application/json'
      ? `${stableStringify(value, 2)}\n`
      : `${String(value).trimEnd()}\n`;

  return {
    id: randomUUID(),
    projectId: input.version.projectId,
    workflowId: input.workflow.id,
    workflowVersionId: input.version.id,
    type,
    name,
    contentType,
    checksum: createHash('sha256').update(content).digest('hex'),
    content,
    createdAt,
  };
}

function getTriggerNodes(
  ir: WorkflowIntermediateRepresentation,
): WorkflowIrNode[] {
  const triggerIds = new Set(ir.triggerNodeIds);
  return ir.nodes.filter((node) => triggerIds.has(node.id));
}

function getWorkflowResponseSchema(
  ir: WorkflowIntermediateRepresentation,
): Record<string, unknown> {
  const responseNode = ir.nodes.find(
    (node) => node.type === 'utility.response_builder',
  );

  if (responseNode) {
    return stableClone(responseNode.outputSchema);
  }

  return {
    type: 'object',
    additionalProperties: true,
  };
}

function normalizePath(path: string): string {
  const trimmedPath = path.trim();
  if (trimmedPath.length === 0) {
    return '/';
  }

  return trimmedPath.startsWith('/') ? trimmedPath : `/${trimmedPath}`;
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : fallback;
}

function toIdentifier(value: string): string {
  const identifier = value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return identifier.length > 0 ? identifier : 'Workflow';
}

function toNestMethodDecorator(method: string): string {
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

function stableClone<T>(value: T): T {
  return JSON.parse(stableStringify(value)) as T;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
