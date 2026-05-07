import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
  WorkflowSnapshot,
} from "@/features/workflow/types";

export type WorkflowTemplateDifficulty = "Basic" | "Intermediate" | "Advanced";

export type WorkflowTemplateCategory =
  | "Auth"
  | "Security"
  | "Payments"
  | "Lifecycle";

export type WorkflowTemplateNode = {
  id: string;
  type: WorkflowNodeType;
  label: string;
  position: { x: number; y: number };
  config: Record<string, string | number>;
};

export type WorkflowTemplateEdge = {
  id: string;
  source: string;
  target: string;
  label?: string;
};

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  category: WorkflowTemplateCategory;
  difficulty: WorkflowTemplateDifficulty;
  useCase: string;
  preview: string[];
  nodes: WorkflowTemplateNode[];
  edges: WorkflowTemplateEdge[];
};

export type AppliedWorkflowTemplate = {
  snapshot: WorkflowSnapshot;
  selectedNodeId: string;
};

const horizontalGap = 260;
const verticalGap = 150;

export const workflowTemplates: WorkflowTemplate[] = [
  {
    id: "otp-authentication",
    name: "OTP Authentication",
    description: "Phone-based login using OTP.",
    category: "Auth",
    difficulty: "Basic",
    useCase: "Phone number login using OTP",
    preview: ["HTTP", "OTP", "SMS"],
    nodes: [
      templateNode("request-trigger", "httpTrigger", "Request OTP", 0, 0, {
        method: "POST",
        path: "/auth/otp/request",
      }),
      templateNode("generate-otp", "generateOtp", "Generate OTP", 1, 0, {
        otpLength: 6,
        expirySeconds: 300,
      }),
      templateNode("store-otp", "databaseWrite", "Store OTP", 2, 0, {
        table: "otp_sessions",
        operation: "upsert",
      }),
      templateNode("send-sms", "sendSms", "Send SMS", 3, 0, {
        senderId: "FORGE",
        template: "otp-login",
        providerSecretRef: "{{SMS_PROVIDER_API_KEY}}",
      }),
      templateNode("verify-trigger", "httpTrigger", "Verify OTP Request", 0, 1, {
        method: "POST",
        path: "/auth/otp/verify",
      }),
      templateNode("verify-otp", "verifyOtp", "Verify OTP", 1, 1, {
        attempts: 3,
        lockWindowSeconds: 900,
      }),
      templateNode("jwt-sign", "jwtSign", "JWT Sign", 2, 1, {
        secretRef: "{{JWT_SECRET}}",
        expiresIn: "15m",
      }),
      templateNode("otp-response", "webhookResponse", "Webhook Response", 3, 1, {
        statusCode: 200,
        bodyTemplate: "{\"authenticated\":true}",
      }),
    ],
    edges: [
      templateEdge("request-trigger", "generate-otp"),
      templateEdge("generate-otp", "store-otp"),
      templateEdge("store-otp", "send-sms"),
      templateEdge("verify-trigger", "verify-otp"),
      templateEdge("verify-otp", "jwt-sign"),
      templateEdge("jwt-sign", "otp-response"),
    ],
  },
  {
    id: "email-verification",
    name: "Email Verification",
    description: "Signup email verification flow.",
    category: "Auth",
    difficulty: "Basic",
    useCase: "Email verification during signup",
    preview: ["HTTP", "Token", "Email"],
    nodes: [
      templateNode("create-trigger", "httpTrigger", "Create Verification", 0, 0, {
        method: "POST",
        path: "/auth/email/verification",
      }),
      templateNode(
        "create-token",
        "createVerificationToken",
        "Create Verification Token",
        1,
        0,
        { tokenLength: 32, expirySeconds: 3600 },
      ),
      templateNode("send-email", "sendEmail", "Send Verification Email", 2, 0, {
        from: "no-reply@company.com",
        template: "email-verification",
        providerSecretRef: "{{EMAIL_PROVIDER_API_KEY}}",
      }),
      templateNode("create-response", "webhookResponse", "Webhook Response", 3, 0, {
        statusCode: 202,
        bodyTemplate: "{\"sent\":true}",
      }),
      templateNode("verify-trigger", "httpTrigger", "Verify Email", 0, 1, {
        method: "POST",
        path: "/auth/email/verify",
      }),
      templateNode("verify-token", "verifyToken", "Verify Token", 1, 1, {
        tokenField: "token",
        table: "verification_tokens",
      }),
      templateNode("mark-verified", "databaseUpdate", "Mark Email Verified", 2, 1, {
        table: "users",
        lookupKey: "email",
        operation: "update",
      }),
      templateNode("verify-response", "webhookResponse", "Webhook Response", 3, 1, {
        statusCode: 200,
        bodyTemplate: "{\"verified\":true}",
      }),
    ],
    edges: [
      templateEdge("create-trigger", "create-token"),
      templateEdge("create-token", "send-email"),
      templateEdge("send-email", "create-response"),
      templateEdge("verify-trigger", "verify-token"),
      templateEdge("verify-token", "mark-verified"),
      templateEdge("mark-verified", "verify-response"),
    ],
  },
  {
    id: "password-reset",
    name: "Password Reset",
    description: "Secure reset token and password update flow.",
    category: "Security",
    difficulty: "Intermediate",
    useCase: "Secure password reset backend flow",
    preview: ["HTTP", "Token", "Hash"],
    nodes: [
      templateNode("request-trigger", "httpTrigger", "Request Reset", 0, 0, {
        method: "POST",
        path: "/auth/password-reset/request",
      }),
      templateNode("reset-token", "generateResetToken", "Generate Reset Token", 1, 0, {
        tokenLength: 32,
        expirySeconds: 1800,
      }),
      templateNode("send-email", "sendEmail", "Send Reset Email", 2, 0, {
        from: "no-reply@company.com",
        template: "password-reset",
        providerSecretRef: "{{EMAIL_PROVIDER_API_KEY}}",
      }),
      templateNode("request-response", "webhookResponse", "Webhook Response", 3, 0, {
        statusCode: 202,
        bodyTemplate: "{\"sent\":true}",
      }),
      templateNode("verify-trigger", "httpTrigger", "Submit New Password", 0, 1, {
        method: "POST",
        path: "/auth/password-reset/confirm",
      }),
      templateNode("verify-reset-token", "verifyResetToken", "Verify Reset Token", 1, 1, {
        tokenField: "resetToken",
        table: "password_reset_tokens",
      }),
      templateNode("hash-password", "passwordHash", "Password Hash", 2, 1, {
        algorithm: "argon2id",
        passwordField: "password",
      }),
      templateNode("update-password", "databaseUpdate", "Update Password", 3, 1, {
        table: "users",
        lookupKey: "id",
        operation: "update",
      }),
      templateNode("reset-response", "webhookResponse", "Webhook Response", 4, 1, {
        statusCode: 200,
        bodyTemplate: "{\"reset\":true}",
      }),
    ],
    edges: [
      templateEdge("request-trigger", "reset-token"),
      templateEdge("reset-token", "send-email"),
      templateEdge("send-email", "request-response"),
      templateEdge("verify-trigger", "verify-reset-token"),
      templateEdge("verify-reset-token", "hash-password"),
      templateEdge("hash-password", "update-password"),
      templateEdge("update-password", "reset-response"),
    ],
  },
  {
    id: "payment-webhook",
    name: "Payment Webhook",
    description: "Verify payment events and update account state.",
    category: "Payments",
    difficulty: "Advanced",
    useCase: "Handle payment provider webhook events",
    preview: ["Webhook", "Verify", "DB"],
    nodes: [
      templateNode("webhook-trigger", "webhookTrigger", "Payment Webhook", 0, 0, {
        provider: "payment-provider",
        path: "/webhooks/payment",
      }),
      templateNode("verify-signature", "verifySignature", "Verify Signature", 1, 0, {
        headerName: "x-provider-signature",
        secretRef: "{{WEBHOOK_SIGNING_SECRET}}",
      }),
      templateNode("condition", "condition", "Payment Succeeded?", 2, 0, {
        expression: "payload.event === 'payment.succeeded'",
      }),
      templateNode("update-record", "databaseUpdate", "Update Subscription", 3, 0, {
        table: "subscriptions",
        lookupKey: "customerId",
        operation: "update",
      }),
      templateNode("send-email", "sendEmail", "Send Receipt Email", 4, 0, {
        from: "billing@company.com",
        template: "payment-receipt",
        providerSecretRef: "{{EMAIL_PROVIDER_API_KEY}}",
      }),
    ],
    edges: [
      templateEdge("webhook-trigger", "verify-signature"),
      templateEdge("verify-signature", "condition"),
      templateEdge("condition", "update-record", "success"),
      templateEdge("update-record", "send-email"),
    ],
  },
  {
    id: "user-onboarding",
    name: "User Onboarding",
    description: "Create a user and send staged onboarding messages.",
    category: "Lifecycle",
    difficulty: "Basic",
    useCase: "Create user and send onboarding messages",
    preview: ["HTTP", "DB", "Email"],
    nodes: [
      templateNode("signup-trigger", "httpTrigger", "Create User", 0, 0, {
        method: "POST",
        path: "/users",
      }),
      templateNode("create-user", "databaseWrite", "Database Write", 1, 0, {
        table: "users",
        operation: "insert",
      }),
      templateNode("welcome-email", "sendEmail", "Send Welcome Email", 2, 0, {
        from: "hello@company.com",
        template: "welcome-email",
        providerSecretRef: "{{EMAIL_PROVIDER_API_KEY}}",
      }),
      templateNode("delay", "delay", "Delay", 3, 0, {
        durationSeconds: 86400,
      }),
      templateNode("follow-up-email", "sendEmail", "Send Follow-up Email", 4, 0, {
        from: "hello@company.com",
        template: "onboarding-follow-up",
        providerSecretRef: "{{EMAIL_PROVIDER_API_KEY}}",
      }),
    ],
    edges: [
      templateEdge("signup-trigger", "create-user"),
      templateEdge("create-user", "welcome-email"),
      templateEdge("welcome-email", "delay"),
      templateEdge("delay", "follow-up-email"),
    ],
  },
];

