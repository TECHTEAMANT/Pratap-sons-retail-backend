import { AppDataSource } from '../src/config/data-source';
import { TallySync } from '../src/entities/TallySync';

async function checkSync() {
  await AppDataSource.initialize();
  const syncRepo = AppDataSource.getRepository(TallySync);
  const syncs = await syncRepo.find({ where: { invoice_number: 'SRET2627000049' } });
  console.log('Sync Records:', JSON.stringify(syncs, null, 2));
  process.exit(0);
}

checkSync().catch(console.error);
