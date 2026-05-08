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

type GenerationWarning = {
  title: string;
  detail: string;
};

const SUPPORTED_BACKEND_NODE_TYPES = new Set([
  'httpTrigger',
  'webhookTrigger',
  'generateOtp',
  'verifyOtp',
  'jwtSign',
  'passwordHash',
  'createVerificationToken',
  'verifyToken',
  'generateResetToken',
  'verifyResetToken',
  'sendSms',
  'sendEmail',
  'verifySignature',
  'condition',
  'databaseWrite',
  'databaseUpdate',
  'databaseRead',
  'databaseDelete',
  'webhookResponse',
  'delay',
  'externalApiCall',
  'transformData',
]);

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
  const unsupportedNodes = getUnsupportedBackendNodes(context.nodes);

  if (unsupportedNodes.length > 0) {
    throw new BadRequestException(
      `This workflow contains nodes that are not supported for backend code generation yet: ${unsupportedNodes
        .map((node) => `${node.label} (${node.nodeType})`)
        .join(', ')}.`,
    );
  }

  if (isPaymentWebhookWorkflow(context.nodes)) {
    return buildPaymentWebhookArtifacts(context);
  }

  if (isPasswordResetWorkflow(context.nodes)) {
    return buildPasswordResetArtifacts(context);
  }

  if (isEmailVerificationWorkflow(context.nodes)) {
    return buildEmailVerificationArtifacts(context);
  }

  if (isOtpAuthWorkflow(context.nodes)) {
    return buildOtpAuthArtifacts(context);
  }

  if (isUserOnboardingWorkflow(context.nodes)) {
    return buildUserOnboardingArtifacts(context);
  }

  return buildGenericWorkflowArtifacts(context, [
    {
      title: 'Workflow skeleton generated',
      detail:
        'This workflow uses supported nodes but does not match a specialized backend module template yet. Review the service TODOs before production use.',
    },
  ]);
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
  const otpLength = getOtpLength(context.nodes);
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
      content: buildOtpAuthServiceSource(otpLength),
    },
    {
      path: 'generated/otp-auth/dto/request-otp.dto.ts',
      contentType: 'text/typescript',
      content: buildRequestOtpDtoSource(),
    },
    {
      path: 'generated/otp-auth/dto/verify-otp.dto.ts',
      contentType: 'text/typescript',
      content: buildVerifyOtpDtoSource(otpLength),
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
        'SMS_PROVIDER_URL=https://example.com/send',
        'SMS_PROVIDER_API_KEY=replace_with_sms_api_key',
        'JWT_SECRET=replace_with_secure_secret',
        'JWT_EXPIRES_IN=15m',
        'OTP_HASH_SECRET=replace_with_otp_hash_secret',
        `OTP_TTL_SECONDS=${getOtpTtlSeconds(context.nodes)}`,
        '',
      ].join('\n'),
    },
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildPaymentWebhookArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const signatureHeaderName = getSignatureHeaderName(context.nodes);
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
      path: 'generated/payment-webhook/providers/subscription.repository.ts',
      contentType: 'text/typescript',
      content: buildSubscriptionRepositorySource(),
    },
    {
      path: 'generated/payment-webhook/types/payment-webhook.types.ts',
      contentType: 'text/typescript',
      content: buildPaymentWebhookTypesSource(signatureHeaderName),
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
        `WEBHOOK_SIGNATURE_HEADER=${signatureHeaderName}`,
        'WEBHOOK_SIGNING_SECRET=replace_with_webhook_secret',
        'EMAIL_PROVIDER_URL=https://example.com/send-email',
        'EMAIL_PROVIDER_API_KEY=replace_with_email_api_key',
        'PAYMENT_RECEIPT_FROM=billing@example.com',
        'SUBSCRIPTION_API_URL=https://example.com/subscriptions',
        '',
      ].join('\n'),
    },
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildEmailVerificationArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const files: Array<GeneratedFile> = [
    moduleFile(
      'email-verification',
      buildAuthUtilityModuleSource('EmailVerification', 'email-verification'),
    ),
    controllerFile(
      'email-verification',
      buildEmailVerificationControllerSource(),
    ),
    serviceFile('email-verification', buildEmailVerificationServiceSource()),
    {
      path: 'generated/email-verification/dto/create-verification.dto.ts',
      contentType: 'text/typescript',
      content: buildEmailDtoSource('CreateVerificationDto', 'email'),
    },
    {
      path: 'generated/email-verification/dto/verify-email.dto.ts',
      contentType: 'text/typescript',
      content: buildTokenDtoSource('VerifyEmailDto', 'email', 'token'),
    },
    tokenStoreFile('email-verification', 'token-store.provider.ts'),
    emailProviderFile('email-verification'),
    userRepositoryFile('email-verification'),
    {
      path: 'generated/email-verification/types/email-verification.types.ts',
      contentType: 'text/typescript',
      content: buildEmailVerificationTypesSource(),
    },
    readmeFile(
      'email-verification',
      buildLifecycleReadme(
        context,
        'Email Verification Module',
        'creates verification tokens, sends verification emails, and marks users as verified.',
      ),
    ),
    envFile('email-verification', [
      'EMAIL_PROVIDER_URL=https://example.com/send-email',
      'EMAIL_PROVIDER_API_KEY=replace_with_email_api_key',
      'EMAIL_FROM=no-reply@example.com',
      'TOKEN_HASH_SECRET=replace_with_token_hash_secret',
      'USER_API_URL=https://example.com/users',
    ]),
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildPasswordResetArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const files: Array<GeneratedFile> = [
    moduleFile('password-reset', buildPasswordResetModuleSource()),
    controllerFile('password-reset', buildPasswordResetControllerSource()),
    serviceFile('password-reset', buildPasswordResetServiceSource()),
    {
      path: 'generated/password-reset/dto/request-password-reset.dto.ts',
      contentType: 'text/typescript',
      content: buildEmailDtoSource('RequestPasswordResetDto', 'email'),
    },
    {
      path: 'generated/password-reset/dto/confirm-password-reset.dto.ts',
      contentType: 'text/typescript',
      content: buildPasswordResetConfirmDtoSource(),
    },
    tokenStoreFile('password-reset', 'token-store.provider.ts'),
    emailProviderFile('password-reset'),
    userPasswordRepositoryFile('password-reset'),
    {
      path: 'generated/password-reset/types/password-reset.types.ts',
      contentType: 'text/typescript',
      content: buildPasswordResetTypesSource(),
    },
    readmeFile(
      'password-reset',
      buildLifecycleReadme(
        context,
        'Password Reset Module',
        'creates reset tokens, sends reset emails, verifies submitted tokens, and updates user passwords through a repository boundary.',
      ),
    ),
    envFile('password-reset', [
      'EMAIL_PROVIDER_URL=https://example.com/send-email',
      'EMAIL_PROVIDER_API_KEY=replace_with_email_api_key',
      'EMAIL_FROM=no-reply@example.com',
      'TOKEN_HASH_SECRET=replace_with_token_hash_secret',
      'USER_PASSWORD_API_URL=https://example.com/users/password',
    ]),
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildUserOnboardingArtifacts(
  context: GeneratorContext,
): GeneratedArtifactEntity[] {
  const files: Array<GeneratedFile> = [
    moduleFile('user-onboarding', buildOnboardingModuleSource()),
    controllerFile('user-onboarding', buildOnboardingControllerSource()),
    serviceFile('user-onboarding', buildOnboardingServiceSource()),
    {
      path: 'generated/user-onboarding/dto/create-user.dto.ts',
      contentType: 'text/typescript',
      content: buildCreateUserDtoSource(),
    },
    emailProviderFile('user-onboarding'),
    userRepositoryFile('user-onboarding'),
    {
      path: 'generated/user-onboarding/types/user-onboarding.types.ts',
      contentType: 'text/typescript',
      content: buildUserOnboardingTypesSource(),
    },
    readmeFile(
      'user-onboarding',
      buildLifecycleReadme(
        context,
        'User Onboarding Module',
        'creates users, sends onboarding email, and exposes repository/provider boundaries for production integrations.',
      ),
    ),
    envFile('user-onboarding', [
      'EMAIL_PROVIDER_URL=https://example.com/send-email',
      'EMAIL_PROVIDER_API_KEY=replace_with_email_api_key',
      'EMAIL_FROM=no-reply@example.com',
      'USER_API_URL=https://example.com/users',
    ]),
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function buildGenericWorkflowArtifacts(
  context: GeneratorContext,
  warnings: GenerationWarning[],
): GeneratedArtifactEntity[] {
  const moduleName = toPascalCase(
    context.workflow.slug || context.workflow.name,
  );
  const filePrefix = toKebabCase(
    context.workflow.slug || context.workflow.name,
  );
  const root = `generated/${filePrefix}`;
  const files: Array<GeneratedFile> = [
    {
      path: `${root}/${filePrefix}.module.ts`,
      contentType: 'text/typescript',
      content: buildGenericWorkflowModuleSource(moduleName, filePrefix),
    },
    {
      path: `${root}/${filePrefix}.controller.ts`,
      contentType: 'text/typescript',
      content: buildGenericWorkflowControllerSource(moduleName, filePrefix),
    },
    {
      path: `${root}/${filePrefix}.service.ts`,
      contentType: 'text/typescript',
      content: buildGenericWorkflowServiceSource(context, moduleName),
    },
    {
      path: `${root}/dto/execute-workflow.dto.ts`,
      contentType: 'text/typescript',
      content: buildGenericExecuteWorkflowDtoSource(),
    },
    {
      path: `${root}/types/${filePrefix}.types.ts`,
      contentType: 'text/typescript',
      content: buildGenericWorkflowTypesSource(moduleName),
    },
    {
      path: `${root}/README.md`,
      contentType: 'text/markdown',
      content: buildGenericWorkflowReadme(context, moduleName, warnings),
    },
    {
      path: `${root}/.env.example`,
      contentType: 'text/plain',
      content: '',
    },
    {
      path: `${root}/GENERATION_WARNINGS.md`,
      contentType: 'text/markdown',
      content: buildWarningsMarkdown(warnings),
    },
  ];

  return files.map((file) => createFileArtifact(context, file));
}

function moduleFile(slug: string, content: string): GeneratedFile {
  return {
    path: `generated/${slug}/${slug}.module.ts`,
    contentType: 'text/typescript',
    content,
  };
}

function controllerFile(slug: string, content: string): GeneratedFile {
  return {
    path: `generated/${slug}/${slug}.controller.ts`,
    contentType: 'text/typescript',
    content,
  };
}

function serviceFile(slug: string, content: string): GeneratedFile {
  return {
    path: `generated/${slug}/${slug}.service.ts`,
    contentType: 'text/typescript',
    content,
  };
}

function readmeFile(slug: string, content: string): GeneratedFile {
  return {
    path: `generated/${slug}/README.md`,
    contentType: 'text/markdown',
    content,
  };
}

function envFile(slug: string, lines: string[]): GeneratedFile {
  return {
    path: `generated/${slug}/.env.example`,
    contentType: 'text/plain',
    content: [...lines, ''].join('\n'),
  };
}

function emailProviderFile(slug: string): GeneratedFile {
  return {
    path: `generated/${slug}/providers/email.provider.ts`,
    contentType: 'text/typescript',
    content: buildGenericEmailProviderSource(),
  };
}

function userRepositoryFile(slug: string): GeneratedFile {
  return {
    path: `generated/${slug}/providers/user.repository.ts`,
    contentType: 'text/typescript',
    content: buildUserRepositorySource(),
  };
}

function userPasswordRepositoryFile(slug: string): GeneratedFile {
  return {
    path: `generated/${slug}/providers/user-password.repository.ts`,
    contentType: 'text/typescript',
    content: buildUserPasswordRepositorySource(),
  };
}

function tokenStoreFile(slug: string, fileName: string): GeneratedFile {
  return {
    path: `generated/${slug}/providers/${fileName}`,
    contentType: 'text/typescript',
    content: buildTokenStoreProviderSource(),
  };
}

function buildGenericWorkflowModuleSource(
  moduleName: string,
  filePrefix: string,
): string {
  return [
    "import { Module } from '@nestjs/common';",
    `import { ${moduleName}Controller } from './${filePrefix}.controller';`,
    `import { ${moduleName}Service } from './${filePrefix}.service';`,
    '',
    '@Module({',
    `  controllers: [${moduleName}Controller],`,
    `  providers: [${moduleName}Service],`,
    `  exports: [${moduleName}Service],`,
    '})',
    `export class ${moduleName}Module {}`,
  ].join('\n');
}

function buildAuthUtilityModuleSource(
  moduleName: string,
  slug: string,
): string {
  return [
    "import { Module } from '@nestjs/common';",
    `import { ${moduleName}Controller } from './${slug}.controller';`,
    `import { ${moduleName}Service } from './${slug}.service';`,
    "import { EmailProvider } from './providers/email.provider';",
    "import { TokenStoreProvider } from './providers/token-store.provider';",
    "import { UserRepository } from './providers/user.repository';",
    '',
    '@Module({',
    `  controllers: [${moduleName}Controller],`,
    `  providers: [${moduleName}Service, TokenStoreProvider, UserRepository, EmailProvider],`,
    `  exports: [${moduleName}Service],`,
    '})',
    `export class ${moduleName}Module {}`,
  ].join('\n');
}

function buildPasswordResetModuleSource(): string {
  return [
    "import { Module } from '@nestjs/common';",
    "import { PasswordResetController } from './password-reset.controller';",
    "import { PasswordResetService } from './password-reset.service';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { TokenStoreProvider } from './providers/token-store.provider';",
    "import { UserPasswordRepository } from './providers/user-password.repository';",
    '',
    '@Module({',
    '  controllers: [PasswordResetController],',
    '  providers: [PasswordResetService, TokenStoreProvider, UserPasswordRepository, EmailProvider],',
    '  exports: [PasswordResetService],',
    '})',
    'export class PasswordResetModule {}',
  ].join('\n');
}

function buildEmailVerificationControllerSource(): string {
  return [
    "import { Body, Controller, Post } from '@nestjs/common';",
    "import { CreateVerificationDto } from './dto/create-verification.dto';",
    "import { VerifyEmailDto } from './dto/verify-email.dto';",
    "import { EmailVerificationService } from './email-verification.service';",
    '',
    "@Controller('auth/email')",
    'export class EmailVerificationController {',
    '  constructor(private readonly service: EmailVerificationService) {}',
    '',
    "  @Post('verification')",
    '  createVerification(@Body() dto: CreateVerificationDto) {',
    '    return this.service.createVerification(dto);',
    '  }',
    '',
    "  @Post('verify')",
    '  verifyEmail(@Body() dto: VerifyEmailDto) {',
    '    return this.service.verifyEmail(dto);',
    '  }',
    '}',
  ].join('\n');
}

function buildEmailVerificationServiceSource(): string {
  return [
    "import { Injectable, UnauthorizedException } from '@nestjs/common';",
    "import { randomBytes } from 'crypto';",
    "import { CreateVerificationDto } from './dto/create-verification.dto';",
    "import { VerifyEmailDto } from './dto/verify-email.dto';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { TokenStoreProvider } from './providers/token-store.provider';",
    "import { UserRepository } from './providers/user.repository';",
    "import type { CreateVerificationResult, VerifyEmailResult } from './types/email-verification.types';",
    '',
    '@Injectable()',
    'export class EmailVerificationService {',
    '  constructor(',
    '    private readonly tokenStore: TokenStoreProvider,',
    '    private readonly users: UserRepository,',
    '    private readonly emailProvider: EmailProvider,',
    '  ) {}',
    '',
    '  async createVerification(dto: CreateVerificationDto): Promise<CreateVerificationResult> {',
    '    const token = randomBytes(24).toString("hex");',
    '    await this.tokenStore.saveToken(dto.email, token, 3600);',
    '    await this.emailProvider.sendEmail(dto.email, "Verify your email", `Use this verification token: ${token}`);',
    '    return { ok: true };',
    '  }',
    '',
    '  async verifyEmail(dto: VerifyEmailDto): Promise<VerifyEmailResult> {',
    '    const verified = await this.tokenStore.verifyToken(dto.email, dto.token);',
    '    if (!verified) {',
    '      throw new UnauthorizedException("Invalid or expired verification token.");',
    '    }',
    '    await this.users.markEmailVerified(dto.email);',
    '    return { ok: true, verified: true };',
    '  }',
    '}',
  ].join('\n');
}

function buildPasswordResetControllerSource(): string {
  return [
    "import { Body, Controller, Post } from '@nestjs/common';",
    "import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';",
    "import { RequestPasswordResetDto } from './dto/request-password-reset.dto';",
    "import { PasswordResetService } from './password-reset.service';",
    '',
    "@Controller('auth/password-reset')",
    'export class PasswordResetController {',
    '  constructor(private readonly service: PasswordResetService) {}',
    '',
    "  @Post('request')",
    '  requestReset(@Body() dto: RequestPasswordResetDto) {',
    '    return this.service.requestReset(dto);',
    '  }',
    '',
    "  @Post('confirm')",
    '  confirmReset(@Body() dto: ConfirmPasswordResetDto) {',
    '    return this.service.confirmReset(dto);',
    '  }',
    '}',
  ].join('\n');
}

function buildPasswordResetServiceSource(): string {
  return [
    "import { Injectable, UnauthorizedException } from '@nestjs/common';",
    "import { randomBytes, scryptSync } from 'crypto';",
    "import { ConfirmPasswordResetDto } from './dto/confirm-password-reset.dto';",
    "import { RequestPasswordResetDto } from './dto/request-password-reset.dto';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { TokenStoreProvider } from './providers/token-store.provider';",
    "import { UserPasswordRepository } from './providers/user-password.repository';",
    "import type { PasswordResetResult, RequestPasswordResetResult } from './types/password-reset.types';",
    '',
    '@Injectable()',
    'export class PasswordResetService {',
    '  constructor(',
    '    private readonly tokenStore: TokenStoreProvider,',
    '    private readonly users: UserPasswordRepository,',
    '    private readonly emailProvider: EmailProvider,',
    '  ) {}',
    '',
    '  async requestReset(dto: RequestPasswordResetDto): Promise<RequestPasswordResetResult> {',
    '    const token = randomBytes(24).toString("hex");',
    '    await this.tokenStore.saveToken(dto.email, token, 1800);',
    '    await this.emailProvider.sendEmail(dto.email, "Reset your password", `Use this reset token: ${token}`);',
    '    return { ok: true };',
    '  }',
    '',
    '  async confirmReset(dto: ConfirmPasswordResetDto): Promise<PasswordResetResult> {',
    '    const verified = await this.tokenStore.verifyToken(dto.email, dto.resetToken);',
    '    if (!verified) {',
    '      throw new UnauthorizedException("Invalid or expired password reset token.");',
    '    }',
    '    const salt = randomBytes(16).toString("hex");',
    '    const passwordHash = `${salt}:${scryptSync(dto.password, salt, 64).toString("hex")}`;',
    '    await this.users.updatePasswordHash(dto.email, passwordHash);',
    '    return { ok: true, passwordUpdated: true };',
    '  }',
    '}',
  ].join('\n');
}

function buildOnboardingModuleSource(): string {
  return [
    "import { Module } from '@nestjs/common';",
    "import { UserOnboardingController } from './user-onboarding.controller';",
    "import { UserOnboardingService } from './user-onboarding.service';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { UserRepository } from './providers/user.repository';",
    '',
    '@Module({',
    '  controllers: [UserOnboardingController],',
    '  providers: [UserOnboardingService, UserRepository, EmailProvider],',
    '  exports: [UserOnboardingService],',
    '})',
    'export class UserOnboardingModule {}',
  ].join('\n');
}

function buildOnboardingControllerSource(): string {
  return [
    "import { Body, Controller, Post } from '@nestjs/common';",
    "import { CreateUserDto } from './dto/create-user.dto';",
    "import { UserOnboardingService } from './user-onboarding.service';",
    '',
    "@Controller('users')",
    'export class UserOnboardingController {',
    '  constructor(private readonly service: UserOnboardingService) {}',
    '',
    '  @Post()',
    '  createUser(@Body() dto: CreateUserDto) {',
    '    return this.service.createUser(dto);',
    '  }',
    '}',
  ].join('\n');
}

function buildOnboardingServiceSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { CreateUserDto } from './dto/create-user.dto';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { UserRepository } from './providers/user.repository';",
    "import type { UserOnboardingResult } from './types/user-onboarding.types';",
    '',
    '@Injectable()',
    'export class UserOnboardingService {',
    '  constructor(',
    '    private readonly users: UserRepository,',
    '    private readonly emailProvider: EmailProvider,',
    '  ) {}',
    '',
    '  async createUser(dto: CreateUserDto): Promise<UserOnboardingResult> {',
    '    const user = await this.users.createUser(dto);',
    '    await this.emailProvider.sendEmail(dto.email, "Welcome", "Your account has been created.");',
    '    return { ok: true, userId: user.id };',
    '  }',
    '}',
  ].join('\n');
}

function buildGenericWorkflowControllerSource(
  moduleName: string,
  filePrefix: string,
): string {
  return [
    "import { Body, Controller, Post } from '@nestjs/common';",
    "import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';",
    `import { ${moduleName}Service } from './${filePrefix}.service';`,
    '',
    `@Controller('${filePrefix}')`,
    `export class ${moduleName}Controller {`,
    `  constructor(private readonly workflowService: ${moduleName}Service) {}`,
    '',
    '  @Post()',
    '  execute(@Body() dto: ExecuteWorkflowDto) {',
    '    return this.workflowService.execute(dto);',
    '  }',
    '}',
  ].join('\n');
}

function buildGenericWorkflowServiceSource(
  context: GeneratorContext,
  moduleName: string,
): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { ExecuteWorkflowDto } from './dto/execute-workflow.dto';",
    `import type { ${moduleName}Result } from './types/${toKebabCase(
      context.workflow.slug || context.workflow.name,
    )}.types';`,
    '',
    '@Injectable()',
    `export class ${moduleName}Service {`,
    `  async execute(dto: ExecuteWorkflowDto): Promise<${moduleName}Result> {`,
    '    return {',
    '      status: "requires_implementation",',
    `      workflowId: ${JSON.stringify(context.workflow.id)},`,
    `      nodeCount: ${context.nodes.length},`,
    '      input: dto.input ?? {},',
    '      warnings: [',
    '        "This generated module is a typed skeleton for a supported-node workflow.",',
    '        "Add concrete provider implementations before production use.",',
    '      ],',
    '    };',
    '  }',
    '}',
  ].join('\n');
}