export function applyWorkflowTemplate(
  workflow: WorkflowDocument,
  template: WorkflowTemplate,
): AppliedWorkflowTemplate {
  const idMap = new Map<string, string>();
  const offset = getTemplateOffset(workflow.nodes);
  const selectedNodeTemplateId = template.nodes[0]?.id;

  const templateNodes: WorkflowNode[] = template.nodes.map((node) => {
    const definition = nodeDefinitionsByType[node.type];
    const nextId = crypto.randomUUID();
    idMap.set(node.id, nextId);

    return {
      id: nextId,
      type: "workflowNode",
      position: {
        x: node.position.x + offset.x,
        y: node.position.y + offset.y,
      },
      selected: node.id === selectedNodeTemplateId,
      data: {
        label: node.label,
        category: definition.category,
        type: node.type,
        config: {
          ...structuredClone(definition.defaults),
          ...structuredClone(node.config),
        },
      },
    };
  });

  const templateEdges: WorkflowEdge[] = template.edges.map((edge) => ({
    id: crypto.randomUUID(),
    source: idMap.get(edge.source) ?? edge.source,
    target: idMap.get(edge.target) ?? edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: false,
  }));

  return {
    selectedNodeId: idMap.get(selectedNodeTemplateId ?? "") ?? templateNodes[0]?.id ?? "",
    snapshot: {
      nodes: [
        ...workflow.nodes.map((node) => ({ ...node, selected: false })),
        ...templateNodes,
      ],
      edges: [...workflow.edges, ...templateEdges],
      viewport: workflow.viewport,
    },
  };
}

function templateNode(
  id: string,
  type: WorkflowNodeType,
  label: string,
  column: number,
  row: number,
  config: Record<string, string | number>,
): WorkflowTemplateNode {
  return {
    id,
    type,
    label,
    position: {
      x: column * horizontalGap,
      y: row * verticalGap,
    },
    config,
  };
}

function templateEdge(
  source: string,
  target: string,
  label?: string,
): WorkflowTemplateEdge {
  return {
    id: `${source}-${target}`,
    source,
    target,
    label,
  };
}

function getTemplateOffset(nodes: WorkflowNode[]): { x: number; y: number } {
  if (nodes.length === 0) {
    return { x: 0, y: 0 };
  }

  const maxX = Math.max(...nodes.map((node) => node.position.x));
  const minY = Math.min(...nodes.map((node) => node.position.y));

  return {
    x: maxX + 360,
    y: minY,
  };
}
