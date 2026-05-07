import type {
  Workflow,
  WorkflowIntermediateRepresentation,
  WorkflowVersion,
} from '../identity/identity.types';
import { nodeRegistryByType } from './node-registry';
import { generateWorkflowArtifacts } from './workflow-artifact-generator';
import { compileWorkflowGraph } from './workflow-compiler';

describe('generateWorkflowArtifacts', () => {
  it('creates deterministic inspectable artifacts for a compiled HTTP workflow', () => {
    const compilation = compileWorkflowGraph(
      {
        nodes: [
          {
            id: 'trigger-1',
            type: 'trigger.http',
            label: 'HTTP Trigger',
            position: { x: 0, y: 0 },
            config: {
              method: 'POST',
              path: '/approvals',
              authStrategy: 'api_key',
            },
          },
          {
            id: 'response-1',
            type: 'utility.response_builder',
            label: 'Build Response',
            position: { x: 180, y: 0 },
            config: {
              statusCode: 202,
            },
          },
        ],
        edges: [
          {
            id: 'edge-1',
            sourceNodeId: 'trigger-1',
            targetNodeId: 'response-1',
            label: null,
          },
        ],
      },
      nodeRegistryByType,
    );

    expect(compilation.ir).not.toBeNull();

    const input = {
      workflow: {
        id: 'workflow-1',
        name: 'Inbound Approvals',
        slug: 'inbound-approvals',
      } as Workflow,
      version: {
        id: 'version-2',
        projectId: 'project-1',
        versionNumber: 2,
      } as WorkflowVersion,
      ir: compilation.ir as WorkflowIntermediateRepresentation,
    };

    const firstArtifacts = generateWorkflowArtifacts(input);
    const secondArtifacts = generateWorkflowArtifacts(input);
    const comparable = (artifact: (typeof firstArtifacts)[number]) => ({
      type: artifact.type,
      name: artifact.name,
      contentType: artifact.contentType,
      checksum: artifact.checksum,
      content: artifact.content,
    });

    expect(firstArtifacts.map((artifact) => artifact.type)).toEqual([
      'openapi',
      'endpoint_contract',
      'dto_schema',
      'sdk_stub',
      'code_preview',
    ]);
    expect(firstArtifacts.map(comparable)).toEqual(
      secondArtifacts.map(comparable),
    );

    const openApiArtifact = firstArtifacts.find(
      (artifact) => artifact.type === 'openapi',
    );
    const openApiSpec = JSON.parse(openApiArtifact?.content ?? '{}') as unknown;
    expect(openApiArtifact?.checksum).toMatch(/^[a-f0-9]{64}$/);
    expect(isRecord(openApiSpec)).toBe(true);
    if (!isRecord(openApiSpec)) {
      throw new Error('OpenAPI artifact must be a JSON object.');
    }

    const paths = openApiSpec.paths;
    expect(openApiSpec.openapi).toBe('3.1.0');
    expect(isRecord(paths)).toBe(true);
    if (!isRecord(paths)) {
      throw new Error('OpenAPI paths must be a JSON object.');
    }

    const approvalsPath = paths['/approvals'];
    expect(isRecord(approvalsPath)).toBe(true);
    if (!isRecord(approvalsPath)) {
      throw new Error('OpenAPI /approvals path must be a JSON object.');
    }

    const postOperation = approvalsPath.post;
    expect(isRecord(postOperation)).toBe(true);
    if (!isRecord(postOperation)) {
      throw new Error('OpenAPI POST operation must be a JSON object.');
    }
    expect(postOperation.operationId).toBe('InboundApprovalsV21');

    const sdkArtifact = firstArtifacts.find(
      (artifact) => artifact.type === 'sdk_stub',
    );
    expect(sdkArtifact?.content).toContain('class ForgeWorkflowClient');
    expect(sdkArtifact?.content).toContain('InboundApprovalsV21');
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
