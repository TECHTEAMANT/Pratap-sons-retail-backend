import { AppDataSource, initializeDatabase } from './src/config/data-source';
import { Vendor } from './src/entities/Vendor';

async function checkVendors() {
  try {
    await initializeDatabase();
    const vendorRepo = AppDataSource.getRepository(Vendor);
    
    const vendors = await vendorRepo.createQueryBuilder('v')
      .leftJoinAndSelect('v.city', 'c')
      .where("v.state IS NULL OR v.state = ''")
      .orWhere("v.city_id IS NULL")
      .select(['v.vendor_code', 'v.name', 'v.state', 'v.city_id', 'c.name'])
      .getMany();

    console.log('--- Vendors with empty state or city ---');
    vendors.forEach((v, i) => {
      console.log(`${i + 1}. [${v.vendor_code}] ${v.name} (State: ${v.state || 'N/A'}, City: ${v.city?.name || 'N/A'})`);
    });
    console.log(`\nTotal: ${vendors.length}`);

    await AppDataSource.destroy();
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkVendors();
