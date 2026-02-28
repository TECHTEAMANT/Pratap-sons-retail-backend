import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from '../config/data-source';
import { Role } from '../entities/Role';
import { User } from '../entities/User';
import { BarcodeSequence } from '../entities/BarcodeSequence';
import bcrypt from 'bcryptjs';

async function reset() {
  try {
    console.log('🔄 Initializing TypeORM DataSource...');
    const ds = await initializeDatabase();
    console.log('✅ Database connected');

    console.log('⚠️ DELETING ALL DATA AND RESETTING SCHEMA...');
    // synchronize(true) drops all tables and recreates them
    await ds.synchronize(true);
    console.log('✅ Database schema reset');

    const roleRepo = ds.getRepository(Role);
    const userRepo = ds.getRepository(User);
    const seqRepo = ds.getRepository(BarcodeSequence);

    // ========== Seed Roles ==========
    console.log('🌱 Seeding initial roles...');
    const defaultRoles = [
      {
        name: 'Admin',
        description: 'Full access to all features',
        can_view_cost: true,
        can_view_mrp: true,
        can_manage_purchases: true,
        can_manage_sales: true,
        can_view_reports: true,
        can_manage_inventory: true,
        can_manage_masters: true,
        can_manage_users: true,
      },
      {
        name: 'Manager',
        description: 'Manage sales, inventory, and view reports',
        can_view_cost: true,
        can_view_mrp: true,
        can_manage_purchases: false,
        can_manage_sales: true,
        can_view_reports: true,
        can_manage_inventory: true,
        can_manage_masters: true,
        can_manage_users: false,
      },
      {
        name: 'Salesman',
        description: 'Create sales invoices and manage bookings',
        can_view_cost: false,
        can_view_mrp: true,
        can_manage_purchases: false,
        can_manage_sales: true,
        can_view_reports: false,
        can_manage_inventory: false,
        can_manage_masters: false,
        can_manage_users: false,
      },
      {
        name: 'Executor',
        description: 'View-only access',
        can_view_cost: false,
        can_view_mrp: true,
        can_manage_purchases: false,
        can_manage_sales: false,
        can_view_reports: false,
        can_manage_inventory: false,
        can_manage_masters: false,
        can_manage_users: false,
      },
    ];

    let adminRole: Role | null = null;
    for (const roleDef of defaultRoles) {
      const role = await roleRepo.save(roleRepo.create(roleDef));
      if (role.name === 'Admin') adminRole = role;
    }
    console.log('✅ Roles seeded');

    // ========== Seed Admin User ==========
    const adminMobile = process.env.ADMIN_MOBILE || '9999999999';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pratapsons.com';

    if (adminRole) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(adminPassword, salt);
      await userRepo.save(userRepo.create({
        email: adminEmail,
        name: 'Administrator',
        mobile: adminMobile,
        password_hash: hash,
        role: 'Admin',
        role_id: adminRole.id,
        active: true,
      }));
      console.log(`✅ Admin user created: ${adminMobile}`);
    }

    // ========== Seed Barcode Sequence ==========
    await seqRepo.save(seqRepo.create({ id: 1, last_number: 10000000 }));
    console.log('✅ Barcode sequence reset');

    console.log('\n🎉 DATABASE RESET COMPLETED SUCCESSFULLY!');
    
    await closeDatabase();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Reset failed:', error.message);
    console.error(error);
    await closeDatabase();
    process.exit(1);
  }
}

reset();
