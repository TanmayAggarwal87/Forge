import { BadRequestException } from '@nestjs/common';
import { createHash, randomUUID } from 'crypto';
import type {
  GeneratedArtifactContentType,
  GeneratedArtifactType,
} from '../identity/identity.types';
import type {
  GeneratedArtifactEntity,
  WorkflowEntity,
  WorkflowVersionEntity,
} from '../database/entities';

export type ArtifactGenerationMode = 'workflow_definition' | 'backend_module';

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

type WorkflowDefinition = {
  workflowId: string;
  name: string;
  status: string;
  version: {
    id: string;
    number: number;
    status: string;
  };
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  configs: Record<string, Record<string, unknown>>;
  metadata: {
    workspaceId: string;
    projectId: string | null;
    nodeCount: number;
    edgeCount: number;
    viewport: Record<string, unknown> | null;
  };
};

type GeneratorContext = {
  workflow: WorkflowEntity;
  version: WorkflowVersionEntity;
  projectId: string;
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

export function buildWorkflowArtifacts(
  workflow: WorkflowEntity,
  version: WorkflowVersionEntity,
  mode: ArtifactGenerationMode,
): GeneratedArtifactEntity[] {
  const context: GeneratorContext = {
    workflow,
    version,
    projectId: workflow.projectId ?? workflow.workspaceId,
    nodes: version.nodesJson.map(readCanvasNode),
    edges: version.edgesJson.map(readCanvasEdge),
  };

  if (mode === 'workflow_definition') {
    return buildWorkflowDefinitionArtifacts(context);
  }

  return buildBackendModuleArtifacts(context);
}

function buildWorkflowDefinitionArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const definition = buildWorkflowDefinition(context);

  return [
    createArtifact(context, {
      type: 'workflow_definition',
      name: 'workflow.definition.ts',
      contentType: 'text/typescript',
      value: buildWorkflowDefinitionSource(definition),
    }),
    createArtifact(context, {
      type: 'workflow_definition',
      name: 'workflow.json',
      contentType: 'application/json',
      value: definition,
    }),
  ];
}

function buildBackendModuleArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  if (isPaymentWebhookWorkflow(context.nodes)) {
    return buildPaymentWebhookArtifacts(context);
  }

  if (isOtpAuthWorkflow(context.nodes)) {
    return buildOtpAuthArtifacts(context);
  }

  throw new BadRequestException(
    'Backend module generation currently supports OTP Authentication and Payment Webhook workflows.',
  );
}

function buildWorkflowDefinition(
  context: GeneratorContext,
): WorkflowDefinition {
  return {
    workflowId: context.workflow.id,
    name: context.workflow.name,
    status: context.workflow.status,
    version: {
      id: context.version.id,
      number: context.version.versionNumber,
      status: context.version.status,
    },
    nodes: context.nodes,
    edges: context.edges,
    configs: Object.fromEntries(
      context.nodes.map((node) => [node.id, node.config]),
    ),
    metadata: {
      workspaceId: context.workflow.workspaceId,
      projectId: context.workflow.projectId,
      nodeCount: context.nodes.length,
      edgeCount: context.edges.length,
      viewport: context.version.viewportJson,
    },
  };
}

function buildWorkflowDefinitionSource(definition: WorkflowDefinition): string {
  return [
    'export type ForgeWorkflowDefinition = {',
    '  workflowId: string;',
    '  name: string;',
    '  status: string;',
    '  version: { id: string; number: number; status: string };',
    '  nodes: Array<{ id: string; label: string; nodeType: string; config: Record<string, unknown> }>;',
    '  edges: Array<{ id: string; source: string | null; target: string | null; label: string | null }>;',
    '  configs: Record<string, Record<string, unknown>>;',
    '  metadata: Record<string, unknown>;',
    '};',
    '',
    `export const workflowDefinition = ${stableStringify(definition, 2)} satisfies ForgeWorkflowDefinition;`,
  ].join('\n');
}

function buildOtpAuthArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const files: Array<GeneratedFile> = [
    {
      path: 'generated/otp-auth/otp-auth.module.ts',
      contentType: 'text/typescript',
      content: buildOtpAuthModuleSource(),
    },
    {
      path: 'generated/otp-auth/otp-auth.controller.ts',
      contentType: 'text/typescript',
      content: buildOtpAuthControllerSource(),
    },
    {
      path: 'generated/otp-auth/otp-auth.service.ts',
      contentType: 'text/typescript',
      content: buildOtpAuthServiceSource(),
    },
    {
      path: 'generated/otp-auth/dto/request-otp.dto.ts',
      contentType: 'text/typescript',
      content: 'export class RequestOtpDto {\n  phoneNumber!: string;\n}\n',
    },
    {
      path: 'generated/otp-auth/dto/verify-otp.dto.ts',
      contentType: 'text/typescript',
      content:
        'export class VerifyOtpDto {\n  phoneNumber!: string;\n  otp!: string;\n}\n',
    },
    {
      path: 'generated/otp-auth/providers/otp-store.provider.ts',
      contentType: 'text/typescript',
      content: buildOtpStoreProviderSource(),
    },
    {
      path: 'generated/otp-auth/providers/sms.provider.ts',
      contentType: 'text/typescript',
      content: buildSmsProviderSource(),
    },
    {
      path: 'generated/otp-auth/types/otp-auth.types.ts',
      contentType: 'text/typescript',
      content: buildOtpAuthTypesSource(),
    },
    {
      path: 'generated/otp-auth/README.md',
      contentType: 'text/markdown',
      content: buildOtpAuthReadme(context),
    },
    {
      path: 'generated/otp-auth/.env.example',
      contentType: 'text/plain',
      content: [
        'SMS_PROVIDER_URL=https://sms-provider.example.com/messages',
        'SMS_PROVIDER_API_KEY={{SMS_PROVIDER_API_KEY}}',
        'JWT_SECRET={{JWT_SECRET}}',
        'OTP_HASH_SECRET={{OTP_HASH_SECRET}}',
        'OTP_TTL_SECONDS=300',
        '',
      ].join('\n'),
    },
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildPaymentWebhookArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const files: Array<GeneratedFile> = [
    {
      path: 'generated/payment-webhook/payment-webhook.module.ts',
      contentType: 'text/typescript',
      content: buildPaymentWebhookModuleSource(),
    },
    {
      path: 'generated/payment-webhook/payment-webhook.controller.ts',
      contentType: 'text/typescript',
      content: buildPaymentWebhookControllerSource(),
    },
    {
      path: 'generated/payment-webhook/payment-webhook.service.ts',
      contentType: 'text/typescript',
      content: buildPaymentWebhookServiceSource(),
    },
    {
      path: 'generated/payment-webhook/dto/payment-webhook.dto.ts',
      contentType: 'text/typescript',
      content: buildPaymentWebhookDtoSource(),
    },
    {
      path: 'generated/payment-webhook/providers/signature-verifier.provider.ts',
      contentType: 'text/typescript',
      content: buildSignatureVerifierProviderSource(),
    },
    {
      path: 'generated/payment-webhook/providers/email.provider.ts',
      contentType: 'text/typescript',
      content: buildEmailProviderSource(),
    },
    {
      path: 'generated/payment-webhook/types/payment-webhook.types.ts',
      contentType: 'text/typescript',
      content: buildPaymentWebhookTypesSource(),
    },
    {
      path: 'generated/payment-webhook/README.md',
      contentType: 'text/markdown',
      content: buildPaymentWebhookReadme(context),
    },
    {
      path: 'generated/payment-webhook/.env.example',
      contentType: 'text/plain',
      content: [
        'WEBHOOK_SIGNING_SECRET={{WEBHOOK_SIGNING_SECRET}}',
        'EMAIL_PROVIDER_URL=https://email-provider.example.com/messages',
        'EMAIL_PROVIDER_API_KEY={{EMAIL_PROVIDER_API_KEY}}',
        'PAYMENT_RECEIPT_FROM=billing@example.com',
        '',
      ].join('\n'),
    },
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildOtpAuthModuleSource(): string {
  return [
    "import { Module } from '@nestjs/common';",
    "import { OtpAuthController } from './otp-auth.controller';",
    "import { OtpAuthService } from './otp-auth.service';",
    "import { InMemoryOtpStore } from './providers/otp-store.provider';",
    "import { SmsProvider } from './providers/sms.provider';",
    '',
    '@Module({',
    '  controllers: [OtpAuthController],',
    '  providers: [OtpAuthService, InMemoryOtpStore, SmsProvider],',
    '  exports: [OtpAuthService],',
    '})',
    'export class OtpAuthModule {}',
  ].join('\n');
}

function buildOtpAuthControllerSource(): string {
  return [
    "import { Body, Controller, Post } from '@nestjs/common';",
    "import { RequestOtpDto } from './dto/request-otp.dto';",
    "import { VerifyOtpDto } from './dto/verify-otp.dto';",
    "import { OtpAuthService } from './otp-auth.service';",
    '',
    "@Controller('auth/otp')",
    'export class OtpAuthController {',
    '  constructor(private readonly otpAuthService: OtpAuthService) {}',
    '',
    "  @Post('request')",
    '  requestOtp(@Body() dto: RequestOtpDto) {',
    '    return this.otpAuthService.requestOtp(dto);',
    '  }',
    '',
    "  @Post('verify')",
    '  verifyOtp(@Body() dto: VerifyOtpDto) {',
    '    return this.otpAuthService.verifyOtp(dto);',
    '  }',
    '}',
  ].join('\n');
}

function buildOtpAuthServiceSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { createHmac, randomInt } from 'crypto';",
    "import { RequestOtpDto } from './dto/request-otp.dto';",
    "import { VerifyOtpDto } from './dto/verify-otp.dto';",
    "import { InMemoryOtpStore } from './providers/otp-store.provider';",
    "import { SmsProvider } from './providers/sms.provider';",
    "import type { RequestOtpResult, VerifyOtpResult } from './types/otp-auth.types';",
    '',
    '@Injectable()',
    'export class OtpAuthService {',
    '  constructor(',
    '    private readonly otpStore: InMemoryOtpStore,',
    '    private readonly smsProvider: SmsProvider,',
    '  ) {}',
    '',
    '  async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResult> {',
    '    const ttlSeconds = Number(process.env.OTP_TTL_SECONDS ?? 300);',
    '    const otp = randomInt(0, 1_000_000).toString().padStart(6, "0");',
    '',
    '    await this.otpStore.save(dto.phoneNumber, otp, ttlSeconds, 3);',
    '    await this.smsProvider.sendOtp(dto.phoneNumber, otp);',
    '',
    '    return { ok: true, expiresInSeconds: ttlSeconds };',
    '  }',
    '',
    '  async verifyOtp(dto: VerifyOtpDto): Promise<VerifyOtpResult> {',
    '    const verified = await this.otpStore.verify(dto.phoneNumber, dto.otp);',
    '',
    '    if (!verified) {',
    '      return { ok: false, reason: "INVALID_OTP" };',
    '    }',
    '',
    '    return {',
    '      ok: true,',
    '      accessToken: this.createAccessToken(dto.phoneNumber),',
    '    };',
    '  }',
    '',
    '  private createAccessToken(subject: string): string {',
    '    const secret = process.env.JWT_SECRET;',
    '',
    '    if (!secret) {',
    '      throw new Error("JWT_SECRET is required to issue OTP auth tokens.");',
    '    }',
    '',
    '    const header = this.encodeJwtPart({ alg: "HS256", typ: "JWT" });',
    '    const payload = this.encodeJwtPart({',
    '      sub: subject,',
    '      iat: Math.floor(Date.now() / 1000),',
    '    });',
    '    const signature = createHmac("sha256", secret)',
    '      .update(`${header}.${payload}`)',
    '      .digest("base64url");',
    '',
    '    return `${header}.${payload}.${signature}`;',
    '  }',
    '',
    '  private encodeJwtPart(value: Record<string, unknown>): string {',
    '    return Buffer.from(JSON.stringify(value)).toString("base64url");',
    '  }',
    '}',
  ].join('\n');
}

function buildOtpStoreProviderSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { createHash } from 'crypto';",
    '',
    'type StoredOtp = {',
    '  otpHash: string;',
    '  expiresAt: number;',
    '  attempts: number;',
    '  maxAttempts: number;',
    '};',
    '',
    '@Injectable()',
    'export class InMemoryOtpStore {',
    '  private readonly records = new Map<string, StoredOtp>();',
    '',
    '  async save(',
    '    phoneNumber: string,',
    '    otp: string,',
    '    ttlSeconds: number,',
    '    maxAttempts: number,',
    '  ): Promise<void> {',
    '    this.records.set(phoneNumber, {',
    '      otpHash: this.hashOtp(otp),',
    '      expiresAt: Date.now() + ttlSeconds * 1000,',
    '      attempts: 0,',
    '      maxAttempts,',
    '    });',
    '  }',
    '',
    '  async verify(phoneNumber: string, otp: string): Promise<boolean> {',
    '    const record = this.records.get(phoneNumber);',
    '',
    '    if (!record || record.expiresAt < Date.now()) {',
    '      this.records.delete(phoneNumber);',
    '      return false;',
    '    }',
    '',
    '    if (record.attempts >= record.maxAttempts) {',
    '      this.records.delete(phoneNumber);',
    '      return false;',
    '    }',
    '',
    '    record.attempts += 1;',
    '    const verified = record.otpHash === this.hashOtp(otp);',
    '',
    '    if (verified) {',
    '      this.records.delete(phoneNumber);',
    '    }',
    '',
    '    return verified;',
    '  }',
    '',
    '  private hashOtp(otp: string): string {',
    '    const secret = process.env.OTP_HASH_SECRET;',
    '',
    '    if (!secret) {',
    '      throw new Error("OTP_HASH_SECRET is required to hash OTP values.");',
    '    }',
    '',
    '    return createHash("sha256").update(`${secret}:${otp}`).digest("hex");',
    '  }',
    '}',
  ].join('\n');
}

function buildSmsProviderSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    '',
    '@Injectable()',
    'export class SmsProvider {',
    '  async sendOtp(phoneNumber: string, otp: string): Promise<void> {',
    '    const endpoint = process.env.SMS_PROVIDER_URL;',
    '    const apiKey = process.env.SMS_PROVIDER_API_KEY;',
    '',
    '    if (!endpoint) {',
    '      throw new Error("SMS_PROVIDER_URL is required to send OTP messages.");',
    '    }',
    '',
    '    if (!apiKey) {',
    '      throw new Error("SMS_PROVIDER_API_KEY is required to send OTP messages.");',
    '    }',
    '',
    '    const response = await fetch(endpoint, {',
    '      method: "POST",',
    '      headers: {',
    '        "Authorization": `Bearer ${apiKey}`,',
    '        "Content-Type": "application/json",',
    '      },',
    '      body: JSON.stringify({',
    '        to: phoneNumber,',
    '        message: `Your verification code is ${otp}`,',
    '      }),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new Error(`SMS provider request failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildOtpAuthTypesSource(): string {
  return [
    'export type RequestOtpResult = {',
    '  ok: true;',
    '  expiresInSeconds: number;',
    '};',
    '',
    'export type VerifyOtpResult =',
    '  | { ok: true; accessToken: string }',
    '  | { ok: false; reason: "INVALID_OTP" };',
    '',
    'export type OtpSessionMetadata = {',
    '  phoneNumber: string;',
    '  expiresAt: number;',
    '  attemptsRemaining: number;',
    '};',
  ].join('\n');
}

