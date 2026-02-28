import 'reflect-metadata';
import { initializeDatabase, closeDatabase, AppDataSource } from '../config/data-source';
import { Role } from '../entities/Role';
import { User } from '../entities/User';
import { BarcodeSequence } from '../entities/BarcodeSequence';
import bcrypt from 'bcryptjs';

/**
 * Seed script for initial data
 * TypeORM handles table creation via synchronize:true
 * This script seeds the default roles, admin user, and barcode sequence
 */
async function seed() {
  try {
    console.log('🔄 Initializing TypeORM DataSource...');
    const ds = await initializeDatabase();
    console.log('✅ Database connected');

    // TypeORM will auto-create tables if synchronize: true
    // For production, run migrations instead
    if (!ds.options.synchronize) {
      console.log('🔄 Running synchronize manually for seeding...');
      await ds.synchronize();
    }
    console.log('✅ Schema synchronized');

    const roleRepo = ds.getRepository(Role);
    const userRepo = ds.getRepository(User);
    const seqRepo = ds.getRepository(BarcodeSequence);

    // ========== Seed Roles ==========
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
      let existing = await roleRepo.findOneBy({ name: roleDef.name });
      if (!existing) {
        existing = await roleRepo.save(roleRepo.create(roleDef));
        console.log(`  ✅ Created role: ${roleDef.name}`);
      } else {
        console.log(`  ⏭️  Role already exists: ${roleDef.name}`);
      }
      if (roleDef.name === 'Admin') adminRole = existing;
    }

    // ========== Seed Admin User ==========
    const adminMobile = process.env.ADMIN_MOBILE || '9999999999';
    const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@pratapsons.com';

    let adminUser = await userRepo.findOneBy({ mobile: adminMobile });
    if (!adminUser && adminRole) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(adminPassword, salt);
      adminUser = await userRepo.save(userRepo.create({
        email: adminEmail,
        name: 'Administrator',
        mobile: adminMobile,
        password_hash: hash,
        role: 'Admin',
        role_id: adminRole.id,
        active: true,
      }));
      console.log(`  ✅ Created admin user: ${adminMobile}`);
    } else {
      console.log(`  ⏭️  Admin user already exists: ${adminMobile}`);
    }

    // ========== Seed Barcode Sequence ==========
    let seq = await seqRepo.findOneBy({ id: 1 });
    if (!seq) {
      await seqRepo.save(seqRepo.create({ id: 1, last_number: 10000000 }));
      console.log('  ✅ Created barcode sequence');
    } else {
      console.log('  ⏭️  Barcode sequence already exists');
    }

    console.log('\n🎉 Seed completed successfully!');
    console.log(`\n📋 Admin Credentials:`);
    console.log(`   Mobile: ${adminMobile}`);
    console.log(`   Password: ${adminPassword}`);
    console.log(`   (Change this immediately after first login)\n`);

    await closeDatabase();
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Seed failed:', error.message);
    console.error(error);
    await closeDatabase();
    process.exit(1);
  }
}

seed();
