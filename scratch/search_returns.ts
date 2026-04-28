import { AppDataSource } from '../src/config/data-source';
import { SalesReturn } from '../src/entities/SalesReturn';

async function searchReturns() {
  try {
    await AppDataSource.initialize();
    const res = await AppDataSource.getRepository(SalesReturn).find({
      where: { invoice_number: 'INV2627000334' }
    });
    console.log("RETURN MATCH:", res);
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

searchReturns();