function buildPaymentWebhookModuleSource(): string {
  return [
    "import { Module } from '@nestjs/common';",
    "import { PaymentWebhookController } from './payment-webhook.controller';",
    "import { PaymentWebhookService } from './payment-webhook.service';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { SignatureVerifierProvider } from './providers/signature-verifier.provider';",
    '',
    '@Module({',
    '  controllers: [PaymentWebhookController],',
    '  providers: [PaymentWebhookService, SignatureVerifierProvider, EmailProvider],',
    '  exports: [PaymentWebhookService],',
    '})',
    'export class PaymentWebhookModule {}',
  ].join('\n');
}

function buildPaymentWebhookControllerSource(): string {
  return [
    "import { Body, Controller, Headers, Post } from '@nestjs/common';",
    "import { PaymentWebhookDto } from './dto/payment-webhook.dto';",
    "import { PaymentWebhookService } from './payment-webhook.service';",
    '',
    "@Controller('webhooks/payment')",
    'export class PaymentWebhookController {',
    '  constructor(private readonly paymentWebhookService: PaymentWebhookService) {}',
    '',
    '  @Post()',
    '  handlePaymentWebhook(',
    '    @Body() dto: PaymentWebhookDto,',
    '    @Headers("x-provider-signature") signature?: string,',
    '  ) {',
    '    return this.paymentWebhookService.handleWebhook(dto, signature);',
    '  }',
    '}',
  ].join('\n');
}

function buildPaymentWebhookServiceSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { PaymentWebhookDto } from './dto/payment-webhook.dto';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { SignatureVerifierProvider } from './providers/signature-verifier.provider';",
    "import type { PaymentWebhookResult } from './types/payment-webhook.types';",
    '',
    '@Injectable()',
    'export class PaymentWebhookService {',
    '  constructor(',
    '    private readonly signatureVerifier: SignatureVerifierProvider,',
    '    private readonly emailProvider: EmailProvider,',
    '  ) {}',
    '',
    '  async handleWebhook(',
    '    dto: PaymentWebhookDto,',
    '    signature?: string,',
    '  ): Promise<PaymentWebhookResult> {',
    '    const signatureValid = this.signatureVerifier.verify(',
    '      JSON.stringify(dto),',
    '      signature,',
    '    );',
    '',
    '    if (!signatureValid) {',
    '      return { accepted: false, reason: "INVALID_SIGNATURE" };',
    '    }',
    '',
    '    if (dto.type !== "payment.succeeded") {',
    '      return { accepted: true, action: "ignored" };',
    '    }',
    '',
    '    await this.emailProvider.sendPaymentReceipt(dto);',
    '',
    '    return { accepted: true, action: "payment_recorded" };',
    '  }',
    '}',
  ].join('\n');
}

function buildPaymentWebhookDtoSource(): string {
  return [
    'export class PaymentWebhookDto {',
    '  id!: string;',
    '  type!: string;',
    '  data!: Record<string, unknown>;',
    '  created?: number;',
    '}',
  ].join('\n');
}

function buildSignatureVerifierProviderSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { createHmac, timingSafeEqual } from 'crypto';",
    '',
    '@Injectable()',
    'export class SignatureVerifierProvider {',
    '  verify(payload: string, signature?: string): boolean {',
    '    const secret = process.env.WEBHOOK_SIGNING_SECRET;',
    '',
    '    if (!secret) {',
    '      throw new Error("WEBHOOK_SIGNING_SECRET is required to verify payment webhooks.");',
    '    }',
    '',
    '    if (!signature) {',
    '      return false;',
    '    }',
    '',
    '    const expected = createHmac("sha256", secret)',
    '      .update(payload)',
    '      .digest("hex");',
    '    const received = signature.replace(/^sha256=/, "");',
    '',
    '    return this.safeCompare(received, expected);',
    '  }',
    '',
    '  private safeCompare(received: string, expected: string): boolean {',
    '    const receivedBuffer = Buffer.from(received);',
    '    const expectedBuffer = Buffer.from(expected);',
    '',
    '    if (receivedBuffer.length !== expectedBuffer.length) {',
    '      return false;',
    '    }',
    '',
    '    return timingSafeEqual(receivedBuffer, expectedBuffer);',
    '  }',
    '}',
  ].join('\n');
}

function buildEmailProviderSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { PaymentWebhookDto } from '../dto/payment-webhook.dto';",
    '',
    '@Injectable()',
    'export class EmailProvider {',
    '  async sendPaymentReceipt(webhook: PaymentWebhookDto): Promise<void> {',
    '    const endpoint = process.env.EMAIL_PROVIDER_URL;',
    '    const apiKey = process.env.EMAIL_PROVIDER_API_KEY;',
    '    const from = process.env.PAYMENT_RECEIPT_FROM ?? "billing@example.com";',
    '    const customerEmail = this.readCustomerEmail(webhook);',
    '',
    '    if (!endpoint) {',
    '      throw new Error("EMAIL_PROVIDER_URL is required to send payment emails.");',
    '    }',
    '',
    '    if (!apiKey) {',
    '      throw new Error("EMAIL_PROVIDER_API_KEY is required to send payment emails.");',
    '    }',
    '',
    '    if (!customerEmail) {',
    '      return;',
    '    }',
    '',
    '    const response = await fetch(endpoint, {',
    '      method: "POST",',
    '      headers: {',
    '        "Authorization": `Bearer ${apiKey}`,',
    '        "Content-Type": "application/json",',
    '      },',
    '      body: JSON.stringify({',
    '        from,',
    '        to: customerEmail,',
    '        subject: "Payment received",',
    '        text: `Payment event ${webhook.id} was processed successfully.`,',
    '      }),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new Error(`Email provider request failed with ${response.status}`);',
    '    }',
    '  }',
    '',
    '  private readCustomerEmail(webhook: PaymentWebhookDto): string | null {',
    '    const email = webhook.data["customerEmail"] ?? webhook.data["email"];',
    '',
    '    return typeof email === "string" && email.trim() ? email.trim() : null;',
    '  }',
    '}',
  ].join('\n');
}

function buildPaymentWebhookTypesSource(): string {
  return [
    'export type PaymentWebhookResult =',
    '  | { accepted: true; action: "payment_recorded" | "ignored" }',
    '  | { accepted: false; reason: "INVALID_SIGNATURE" };',
    '',
    'export type PaymentProviderEvent = {',
    '  id: string;',
    '  type: string;',
    '  data: Record<string, unknown>;',
    '  created?: number;',
    '};',
  ].join('\n');
}

function buildOtpAuthReadme(context: GeneratorContext): string {
  return [
    '# OTP Auth Module',
    '',
    `Generated from FORGE workflow "${context.workflow.name}".`,
    '',
    '## Files',
    '',
    '- `otp-auth.module.ts` wires the controller, service, and providers.',
    '- `otp-auth.controller.ts` exposes `POST /auth/otp/request` and `POST /auth/otp/verify`.',
    '- `otp-auth.service.ts` coordinates OTP creation, delivery, verification, and JWT signing.',
    '- `providers/otp-store.provider.ts` is an in-memory OTP store. Replace it with Redis or Postgres for production.',
    '- `providers/sms.provider.ts` is the SMS integration boundary.',
    '',
    '## Usage',
    '',
    '1. Copy `generated/otp-auth` into your NestJS source tree.',
    '2. Import `OtpAuthModule` in your application module.',
    '3. Add the variables from `.env.example` to your runtime environment.',
    '4. Replace `SmsProvider.deliver` with your SMS provider implementation.',
    '',
    'No provider credentials are generated. Secret values are represented with placeholders only.',
    '',
  ].join('\n');
}

