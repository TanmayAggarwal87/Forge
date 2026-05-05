import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { Queue, Worker } from 'bullmq';
import { randomUUID } from 'crypto';
import IORedis from 'ioredis';
import { requireString } from '../common/validation';
import { InMemoryStoreService } from '../identity/in-memory-store.service';
import type {
  WorkflowExecution,
  WorkflowExecutionError,
  WorkflowExecutionLog,
  WorkflowExecutionLogLevel,
  WorkflowExecutionStep,
  WorkflowExecutionTriggerType,
  WorkflowIntermediateRepresentation,
  WorkflowIrEdge,
  WorkflowIrNode,
} from '../identity/identity.types';

type ExecuteWorkflowInput = {
  triggerType: WorkflowExecutionTriggerType;
  idempotencyKey: string | null;
  payload: Record<string, unknown>;
};

type StepResult = {
  output: Record<string, unknown>;
};

type WorkflowExecutionJob = {
  executionId: string;
};

class RuntimeNodeError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

@Injectable()
export class WorkflowExecutionService implements OnModuleDestroy {
  private readonly bullQueue: Queue<WorkflowExecutionJob> | null = null;
  private readonly bullWorker: Worker<WorkflowExecutionJob> | null = null;
  private readonly redisConnection: IORedis | null = null;
  private readonly queuedExecutionIds = new Set<string>();
  private readonly retryBackoffBaseMs = Number(
    process.env.FORGE_EXECUTION_BACKOFF_MS ?? '25',
  );

