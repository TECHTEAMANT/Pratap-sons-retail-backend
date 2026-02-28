import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from './src/config/data-source';
import { BarcodeBatch } from './src/entities/BarcodeBatch';

async function verifyDesign() {
  const ds = await initializeDatabase();
  const repo = ds.getRepository(BarcodeBatch);
  
  const designNo = 'K-0356 1';
  const data = await repo.find({
    where: { design_no: designNo },
    relations: ['size', 'vendor', 'product_group', 'color']
  });
  
  const result = data.map(b => ({
    barcode: b.barcode_alias_8digit,
    size: b.size?.name,
    vendor: b.vendor?.name,
    pg: b.product_group?.name,
    color: b.color?.name,
    status: b.status,
    vendor_id: b.vendor_id,
    pg_id: b.product_group_id,
    color_id: b.color_id
  }));
  
  console.log(JSON.stringify(result, null, 2));
  await closeDatabase();
}

verifyDesign();
