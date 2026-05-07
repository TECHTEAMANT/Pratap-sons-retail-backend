import { AppDataSource } from '../src/config/data-source';
import { SalesReturn } from '../src/entities/SalesReturn';

async function checkReturnItems() {
  await AppDataSource.initialize();
  const returnNumber = 'SRET2627000049';
  
  const srRepo = AppDataSource.getRepository(SalesReturn);
  const sr = await srRepo.findOne({ 
    where: { return_number: returnNumber },
    relations: ['items']
  });
  
  if (sr) {
    console.log('Return Items:', JSON.stringify(sr.items, null, 2));
  } else {
    console.log('Return NOT FOUND');
  }
  
  process.exit(0);
}

checkReturnItems().catch(console.error);
