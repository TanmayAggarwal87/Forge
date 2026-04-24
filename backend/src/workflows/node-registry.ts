import type { NodeDefinition } from '../identity/identity.types';

const passthroughSchema = {
  type: 'object',
  additionalProperties: true,
};

export const nodeRegistry: NodeDefinition[] = [
  {
    type: 'trigger.http',
    version: 1,
    title: 'HTTP Trigger',
    description: 'Starts a workflow from an authenticated HTTP request.',
    category: 'trigger',
    capabilityTags: ['http', 'trigger', 'sync'],
    executionMode: 'sync',
    retryable: false,
    defaultTimeoutMs: 15000,
    inputSchema: {
      type: 'object',
      properties: {
        request: { type: 'object' },
      },
      required: ['request'],
      additionalProperties: false,
    },
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        method: {
          type: 'string',
          enum: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        path: { type: 'string' },
        authStrategy: {
          type: 'string',
          enum: ['workspace_session', 'api_key', 'public'],
        },
      },
      required: ['method', 'path'],
      additionalProperties: false,
    },
  },
  {
    type: 'trigger.schedule',
    version: 1,
    title: 'Scheduled Trigger',
    description: 'Starts a workflow on a cron-like schedule.',
    category: 'trigger',
    capabilityTags: ['schedule', 'trigger', 'async'],
    executionMode: 'async',
    retryable: true,
    defaultTimeoutMs: 30000,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        cron: { type: 'string' },
        timezone: { type: 'string' },
      },
      required: ['cron'],
      additionalProperties: false,
    },
  },
  {
    type: 'logic.condition',
    version: 1,
    title: 'Condition',
    description: 'Branches workflow execution based on structured predicates.',
    category: 'logic',
    capabilityTags: ['branch', 'condition'],
    executionMode: 'sync',
    retryable: false,
    defaultTimeoutMs: 5000,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        expression: { type: 'string' },
      },
      required: ['expression'],
      additionalProperties: false,
    },
  },
  {
    type: 'logic.transform',
    version: 1,
    title: 'Transform Payload',
    description: 'Maps the current payload into a new structured shape.',
    category: 'logic',
    capabilityTags: ['transform', 'mapping'],
    executionMode: 'sync',
    retryable: false,
    defaultTimeoutMs: 5000,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        template: { type: 'object' },
      },
      additionalProperties: false,
    },
  },
  {
    type: 'data.insert_record',
    version: 1,
    title: 'Insert Record',
    description: 'Writes a validated record into a configured datastore.',
    category: 'data',
    capabilityTags: ['database', 'write'],
    executionMode: 'async',
    retryable: true,
    defaultTimeoutMs: 20000,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        resource: { type: 'string' },
      },
      required: ['resource'],
      additionalProperties: false,
    },
  },
  {
    type: 'integration.rest_request',
    version: 1,
    title: 'REST Request',
    description: 'Calls an allowlisted external HTTP service.',
    category: 'integration',
    capabilityTags: ['http', 'integration', 'outbound'],
    executionMode: 'async',
    retryable: true,
    defaultTimeoutMs: 20000,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        method: { type: 'string' },
        url: { type: 'string' },
      },
      required: ['method', 'url'],
      additionalProperties: false,
    },
  },
  {
    type: 'utility.response_builder',
    version: 1,
    title: 'Response Builder',
    description: 'Builds the structured HTTP response returned to callers.',
    category: 'utility',
    capabilityTags: ['response', 'http'],
    executionMode: 'sync',
    retryable: false,
    defaultTimeoutMs: 5000,
    inputSchema: passthroughSchema,
    outputSchema: passthroughSchema,
    configSchema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number' },
      },
      additionalProperties: false,
    },
  },
];

export const nodeRegistryByType = new Map(
  nodeRegistry.map((definition) => [definition.type, definition]),
);
