import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from './src/config/data-source';
import { BarcodeBatch } from './src/entities/BarcodeBatch';

async function debugDesign() {
  const ds = await initializeDatabase();
  const repo = ds.getRepository(BarcodeBatch);
  
  const designNo = 'K-0356 1';
  console.log(`Searching for design: ${designNo}`);
  
  const batches = await repo.find({
    where: { design_no: designNo },
    relations: ['product_group', 'size', 'color', 'vendor', 'floor']
  });
  
  console.log(`Found ${batches.length} batches:`);
  batches.forEach(b => {
    console.log(`- ID: ${b.id}, Barcode: ${b.barcode_alias_8digit}, Size: ${b.size?.name} (ID: ${b.size_id}), Status: ${b.status}, Vendor ID: ${b.vendor_id}, PG ID: ${b.product_group_id}, Color ID: ${b.color_id}`);
  });
  
  await closeDatabase();
}

debugDesign();
