import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceEntity } from './workspace.entity';
import { WorkflowVersionEntity } from './workflow-version.entity';

export type WorkflowEntityStatus = 'draft' | 'published' | 'inactive';

@Entity({ name: 'workflows' })
export class WorkflowEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'uuid' })
  workspaceId!: string;

  @Index()
  @Column({ name: 'project_id', type: 'uuid', nullable: true })
  projectId!: string | null;

  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'varchar', length: 140 })
  slug!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'draft' })
  status!: WorkflowEntityStatus;

  @Column({ name: 'draft_version_id', type: 'uuid', nullable: true })
  draftVersionId!: string | null;

  @Column({ name: 'published_version_id', type: 'uuid', nullable: true })
  publishedVersionId!: string | null;

  @Column({ name: 'created_by_user_id', type: 'uuid' })
  createdByUserId!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne(() => WorkspaceEntity, (workspace) => workspace.workflows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @OneToMany(() => WorkflowVersionEntity, (version) => version.workflow)
  versions!: WorkflowVersionEntity[];
}
