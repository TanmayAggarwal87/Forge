import type { WorkflowTemplateDifficulty } from '../entities/workflow-template.entity';

export type SystemWorkflowTemplateSeed = {
  name: string;
  description: string;
  category: string;
  difficulty: WorkflowTemplateDifficulty;
  nodesJson: Array<{
    id: string;
    type: string;
    label: string;
    position: { x: number; y: number };
    config: Record<string, string | number>;
  }>;
  edgesJson: Array<{
    id: string;
    source: string;
    target: string;
    label: string | null;
  }>;
  previewJson: {
    useCase: string;
    steps: string[];
  };
};

export const systemWorkflowTemplates: SystemWorkflowTemplateSeed[] = [
  {
    name: 'OTP Authentication Flow',
    description: 'Phone number login using OTP.',
    category: 'Auth',
    difficulty: 'Basic',
    previewJson: {
      useCase: 'Phone number login using OTP',
      steps: ['HTTP', 'OTP', 'SMS', 'JWT'],
    },
    nodesJson: [
      node('request-trigger', 'httpTrigger', 'Request OTP', 0, 0, {
        method: 'POST',
        path: '/auth/otp/request',
      }),
      node('generate-otp', 'generateOtp', 'Generate OTP', 1, 0, {
        otpLength: 6,
        expirySeconds: 300,
      }),
      node('store-otp', 'databaseWrite', 'Store OTP', 2, 0, {
        table: 'otp_sessions',
        operation: 'upsert',
      }),
      node('send-sms', 'sendSms', 'Send SMS', 3, 0, {
        senderId: 'FORGE',
        template: 'otp-login',
        providerSecretRef: '{{SMS_PROVIDER_API_KEY}}',
      }),
      node('verify-trigger', 'httpTrigger', 'Verify OTP Request', 0, 1, {
        method: 'POST',
        path: '/auth/otp/verify',
      }),
      node('verify-otp', 'verifyOtp', 'Verify OTP', 1, 1, {
        attempts: 3,
        lockWindowSeconds: 900,
      }),
      node('jwt-sign', 'jwtSign', 'JWT Sign', 2, 1, {
        secretRef: '{{JWT_SECRET}}',
        expiresIn: '15m',
      }),
      node('otp-response', 'webhookResponse', 'Webhook Response', 3, 1, {
        statusCode: 200,
        bodyTemplate: '{"authenticated":true}',
      }),
    ],
    edgesJson: [
      edge('request-trigger', 'generate-otp'),
      edge('generate-otp', 'store-otp'),
      edge('store-otp', 'send-sms'),
      edge('verify-trigger', 'verify-otp'),
      edge('verify-otp', 'jwt-sign'),
      edge('jwt-sign', 'otp-response'),
    ],
  },
  {
    name: 'Email Verification Flow',
    description: 'Email verification during signup.',
    category: 'Auth',
    difficulty: 'Basic',
    previewJson: {
      useCase: 'Email verification during signup',
      steps: ['HTTP', 'Token', 'Email', 'Response'],
    },
    nodesJson: [
      node('create-trigger', 'httpTrigger', 'Create Verification', 0, 0, {
        method: 'POST',
        path: '/auth/email/verification',
      }),
      node(
        'create-token',
        'createVerificationToken',
        'Create Verification Token',
        1,
        0,
        {
          tokenLength: 32,
          expirySeconds: 3600,
        },
      ),
      node('send-email', 'sendEmail', 'Send Verification Email', 2, 0, {
        from: 'no-reply@company.com',
        template: 'email-verification',
        providerSecretRef: '{{EMAIL_PROVIDER_API_KEY}}',
      }),
      node('create-response', 'webhookResponse', 'Webhook Response', 3, 0, {
        statusCode: 202,
        bodyTemplate: '{"sent":true}',
      }),
      node('verify-trigger', 'httpTrigger', 'Verify Email', 0, 1, {
        method: 'POST',
        path: '/auth/email/verify',
      }),
      node('verify-token', 'verifyToken', 'Verify Token', 1, 1, {
        tokenField: 'token',
        table: 'verification_tokens',
      }),
      node('mark-verified', 'databaseUpdate', 'Mark Email Verified', 2, 1, {
        table: 'users',
        lookupKey: 'email',
        operation: 'update',
      }),
      node('verify-response', 'webhookResponse', 'Webhook Response', 3, 1, {
        statusCode: 200,
        bodyTemplate: '{"verified":true}',
      }),
    ],
    edgesJson: [
      edge('create-trigger', 'create-token'),
      edge('create-token', 'send-email'),
      edge('send-email', 'create-response'),
      edge('verify-trigger', 'verify-token'),
      edge('verify-token', 'mark-verified'),
      edge('mark-verified', 'verify-response'),
    ],
  },
  {
    name: 'Password Reset Flow',
    description: 'Secure password reset backend flow.',
    category: 'Security',
    difficulty: 'Intermediate',
    previewJson: {
      useCase: 'Secure password reset backend flow',
      steps: ['HTTP', 'Reset Token', 'Email', 'Hash'],
    },
    nodesJson: [
      node('request-trigger', 'httpTrigger', 'Request Reset', 0, 0, {
        method: 'POST',
        path: '/auth/password-reset/request',
      }),
      node('reset-token', 'generateResetToken', 'Generate Reset Token', 1, 0, {
        tokenLength: 32,
        expirySeconds: 1800,
      }),
      node('send-email', 'sendEmail', 'Send Reset Email', 2, 0, {
        from: 'no-reply@company.com',
        template: 'password-reset',
        providerSecretRef: '{{EMAIL_PROVIDER_API_KEY}}',
      }),
      node('request-response', 'webhookResponse', 'Webhook Response', 3, 0, {
        statusCode: 202,
        bodyTemplate: '{"sent":true}',
      }),
      node('verify-trigger', 'httpTrigger', 'Submit New Password', 0, 1, {
        method: 'POST',
        path: '/auth/password-reset/confirm',
      }),
      node(
        'verify-reset-token',
        'verifyResetToken',
        'Verify Reset Token',
        1,
        1,
        {
          tokenField: 'resetToken',
          table: 'password_reset_tokens',
        },
      ),
      node('hash-password', 'passwordHash', 'Password Hash', 2, 1, {
        algorithm: 'argon2id',
        passwordField: 'password',
      }),
      node('update-password', 'databaseUpdate', 'Update Password', 3, 1, {
        table: 'users',
        lookupKey: 'id',
        operation: 'update',
      }),
      node('reset-response', 'webhookResponse', 'Webhook Response', 4, 1, {
        statusCode: 200,
        bodyTemplate: '{"reset":true}',
      }),
    ],
    edgesJson: [
      edge('request-trigger', 'reset-token'),
      edge('reset-token', 'send-email'),
      edge('send-email', 'request-response'),
      edge('verify-trigger', 'verify-reset-token'),
      edge('verify-reset-token', 'hash-password'),
      edge('hash-password', 'update-password'),
      edge('update-password', 'reset-response'),
    ],
  },
  {
    name: 'Payment Webhook Flow',
    description: 'Handle payment provider webhook events.',
    category: 'Payments',
    difficulty: 'Advanced',
    previewJson: {
      useCase: 'Handle payment provider webhook events',
      steps: ['Webhook', 'Verify', 'Condition', 'Database'],
    },
    nodesJson: [
      node('webhook-trigger', 'webhookTrigger', 'Payment Webhook', 0, 0, {
        provider: 'payment-provider',
        path: '/webhooks/payment',
      }),
      node('verify-signature', 'verifySignature', 'Verify Signature', 1, 0, {
        headerName: 'x-provider-signature',
        secretRef: '{{WEBHOOK_SIGNING_SECRET}}',
      }),
      node('condition', 'condition', 'Payment Succeeded?', 2, 0, {
        expression: "payload.event === 'payment.succeeded'",
      }),
      node('update-record', 'databaseUpdate', 'Update Subscription', 3, 0, {
        table: 'subscriptions',
        lookupKey: 'customerId',
        operation: 'update',
      }),
      node('send-email', 'sendEmail', 'Send Receipt Email', 4, 0, {
        from: 'billing@company.com',
        template: 'payment-receipt',
        providerSecretRef: '{{EMAIL_PROVIDER_API_KEY}}',
      }),
    ],
    edgesJson: [
      edge('webhook-trigger', 'verify-signature'),
      edge('verify-signature', 'condition'),
      edge('condition', 'update-record', 'success'),
      edge('update-record', 'send-email'),
    ],
  },
  {
    name: 'User Onboarding Flow',
    description: 'Create user and send onboarding messages.',
    category: 'Lifecycle',
    difficulty: 'Basic',
    previewJson: {
      useCase: 'Create user and send onboarding messages',
      steps: ['HTTP', 'Database', 'Email', 'Delay'],
    },
    nodesJson: [
      node('signup-trigger', 'httpTrigger', 'Create User', 0, 0, {
        method: 'POST',
        path: '/users',
      }),
      node('create-user', 'databaseWrite', 'Database Write', 1, 0, {
        table: 'users',
        operation: 'insert',
      }),
      node('welcome-email', 'sendEmail', 'Send Welcome Email', 2, 0, {
        from: 'hello@company.com',
        template: 'welcome-email',
        providerSecretRef: '{{EMAIL_PROVIDER_API_KEY}}',
      }),
      node('delay', 'delay', 'Delay', 3, 0, {
        durationSeconds: 86400,
      }),
      node('follow-up-email', 'sendEmail', 'Send Follow-up Email', 4, 0, {
        from: 'hello@company.com',
        template: 'onboarding-follow-up',
        providerSecretRef: '{{EMAIL_PROVIDER_API_KEY}}',
      }),
    ],
    edgesJson: [
      edge('signup-trigger', 'create-user'),
      edge('create-user', 'welcome-email'),
      edge('welcome-email', 'delay'),
      edge('delay', 'follow-up-email'),
    ],
  },
];

function node(
  id: string,
  type: string,
  label: string,
  column: number,
  row: number,
  config: Record<string, string | number>,
) {
  return {
    id,
    type,
    label,
    position: {
      x: column * 260,
      y: row * 150,
    },
    config,
  };
}

function edge(source: string, target: string, label: string | null = null) {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
  };
}