function buildPaymentWebhookReadme(context: GeneratorContext): string {
  return [
    '# Payment Webhook Module',
    '',
    `Generated from FORGE workflow "${context.workflow.name}".`,
    '',
    '## Files',
    '',
    '- `payment-webhook.module.ts` wires the controller, service, and providers.',
    '- `payment-webhook.controller.ts` exposes `POST /webhooks/payment`.',
    '- `payment-webhook.service.ts` verifies signatures and handles successful payments.',
    '- `providers/signature-verifier.provider.ts` validates HMAC SHA-256 webhook signatures.',
    '- `providers/email.provider.ts` is the receipt email integration boundary.',
    '',
    '## Usage',
    '',
    '1. Copy `generated/payment-webhook` into your NestJS source tree.',
    '2. Import `PaymentWebhookModule` in your application module.',
    '3. Add the variables from `.env.example` to your runtime environment.',
    '4. Replace `EmailProvider.deliver` with your email provider implementation.',
    '5. If your payment provider signs the raw request body, adapt the controller to pass that raw body into `SignatureVerifierProvider.verify`.',
    '',
    'No provider credentials are generated. Secret values are represented with placeholders only.',
    '',
  ].join('\n');
}

type GeneratedFile = {
  path: string;
  contentType: GeneratedArtifactContentType;
  content: string;
};

function createFileArtifact(
  context: GeneratorContext,
  file: GeneratedFile,
): GeneratedArtifactEntity {
  return createArtifact(context, {
    type: 'backend_module',
    name: file.path,
    contentType: file.contentType,
    value: file.content,
  });
}

function createArtifact(
  context: GeneratorContext,
  input: {
    type: GeneratedArtifactType;
    name: string;
    contentType: GeneratedArtifactContentType;
    value: unknown;
  },
): GeneratedArtifactEntity {
  const content =
    input.contentType === 'application/json'
      ? `${stableStringify(input.value, 2)}\n`
      : `${String(input.value).trimEnd()}\n`;

  return {
    id: randomUUID(),
    projectId: context.projectId,
    workflowId: context.workflow.id,
    workflowVersionId: context.version.id,
    type: input.type,
    name: input.name,
    contentType: input.contentType,
    checksum: createHash('sha256').update(content).digest('hex'),
    content,
    createdAt: new Date(),
  };
}

function isPaymentWebhookWorkflow(nodes: CanvasNode[]): boolean {
  return nodes.some((node) =>
    ['webhookTrigger', 'verifySignature'].includes(node.nodeType),
  );
}

function isOtpAuthWorkflow(nodes: CanvasNode[]): boolean {
  return nodes.some((node) =>
    ['generateOtp', 'verifyOtp'].includes(node.nodeType),
  );
}

function readCanvasNode(value: unknown): CanvasNode {
  const node = isRecord(value) ? value : {};
  const data = isRecord(node.data) ? node.data : {};
  const label =
    typeof data.label === 'string'
      ? data.label
      : typeof node.label === 'string'
        ? node.label
        : 'Untitled Node';
  const nodeType =
    typeof data.type === 'string'
      ? data.type
      : typeof node.type === 'string'
        ? node.type
        : 'unknown';
  const config = isRecord(data.config)
    ? data.config
    : isRecord(node.config)
      ? node.config
      : {};

  return {
    id: typeof node.id === 'string' ? node.id : randomUUID(),
    label,
    nodeType,
    config,
  };
}

function readCanvasEdge(value: unknown): CanvasEdge {
  const edge = isRecord(value) ? value : {};
  const source = edge.source ?? edge.sourceNodeId;
  const target = edge.target ?? edge.targetNodeId;

  return {
    id: typeof edge.id === 'string' ? edge.id : randomUUID(),
    source: typeof source === 'string' ? source : null,
    target: typeof target === 'string' ? target : null,
    label: typeof edge.label === 'string' ? edge.label : null,
  };
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
