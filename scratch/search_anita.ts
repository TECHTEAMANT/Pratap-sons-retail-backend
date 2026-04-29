import { AppDataSource } from '../src/config/data-source';
import { Customer } from '../src/entities/Customer';

async function searchAnita() {
  try {
    await AppDataSource.initialize();
    const res = await AppDataSource.getRepository(Customer).find({
      where: [
        { name: 'anita jain' },
        { name: 'Anita Jain' },
        { name: 'ANITA JAIN' }
      ]
    });
    console.log("ANITA SEARCH:", res);
    await AppDataSource.destroy();
  } catch (error) {
    console.error(error);
  }
}

searchAnita();
