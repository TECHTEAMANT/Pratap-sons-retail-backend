import { AppDataSource } from '../src/config/data-source';
import { TallySync } from '../src/entities/TallySync';

async function checkSyncCount() {
  await AppDataSource.initialize();
  const count = await AppDataSource.getRepository(TallySync).count({ where: { record_type: 'sales_return' } });
  console.log('Total Sales Return Sync Records:', count);
  process.exit(0);
}

checkSyncCount().catch(console.error);
