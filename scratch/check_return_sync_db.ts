import { AppDataSource } from '../src/config/data-source';
import { SalesReturn } from '../src/entities/SalesReturn';
import { TallySync } from '../src/entities/TallySync';

async function checkSync() {
  await AppDataSource.initialize();
  const returnNumber = 'SRET2627000049';
  
  const srRepo = AppDataSource.getRepository(SalesReturn);
  const syncRepo = AppDataSource.getRepository(TallySync);
  
  const sr = await srRepo.findOne({ where: { return_number: returnNumber } });
  console.log('Sales Return:', sr ? {
    id: sr.id,
    number: sr.return_number,
    coupon: sr.credit_coupon_no,
    amount: sr.total_return_amount
  } : 'NOT FOUND');
  
  const syncs = await syncRepo.find({ where: { invoice_number: returnNumber } });
  console.log('Sync Records:', syncs.map(s => ({
    id: s.id,
    type: s.record_type,
    status: s.sync_status,
    amount: s.total_amount
  })));
  
  process.exit(0);
}

checkSync().catch(console.error);
