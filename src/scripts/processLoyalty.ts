import { AppDataSource } from '../config/data-source';
import { LoyaltyConfig } from '../entities';
import { loyaltyService } from '../services/loyalty.service';
import logger from '../utils/logger';

async function run() {
  try {
    await AppDataSource.initialize();
    logger.info('Database initialized for loyalty processing');

    // Ensure default config exists
    const configRepo = AppDataSource.getRepository(LoyaltyConfig);
    let config = await configRepo.findOne({ where: { active: true } });

    if (!config) {
      logger.info('No active loyalty config found. Creating default...');
      config = configRepo.create({
        points_per_rupee: 0.01, // 1%
        redemption_value_per_point: 1, // 1 point = 1 rupee
        min_invoice_value: 0,
        max_redeem_percentage: 100,
        birthday_points: 250,
        anniversary_points: 250,
        active: true
      });
      await configRepo.save(config);
      logger.info('Default loyalty config created.');
    }

    logger.info('Processing special day points...');
    await loyaltyService.processSpecialDayPoints();
    logger.info('Loyalty processing completed successfully.');

    process.exit(0);
  } catch (err) {
    logger.error('Error processing loyalty:', err);
    process.exit(1);
  }
}

run();
