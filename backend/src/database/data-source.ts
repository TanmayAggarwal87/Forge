import 'reflect-metadata';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { createTypeOrmOptions } from './database.config';

const options = createTypeOrmOptions() as DataSourceOptions;

export default new DataSource(options);
