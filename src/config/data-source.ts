import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { config } from './index';
import path from 'path';

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.db.host,
  port: config.db.port,
  database: config.db.name,
  username: config.db.user,
  password: config.db.password,
  ssl: config.db.ssl ? { rejectUnauthorized: false } : false,
  synchronize: config.nodeEnv === 'development', // auto-sync in dev only
  logging: config.nodeEnv === 'development' ? ['error', 'warn'] : ['error'],
  entities: [path.join(__dirname, '../entities/**/*.{ts,js}')],
  migrations: [path.join(__dirname, '../database/migrations/**/*.{ts,js}')],
  subscribers: [],
});

/**
 * Initialize the TypeORM DataSource
 */
export async function initializeDatabase(): Promise<DataSource> {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }
  return AppDataSource;
}

/**
 * Close the TypeORM DataSource
 */
export async function closeDatabase(): Promise<void> {
  if (AppDataSource.isInitialized) {
    await AppDataSource.destroy();
  }
}
