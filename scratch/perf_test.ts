import { AppDataSource } from '../src/data-source';
import { BarcodeBatch } from '../src/entities/BarcodeBatch';

async function testPerformance() {
  await AppDataSource.initialize();
  console.log('DB Connected');

  const start = Date.now();
  
  const summaryQB = AppDataSource.getRepository(BarcodeBatch)
    .createQueryBuilder('bb')
    .select([
      'COALESCE(SUM(bb.available_quantity), 0) as "totalAvailable"',
      'COALESCE(SUM(bb.total_quantity - bb.available_quantity), 0) as "totalSold"',
      'COALESCE(SUM(bb.available_quantity * bb.cost_actual), 0) as "totalCostValue"'
    ])
    .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] });

  const summary = await summaryQB.getRawOne();
  console.log('Summary Query took:', Date.now() - start, 'ms');
  console.log('Summary Data:', summary);

  const start2 = Date.now();
  const qb = AppDataSource.getRepository(BarcodeBatch)
    .createQueryBuilder('bb')
    .leftJoinAndSelect('bb.product_group', 'pg')
    .leftJoinAndSelect('bb.size', 'sz')
    .leftJoinAndSelect('bb.color', 'cl')
    .leftJoinAndSelect('bb.vendor', 'v')
    .select([
        'bb.barcode_alias_8digit',
        'bb.design_no',
        'bb.available_quantity',
        'bb.total_quantity'
    ])
    .where('bb.status IN (:...statuses)', { statuses: ['active', 'Available', 'defective', 'Sold', 'Returned'] })
    .skip(0)
    .take(50);

  const items = await qb.getRawMany();
  console.log('Items Query (50) took:', Date.now() - start2, 'ms');
  
  process.exit(0);
}

testPerformance().catch(console.error);
