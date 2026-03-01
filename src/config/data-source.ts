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
  synchronize: false, // Handled explicitly in initializeDatabase() for all environments
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
  // Always synchronize schema on startup (adds missing columns/tables, never drops)
  // This means any new entity fields are auto-applied to the DB without manual migrations
  await AppDataSource.synchronize();
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
