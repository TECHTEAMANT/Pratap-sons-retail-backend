import { AppDataSource } from '../src/config/data-source';
import { Customer } from '../src/entities/Customer';

async function check() {
  await AppDataSource.initialize();
  const count = await AppDataSource.getRepository(Customer).count();
  console.log('Total Customers:', count);
  process.exit(0);
}

check();