  constructor(private readonly store: InMemoryStoreService) {
    if (process.env.FORGE_QUEUE_DRIVER === 'bullmq' && process.env.REDIS_URL) {
      this.redisConnection = new IORedis(process.env.REDIS_URL, {
        maxRetriesPerRequest: null,
      });
      this.bullQueue = new Queue<WorkflowExecutionJob>(
        'forge-workflow-executions',
        {
          connection: this.redisConnection,
        },
      );
      this.bullWorker = new Worker<WorkflowExecutionJob>(
        'forge-workflow-executions',
        async (job) => {
          try {
            await this.processExecution(job.data.executionId);
          } finally {
            this.queuedExecutionIds.delete(job.data.executionId);
          }
        },
        {
          connection: this.redisConnection,
          concurrency: Number(process.env.FORGE_WORKER_CONCURRENCY ?? '5'),
        },
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.bullWorker?.close();
    await this.bullQueue?.close();
    this.redisConnection?.disconnect();
  }

  async executePublishedWorkflow(
    projectId: string,
    workflowId: string,
    userId: string,
    body: Record<string, unknown>,
  ) {
    const publishedWorkflow = this.store.getPublishedWorkflowForUser(
      projectId,
      workflowId,
      userId,
    );
    const compiledIr = publishedWorkflow.publishedVersion.compiledIr;

    if (!compiledIr) {
      throw new BadRequestException(
        'Published workflow version does not have a compiled runtime plan.',
      );
    }

    const input = this.parseExecuteInput(body);
    const existingExecution = input.idempotencyKey
      ? this.store.findWorkflowExecutionByIdempotencyKey(
          projectId,
          workflowId,
          publishedWorkflow.publishedVersion.id,
          input.idempotencyKey,
        )
      : null;
    if (existingExecution) {
      return {
        execution: existingExecution,
        mode: this.hasAsyncNodes(compiledIr) ? 'async' : 'sync',
        idempotentReplay: true,
      };
    }

    const execution = this.store.createWorkflowExecution({
      projectId,
      workflowId,
      workflowVersionId: publishedWorkflow.publishedVersion.id,
      status: this.hasAsyncNodes(compiledIr) ? 'queued' : 'running',
      triggerType: input.triggerType,
      traceId: randomUUID(),
      idempotencyKey: input.idempotencyKey,
      input: sanitizeRecord(input.payload),
    });

    this.log(execution, null, 'info', 'Workflow execution accepted.', {
      triggerType: execution.triggerType,
      workflowVersionId: execution.workflowVersionId,
    });

    if (this.hasAsyncNodes(compiledIr)) {
      this.enqueueExecution(execution.id);
      return {
        execution: this.store.getWorkflowExecutionById(execution.id),
        mode: 'async',
      };
    }

    return {
      execution: await this.processExecution(execution.id),
      mode: 'sync',
    };
  }

  listExecutions(projectId: string, workflowId: string, userId: string) {
    return {
      executions: this.store.listWorkflowExecutionsForUser(
        projectId,
        workflowId,
        userId,
      ),
    };
  }

  getExecution(
    projectId: string,
    workflowId: string,
    executionId: string,
    userId: string,
  ) {
    return {
      execution: this.store.getWorkflowExecutionForUser(
        projectId,
        workflowId,
        executionId,
        userId,
      ),
    };
  }

  async waitForExecutionToSettle(
    executionId: string,
    timeoutMs = 2000,
  ): Promise<WorkflowExecution> {
    const deadline = Date.now() + timeoutMs;

    while (Date.now() <= deadline) {
      const execution = this.store.getWorkflowExecutionById(executionId);
      if (!['queued', 'running'].includes(execution.status)) {
        return execution;
      }

      await sleep(10);
    }

    return this.store.getWorkflowExecutionById(executionId);
  }

  private enqueueExecution(executionId: string): void {
    if (this.queuedExecutionIds.has(executionId)) {
      return;
    }

    if (this.bullQueue) {
      this.queuedExecutionIds.add(executionId);
      void this.bullQueue
        .add(
          'execute-workflow',
          { executionId },
          {
            attempts: 1,
            jobId: executionId,
            removeOnComplete: { count: 1000 },
            removeOnFail: { count: 1000 },
          },
        )
        .catch(() => {
          this.queuedExecutionIds.delete(executionId);
          this.enqueueInMemory(executionId);
        });
      return;
    }

    this.enqueueInMemory(executionId);
  }

  private enqueueInMemory(executionId: string): void {
    if (this.queuedExecutionIds.has(executionId)) {
      return;
    }

    this.queuedExecutionIds.add(executionId);
    setTimeout(() => {
      void this.processExecution(executionId).finally(() => {
        this.queuedExecutionIds.delete(executionId);
      });
    }, 0);
  }

  private async processExecution(
    executionId: string,
  ): Promise<WorkflowExecution> {
    let execution = this.store.getWorkflowExecutionById(executionId);
    const version = this.store.getWorkflowVersionById(
      execution.workflowVersionId,
    );
    const ir = version.compiledIr;

    if (!ir) {
      const error = toExecutionError(
        new RuntimeNodeError(
          'runtime.missing_ir',
          'Workflow version does not have a compiled runtime plan.',
          false,
        ),
      );
      return this.store.updateWorkflowExecution(execution.id, {
        status: 'failed',
        error,
        completedAt: new Date().toISOString(),
      });
    }

    const startedAt = execution.startedAt ?? new Date().toISOString();
    execution = this.store.updateWorkflowExecution(execution.id, {
      status: 'running',
      startedAt,
    });
    this.log(execution, null, 'info', 'Workflow execution started.', {
      graphHash: ir.graphHash,
    });

    try {
      const output = await this.runIr(execution, ir);
      const completed = this.store.updateWorkflowExecution(execution.id, {
        status: 'succeeded',
        output: sanitizeRecord(output),
        completedAt: new Date().toISOString(),
      });
      this.log(completed, null, 'info', 'Workflow execution succeeded.', {});
      return completed;
    } catch (error) {
      const executionError = toExecutionError(error);
      const status =
        executionError.code === 'runtime.timeout'
          ? 'timed_out'
          : executionError.retryable
            ? 'dead_lettered'
            : 'failed';
      const failed = this.store.updateWorkflowExecution(execution.id, {
        status,
        error: executionError,
        completedAt: new Date().toISOString(),
      });
      this.log(failed, null, 'error', 'Workflow execution failed.', {
        code: executionError.code,
        status,
      });
      return failed;
    }
  }

  private async runIr(
    execution: WorkflowExecution,
    ir: WorkflowIntermediateRepresentation,
  ): Promise<Record<string, unknown>> {
    const nodeById = new Map(ir.nodes.map((node) => [node.id, node]));
    const incomingEdgesByNodeId = groupEdgesByTarget(ir.edges);
    const outputByNodeId = new Map<string, Record<string, unknown>>();
    const stepStatusByNodeId = new Map<
      string,
      WorkflowExecutionStep['status']
    >();
    let lastOutput: Record<string, unknown> = execution.input;

    for (const nodeId of ir.executionOrder) {
      const node = nodeById.get(nodeId);
      if (!node) {
        continue;
      }

      const stepId = this.stepId(execution.id, node.id);
      const input = this.buildNodeInput(
        node,
        incomingEdgesByNodeId.get(node.id) ?? [],
        outputByNodeId,
        stepStatusByNodeId,
        execution.input,
      );

      if (!input.shouldRun) {
        this.upsertStep(execution, node, {
          id: stepId,
          status: 'skipped',
          attempt: 0,
          input: null,
          output: null,
          error: null,
          startedAt: null,
          completedAt: new Date().toISOString(),
          durationMs: 0,
        });
        stepStatusByNodeId.set(node.id, 'skipped');
        this.log(execution, stepId, 'info', 'Workflow step skipped.', {
          nodeId: node.id,
        });
        continue;
      }

      const result = await this.runStepWithRetries(
        execution,
        node,
        input.value,
      );
      outputByNodeId.set(node.id, result.output);
      stepStatusByNodeId.set(node.id, 'succeeded');
      lastOutput = result.output;
    }

    return lastOutput;
  }

  private buildNodeInput(
    node: WorkflowIrNode,
    incomingEdges: WorkflowIrEdge[],
    outputByNodeId: Map<string, Record<string, unknown>>,
    stepStatusByNodeId: Map<string, WorkflowExecutionStep['status']>,
    triggerPayload: Record<string, unknown>,
  ): { shouldRun: boolean; value: Record<string, unknown> } {
    if (node.type.startsWith('trigger.')) {
      return { shouldRun: true, value: triggerPayload };
    }

    if (incomingEdges.length === 0) {
      return { shouldRun: true, value: triggerPayload };
    }

    const activeInputs: Array<[string, Record<string, unknown>]> = [];

    for (const edge of incomingEdges) {
      const sourceStatus = stepStatusByNodeId.get(edge.sourceNodeId);
      const sourceOutput = outputByNodeId.get(edge.sourceNodeId);

      if (sourceStatus === 'failed' || sourceStatus === 'timed_out') {
        return { shouldRun: false, value: {} };
      }

      if (sourceStatus === 'succeeded' && sourceOutput) {
        if (this.isEdgeActive(edge, sourceOutput)) {
          activeInputs.push([edge.sourceNodeId, sourceOutput]);
        }
      }
    }

    if (activeInputs.length === 0) {
      return { shouldRun: false, value: {} };
    }

    if (activeInputs.length === 1) {
      return { shouldRun: true, value: activeInputs[0][1] };
    }

    return {
      shouldRun: true,
      value: {
        inputs: Object.fromEntries(activeInputs),
      },
    };
  }

  private async runStepWithRetries(
    execution: WorkflowExecution,
    node: WorkflowIrNode,
    input: Record<string, unknown>,
  ): Promise<StepResult> {
    const maxAttempts = node.retryable ? 3 : 1;
    const stepId = this.stepId(execution.id, node.id);
    let lastError: WorkflowExecutionError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAtTime = Date.now();
      const startedAt = new Date(startedAtTime).toISOString();
      this.upsertStep(execution, node, {
        id: stepId,
        status: attempt > 1 ? 'retrying' : 'running',
        attempt,
        input: sanitizeRecord(input),
        output: null,
        error: null,
        startedAt,
        completedAt: null,
        durationMs: null,
      });
      this.log(execution, stepId, 'info', 'Workflow step attempt started.', {
        nodeId: node.id,
        attempt,
        maxAttempts,
      });

      try {
        const output = await withTimeout(
          this.executeNode(node, input),
          node.timeoutMs,
        );
        const completedAt = new Date().toISOString();
        this.upsertStep(execution, node, {
          id: stepId,
          status: 'succeeded',
          attempt,
          input: sanitizeRecord(input),
          output: sanitizeRecord(output),
          error: null,
          startedAt,
          completedAt,
          durationMs: Date.now() - startedAtTime,
        });
        this.log(execution, stepId, 'info', 'Workflow step succeeded.', {
          nodeId: node.id,
          attempt,
        });
        return { output };
      } catch (error) {
        lastError = toExecutionError(error);
        const isFinalAttempt = attempt === maxAttempts || !lastError.retryable;
        const completedAt = new Date().toISOString();
        this.upsertStep(execution, node, {
          id: stepId,
          status: isFinalAttempt
            ? lastError.code === 'runtime.timeout'
              ? 'timed_out'
              : 'failed'
            : 'retrying',
          attempt,
          input: sanitizeRecord(input),
          output: null,
          error: lastError,
          startedAt,
          completedAt,
          durationMs: Date.now() - startedAtTime,
        });
        this.log(
          execution,
          stepId,
          isFinalAttempt ? 'error' : 'warn',
          isFinalAttempt
            ? 'Workflow step failed.'
            : 'Workflow step failed and will retry.',
          {
            nodeId: node.id,
            attempt,
            code: lastError.code,
          },
        );

        if (isFinalAttempt) {
          throw lastError;
        }

        await sleep(this.retryBackoffBaseMs * 2 ** (attempt - 1));
      }
    }

    throw lastError;
  }

  private async executeNode(
    node: WorkflowIrNode,
    input: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    switch (node.type) {
      case 'trigger.http':
      case 'trigger.schedule':
        return input;
      case 'logic.condition':
        return {
          ...input,
          conditionResult: evaluateCondition(node.config.expression, input),
        };
      case 'logic.transform':
        return applyTemplate(node.config.template, input);
      case 'data.insert_record':
        return {
          ...input,
          record: {
            id: randomUUID(),
            resource: requireNodeConfigString(node, 'resource'),
            insertedAt: new Date().toISOString(),
          },
        };
      case 'integration.rest_request':
        return this.executeRestRequestNode(node, input);
      case 'utility.response_builder':
        return {
          statusCode:
            typeof node.config.statusCode === 'number'
              ? node.config.statusCode
              : 200,
          body: input,
        };
      default:
        return input;
    }
  }

  private executeRestRequestNode(
    node: WorkflowIrNode,
    input: Record<string, unknown>,
  ): Record<string, unknown> {
    const method = requireNodeConfigString(node, 'method').toUpperCase();
    const url = requireNodeConfigString(node, 'url');
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(url);
    } catch {
      throw new RuntimeNodeError(
        'integration.invalid_url',
        'REST request URL must be absolute and valid.',
        true,
      );
    }

    if (parsedUrl.protocol !== 'https:') {
      throw new RuntimeNodeError(
        'integration.insecure_url',
        'REST request URL must use HTTPS.',
        true,
      );
    }

    return {
      ...input,
      restResponse: {
        method,
        url: parsedUrl.toString(),
        statusCode: 200,
        body: null,
      },
    };
  }

