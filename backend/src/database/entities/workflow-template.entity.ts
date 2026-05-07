import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export type WorkflowTemplateDifficulty = 'Basic' | 'Intermediate' | 'Advanced';

@Entity({ name: 'workflow_templates' })
export class WorkflowTemplateEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 120 })
  name!: string;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'varchar', length: 80 })
  category!: string;

  @Column({ type: 'varchar', length: 32 })
  difficulty!: WorkflowTemplateDifficulty;

  @Column({ name: 'nodes_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  nodesJson!: unknown[];

  @Column({ name: 'edges_json', type: 'jsonb', default: () => "'[]'::jsonb" })
  edgesJson!: unknown[];

  @Column({ name: 'preview_json', type: 'jsonb', default: () => "'{}'::jsonb" })
  previewJson!: Record<string, unknown>;

  @Column({ name: 'is_system_template', type: 'boolean', default: false })
  isSystemTemplate!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
