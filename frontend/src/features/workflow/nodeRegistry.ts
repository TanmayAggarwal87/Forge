import { z } from "zod";
import type {
  NodeConfigField,
  WorkflowNodeData,
  WorkflowNodeType,
} from "@/features/workflow/types";

type NodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  category:
    | "Triggers"
    | "Authentication"
    | "Communication"
    | "Logic"
    | "Database"
    | "API / Integrations";
  description: string;
  defaults: WorkflowNodeData["config"];
  fields: NodeConfigField[];
  schema: z.ZodObject<Record<string, z.ZodType>>;
};

function configSchema(fields: NodeConfigField[]) {
  return z.object(
    Object.fromEntries(
      fields.map((field) => {
        const schema =
          field.type === "number"
            ? z.coerce
                .number()
                .min(field.min ?? Number.NEGATIVE_INFINITY, `${field.label} is invalid`)
            : z.string().trim().min(1, `${field.label} is required`);

        return [field.key, field.optional ? schema.optional() : schema];
      }),
    ),
  );
}

function createDefinition(
  definition: Omit<NodeDefinition, "schema">,
): NodeDefinition {
  return {
    ...definition,
    schema: configSchema(definition.fields),
  };
}

export const nodeDefinitions = [
  createDefinition({
    type: "httpTrigger",
    label: "HTTP Trigger",
    category: "Triggers",
    description: "Starts the workflow from an inbound HTTP request.",
    defaults: {
      method: "POST",
      path: "/otp/request",
    },
    fields: [
      {
        key: "method",
        label: "Method",
        type: "select",
        options: [
          { label: "GET", value: "GET" },
          { label: "POST", value: "POST" },
          { label: "PUT", value: "PUT" },
        ],
      },
      {
        key: "path",
        label: "Path",
        type: "text",
        placeholder: "/otp/request",
      },
    ],
  }),
  createDefinition({
    type: "webhookTrigger",
    label: "Webhook Trigger",
    category: "Triggers",
    description: "Starts the workflow from an external signed webhook event.",
    defaults: {
      provider: "payment-provider",
      path: "/webhooks/provider",
    },
    fields: [
      { key: "provider", label: "Provider", type: "text" },
      { key: "path", label: "Path", type: "text", placeholder: "/webhooks/provider" },
    ],
  }),
  createDefinition({
    type: "generateOtp",
    label: "Generate OTP",
    category: "Authentication",
    description: "Creates a one-time password and expiration window.",
    defaults: {
      otpLength: 6,
      expirySeconds: 300,
    },
    fields: [
      { key: "otpLength", label: "OTP Length", type: "number", min: 4, step: 1 },
      {
        key: "expirySeconds",
        label: "Expiry Time (seconds)",
        type: "number",
        min: 30,
        step: 30,
      },
    ],
  }),
  createDefinition({
    type: "verifyOtp",
    label: "Verify OTP",
    category: "Authentication",
    description: "Validates the submitted OTP against the active token.",
    defaults: {
      attempts: 3,
      lockWindowSeconds: 900,
    },
    fields: [
      { key: "attempts", label: "Max Attempts", type: "number", min: 1, step: 1 },
      {
        key: "lockWindowSeconds",
        label: "Lock Window (seconds)",
        type: "number",
        min: 60,
        step: 60,
      },
    ],
  }),
  createDefinition({
    type: "jwtSign",
    label: "JWT Sign",
    category: "Authentication",
    description: "Creates a signed token using a configured secret reference.",
    defaults: {
      secretRef: "{{JWT_SECRET}}",
      expiresIn: "15m",
    },
    fields: [
      { key: "secretRef", label: "Secret Reference", type: "text" },
      { key: "expiresIn", label: "Expires In", type: "text", placeholder: "15m" },
    ],
  }),
  createDefinition({
    type: "passwordHash",
    label: "Password Hash",
    category: "Authentication",
    description: "Hashes a submitted password before storage.",
    defaults: {
      algorithm: "argon2id",
      passwordField: "password",
    },
    fields: [
      {
        key: "algorithm",
        label: "Algorithm",
        type: "select",
        options: [
          { label: "Argon2id", value: "argon2id" },
          { label: "Bcrypt", value: "bcrypt" },
        ],
      },
      { key: "passwordField", label: "Password Field", type: "text" },
    ],
  }),
  createDefinition({
    type: "createVerificationToken",
    label: "Create Verification Token",
    category: "Authentication",
    description: "Creates a short-lived email verification token.",
    defaults: {
      tokenLength: 32,
      expirySeconds: 3600,
    },
    fields: [
      { key: "tokenLength", label: "Token Length", type: "number", min: 16, step: 1 },
      {
        key: "expirySeconds",
        label: "Expiry Time (seconds)",
        type: "number",
        min: 300,
        step: 300,
      },
    ],
  }),
  createDefinition({
    type: "verifyToken",
    label: "Verify Token",
    category: "Authentication",
    description: "Validates a submitted verification token.",
    defaults: {
      tokenField: "token",
      table: "verification_tokens",
    },
    fields: [
      { key: "tokenField", label: "Token Field", type: "text" },
      { key: "table", label: "Token Table", type: "text" },
    ],
  }),
  createDefinition({
    type: "generateResetToken",
    label: "Generate Reset Token",
    category: "Authentication",
    description: "Creates a password reset token without exposing secrets.",
    defaults: {
      tokenLength: 32,
      expirySeconds: 1800,
    },
    fields: [
      { key: "tokenLength", label: "Token Length", type: "number", min: 16, step: 1 },
      {
        key: "expirySeconds",
        label: "Expiry Time (seconds)",
        type: "number",
        min: 300,
        step: 300,
      },
    ],
  }),
  createDefinition({
    type: "verifyResetToken",
    label: "Verify Reset Token",
    category: "Authentication",
    description: "Checks that a password reset token is still valid.",
    defaults: {
      tokenField: "resetToken",
      table: "password_reset_tokens",
    },
    fields: [
      { key: "tokenField", label: "Token Field", type: "text" },
      { key: "table", label: "Token Table", type: "text" },
    ],
  }),
  createDefinition({
    type: "verifySignature",
    label: "Verify Signature",
    category: "Authentication",
    description: "Verifies an inbound webhook signature using a secret reference.",
    defaults: {
      headerName: "x-provider-signature",
      secretRef: "{{WEBHOOK_SIGNING_SECRET}}",
    },
    fields: [
      { key: "headerName", label: "Signature Header", type: "text" },
      { key: "secretRef", label: "Secret Reference", type: "text" },
    ],
  }),
  createDefinition({
    type: "sendEmail",
    label: "Send Email",
    category: "Communication",
    description: "Dispatches a transactional email.",
    defaults: {
      from: "no-reply@company.com",
      template: "otp-email",
      providerSecretRef: "{{EMAIL_PROVIDER_API_KEY}}",
    },
    fields: [
      { key: "from", label: "From Address", type: "text" },
      { key: "template", label: "Template", type: "text" },
      {
        key: "providerSecretRef",
        label: "Provider Secret Reference",
        type: "text",
        optional: true,
      },
    ],
  }),
  createDefinition({
    type: "sendSms",
    label: "Send SMS",
    category: "Communication",
    description: "Dispatches an SMS notification.",
    defaults: {
      senderId: "FORGE",
      template: "otp-sms",
      providerSecretRef: "{{SMS_PROVIDER_API_KEY}}",
    },
    fields: [
      { key: "senderId", label: "Sender ID", type: "text" },
      { key: "template", label: "Template", type: "text" },
      {
        key: "providerSecretRef",
        label: "Provider Secret Reference",
        type: "text",
        optional: true,
      },
    ],
  }),
  createDefinition({
    type: "delay",
    label: "Delay",
    category: "Logic",
    description: "Pauses the workflow for a fixed period.",
    defaults: {
      durationSeconds: 30,
    },
    fields: [
      {
        key: "durationSeconds",
        label: "Duration (seconds)",
        type: "number",
        min: 1,
        step: 1,
      },
    ],
  }),
  createDefinition({
    type: "condition",
    label: "Condition",
    category: "Logic",
    description: "Branches execution based on an expression.",
    defaults: {
      expression: "payload.otpValid === true",
    },
    fields: [
      {
        key: "expression",
        label: "Expression",
        type: "textarea",
        placeholder: "payload.otpValid === true",
      },
    ],
  }),
  createDefinition({
    type: "databaseWrite",
    label: "Database Write",
    category: "Database",
    description: "Writes a record into a persistent store.",
    defaults: {
      table: "otp_sessions",
      operation: "insert",
    },
    fields: [
      { key: "table", label: "Table", type: "text" },
      {
        key: "operation",
        label: "Operation",
        type: "select",
        options: [
          { label: "Insert", value: "insert" },
          { label: "Upsert", value: "upsert" },
          { label: "Update", value: "update" },
        ],
      },
    ],
  }),
  createDefinition({
    type: "databaseRead",
    label: "Database Read",
    category: "Database",
    description: "Fetches a record from a persistent store.",
    defaults: {
      table: "otp_sessions",
      lookupKey: "phoneNumber",
    },
    fields: [
      { key: "table", label: "Table", type: "text" },
      { key: "lookupKey", label: "Lookup Key", type: "text" },
    ],
  }),
  createDefinition({
    type: "databaseUpdate",
    label: "Database Update",
    category: "Database",
    description: "Updates a validated record in a persistent store.",
    defaults: {
      table: "users",
      lookupKey: "id",
      operation: "update",
    },
    fields: [
      { key: "table", label: "Table", type: "text" },
      { key: "lookupKey", label: "Lookup Key", type: "text" },
      {
        key: "operation",
        label: "Operation",
        type: "select",
        options: [
          { label: "Update", value: "update" },
          { label: "Upsert", value: "upsert" },
        ],
      },
    ],
  }),
  createDefinition({
    type: "webhookResponse",
    label: "Webhook Response",
    category: "API / Integrations",
    description: "Returns a structured HTTP response to the caller.",
    defaults: {
      statusCode: 200,
      bodyTemplate: "{\"ok\":true}",
    },
    fields: [
      { key: "statusCode", label: "Status Code", type: "number", min: 100, step: 1 },
      {
        key: "bodyTemplate",
        label: "Body Template",
        type: "textarea",
        placeholder: "{\"ok\":true}",
      },
    ],
  }),
] as const satisfies readonly NodeDefinition[];

export const nodeDefinitionsByType = Object.fromEntries(
  nodeDefinitions.map((definition) => [definition.type, definition]),
) as Record<WorkflowNodeType, NodeDefinition>;

export const nodeCategories = Array.from(
  new Set(nodeDefinitions.map((definition) => definition.category)),
);
