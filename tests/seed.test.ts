import { AppDataSource } from '../src/config/data-source';
import { User } from '../src/entities/User';
import { Role } from '../src/entities/Role';
import bcrypt from 'bcryptjs';

async function seedUser() {
  console.log('Connecting to database...');
  await AppDataSource.initialize();
  
  const roleRepo = AppDataSource.getRepository(Role);
  const userRepo = AppDataSource.getRepository(User);

  // Find or create Admin Role
  let adminRole = await roleRepo.findOne({ where: { name: 'Admin' } });
  if (!adminRole) {
    adminRole = roleRepo.create({
      name: 'Admin',
      description: 'System Administrator with full access',
      can_view_cost: true,
      can_view_mrp: true,
      can_manage_purchases: true,
      can_manage_sales: true,
      can_view_reports: true,
      can_manage_inventory: true,
      can_manage_masters: true,
      can_manage_users: true
    });
    await roleRepo.save(adminRole);
    console.log('Created Admin role');
  }

  // Find or create test Admin user
  let adminUser = await userRepo.findOne({ where: { mobile: '9999999999' } });
  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash('admin123', salt);

  if (adminUser) {
    adminUser.password_hash = hashedPassword;
    adminUser.role = 'Admin';
    adminUser.role_id = adminRole.id;
    adminUser.active = true;
    await userRepo.save(adminUser);
    console.log('Updated existing test user with new bcrypt password');
  } else {
    adminUser = userRepo.create({
      email: 'admin@test.local',
      mobile: '9999999999',
      name: 'System Admin',
      password_hash: hashedPassword,
      role: 'Admin',
      role_id: adminRole.id,
      active: true
    });
    await userRepo.save(adminUser);
    console.log('Created new test user');
  }

  console.log('\n✅ Seed successful!');
  console.log('Mobile: 9999999999');
  console.log('Password: admin123\n');
  
  process.exit(0);
}

seedUser().catch(err => {
  console.error('Seed failed', err);
  process.exit(1);
});
