import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { createTypeOrmOptions, databaseEntities } from './database.config';

@Module({
  imports:
    process.env.NODE_ENV === 'test' ||
    process.env.FORGE_DISABLE_DATABASE === 'true'
      ? []
      : [
          TypeOrmModule.forRoot(createTypeOrmOptions()),
          TypeOrmModule.forFeature(databaseEntities),
        ],
  exports:
    process.env.NODE_ENV === 'test' ||
    process.env.FORGE_DISABLE_DATABASE === 'true'
      ? []
      : [TypeOrmModule],
})
export class DatabaseModule {}
