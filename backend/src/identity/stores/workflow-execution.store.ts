import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type {
  WorkflowExecution,
  WorkflowExecutionLog,
  WorkflowExecutionStep,
} from '../identity.types';
import { ForgeMemoryState } from './forge-memory-state.service';
import { WorkflowStore } from './workflow.store';

type CreateExecutionInput = {
  projectId: string;
  workflowId: string;
  workflowVersionId: string;
  status: WorkflowExecution['status'];
  triggerType: WorkflowExecution['triggerType'];
  traceId: string;
  idempotencyKey?: string | null;
  input: Record<string, unknown>;
};

@Injectable()
export class WorkflowExecutionStore {
  constructor(
    private readonly state: ForgeMemoryState,
    private readonly workflowStore: WorkflowStore,
  ) {}

  createWorkflowExecution(input: CreateExecutionInput): WorkflowExecution {
    const now = new Date().toISOString();
    const execution: WorkflowExecution = {
      id: randomUUID(),
      projectId: input.projectId,
      workflowId: input.workflowId,
      workflowVersionId: input.workflowVersionId,
      status: input.status,
      triggerType: input.triggerType,
      traceId: input.traceId,
      idempotencyKey: input.idempotencyKey ?? null,
      input: input.input,
      output: null,
      error: null,
      createdAt: now,
      startedAt: null,
      completedAt: null,
      updatedAt: now,
    };

    this.state.workflowExecutions.set(execution.id, execution);
    return execution;
  }

  findWorkflowExecutionByIdempotencyKey(
    projectId: string,
    workflowId: string,
    workflowVersionId: string,
    idempotencyKey: string,
  ): WorkflowExecution | null {
    return (
      Array.from(this.state.workflowExecutions.values()).find(
        (execution) =>
          execution.projectId === projectId &&
          execution.workflowId === workflowId &&
          execution.workflowVersionId === workflowVersionId &&
          execution.idempotencyKey === idempotencyKey,
      ) ?? null
    );
  }

  updateWorkflowExecution(
    executionId: string,
    patch: Partial<
      Pick<
        WorkflowExecution,
        'status' | 'output' | 'error' | 'startedAt' | 'completedAt'
      >
    >,
  ): WorkflowExecution {
    const execution = this.state.workflowExecutions.get(executionId);
    if (!execution) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    const updatedExecution: WorkflowExecution = {
      ...execution,
      ...patch,
      updatedAt: new Date().toISOString(),
    };

    this.state.workflowExecutions.set(executionId, updatedExecution);
    return updatedExecution;
  }

  upsertWorkflowExecutionStep(
    step: WorkflowExecutionStep,
  ): WorkflowExecutionStep {
    this.state.workflowExecutionSteps.set(step.id, step);
    return step;
  }

  appendWorkflowExecutionLog(log: WorkflowExecutionLog): WorkflowExecutionLog {
    this.state.workflowExecutionLogs.push(log);
    return log;
  }

  getWorkflowExecutionForUser(
    projectId: string,
    workflowId: string,
    executionId: string,
    userId: string,
  ): WorkflowExecution & {
    steps: WorkflowExecutionStep[];
    logs: WorkflowExecutionLog[];
  } {
    this.workflowStore.getWorkflowDraftForUser(projectId, workflowId, userId);

    const execution = this.state.workflowExecutions.get(executionId);
    if (
      !execution ||
      execution.projectId !== projectId ||
      execution.workflowId !== workflowId
    ) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    return {
      ...execution,
      steps: this.listWorkflowExecutionSteps(execution.id),
      logs: this.listWorkflowExecutionLogs(execution.id),
    };
  }

  getWorkflowExecutionById(executionId: string): WorkflowExecution {
    const execution = this.state.workflowExecutions.get(executionId);
    if (!execution) {
      throw new NotFoundException('Workflow execution was not found.');
    }

    return execution;
  }

  listWorkflowExecutionsForUser(
    projectId: string,
    workflowId: string,
    userId: string,
  ): WorkflowExecution[] {
    this.workflowStore.getWorkflowDraftForUser(projectId, workflowId, userId);

    return Array.from(this.state.workflowExecutions.values())
      .filter(
        (execution) =>
          execution.projectId === projectId &&
          execution.workflowId === workflowId,
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  listWorkflowExecutionSteps(executionId: string): WorkflowExecutionStep[] {
    return Array.from(this.state.workflowExecutionSteps.values())
      .filter((step) => step.executionId === executionId)
      .sort(
        (left, right) =>
          left.startedAt?.localeCompare(right.startedAt ?? '') ?? 0,
      );
  }

  listWorkflowExecutionLogs(executionId: string): WorkflowExecutionLog[] {
    return this.state.workflowExecutionLogs.filter(
      (log) => log.executionId === executionId,
    );
  }
}
