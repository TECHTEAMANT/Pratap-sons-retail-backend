import { AppDataSource } from '../src/config/data-source';
import { SalesOrderAdvance } from '../src/entities/SalesOrderAdvance';

async function fixAdvances() {
  try {
    await AppDataSource.initialize();
    console.log('Database initialized');

    const repo = AppDataSource.getRepository(SalesOrderAdvance);
    const result = await repo.createQueryBuilder()
      .update(SalesOrderAdvance)
      .set({ status: 'active' })
      .where('status IS NULL')
      .execute();

    console.log(`Updated ${result.affected} records to 'active'`);
    process.exit(0);
  } catch (err) {
    console.error('Error fixing advances:', err);
    process.exit(1);
  }
}

fixAdvances();
