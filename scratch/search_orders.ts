import { AppDataSource } from '../src/config/data-source';
import { SalesOrder } from '../src/entities/SalesOrder';

async function searchOrders() {
  try {
    await AppDataSource.initialize();
    const res = await AppDataSource.getRepository(SalesOrder).find({
      where: { order_number: 'INV2627000334' }
    });
    console.log("ORDER MATCH:", res);
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

searchOrders();
