import { nodeDefinitionsByType } from "@/features/workflow/nodeRegistry";
import type { WorkflowNodeType } from "@/features/workflow/types";

export type NodePortType =
  | "trigger"
  | "auth"
  | "logic"
  | "database"
  | "communication"
  | "response"
  | "deployment"
  | "utility";

export type ConnectionValidationResult = {
  isValid: boolean;
  reason: string | null;
};

type NodeConnectionRule = {
  portType: NodePortType;
  allowedTargets: readonly WorkflowNodeType[];
  terminal?: boolean;
};

export const nodeConnectionRules: Record<WorkflowNodeType, NodeConnectionRule> = {
  httpTrigger: {
    portType: "trigger",
    allowedTargets: [
      "generateOtp",
      "verifyOtp",
      "createVerificationToken",
      "verifyToken",
      "generateResetToken",
      "verifyResetToken",
      "passwordHash",
      "databaseWrite",
      "databaseRead",
      "databaseUpdate",
      "condition",
      "sendEmail",
      "sendSms",
      "webhookResponse",
    ],
  },
  webhookTrigger: {
    portType: "trigger",
    allowedTargets: [
      "verifySignature",
      "condition",
      "databaseWrite",
      "databaseUpdate",
      "webhookResponse",
    ],
  },
  generateOtp: {
    portType: "auth",
    allowedTargets: ["databaseWrite", "sendSms", "sendEmail", "webhookResponse"],
  },
  verifyOtp: {
    portType: "auth",
    allowedTargets: ["jwtSign", "condition", "databaseRead", "webhookResponse"],
  },
  jwtSign: {
    portType: "auth",
    allowedTargets: ["webhookResponse", "databaseUpdate"],
  },
  passwordHash: {
    portType: "auth",
    allowedTargets: ["databaseUpdate", "webhookResponse"],
  },
  createVerificationToken: {
    portType: "auth",
    allowedTargets: ["databaseWrite", "sendEmail", "webhookResponse"],
  },
  verifyToken: {
    portType: "auth",
    allowedTargets: ["databaseUpdate", "condition", "webhookResponse"],
  },
  generateResetToken: {
    portType: "auth",
    allowedTargets: ["databaseWrite", "sendEmail", "webhookResponse"],
  },
  verifyResetToken: {
    portType: "auth",
    allowedTargets: ["passwordHash", "condition", "webhookResponse"],
  },
  verifySignature: {
    portType: "auth",
    allowedTargets: ["condition", "databaseUpdate", "webhookResponse"],
  },
  sendEmail: {
    portType: "communication",
    allowedTargets: ["webhookResponse", "delay", "databaseUpdate"],
  },
  sendSms: {
    portType: "communication",
    allowedTargets: ["webhookResponse", "delay", "databaseUpdate"],
  },
  delay: {
    portType: "logic",
    allowedTargets: ["sendEmail", "sendSms", "databaseUpdate", "webhookResponse"],
  },
  condition: {
    portType: "logic",
    allowedTargets: [
      "databaseUpdate",
      "databaseWrite",
      "sendEmail",
      "sendSms",
      "webhookResponse",
    ],
  },
  databaseWrite: {
    portType: "database",
    allowedTargets: ["sendEmail", "sendSms", "condition", "webhookResponse"],
  },
  databaseRead: {
    portType: "database",
    allowedTargets: ["condition", "sendEmail", "sendSms", "webhookResponse"],
  },
  databaseUpdate: {
    portType: "database",
    allowedTargets: ["sendEmail", "webhookResponse", "condition"],
  },
  webhookResponse: {
    portType: "response",
    allowedTargets: [],
    terminal: true,
  },
};

export function validateNodeConnection(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
): ConnectionValidationResult {
  if (sourceType === targetType) {
    return {
      isValid: false,
      reason: "A node cannot connect to another node of the same type.",
    };
  }

  const sourceRule = nodeConnectionRules[sourceType];

  if (sourceRule.terminal) {
    return {
      isValid: false,
      reason: `${getNodeLabel(sourceType)} is a terminal node.`,
    };
  }

  if (!sourceRule.allowedTargets.includes(targetType)) {
    return {
      isValid: false,
      reason: `${getNodeLabel(sourceType)} cannot connect directly to ${getNodeLabel(targetType)}.`,
    };
  }

  return {
    isValid: true,
    reason: null,
  };
}

export function canConnectNodeTypes(
  sourceType: WorkflowNodeType,
  targetType: WorkflowNodeType,
) {
  return validateNodeConnection(sourceType, targetType).isValid;
}

function getNodeLabel(type: WorkflowNodeType) {
  return nodeDefinitionsByType[type].label;
}
