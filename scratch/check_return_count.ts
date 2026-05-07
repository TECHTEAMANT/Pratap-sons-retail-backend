import { AppDataSource } from '../src/config/data-source';
import { SalesReturn } from '../src/entities/SalesReturn';

async function checkCount() {
  await AppDataSource.initialize();
  const count = await AppDataSource.getRepository(SalesReturn).count();
  console.log('Total Sales Returns:', count);
  process.exit(0);
}

checkCount().catch(console.error);
