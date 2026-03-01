import 'reflect-metadata';
import { initializeDatabase, closeDatabase, AppDataSource } from './src/config/data-source';
import { Vendor } from './src/entities/Vendor';
import { City } from './src/entities/City';
import { ILike } from 'typeorm';

async function checkVendors() {
  try {
    await initializeDatabase();
    
    const cityRepo = AppDataSource.getRepository(City);
    const mumbai = await cityRepo.findOne({ where: { name: 'Mumbai' } });
    
    if (!mumbai) {
      console.log('Mumbai not found');
      return;
    }
    
    console.log(`Found Mumbai with city_code: ${mumbai.city_code}`);
    
    const vendorRepo = AppDataSource.getRepository(Vendor);
    const vendors = await vendorRepo.find({
      where: { vendor_code: ILike(`${mumbai.city_code}%`) },
      order: { vendor_code: 'ASC' }
    });
    
    console.log(`Found ${vendors.length} vendors starting with ${mumbai.city_code}`);
    console.log(JSON.stringify(vendors.map(v => ({ vendor_code: v.vendor_code, city_id: v.city_id })), null, 2));
    
    await closeDatabase();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkVendors();
