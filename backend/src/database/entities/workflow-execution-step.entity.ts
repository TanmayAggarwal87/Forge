import {
  Column,
  Entity,
  Index,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  WorkflowExecutionError,
  WorkflowExecutionStepStatus,
} from '../../identity/identity.types';

@Entity({ name: 'workflow_execution_steps' })
export class WorkflowExecutionStepEntity {
  @PrimaryColumn({ type: 'varchar', length: 260 })
  id!: string;

  @Index()
  @Column({ name: 'execution_id', type: 'uuid' })
  executionId!: string;

  @Column({ name: 'workflow_version_id', type: 'uuid' })
  workflowVersionId!: string;

  @Column({ name: 'node_id', type: 'varchar', length: 160 })
  nodeId!: string;

  @Column({ name: 'node_type', type: 'varchar', length: 160 })
  nodeType!: string;

  @Column({ type: 'varchar', length: 160 })
  label!: string;

  @Column({ type: 'varchar', length: 32 })
  status!: WorkflowExecutionStepStatus;

  @Column({ type: 'int' })
  attempt!: number;

  @Column({ name: 'max_attempts', type: 'int' })
  maxAttempts!: number;

  @Column({ type: 'jsonb', nullable: true })
  input!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  output!: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  error!: WorkflowExecutionError | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'duration_ms', type: 'int', nullable: true })
  durationMs!: number | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