function buildGenericExecuteWorkflowDtoSource(): string {
  return [
    "import { IsObject, IsOptional } from 'class-validator';",
    '',
    'export class ExecuteWorkflowDto {',
    '  @IsOptional()',
    '  @IsObject()',
    '  input?: Record<string, unknown>;',
    '}',
  ].join('\n');
}

function buildEmailDtoSource(className: string, fieldName: string): string {
  return [
    "import { IsEmail, IsNotEmpty, IsString } from 'class-validator';",
    '',
    `export class ${className} {`,
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @IsEmail()',
    `  ${fieldName}!: string;`,
    '}',
  ].join('\n');
}

function buildTokenDtoSource(
  className: string,
  emailField: string,
  tokenField: string,
): string {
  return [
    "import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';",
    '',
    `export class ${className} {`,
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @IsEmail()',
    `  ${emailField}!: string;`,
    '',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @MinLength(16)',
    `  ${tokenField}!: string;`,
    '}',
  ].join('\n');
}

function buildPasswordResetConfirmDtoSource(): string {
  return [
    "import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';",
    '',
    'export class ConfirmPasswordResetDto {',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @IsEmail()',
    '  email!: string;',
    '',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @MinLength(16)',
    '  resetToken!: string;',
    '',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @MinLength(8)',
    '  password!: string;',
    '}',
  ].join('\n');
}

