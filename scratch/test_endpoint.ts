import 'reflect-metadata';
import { AppDataSource, initializeDatabase, closeDatabase } from '../src/config/data-source';
import { inventoryService } from '../src/services/inventory.service';
import { inventoryController } from '../src/controllers/inventory.controller';

async function check() {
  await initializeDatabase();
  try {
    const req = {
      query: { searchDesign: '2395' },
      user: { role: 'Admin', permissions: { can_view_cost: true, can_view_mrp: true } }
    };
    
    let sentData: any = null;
    const res = {
      json: (data: any) => { sentData = data; return res; },
      status: (code: number) => { return res; }
    };
    
    await inventoryController.getGrouped(req as any, res as any);
    console.log('Total items for 2395:', sentData?.pagination?.total);
    console.log('Items returned:', sentData?.data?.length);
  } catch (err) {
    console.error('Error in tests:', err);
  }
  await closeDatabase();
}
check().catch(console.error);
