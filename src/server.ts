import 'reflect-metadata';
import { config, validateConfig } from './config';
import { initializeDatabase, closeDatabase } from './config/data-source';
import app from './app';
import logger from './utils/logger';
import { customerService } from './services/customer.service';

async function startServer() {
  try {
    // Validate environment
    validateConfig();
    logger.info('Configuration validated ✓');

    // Initialize TypeORM DataSource
    await initializeDatabase();
    logger.info('TypeORM DataSource initialized ✓ (auto-sync ran)');
    logger.info('PostgreSQL connected ✓');

    // Run automatic data repair on startup
    logger.info('Running automatic data repair...');
    customerService.recalculateCustomerStats()
      .then(res => logger.info(`Data repair completed: Processed ${res.customersProcessed} customers, ${res.errors} errors.`))
      .catch(err => logger.error('Data repair failed', { error: err.message }));

    // Start Express server
    const server = app.listen(config.port, () => {
      logger.info(`🚀 INVENTO ERP Backend running on port ${config.port}`);
      logger.info(`   Environment: ${config.nodeEnv}`);
      logger.info(`   Health check: http://localhost:${config.port}/api/health`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received. Shutting down gracefully...`);
      server.close(async () => {
        await closeDatabase();
        logger.info('Server closed');
        process.exit(0);
      });

      // Force shutdown after 10s
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error: any) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

startServer();
