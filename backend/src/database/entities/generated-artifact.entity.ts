import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type {
  GeneratedArtifactContentType,
  GeneratedArtifactType,
} from '../../identity/identity.types';

@Entity({ name: 'generated_artifacts' })
export class GeneratedArtifactEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'project_id', type: 'uuid' })
  projectId!: string;

  @Column({ name: 'workflow_id', type: 'uuid' })
  workflowId!: string;

  @Index()
  @Column({ name: 'workflow_version_id', type: 'uuid' })
  workflowVersionId!: string;

  @Column({ type: 'varchar', length: 48 })
  type!: GeneratedArtifactType;

  @Column({ type: 'varchar', length: 160 })
  name!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 80 })
  contentType!: GeneratedArtifactContentType;

  @Column({ type: 'varchar', length: 128 })
  checksum!: string;

  @Column({ type: 'text' })
  content!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
