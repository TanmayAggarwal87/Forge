import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  WorkflowExecutionError,
  WorkflowExecutionStatus,
  WorkflowExecutionTriggerType,
} from '../../identity/identity.types';

@Entity({ name: 'workflow_executions' })
export class WorkflowExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId!: string;

  @Index()
  @Column({ name: 'workflow_version_id', type: 'uuid' })
  workflowVersionId!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: WorkflowExecutionStatus;

  @Column({ name: 'trigger_type', type: 'varchar', length: 32 })
  triggerType!: WorkflowExecutionTriggerType;

  @Column({ name: 'trace_id', type: 'varchar', length: 120 })
  traceId!: string;

  @Column({
    name: 'idempotency_key',
    type: 'varchar',
    length: 180,
    nullable: true,
  })
  idempotencyKey!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  input!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  error!: WorkflowExecutionError | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