  private upsertStep(
    execution: WorkflowExecution,
    node: WorkflowIrNode,
    patch: {
      id: string;
      status: WorkflowExecutionStep['status'];
      attempt: number;
      input: Record<string, unknown> | null;
      output: Record<string, unknown> | null;
      error: WorkflowExecutionError | null;
      startedAt: string | null;
      completedAt: string | null;
      durationMs: number | null;
    },
  ): WorkflowExecutionStep {
    return this.store.upsertWorkflowExecutionStep({
      id: patch.id,
      executionId: execution.id,
      workflowVersionId: execution.workflowVersionId,
      nodeId: node.id,
      nodeType: node.type,
      label: node.label,
      status: patch.status,
      attempt: patch.attempt,
      maxAttempts: node.retryable ? 3 : 1,
      input: patch.input,
      output: patch.output,
      error: patch.error,
      startedAt: patch.startedAt,
      completedAt: patch.completedAt,
      durationMs: patch.durationMs,
      updatedAt: new Date().toISOString(),
    });
  }

  private log(
    execution: WorkflowExecution,
    stepId: string | null,
    level: WorkflowExecutionLogLevel,
    message: string,
    metadata: Record<string, unknown>,
  ): WorkflowExecutionLog {
    return this.store.appendWorkflowExecutionLog({
      id: randomUUID(),
      executionId: execution.id,
      stepId,
      traceId: execution.traceId,
      level,
      message,
      metadata: sanitizeRecord(metadata),
      createdAt: new Date().toISOString(),
    });
  }

