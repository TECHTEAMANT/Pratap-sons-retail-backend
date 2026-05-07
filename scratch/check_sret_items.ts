import { AppDataSource } from '../src/config/data-source';
import { SalesReturnItem } from '../src/entities/SalesReturnItem';
import { SalesReturn } from '../src/entities/SalesReturn';

async function checkItems() {
  await AppDataSource.initialize();
  const srRepo = AppDataSource.getRepository(SalesReturn);
  const sriRepo = AppDataSource.getRepository(SalesReturnItem);
  
  const sr = await srRepo.findOne({ where: { return_number: 'SRET2627000049' } });
  if (!sr) {
    console.log('Return not found');
    process.exit(0);
  }
  
  const items = await sriRepo.find({ where: { salesReturn: { id: sr.id } } });
  console.log('Items:', JSON.stringify(items, null, 2));
  process.exit(0);
}

checkItems().catch(console.error);
