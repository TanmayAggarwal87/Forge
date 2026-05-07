import type {
  WorkflowEntity,
  WorkflowVersionEntity,
} from '../database/entities';
import { buildWorkflowArtifacts } from './workflow-code-generator';

describe('buildWorkflowArtifacts', () => {
  it('exports workflow definitions without backend code artifacts', () => {
    const artifacts = buildWorkflowArtifacts(
      createWorkflow('OTP Authentication Flow'),
      createVersion([
        createNode('request-trigger', 'httpTrigger', 'Request OTP'),
        createNode('generate-otp', 'generateOtp', 'Generate OTP'),
      ]),
      'workflow_definition',
    );

    expect(artifacts.map((artifact) => artifact.name)).toEqual([
      'workflow.definition.ts',
      'workflow.json',
    ]);
    expect(
      artifacts.every((artifact) => artifact.type === 'workflow_definition'),
    ).toBe(true);
    expect(artifacts[0].content).toContain('workflowDefinition');
    expect(artifacts[0].content).not.toContain('@Controller');
  });

  it('generates a complete OTP authentication NestJS module', () => {
    const artifacts = buildWorkflowArtifacts(
      createWorkflow('OTP Authentication Flow'),
      createVersion([
        createNode('request-trigger', 'httpTrigger', 'Request OTP'),
        createNode('generate-otp', 'generateOtp', 'Generate OTP'),
        createNode('verify-otp', 'verifyOtp', 'Verify OTP'),
      ]),
      'backend_module',
    );

    expect(artifacts.map((artifact) => artifact.name)).toEqual([
      'generated/otp-auth/otp-auth.module.ts',
      'generated/otp-auth/otp-auth.controller.ts',
      'generated/otp-auth/otp-auth.service.ts',
      'generated/otp-auth/dto/request-otp.dto.ts',
      'generated/otp-auth/dto/verify-otp.dto.ts',
      'generated/otp-auth/providers/otp-store.provider.ts',
      'generated/otp-auth/providers/sms.provider.ts',
      'generated/otp-auth/types/otp-auth.types.ts',
      'generated/otp-auth/README.md',
      'generated/otp-auth/.env.example',
    ]);
    expect(
      artifacts.every((artifact) => artifact.type === 'backend_module'),
    ).toBe(true);
    expect(
      artifacts.find((artifact) =>
        artifact.name.endsWith('otp-auth.controller.ts'),
      )?.content,
    ).toContain("@Controller('auth/otp')");
    expect(
      artifacts.find((artifact) => artifact.name.endsWith('workflow.json')),
    ).toBeUndefined();
  });

  it('generates a complete payment webhook NestJS module', () => {
    const artifacts = buildWorkflowArtifacts(
      createWorkflow('Payment Webhook Flow'),
      createVersion([
        createNode('webhook-trigger', 'webhookTrigger', 'Payment Webhook'),
        createNode('verify-signature', 'verifySignature', 'Verify Signature'),
      ]),
      'backend_module',
    );

    expect(artifacts.map((artifact) => artifact.name)).toEqual([
      'generated/payment-webhook/payment-webhook.module.ts',
      'generated/payment-webhook/payment-webhook.controller.ts',
      'generated/payment-webhook/payment-webhook.service.ts',
      'generated/payment-webhook/dto/payment-webhook.dto.ts',
      'generated/payment-webhook/providers/signature-verifier.provider.ts',
      'generated/payment-webhook/providers/email.provider.ts',
      'generated/payment-webhook/types/payment-webhook.types.ts',
      'generated/payment-webhook/README.md',
      'generated/payment-webhook/.env.example',
    ]);
    expect(
      artifacts.find((artifact) =>
        artifact.name.endsWith('signature-verifier.provider.ts'),
      )?.content,
    ).toContain('timingSafeEqual');
  });
});

function createWorkflow(name: string): WorkflowEntity {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    workspaceId: '22222222-2222-2222-2222-222222222222',
    projectId: null,
    name,
    slug: name.toLowerCase().replace(/\s+/g, '-'),
    description: null,
    status: 'draft',
    draftVersionId: '33333333-3333-3333-3333-333333333333',
    publishedVersionId: null,
    createdByUserId: '44444444-4444-4444-4444-444444444444',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  } as WorkflowEntity;
}

function createVersion(
  nodesJson: Array<Record<string, unknown>>,
): WorkflowVersionEntity {
  return {
    id: '33333333-3333-3333-3333-333333333333',
    workflowId: '11111111-1111-1111-1111-111111111111',
    projectId: null,
    versionNumber: 1,
    status: 'draft',
    nodesJson,
    edgesJson: [],
    viewportJson: null,
    validation: { isValid: true, issues: [] },
    compiledIr: null,
    createdBy: '44444444-4444-4444-4444-444444444444',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
    publishedAt: null,
  } as WorkflowVersionEntity;
}

function createNode(
  id: string,
  type: string,
  label: string,
): Record<string, unknown> {
  return {
    id,
    type,
    label,
    position: { x: 0, y: 0 },
    config: {},
  };
}