  private hasAsyncNodes(ir: WorkflowIntermediateRepresentation): boolean {
    return ir.nodes.some((node) => node.executionMode === 'async');
  }

  private isEdgeActive(
    edge: WorkflowIrEdge,
    sourceOutput: Record<string, unknown>,
  ): boolean {
    if (edge.condition === null) {
      return true;
    }

    const conditionResult = sourceOutput.conditionResult;
    if (typeof conditionResult !== 'boolean') {
      return true;
    }

    const normalizedCondition = edge.condition.trim().toLowerCase();
    if (['true', 'yes', 'on_true', 'success'].includes(normalizedCondition)) {
      return conditionResult;
    }

    if (['false', 'no', 'on_false', 'failure'].includes(normalizedCondition)) {
      return !conditionResult;
    }

    return true;
  }

  private stepId(executionId: string, nodeId: string): string {
    return `${executionId}:${nodeId}`;
  }

  private parseExecuteInput(
    body: Record<string, unknown>,
  ): ExecuteWorkflowInput {
    const triggerType =
      body.triggerType === undefined
        ? 'manual'
        : requireString(body.triggerType, 'triggerType', 20);

    if (!['http', 'manual', 'schedule'].includes(triggerType)) {
      throw new BadRequestException(
        'triggerType must be one of: http, manual, schedule.',
      );
    }

    if (body.input !== undefined && !isRecord(body.input)) {
      throw new BadRequestException('input must be an object.');
    }

    const idempotencyKey =
      body.idempotencyKey === undefined || body.idempotencyKey === null
        ? null
        : requireString(body.idempotencyKey, 'idempotencyKey', 160);

    return {
      triggerType: triggerType as WorkflowExecutionTriggerType,
      idempotencyKey,
      payload: body.input === undefined ? {} : body.input,
    };
  }
}

