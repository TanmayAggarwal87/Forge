import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { config } from 'dotenv';
import { resolve } from 'path';
import { CreateForgePersistenceTables1788770000000 } from './migrations/1788770000000-CreateForgePersistenceTables';
import {
  AuditLogEntity,
  GeneratedArtifactEntity,
  ProjectEntity,
  SessionEntity,
  UserEntity,
  WorkflowEntity,
  WorkflowExecutionEntity,
  WorkflowExecutionLogEntity,
  WorkflowExecutionStepEntity,
  WorkflowTemplateEntity,
  WorkflowVersionEntity,
  WorkspaceEntity,
} from './entities';

for (const envPath of [
  resolve(process.cwd(), '.env'),
  resolve(process.cwd(), 'backend', '.env'),
  resolve(__dirname, '..', '..', '.env'),
]) {
  config({ path: envPath, quiet: true });
}

export const databaseEntities = [
  AuditLogEntity,
  GeneratedArtifactEntity,
  ProjectEntity,
  SessionEntity,
  UserEntity,
  WorkflowEntity,
  WorkflowExecutionEntity,
  WorkflowExecutionLogEntity,
  WorkflowExecutionStepEntity,
  WorkflowTemplateEntity,
  WorkflowVersionEntity,
  WorkspaceEntity,
];

export function createTypeOrmOptions(): TypeOrmModuleOptions {
  const databaseUrl = process.env.DATABASE_URL;

  return {
    type: 'postgres',
    url: databaseUrl,
    host: databaseUrl ? undefined : (process.env.DB_HOST ?? 'localhost'),
    port: databaseUrl ? undefined : Number(process.env.DB_PORT ?? '5432'),
    username: databaseUrl
      ? undefined
      : (process.env.DB_USERNAME ?? process.env.DB_USER ?? 'postgres'),
    password: databaseUrl ? undefined : (process.env.DB_PASSWORD ?? 'password'),
    database: databaseUrl ? undefined : (process.env.DB_NAME ?? 'forge'),
    entities: databaseEntities,
    migrations: [CreateForgePersistenceTables1788770000000],
    synchronize: false,
    migrationsRun: shouldRunDatabaseMigrations(),
    ssl:
      process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          }
        : false,
  };
}

export function shouldRunDatabaseMigrations(): boolean {
  return (
    process.env.TYPEORM_MIGRATIONS_RUN === 'true' ||
    (process.env.TYPEORM_MIGRATIONS_RUN !== 'false' &&
      process.env.NODE_ENV !== 'production')
  );
}
