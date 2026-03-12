import { AppDataSource } from '../config/data-source';
import { Customer, SalesInvoice, LoyaltyConfig, LoyaltyHistory, LoyaltyTransactionType } from '../entities';
import logger from '../utils/logger';

async function backfill() {
  try {
    await AppDataSource.initialize();
    logger.info('Database initialized for loyalty backfill');

    const invoiceRepo = AppDataSource.getRepository(SalesInvoice);
    const customerRepo = AppDataSource.getRepository(Customer);
    const historyRepo = AppDataSource.getRepository(LoyaltyHistory);
    const configRepo = AppDataSource.getRepository(LoyaltyConfig);

    // 1. Get Loyalty Config
    let config = await configRepo.findOne({ where: { active: true } });
    if (!config) {
      logger.error('No active loyalty config found. Please ensure it is created.');
      process.exit(1);
    }

    const pointsPerRupee = Number(config.points_per_rupee) || 0.01;
    logger.info(`Using points rate: ${pointsPerRupee * 100}%`);

    // 2. Clear existing totals to avoid double counting if re-run
    logger.info('Resetting customer loyalty totals for clean sync...');
    await customerRepo.createQueryBuilder()
      .update(Customer)
      .set({
        loyalty_points: 0,
        loyalty_points_balance: 0,
        total_purchases: 0,
        total_visits: 0
      })
      .execute();
    
    // Clear history to start fresh for EARN transactions matching invoices
    await historyRepo.delete({ type: LoyaltyTransactionType.EARN });

    // 3. Process all invoices
    const invoices = await invoiceRepo.find({
      order: { created_at: 'ASC' }
    });

    logger.info(`Found ${invoices.length} invoices to process.`);

    for (const invoice of invoices) {
      if (!invoice.customer_mobile) continue;

      const customer = await customerRepo.findOne({ where: { mobile: invoice.customer_mobile } });
      if (!customer) {
        logger.warn(`No customer found for mobile ${invoice.customer_mobile} (Invoice ${invoice.invoice_number})`);
        continue;
      }

      const pointsEarned = parseFloat((Number(invoice.net_payable) * pointsPerRupee).toFixed(2));
      
      // Update Invoice
      invoice.loyalty_points_earned = pointsEarned;
      await invoiceRepo.save(invoice);

      // Update Customer
      customer.loyalty_points = (Number(customer.loyalty_points) || 0) + pointsEarned;
      customer.loyalty_points_balance = (Number(customer.loyalty_points_balance) || 0) + pointsEarned;
      customer.total_purchases = (Number(customer.total_purchases) || 0) + Number(invoice.net_payable);
      customer.total_visits = (Number(customer.total_visits) || 0) + 1;
      
      const invoiceDate = new Date(invoice.invoice_date);
      if (!customer.last_purchase_date || new Date(customer.last_purchase_date) < invoiceDate) {
        customer.last_purchase_date = invoiceDate;
      }
      
      await customerRepo.save(customer);

      // Create History
      const history = historyRepo.create({
        customer_id: customer.id,
        points: pointsEarned,
        type: LoyaltyTransactionType.EARN,
        reference_id: invoice.id,
        notes: `Backfilled: Points earned from invoice ${invoice.invoice_number}`,
        created_at: invoice.created_at // Preserve original timestamp
      });
      await historyRepo.save(history);
    }

    logger.info('Loyalty backfill completed successfully.');
    process.exit(0);
  } catch (err: any) {
    const fs = require('fs');
    fs.writeFileSync('./backfill_error.txt', err.stack || err.message || JSON.stringify(err));
    console.error('CRITICAL BACKFILL ERROR written to backfill_error.txt');
    process.exit(1);
  }
}

backfill();