function groupEdgesByTarget(
  edges: WorkflowIrEdge[],
): Map<string, WorkflowIrEdge[]> {
  const grouped = new Map<string, WorkflowIrEdge[]>();

  for (const edge of edges) {
    grouped.set(edge.targetNodeId, [
      ...(grouped.get(edge.targetNodeId) ?? []),
      edge,
    ]);
  }

  return grouped;
}

function requireNodeConfigString(node: WorkflowIrNode, field: string): string {
  const value = node.config[field];

  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new RuntimeNodeError(
      'node.invalid_config',
      `Node "${node.label}" requires config.${field}.`,
      false,
    );
  }

  return value.trim();
}

function evaluateCondition(
  value: unknown,
  input: Record<string, unknown>,
): boolean {
  if (typeof value !== 'string') {
    return true;
  }

  const expression = value.trim();
  if (expression === '' || expression.toLowerCase() === 'true') {
    return true;
  }

  if (expression.toLowerCase() === 'false') {
    return false;
  }

  const comparison = expression.match(/^([\w.]+)\s*(==|!=)\s*(.+)$/);
  if (!comparison) {
    throw new RuntimeNodeError(
      'condition.unsupported_expression',
      'Condition expression must be true, false, field == value, or field != value.',
      false,
    );
  }

  const [, path, operator, rawExpected] = comparison;
  const actual = getPath(input, path);
  const expected = parseLiteral(rawExpected.trim());

  return operator === '==' ? actual === expected : actual !== expected;
}

function applyTemplate(
  value: unknown,
  input: Record<string, unknown>,
): Record<string, unknown> {
  if (!isRecord(value)) {
    return input;
  }

  return materializeTemplate(value, input) as Record<string, unknown>;
}

function materializeTemplate(
  value: unknown,
  input: Record<string, unknown>,
): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => materializeTemplate(item, input));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        materializeTemplate(item, input),
      ]),
    );
  }

  if (typeof value === 'string' && value.startsWith('$input.')) {
    return getPath(input, value.slice('$input.'.length));
  }

  if (value === '$input') {
    return input;
  }

  return value;
}

function getPath(value: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }

    return current[segment];
  }, value);
}

function parseLiteral(value: string): unknown {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  if (value === 'true') {
    return true;
  }

  if (value === 'false') {
    return false;
  }

  if (value === 'null') {
    return null;
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : value;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
): Promise<T> {
  let timeout: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new RuntimeNodeError(
          'runtime.timeout',
          `Workflow step exceeded ${timeoutMs}ms timeout.`,
          true,
        ),
      );
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function toExecutionError(error: unknown): WorkflowExecutionError {
  if (error instanceof RuntimeNodeError) {
    return {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
    };
  }

  if (isRecord(error)) {
    return {
      code: typeof error.code === 'string' ? error.code : 'runtime.error',
      message:
        typeof error.message === 'string'
          ? error.message
          : 'Workflow execution failed.',
      retryable: Boolean(error.retryable),
    };
  }

  return {
    code: 'runtime.error',
    message: 'Workflow execution failed.',
    retryable: false,
  };
}

function sanitizeRecord(
  value: Record<string, unknown>,
): Record<string, unknown> {
  return sanitizeValue(value) as Record<string, unknown>;
}

function sanitizeValue(value: unknown, depth = 0): unknown {
  if (depth > 5) {
    return '[Truncated]';
  }

  if (typeof value === 'string') {
    return value.length > 1000 ? `${value.slice(0, 1000)}...` : value;
  }

  if (Array.isArray(value)) {
    return value.slice(0, 25).map((item) => sanitizeValue(item, depth + 1));
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        isSensitiveKey(key) ? '[Redacted]' : sanitizeValue(item, depth + 1),
      ]),
    );
  }

  return value;
}

function isSensitiveKey(key: string): boolean {
  return /password|secret|token|apikey|api_key|authorization|cookie/i.test(key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
