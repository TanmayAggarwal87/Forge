import { z } from "zod";
import type {
  NodeConfigField,
  WorkflowNodeData,
  WorkflowNodeType,
} from "@/features/workflow/types";

type NodeDefinition = {
  type: WorkflowNodeType;
  label: string;
  category: "Triggers" | "Authentication" | "Communication" | "Logic" | "Database";
  description: string;
  defaults: WorkflowNodeData["config"];
  fields: NodeConfigField[];
  schema: z.ZodObject<Record<string, z.ZodType>>;
};

function configSchema(fields: NodeConfigField[]) {
  return z.object(
    Object.fromEntries(
      fields.map((field) => {
        if (field.type === "number") {
          return [
            field.key,
            z.coerce
              .number()
              .min(field.min ?? Number.NEGATIVE_INFINITY, `${field.label} is invalid`),
          ];
        }

        return [field.key, z.string().trim().min(1, `${field.label} is required`)];
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
    type: "sendEmail",
    label: "Send Email",
    category: "Communication",
    description: "Dispatches a transactional email.",
    defaults: {
      from: "no-reply@company.com",
      template: "otp-email",
    },
    fields: [
      { key: "from", label: "From Address", type: "text" },
      { key: "template", label: "Template", type: "text" },
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
    },
    fields: [
      { key: "senderId", label: "Sender ID", type: "text" },
      { key: "template", label: "Template", type: "text" },
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
] as const satisfies readonly NodeDefinition[];

export const nodeDefinitionsByType = Object.fromEntries(
  nodeDefinitions.map((definition) => [definition.type, definition]),
) as Record<WorkflowNodeType, NodeDefinition>;

export const nodeCategories = Array.from(
  new Set(nodeDefinitions.map((definition) => definition.category)),
);
