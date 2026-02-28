import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from './src/config/data-source';
import { BarcodeBatch } from './src/entities/BarcodeBatch';

async function checkInventory() {
  const ds = await initializeDatabase();
  const repo = ds.getRepository(BarcodeBatch);
  const data = await repo.find({
    relations: ['product_group', 'size', 'color', 'vendor', 'floor'],
    take: 5
  });
  console.log(JSON.stringify(data, null, 2));
  await closeDatabase();
}

checkInventory();