function buildCreateUserDtoSource(): string {
  return [
    "import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';",
    '',
    'export class CreateUserDto {',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  name!: string;',
    '',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  @IsEmail()',
    '  email!: string;',
    '',
    '  @IsOptional()',
    '  @IsString()',
    '  phoneNumber?: string;',
    '}',
  ].join('\n');
}

function buildTokenStoreProviderSource(): string {
  return [
    "import { Injectable, ServiceUnavailableException } from '@nestjs/common';",
    "import { createHash } from 'crypto';",
    '',
    'type StoredToken = { tokenHash: string; expiresAt: number };',
    '',
    '// Demo-only in-memory token store. Replace with Redis or a database table before production.',
    '@Injectable()',
    'export class TokenStoreProvider {',
    '  private readonly records = new Map<string, StoredToken>();',
    '',
    '  async saveToken(subject: string, token: string, ttlSeconds: number): Promise<void> {',
    '    this.records.set(subject, {',
    '      tokenHash: this.hashToken(token),',
    '      expiresAt: Date.now() + ttlSeconds * 1000,',
    '    });',
    '  }',
    '',
    '  async verifyToken(subject: string, token: string): Promise<boolean> {',
    '    const record = this.records.get(subject);',
    '    if (!record || record.expiresAt < Date.now()) {',
    '      this.records.delete(subject);',
    '      return false;',
    '    }',
    '    const verified = record.tokenHash === this.hashToken(token);',
    '    if (verified) {',
    '      this.records.delete(subject);',
    '    }',
    '    return verified;',
    '  }',
    '',
    '  private hashToken(token: string): string {',
    '    const secret = process.env.TOKEN_HASH_SECRET;',
    '    if (!secret) {',
    '      throw new ServiceUnavailableException("TOKEN_HASH_SECRET is required to hash tokens.");',
    '    }',
    '    return createHash("sha256").update(`${secret}:${token}`).digest("hex");',
    '  }',
    '}',
  ].join('\n');
}

