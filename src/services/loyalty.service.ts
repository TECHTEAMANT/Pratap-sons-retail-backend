import { AppDataSource } from '../config/data-source';
import { Customer, LoyaltyConfig, LoyaltyHistory, LoyaltyTransactionType } from '../entities';
import { Between, LessThan, In } from 'typeorm';
import logger from '../utils/logger';

export class LoyaltyService {
  private customerRepo = AppDataSource.getRepository(Customer);
  private configRepo = AppDataSource.getRepository(LoyaltyConfig);
  private historyRepo = AppDataSource.getRepository(LoyaltyHistory);

  /**
   * Called daily by cron / manually. Awards points to all customers
   * whose birthday or anniversary falls in the current month.
   */
  async processSpecialDayPoints() {
    const today = new Date();
    const month = today.getMonth() + 1;
    const year = today.getFullYear();
    return this.processMonthPoints(month, year);
  }

  /**
   * Award birthday & anniversary points for a specific month and year.
   * Idempotent — safe to call multiple times; will not double-award.
   */
  async processMonthPoints(month: number, year: number) {
    return AppDataSource.transaction(async (manager) => {
      const config = await manager.findOne(LoyaltyConfig, { where: { active: true } });
      if (!config) {
        logger.info('Loyalty points system is not active or no config found.');
        return { birthdayCount: 0, anniversaryCount: 0 };
      }

      // Find all customers whose birthday falls in this month
      const birthdayCustomers = await manager.createQueryBuilder(Customer, 'c')
        .where('EXTRACT(MONTH FROM c.birthday) = :month', { month })
        .andWhere('c.status = :status', { status: 'active' })
        .getMany();

      let birthdayCount = 0;
      for (const customer of birthdayCustomers) {
        const awarded = await this.awardPointsIfEligible(
          manager,
          customer,
          Number(config.birthday_points),
          LoyaltyTransactionType.BIRTHDAY,
          `Birthday points for ${month}/${year}`,
          year,
          month
        );
        if (awarded) birthdayCount++;
      }

      // Find all customers whose anniversary falls in this month
      const anniversaryCustomers = await manager.createQueryBuilder(Customer, 'c')
        .where('EXTRACT(MONTH FROM c.anniversary) = :month', { month })
        .andWhere('c.status = :status', { status: 'active' })
        .getMany();

      let anniversaryCount = 0;
      for (const customer of anniversaryCustomers) {
        const awarded = await this.awardPointsIfEligible(
          manager,
          customer,
          Number(config.anniversary_points),
          LoyaltyTransactionType.ANNIVERSARY,
          `Anniversary points for ${month}/${year}`,
          year,
          month
        );
        if (awarded) anniversaryCount++;
      }

      logger.info(`Month ${month}/${year}: Awarded birthday to ${birthdayCount}, anniversary to ${anniversaryCount} customers.`);
      return { birthdayCount, anniversaryCount };
    });
  }

  private async awardPointsIfEligible(
    manager: any,
    customer: Customer,
    points: number,
    type: LoyaltyTransactionType,
    notes: string,
    year: number,
    month: number
  ): Promise<boolean> {
    if (points <= 0) return false;

    // Check if already awarded for this type in this exact month+year
    const startOfMonth = new Date(year, month - 1, 1);
    const endOfMonth = new Date(year, month, 0, 23, 59, 59);

    const existing = await manager.findOne(LoyaltyHistory, {
      where: {
        customer_id: customer.id,
        type: type,
        created_at: Between(startOfMonth, endOfMonth)
      }
    });

    if (existing) {
      logger.debug(`${type} points already awarded to ${customer.mobile} for ${month}/${year}`);
      return false;
    }

    // Award points
    customer.loyalty_points = (Number(customer.loyalty_points) || 0) + points;
    customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) + points;
    await manager.save(customer);

    // Points expire at the end of the month they were awarded in
    const expiresAt = new Date(year, month, 0, 23, 59, 59);

    const history = manager.create(LoyaltyHistory, {
      customer_id: customer.id,
      points: points,
      type: type,
      notes: notes,
      expires_at: (type === LoyaltyTransactionType.BIRTHDAY || type === LoyaltyTransactionType.ANNIVERSARY) ? expiresAt : null
    });
    await manager.save(history);

    logger.info(`Awarded ${points} ${type} points to ${customer.mobile} for ${month}/${year}. Expires: ${expiresAt}`);
    return true;
  }

  /**
   * Deducts expired points from customer balances.
   * Finds all LoyaltyHistory entries where expires_at < now AND points > 0 (not already expired/processed)
   */
  async processExpiredPoints() {
    const now = new Date();
    
    return AppDataSource.transaction(async (manager) => {
      // Find all unexpired records that should have expired
      // Note: We only look for records where notes doesn't contain 'EXPIRED_' to avoid double processing
      // and where the points are positive.
      const expiredRecords = await manager.find(LoyaltyHistory, {
        where: {
          expires_at: LessThan(now),
          type: In([LoyaltyTransactionType.BIRTHDAY, LoyaltyTransactionType.ANNIVERSARY])
        },
        relations: ['customer']
      });

      let count = 0;
      for (const record of expiredRecords) {
        // Check if we already created a REDEEM code or adjustment for this expiry
        const alreadyProcessed = await manager.findOne(LoyaltyHistory, {
          where: {
            reference_id: `EXPIRED_${record.id}`
          }
        });

        if (alreadyProcessed) continue;

        const customer = record.customer;
        const pointsToDeduct = Number(record.points);

        // Deduct from balance (don't go below 0)
        const oldBalance = Number(customer.loyalty_points_balance) || 0;
        customer.loyalty_points_balance = Math.max(0, oldBalance - pointsToDeduct);
        await manager.save(customer);

        // Create a record for the deduction
        const deduction = manager.create(LoyaltyHistory, {
          customer_id: customer.id,
          points: -pointsToDeduct,
          type: LoyaltyTransactionType.ADJUSTMENT,
          notes: `Expiry of ${record.type} points from ${record.created_at.toLocaleDateString()}`,
          reference_id: `EXPIRED_${record.id}`
        });
        await manager.save(deduction);
        
        count++;
      }

      if (count > 0) {
        logger.info(`Processed ${count} expired loyalty point records.`);
      }
      return count;
    });
  }
}

export const loyaltyService = new LoyaltyService();
