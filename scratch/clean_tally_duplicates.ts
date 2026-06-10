import { AppDataSource } from '../src/data-source';
import { TallySync } from '../src/entities/TallySync';

async function clean() {
  await AppDataSource.initialize();
  console.log('Database connected');
  
  const records = await AppDataSource.getRepository(TallySync).find({
    where: { record_type: 'payment_receipt_advance' },
    order: { created_at: 'ASC' }
  });
  
  console.log(`Found ${records.length} total advance sync records`);
  
  const seen = new Set();
  const toDelete = [];
  
  for (const row of records) {
    if (seen.has(row.invoice_number)) {
      toDelete.push(row.id);
    } else {
      seen.add(row.invoice_number);
    }
  }
  
  console.log(`Found ${toDelete.length} duplicates to delete.`);
  
  if (toDelete.length > 0) {
    for (let i = 0; i < toDelete.length; i += 100) {
      const chunk = toDelete.slice(i, i + 100);
      await AppDataSource.getRepository(TallySync)
        .createQueryBuilder()
        .delete()
        .whereInIds(chunk)
        .execute();
      console.log(`Deleted chunk of ${chunk.length}`);
    }
  }
  
  console.log('Done');
  process.exit(0);
}

clean().catch(console.error);
