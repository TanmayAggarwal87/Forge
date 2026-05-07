import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateForgePersistenceTables1788770000000 implements MigrationInterface {
  name = 'CreateForgePersistenceTables1788770000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "email" varchar(320) NOT NULL UNIQUE,
        "name" varchar(160) NOT NULL,
        "password_hash" varchar(256) NOT NULL,
        "password_salt" varchar(128) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "token" varchar(128) PRIMARY KEY,
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "expires_at" timestamptz NOT NULL
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workspaces" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "slug" varchar(140) NOT NULL,
        "description" text,
        "status" varchar(32) NOT NULL DEFAULT 'active',
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "projects" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "name" varchar(120) NOT NULL,
        "slug" varchar(140) NOT NULL,
        "description" text,
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workflows" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workspace_id" uuid NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
        "name" varchar(120) NOT NULL,
        "slug" varchar(140) NOT NULL,
        "description" text,
        "status" varchar(32) NOT NULL DEFAULT 'draft',
        "draft_version_id" uuid,
        "published_version_id" uuid,
        "created_by_user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workflow_versions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
        "project_id" uuid REFERENCES "projects"("id") ON DELETE SET NULL,
        "version_number" integer NOT NULL,
        "status" varchar(32) NOT NULL,
        "nodes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "edges_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "viewport_json" jsonb,
        "validation" jsonb NOT NULL DEFAULT '{"isValid":true,"issues":[]}'::jsonb,
        "compiled_ir" jsonb,
        "created_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        "published_at" timestamptz
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workflow_templates" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL UNIQUE,
        "description" text NOT NULL,
        "category" varchar(80) NOT NULL,
        "difficulty" varchar(32) NOT NULL,
        "nodes_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "edges_json" jsonb NOT NULL DEFAULT '[]'::jsonb,
        "preview_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "is_system_template" boolean NOT NULL DEFAULT false,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "workspace_id" uuid REFERENCES "workspaces"("id") ON DELETE SET NULL,
        "workflow_id" uuid REFERENCES "workflows"("id") ON DELETE SET NULL,
        "action" varchar(120) NOT NULL,
        "target_type" varchar(80) NOT NULL,
        "target_id" varchar(160) NOT NULL,
        "metadata_json" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "generated_artifacts" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
        "workflow_version_id" uuid NOT NULL REFERENCES "workflow_versions"("id") ON DELETE CASCADE,
        "type" varchar(48) NOT NULL,
        "name" varchar(160) NOT NULL,
        "content_type" varchar(80) NOT NULL,
        "checksum" varchar(128) NOT NULL,
        "content" text NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workflow_executions" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "project_id" uuid NOT NULL,
        "workflow_id" uuid NOT NULL REFERENCES "workflows"("id") ON DELETE CASCADE,
        "workflow_version_id" uuid NOT NULL REFERENCES "workflow_versions"("id") ON DELETE CASCADE,
        "status" varchar(32) NOT NULL,
        "trigger_type" varchar(32) NOT NULL,
        "trace_id" varchar(120) NOT NULL,
        "idempotency_key" varchar(180),
        "input" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "output" jsonb,
        "error" jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workflow_execution_steps" (
        "id" varchar(260) PRIMARY KEY,
        "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
        "workflow_version_id" uuid NOT NULL REFERENCES "workflow_versions"("id") ON DELETE CASCADE,
        "node_id" varchar(160) NOT NULL,
        "node_type" varchar(160) NOT NULL,
        "label" varchar(160) NOT NULL,
        "status" varchar(32) NOT NULL,
        "attempt" integer NOT NULL,
        "max_attempts" integer NOT NULL,
        "input" jsonb,
        "output" jsonb,
        "error" jsonb,
        "started_at" timestamptz,
        "completed_at" timestamptz,
        "duration_ms" integer,
        "updated_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(`
      CREATE TABLE "workflow_execution_logs" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "execution_id" uuid NOT NULL REFERENCES "workflow_executions"("id") ON DELETE CASCADE,
        "step_id" varchar(260),
        "trace_id" varchar(120) NOT NULL,
        "level" varchar(16) NOT NULL,
        "message" text NOT NULL,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" timestamptz NOT NULL DEFAULT now()
      )
    `);
    await queryRunner.query(
      'CREATE INDEX "idx_sessions_user_id" ON "sessions" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workspaces_user_id" ON "workspaces" ("user_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_projects_workspace_id" ON "projects" ("workspace_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workflows_workspace_id" ON "workflows" ("workspace_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workflows_project_id" ON "workflows" ("project_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workflow_versions_workflow_id" ON "workflow_versions" ("workflow_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_audit_logs_workspace_id" ON "audit_logs" ("workspace_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_audit_logs_workflow_id" ON "audit_logs" ("workflow_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_generated_artifacts_version_id" ON "generated_artifacts" ("workflow_version_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workflow_executions_version_id" ON "workflow_executions" ("workflow_version_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workflow_execution_steps_execution_id" ON "workflow_execution_steps" ("execution_id")',
    );
    await queryRunner.query(
      'CREATE INDEX "idx_workflow_execution_logs_execution_id" ON "workflow_execution_logs" ("execution_id")',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_execution_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_execution_steps"');
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_executions"');
    await queryRunner.query('DROP TABLE IF EXISTS "generated_artifacts"');
    await queryRunner.query('DROP TABLE IF EXISTS "audit_logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_templates"');
    await queryRunner.query('DROP TABLE IF EXISTS "workflow_versions"');
    await queryRunner.query('DROP TABLE IF EXISTS "workflows"');
    await queryRunner.query('DROP TABLE IF EXISTS "projects"');
    await queryRunner.query('DROP TABLE IF EXISTS "workspaces"');
    await queryRunner.query('DROP TABLE IF EXISTS "sessions"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');
  }
}
