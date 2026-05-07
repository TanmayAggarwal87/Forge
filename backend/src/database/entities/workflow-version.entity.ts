import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type {
  WorkflowGraph,
  WorkflowIntermediateRepresentation,
  WorkflowValidationResult,
} from '../../identity/identity.types';
import { WorkflowEntity } from './workflow.entity';

export type WorkflowVersionEntityStatus = 'draft' | 'published';

@Entity({ name: 'workflow_versions' })
export class WorkflowVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId!: string;

  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ name: 'version_number', type: 'int' })
  versionNumber!: number;

  @Column({ type: 'varchar', length: 32 })
  status!: WorkflowVersionEntityStatus;

  @Column({ name: 'nodes_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  nodesJson!: WorkflowGraph['nodes'];

  @Column({ name: 'edges_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  edgesJson!: WorkflowGraph['edges'];

  @Column({ name: 'viewport_json', type: 'jsonb', nullable: true })
  viewportJson!: Record<string, unknown> | null;

  @Column({
    type: 'jsonb',
    default: () => '\'{"isValid":true,"issues":[]}\'::jsonb',
  })
  validation!: WorkflowValidationResult;

  @Column({ name: 'compiled_ir', type: 'jsonb', nullable: true })
  compiledIr!: WorkflowIntermediateRepresentation | null;

  @Column({ name: 'created_by', type: 'uuid' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'published_at', type: 'timestamptz', nullable: true })
  publishedAt!: Date | null;

  @ManyToOne(() => WorkflowEntity, (workflow) => workflow.versions, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workflow_id' })
  workflow!: WorkflowEntity;
}
