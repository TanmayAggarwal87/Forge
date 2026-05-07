import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { WorkflowExecutionLogLevel } from '../../identity/identity.types';

@Entity({ name: 'workflow_execution_logs' })
export class WorkflowExecutionLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'execution_id', type: 'uuid' })
  executionId!: string;

  @Column({ name: 'step_id', type: 'varchar', length: 260, nullable: true })
  stepId!: string | null;

  @Column({ name: 'trace_id', type: 'varchar', length: 120 })
  traceId!: string;

  @Column({ type: 'varchar', length: 16 })
  level!: WorkflowExecutionLogLevel;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
