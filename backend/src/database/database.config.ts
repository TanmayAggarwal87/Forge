import 'dotenv/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
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
    migrations: [__dirname + '/migrations/*{.ts,.js}'],
    synchronize: false,
    migrationsRun: process.env.TYPEORM_MIGRATIONS_RUN === 'true',
    ssl:
      process.env.DB_SSL === 'true'
        ? {
            rejectUnauthorized:
              process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
          }
        : false,
  };
}