function buildGenericEmailProviderSource(): string {
  return [
    "import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';",
    '',
    '@Injectable()',
    'export class EmailProvider {',
    '  async sendEmail(to: string, subject: string, text: string): Promise<void> {',
    '    const endpoint = process.env.EMAIL_PROVIDER_URL;',
    '    const apiKey = process.env.EMAIL_PROVIDER_API_KEY;',
    '    const from = process.env.EMAIL_FROM ?? "no-reply@example.com";',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("EMAIL_PROVIDER_URL is required to send email.");',
    '    }',
    '    if (!apiKey) {',
    '      throw new ServiceUnavailableException("EMAIL_PROVIDER_API_KEY is required to send email.");',
    '    }',
    '    const response = await fetch(endpoint, {',
    '      method: "POST",',
    '      headers: {',
    '        "Authorization": `Bearer ${apiKey}`,',
    '        "Content-Type": "application/json",',
    '      },',
    '      body: JSON.stringify({ from, to, subject, text }),',
    '    });',
    '    if (!response.ok) {',
    '      throw new InternalServerErrorException(`Email provider request failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildUserRepositorySource(): string {
  return [
    "import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';",
    '',
    '@Injectable()',
    'export class UserRepository {',
    '  async createUser(input: { name: string; email: string; phoneNumber?: string }): Promise<{ id: string }> {',
    '    const endpoint = process.env.USER_API_URL;',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("USER_API_URL is required for user writes.");',
    '    }',
    '    const response = await fetch(endpoint, {',
    '      method: "POST",',
    '      headers: { "Content-Type": "application/json" },',
    '      body: JSON.stringify(input),',
    '    });',
    '    if (!response.ok) {',
    '      throw new InternalServerErrorException(`User repository request failed with ${response.status}`);',
    '    }',
    '    return (await response.json()) as { id: string };',
    '  }',
    '',
    '  async markEmailVerified(email: string): Promise<void> {',
    '    const endpoint = process.env.USER_API_URL;',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("USER_API_URL is required for user writes.");',
    '    }',
    '    const response = await fetch(`${endpoint}/verify-email`, {',
    '      method: "PATCH",',
    '      headers: { "Content-Type": "application/json" },',
    '      body: JSON.stringify({ email, verified: true }),',
    '    });',
    '    if (!response.ok) {',
    '      throw new InternalServerErrorException(`User verification update failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildUserPasswordRepositorySource(): string {
  return [
    "import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';",
    '',
    '@Injectable()',
    'export class UserPasswordRepository {',
    '  async updatePasswordHash(email: string, passwordHash: string): Promise<void> {',
    '    const endpoint = process.env.USER_PASSWORD_API_URL;',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("USER_PASSWORD_API_URL is required for password updates.");',
    '    }',
    '    const response = await fetch(endpoint, {',
    '      method: "PATCH",',
    '      headers: { "Content-Type": "application/json" },',
    '      body: JSON.stringify({ email, passwordHash }),',
    '    });',
    '    if (!response.ok) {',
    '      throw new InternalServerErrorException(`Password update failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildGenericWorkflowTypesSource(moduleName: string): string {
  return [
    `export type ${moduleName}Result = {`,
    '  status: "requires_implementation";',
    '  workflowId: string;',
    '  nodeCount: number;',
    '  input: Record<string, unknown>;',
    '  warnings: string[];',
    '};',
  ].join('\n');
}

function buildEmailVerificationTypesSource(): string {
  return [
    'export type CreateVerificationResult = { ok: true };',
    'export type VerifyEmailResult = { ok: true; verified: true };',
  ].join('\n');
}

function buildPasswordResetTypesSource(): string {
  return [
    'export type RequestPasswordResetResult = { ok: true };',
    'export type PasswordResetResult = { ok: true; passwordUpdated: true };',
  ].join('\n');
}

function buildUserOnboardingTypesSource(): string {
  return [
    'export type UserOnboardingResult = { ok: true; userId: string };',
  ].join('\n');
}

function buildGenericWorkflowReadme(
  context: GeneratorContext,
  moduleName: string,
  warnings: GenerationWarning[],
): string {
  return [
    `# ${moduleName} Module`,
    '',
    `Generated from FORGE workflow "${context.workflow.name}".`,
    '',
    'This is a generic NestJS workflow skeleton because the graph uses supported nodes but does not match a specialized generator template yet.',
    '',
    '## Install dependencies',
    '',
    '```bash',
    'npm install class-validator class-transformer',
    '```',
    '',
    '## Register the module',
    '',
    'Import the generated module into your NestJS application module.',
    '',
    '## Warnings',
    '',
    ...warnings.map((warning) => `- ${warning.title}: ${warning.detail}`),
    '',
    '## Production replacement points',
    '',
    '- Add concrete providers/repositories for side-effect nodes before production use.',
    '- Keep controllers thin and move workflow behavior into the service as providers become supported.',
    '',
  ].join('\n');
}

function buildLifecycleReadme(
  context: GeneratorContext,
  title: string,
  summary: string,
): string {
  return [
    `# ${title}`,
    '',
    `Generated from FORGE workflow "${context.workflow.name}".`,
    '',
    `This module ${summary}`,
    '',
    '## Install dependencies',
    '',
    '```bash',
    'npm install class-validator class-transformer',
    '```',
    '',
    'Enable NestJS validation globally if your app has not already done so.',
    '',
    '## Register the module',
    '',
    'Import the generated module into your NestJS application module.',
    '',
    '## Required environment variables',
    '',
    'See `.env.example` in this generated folder.',
    '',
    '## Production replacement points',
    '',
    '- Provider classes are generic HTTP integration boundaries.',
    '- Token stores are demo-only in-memory stores and must be replaced with Redis or a database before production.',
    '- Repository providers should be replaced with your application database/repository implementations.',
    '',
    'No provider credentials are generated. Secret values are represented with placeholders only.',
    '',
  ].join('\n');
}

function buildWarningsMarkdown(warnings: GenerationWarning[]): string {
  return [
    '# Generation Warnings',
    '',
    ...warnings.map((warning) => `- **${warning.title}**: ${warning.detail}`),
    '',
  ].join('\n');
}

function buildOtpAuthModuleSource(): string {
  return [
    "import { Module } from '@nestjs/common';",
    "import { JwtModule } from '@nestjs/jwt';",
    "import { OtpAuthController } from './otp-auth.controller';",
    "import { OtpAuthService } from './otp-auth.service';",
    "import { InMemoryOtpStore } from './providers/otp-store.provider';",
    "import { SmsProvider } from './providers/sms.provider';",
    "import { OTP_STORE } from './types/otp-auth.types';",
    '',
    '@Module({',
    '  imports: [',
    '    JwtModule.register({',
    `      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN ?? "15m" },`,
    '    }),',
    '  ],',
    '  controllers: [OtpAuthController],',
    '  providers: [',
    '    OtpAuthService,',
    '    SmsProvider,',
    '    { provide: OTP_STORE, useClass: InMemoryOtpStore },',
    '  ],',
    '  exports: [OtpAuthService],',
    '})',
    'export class OtpAuthModule {}',
  ].join('\n');
}

function buildRequestOtpDtoSource(): string {
  return [
    "import { IsNotEmpty, IsString } from 'class-validator';",
    '',
    'export class RequestOtpDto {',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  phoneNumber!: string;',
    '}',
  ].join('\n');
}

function buildVerifyOtpDtoSource(otpLength: number): string {
  return [
    "import { IsNotEmpty, IsString, Matches } from 'class-validator';",
    '',
    'export class VerifyOtpDto {',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  phoneNumber!: string;',
    '',
    '  @IsString()',
    '  @IsNotEmpty()',
    `  @Matches(/^\\d{${otpLength}}$/, { message: "otp must be a ${otpLength} digit numeric code" })`,
    '  otp!: string;',
    '}',
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

function buildOtpAuthServiceSource(otpLength: number): string {
  return [
    "import { Inject, Injectable, InternalServerErrorException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';",
    "import { JwtService } from '@nestjs/jwt';",
    "import { randomInt } from 'crypto';",
    "import { RequestOtpDto } from './dto/request-otp.dto';",
    "import { VerifyOtpDto } from './dto/verify-otp.dto';",
    "import { SmsProvider } from './providers/sms.provider';",
    "import { OTP_STORE, type OtpStore, type RequestOtpResult, type VerifyOtpResult } from './types/otp-auth.types';",
    '',
    '@Injectable()',
    'export class OtpAuthService {',
    '  constructor(',
    '    @Inject(OTP_STORE) private readonly otpStore: OtpStore,',
    '    private readonly smsProvider: SmsProvider,',
    '    private readonly jwtService: JwtService,',
    '  ) {}',
    '',
    '  async requestOtp(dto: RequestOtpDto): Promise<RequestOtpResult> {',
    '    const ttlSeconds = Number(process.env.OTP_TTL_SECONDS ?? 300);',
    `    const otp = this.generateNumericOtp(${otpLength});`,
    '',
    '    await this.otpStore.saveOtp({',
    '      phoneNumber: dto.phoneNumber,',
    '      otp,',
    '      ttlSeconds,',
    '      maxAttempts: 3,',
    '    });',
    '',
    '    try {',
    '      await this.smsProvider.sendOtp(dto.phoneNumber, otp);',
    '    } catch {',
    '      await this.otpStore.deleteOtp(dto.phoneNumber);',
    '      throw new InternalServerErrorException("Unable to send OTP.");',
    '    }',
    '',
    '    return { ok: true, expiresInSeconds: ttlSeconds };',
    '  }',
    '',
    '  async verifyOtp(dto: VerifyOtpDto): Promise<VerifyOtpResult> {',
    '    const result = await this.otpStore.verifyOtp(dto.phoneNumber, dto.otp);',
    '',
    '    if (result !== "verified") {',
    '      throw new UnauthorizedException("Invalid or expired OTP.");',
    '    }',
    '',
    '    return {',
    '      ok: true,',
    '      accessToken: await this.createAccessToken(dto.phoneNumber),',
    '    };',
    '  }',
    '',
    '  private async createAccessToken(subject: string): Promise<string> {',
    '    const secret = process.env.JWT_SECRET;',
    '',
    '    if (!secret) {',
    '      throw new ServiceUnavailableException("JWT_SECRET is required to issue OTP auth tokens.");',
    '    }',
    '',
    '    return this.jwtService.signAsync(',
    '      { sub: subject },',
    '      {',
    '        secret,',
    '        expiresIn: process.env.JWT_EXPIRES_IN ?? "15m",',
    '      },',
    '    );',
    '  }',
    '',
    '  private generateNumericOtp(length: number): string {',
    '    const upperBound = 10 ** length;',
    '',
    '    return randomInt(0, upperBound).toString().padStart(length, "0");',
    '  }',
    '}',
  ].join('\n');
}

function buildOtpStoreProviderSource(): string {
  return [
    "import { Injectable } from '@nestjs/common';",
    "import { createHash } from 'crypto';",
    "import type { OtpRecord, OtpStore, OtpVerificationResult, SaveOtpInput } from '../types/otp-auth.types';",
    '',
    '// Demo-only store. OTPs are lost on restart and are not shared across app instances.',
    '// Replace this with Redis or another expiring distributed store before production.',
    '@Injectable()',
    'export class InMemoryOtpStore implements OtpStore {',
    '  private readonly records = new Map<string, OtpRecord>();',
    '',
    '  async saveOtp(input: SaveOtpInput): Promise<void> {',
    '    this.records.set(input.phoneNumber, {',
    '      phoneNumber: input.phoneNumber,',
    '      otpHash: this.hashOtp(input.otp),',
    '      expiresAt: Date.now() + input.ttlSeconds * 1000,',
    '      attempts: 0,',
    '      maxAttempts: input.maxAttempts,',
    '    });',
    '  }',
    '',
    '  async getOtp(phoneNumber: string): Promise<OtpRecord | null> {',
    '    return this.records.get(phoneNumber) ?? null;',
    '  }',
    '',
    '  async deleteOtp(phoneNumber: string): Promise<void> {',
    '    this.records.delete(phoneNumber);',
    '  }',
    '',
    '  async verifyOtp(',
    '    phoneNumber: string,',
    '    otp: string,',
    '  ): Promise<OtpVerificationResult> {',
    '    const record = this.records.get(phoneNumber);',
    '',
    '    if (!record) {',
    '      return "not_found";',
    '    }',
    '',
    '    if (record.expiresAt < Date.now()) {',
    '      this.records.delete(phoneNumber);',
    '      return "expired";',
    '    }',
    '',
    '    if (record.attempts >= record.maxAttempts) {',
    '      this.records.delete(phoneNumber);',
    '      return "too_many_attempts";',
    '    }',
    '',
    '    record.attempts += 1;',
    '    const verified = record.otpHash === this.hashOtp(otp);',
    '',
    '    if (verified) {',
    '      this.records.delete(phoneNumber);',
    '      return "verified";',
    '    }',
    '',
    '    return "invalid";',
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
    "import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';",
    '',
    '@Injectable()',
    'export class SmsProvider {',
    '  async sendOtp(phoneNumber: string, otp: string): Promise<void> {',
    '    const endpoint = process.env.SMS_PROVIDER_URL;',
    '    const apiKey = process.env.SMS_PROVIDER_API_KEY;',
    '',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("SMS_PROVIDER_URL is required to send OTP messages.");',
    '    }',
    '',
    '    if (!apiKey) {',
    '      throw new ServiceUnavailableException("SMS_PROVIDER_API_KEY is required to send OTP messages.");',
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
    '      throw new InternalServerErrorException(`SMS provider request failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildOtpAuthTypesSource(): string {
  return [
    'export const OTP_STORE = Symbol("OTP_STORE");',
    '',
    'export type RequestOtpResult = {',
    '  ok: true;',
    '  expiresInSeconds: number;',
    '};',
    '',
    'export type VerifyOtpResult = {',
    '  ok: true;',
    '  accessToken: string;',
    '};',
    '',
    'export type OtpVerificationResult =',
    '  | "verified"',
    '  | "not_found"',
    '  | "expired"',
    '  | "too_many_attempts"',
    '  | "invalid";',
    '',
    'export type SaveOtpInput = {',
    '  phoneNumber: string;',
    '  otp: string;',
    '  ttlSeconds: number;',
    '  maxAttempts: number;',
    '};',
    '',
    'export type OtpRecord = {',
    '  phoneNumber: string;',
    '  otpHash: string;',
    '  expiresAt: number;',
    '  attempts: number;',
    '  maxAttempts: number;',
    '};',
    '',
    'export type OtpStore = {',
    '  saveOtp(input: SaveOtpInput): Promise<void>;',
    '  getOtp(phoneNumber: string): Promise<OtpRecord | null>;',
    '  deleteOtp(phoneNumber: string): Promise<void>;',
    '  verifyOtp(phoneNumber: string, otp: string): Promise<OtpVerificationResult>;',
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
    "import { SubscriptionRepository } from './providers/subscription.repository';",
    '',
    '@Module({',
    '  controllers: [PaymentWebhookController],',
    '  providers: [',
    '    PaymentWebhookService,',
    '    SignatureVerifierProvider,',
    '    SubscriptionRepository,',
    '    EmailProvider,',
    '  ],',
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
    "import { PAYMENT_WEBHOOK_SIGNATURE_HEADER } from './types/payment-webhook.types';",
    '',
    "@Controller('webhooks/payment')",
    'export class PaymentWebhookController {',
    '  constructor(private readonly paymentWebhookService: PaymentWebhookService) {}',
    '',
    '  @Post()',
    '  handlePaymentWebhook(',
    '    @Body() dto: PaymentWebhookDto,',
    '    @Headers(PAYMENT_WEBHOOK_SIGNATURE_HEADER) signature?: string,',
    '  ) {',
    '    return this.paymentWebhookService.handleWebhook(dto, signature);',
    '  }',
    '}',
  ].join('\n');
}

function buildPaymentWebhookServiceSource(): string {
  return [
    "import { BadRequestException, Injectable } from '@nestjs/common';",
    "import { PaymentWebhookDto } from './dto/payment-webhook.dto';",
    "import { EmailProvider } from './providers/email.provider';",
    "import { SignatureVerifierProvider } from './providers/signature-verifier.provider';",
    "import { SubscriptionRepository } from './providers/subscription.repository';",
    "import type { PaymentWebhookResult, ReceiptEmailInput } from './types/payment-webhook.types';",
    '',
    '@Injectable()',
    'export class PaymentWebhookService {',
    '  constructor(',
    '    private readonly signatureVerifier: SignatureVerifierProvider,',
    '    private readonly subscriptionRepository: SubscriptionRepository,',
    '    private readonly emailProvider: EmailProvider,',
    '  ) {}',
    '',
    '  async handleWebhook(',
    '    dto: PaymentWebhookDto,',
    '    signature?: string,',
    '  ): Promise<PaymentWebhookResult> {',
    '    this.signatureVerifier.verifyOrThrow(JSON.stringify(dto), signature);',
    '',
    '    if (dto.type !== "payment.succeeded") {',
    '      return { accepted: true, action: "ignored" };',
    '    }',
    '',
    '    const customerId = this.readRequiredString(dto.data, "customerId");',
    '    const customerEmail = this.readOptionalString(dto.data, "customerEmail")',
    '      ?? this.readOptionalString(dto.data, "email");',
    '',
    '    await this.subscriptionRepository.markPaymentSucceeded({',
    '      customerId,',
    '      eventId: dto.id,',
    '      payload: dto.data,',
    '    });',
    '',
    '    if (customerEmail) {',
    '      const emailInput: ReceiptEmailInput = {',
    '        eventId: dto.id,',
    '        customerId,',
    '        customerEmail,',
    '      };',
    '',
    '      await this.emailProvider.sendPaymentReceipt(emailInput);',
    '    }',
    '',
    '    return { accepted: true, action: "payment_recorded" };',
    '  }',
    '',
    '  private readRequiredString(',
    '    payload: Record<string, unknown>,',
    '    key: string,',
    '  ): string {',
    '    const value = payload[key];',
    '',
    '    if (typeof value !== "string" || !value.trim()) {',
    '      throw new BadRequestException(`${key} is required for payment.succeeded events.`);',
    '    }',
    '',
    '    return value.trim();',
    '  }',
    '',
    '  private readOptionalString(',
    '    payload: Record<string, unknown>,',
    '    key: string,',
    '  ): string | null {',
    '    const value = payload[key];',
    '',
    '    return typeof value === "string" && value.trim() ? value.trim() : null;',
    '  }',
    '}',
  ].join('\n');
}

function buildPaymentWebhookDtoSource(): string {
  return [
    "import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';",
    '',
    'export class PaymentWebhookDto {',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  id!: string;',
    '',
    '  @IsString()',
    '  @IsNotEmpty()',
    '  type!: string;',
    '',
    '  @IsObject()',
    '  data!: Record<string, unknown>;',
    '',
    '  @IsOptional()',
    '  @IsNumber()',
    '  created?: number;',
    '}',
  ].join('\n');
}

function buildSignatureVerifierProviderSource(): string {
  return [
    "import { Injectable, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';",
    "import { createHmac, timingSafeEqual } from 'crypto';",
    '',
    '@Injectable()',
    'export class SignatureVerifierProvider {',
    '  verifyOrThrow(payload: string, signature?: string): void {',
    '    const secret = process.env.WEBHOOK_SIGNING_SECRET;',
    '',
    '    if (!secret) {',
    '      throw new ServiceUnavailableException("WEBHOOK_SIGNING_SECRET is required to verify payment webhooks.");',
    '    }',
    '',
    '    if (!signature) {',
    '      throw new UnauthorizedException("Missing payment webhook signature.");',
    '    }',
    '',
    '    const expected = createHmac("sha256", secret)',
    '      .update(payload)',
    '      .digest("hex");',
    '    const received = signature.replace(/^sha256=/, "");',
    '',
    '    if (!this.safeCompare(received, expected)) {',
    '      throw new UnauthorizedException("Invalid payment webhook signature.");',
    '    }',
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
    "import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';",
    "import type { ReceiptEmailInput } from '../types/payment-webhook.types';",
    '',
    '@Injectable()',
    'export class EmailProvider {',
    '  async sendPaymentReceipt(input: ReceiptEmailInput): Promise<void> {',
    '    const endpoint = process.env.EMAIL_PROVIDER_URL;',
    '    const apiKey = process.env.EMAIL_PROVIDER_API_KEY;',
    '    const from = process.env.PAYMENT_RECEIPT_FROM ?? "billing@example.com";',
    '',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("EMAIL_PROVIDER_URL is required to send payment emails.");',
    '    }',
    '',
    '    if (!apiKey) {',
    '      throw new ServiceUnavailableException("EMAIL_PROVIDER_API_KEY is required to send payment emails.");',
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
    '        to: input.customerEmail,',
    '        subject: "Payment received",',
    '        text: `Payment event ${input.eventId} for customer ${input.customerId} was processed successfully.`,',
    '      }),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new InternalServerErrorException(`Email provider request failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildSubscriptionRepositorySource(): string {
  return [
    "import { Injectable, InternalServerErrorException, ServiceUnavailableException } from '@nestjs/common';",
    "import type { PaymentSubscriptionUpdate } from '../types/payment-webhook.types';",
    '',
    '@Injectable()',
    'export class SubscriptionRepository {',
    '  async markPaymentSucceeded(input: PaymentSubscriptionUpdate): Promise<void> {',
    '    const endpoint = process.env.SUBSCRIPTION_API_URL;',
    '',
    '    if (!endpoint) {',
    '      throw new ServiceUnavailableException("SUBSCRIPTION_API_URL is required to update subscriptions.");',
    '    }',
    '',
    '    const response = await fetch(`${endpoint}/${encodeURIComponent(input.customerId)}`, {',
    '      method: "PATCH",',
    '      headers: { "Content-Type": "application/json" },',
    '      body: JSON.stringify({',
    '        status: "active",',
    '        lastPaymentEventId: input.eventId,',
    '        paymentPayload: input.payload,',
    '      }),',
    '    });',
    '',
    '    if (!response.ok) {',
    '      throw new InternalServerErrorException(`Subscription update failed with ${response.status}`);',
    '    }',
    '  }',
    '}',
  ].join('\n');
}

function buildPaymentWebhookTypesSource(signatureHeaderName: string): string {
  return [
    `export const PAYMENT_WEBHOOK_SIGNATURE_HEADER = process.env.WEBHOOK_SIGNATURE_HEADER ?? ${JSON.stringify(signatureHeaderName)};`,
    '',
    'export type PaymentWebhookResult =',
    '  | { accepted: true; action: "payment_recorded" }',
    '  | { accepted: true; action: "ignored" };',
    '',
    'export type PaymentProviderEvent = {',
    '  id: string;',
    '  type: string;',
    '  data: Record<string, unknown>;',
    '  created?: number;',
    '};',
    '',
    'export type PaymentSubscriptionUpdate = {',
    '  customerId: string;',
    '  eventId: string;',
    '  payload: Record<string, unknown>;',
    '};',
    '',
    'export type ReceiptEmailInput = {',
    '  eventId: string;',
    '  customerId: string;',
    '  customerEmail: string;',
    '};',
  ].join('\n');
}

function buildOtpAuthReadme(context: GeneratorContext): string {
  const otpLength = getOtpLength(context.nodes);
  const ttlSeconds = getOtpTtlSeconds(context.nodes);

  return [
    '# OTP Auth Module',
    '',
    `Generated from FORGE workflow "${context.workflow.name}".`,
    '',
    'This module exposes a phone-number OTP login flow with request and verify endpoints.',
    '',
    '## Files',
    '',
    '- `otp-auth.module.ts` wires the controller, service, and providers.',
    '- `otp-auth.controller.ts` exposes `POST /auth/otp/request` and `POST /auth/otp/verify`.',
    '- `otp-auth.service.ts` coordinates OTP creation, delivery, verification, and JWT signing through `JwtService`.',
    '- `providers/otp-store.provider.ts` is a demo-only in-memory OTP store.',
    '- `providers/sms.provider.ts` is a generic SMS provider boundary with a `sendOtp` method.',
    '',
    '## Install dependencies',
    '',
    '```bash',
    'npm install @nestjs/jwt class-validator class-transformer',
    '```',
    '',
    'Enable NestJS validation globally if your app has not already done so:',
    '',
    '```ts',
    'app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));',
    '```',
    '',
    '## Register the module',
    '',
    '```ts',
    "import { Module } from '@nestjs/common';",
    "import { OtpAuthModule } from './generated/otp-auth/otp-auth.module';",
    '',
    '@Module({',
    '  imports: [OtpAuthModule],',
    '})',
    'export class AppModule {}',
    '```',
    '',
    '## Required environment variables',
    '',
    '- `JWT_SECRET`',
    '- `JWT_EXPIRES_IN`',
    '- `OTP_HASH_SECRET`',
    '- `OTP_TTL_SECONDS`',
    '- `SMS_PROVIDER_URL`',
    '- `SMS_PROVIDER_API_KEY`',
    '',
    '## Example requests',
    '',
    '```json',
    '{ "phoneNumber": "+15551234567" }',
    '```',
    '',
    '```json',
    `{ "phoneNumber": "+15551234567", "otp": "${'0'.repeat(otpLength)}" }`,
    '```',
    '',
    '## Example responses',
    '',
    '```json',
    `{ "ok": true, "expiresInSeconds": ${ttlSeconds} }`,
    '```',
    '',
    '```json',
    '{ "ok": true, "accessToken": "jwt_token" }',
    '```',
    '',
    '## Error behavior',
    '',
    'Invalid, expired, or over-attempted OTP verification throws `UnauthorizedException`.',
    'SMS delivery failures throw `InternalServerErrorException` after deleting the stored OTP.',
    'Missing JWT or provider configuration throws `ServiceUnavailableException`.',
    '',
    '## Production replacement points',
    '',
    '- `InMemoryOtpStore` is demo-only, loses data on restart, and does not work across multiple app instances.',
    '- Replace `InMemoryOtpStore` with Redis or another expiring distributed store before production.',
    '- Replace the generic `SmsProvider.sendOtp` HTTP call with your SMS provider contract.',
    '',
    '## Known limitations',
    '',
    '- Phone-number format validation is intentionally minimal to avoid rejecting valid international numbers.',
    '- OTPs are hashed at rest in the demo store, but the store itself is not production-safe.',
    '',
    'No provider credentials are generated. Secret values are represented with placeholders only.',
    '',
  ].join('\n');
}

function buildPaymentWebhookReadme(context: GeneratorContext): string {
  const signatureHeaderName = getSignatureHeaderName(context.nodes);

  return [
    '# Payment Webhook Module',
    '',
    `Generated from FORGE workflow "${context.workflow.name}".`,
    '',
    'This module verifies payment webhook signatures, processes `payment.succeeded` events, updates a subscription record, and sends a receipt email when an email address is present.',
    '',
    '## Files',
    '',
    '- `payment-webhook.module.ts` wires the controller, service, and providers.',
    '- `payment-webhook.controller.ts` exposes `POST /webhooks/payment`.',
    '- `payment-webhook.service.ts` verifies signatures and handles successful payments.',
    '- `providers/signature-verifier.provider.ts` validates HMAC SHA-256 webhook signatures.',
    '- `providers/subscription.repository.ts` is a repository boundary for subscription updates.',
    '- `providers/email.provider.ts` is a generic receipt email provider boundary.',
    '',
    '## Install dependencies',
    '',
    '```bash',
    'npm install class-validator class-transformer',
    '```',
    '',
    'Enable NestJS validation globally if your app has not already done so:',
    '',
    '```ts',
    'app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));',
    '```',
    '',
    '## Register the module',
    '',
    '```ts',
    "import { Module } from '@nestjs/common';",
    "import { PaymentWebhookModule } from './generated/payment-webhook/payment-webhook.module';",
    '',
    '@Module({',
    '  imports: [PaymentWebhookModule],',
    '})',
    'export class AppModule {}',
    '```',
    '',
    '## Required environment variables',
    '',
    `- \`WEBHOOK_SIGNATURE_HEADER\` defaults to \`${signatureHeaderName}\` in generated code`,
    '- `WEBHOOK_SIGNING_SECRET`',
    '- `SUBSCRIPTION_API_URL`',
    '- `EMAIL_PROVIDER_URL`',
    '- `EMAIL_PROVIDER_API_KEY`',
    '- `PAYMENT_RECEIPT_FROM`',
    '',
    '## Example request',
    '',
    'Headers:',
    '',
    '```',
    `${signatureHeaderName}: sha256=<hmac_sha256_signature>`,
    '```',
    '',
    'Body:',
    '',
    '```json',
    '{',
    '  "id": "evt_123",',
    '  "type": "payment.succeeded",',
    '  "data": {',
    '    "customerId": "cus_123",',
    '    "customerEmail": "customer@example.com"',
    '  }',
    '}',
    '```',
    '',
    '## Example responses',
    '',
    '```json',
    '{ "accepted": true, "action": "payment_recorded" }',
    '```',
    '',
    '```json',
    '{ "accepted": true, "action": "ignored" }',
    '```',
    '',
    '## Error behavior',
    '',
    '- Missing or invalid signatures throw `UnauthorizedException`.',
    '- Missing signing or provider configuration throws `ServiceUnavailableException`.',
    '- Missing `customerId` on `payment.succeeded` throws `BadRequestException`.',
    '- Subscription update and email provider failures throw `InternalServerErrorException`.',
    '',
    '## Production replacement points',
    '',
    '- `SignatureVerifierProvider` uses a generic HMAC SHA-256 signature format. Adapt it to your provider if the provider signs raw request bodies or uses timestamped signatures.',
    '- `SubscriptionRepository` calls a configured HTTP endpoint. Replace it with your database repository if subscriptions live in your app database.',
    '- `EmailProvider` is generic and should be adapted to your email provider contract.',
    '',
    '## Known limitations',
    '',
    '- Most payment providers require raw-body signature verification. If yours does, pass the raw body to `SignatureVerifierProvider.verifyOrThrow` instead of `JSON.stringify(dto)`.',
    '- Receipt email sending is skipped when the payload does not include `customerEmail` or `email`.',
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

function isEmailVerificationWorkflow(nodes: CanvasNode[]): boolean {
  return nodes.some((node) =>
    ['createVerificationToken', 'verifyToken'].includes(node.nodeType),
  );
}

function isPasswordResetWorkflow(nodes: CanvasNode[]): boolean {
  return nodes.some((node) =>
    ['generateResetToken', 'verifyResetToken', 'passwordHash'].includes(
      node.nodeType,
    ),
  );
}

function isUserOnboardingWorkflow(nodes: CanvasNode[]): boolean {
  const nodeTypes = new Set(nodes.map((node) => node.nodeType));
  return (
    nodeTypes.has('databaseWrite') &&
    nodeTypes.has('sendEmail') &&
    !isEmailVerificationWorkflow(nodes) &&
    !isPasswordResetWorkflow(nodes) &&
    !isOtpAuthWorkflow(nodes)
  );
}

function getUnsupportedBackendNodes(nodes: CanvasNode[]): CanvasNode[] {
  return nodes.filter(
    (node) => !SUPPORTED_BACKEND_NODE_TYPES.has(node.nodeType),
  );
}

function getOtpLength(nodes: CanvasNode[]): number {
  const value = nodes.find((node) => node.nodeType === 'generateOtp')?.config
    .otpLength;

  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? Math.min(Math.max(value, 4), 10)
    : 6;
}

function getOtpTtlSeconds(nodes: CanvasNode[]): number {
  const value = nodes.find((node) => node.nodeType === 'generateOtp')?.config
    .expirySeconds;

  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : 300;
}

function getSignatureHeaderName(nodes: CanvasNode[]): string {
  const value = nodes.find((node) => node.nodeType === 'verifySignature')
    ?.config.headerName;

  return typeof value === 'string' && value.trim()
    ? value.trim().toLowerCase()
    : 'x-provider-signature';
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

function toPascalCase(value: string): string {
  const identifier = value
    .split(/[^a-zA-Z0-9]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  return identifier || 'GeneratedWorkflow';
}

function toKebabCase(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || 'generated-workflow';
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
