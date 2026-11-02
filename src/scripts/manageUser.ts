import 'reflect-metadata';
import { initializeDatabase, closeDatabase } from '../config/data-source';
import { User } from '../entities/User';
import { Role } from '../entities/Role';
import bcrypt from 'bcryptjs';

async function main() {
  const args = process.argv.slice(2);
  const command = args[0]?.toLowerCase();

  if (!command || !['create', 'reset', 'list'].includes(command)) {
    console.log(`
=============================================================
👤 INVENTO ERP — User Credential & Account Management CLI
=============================================================

Usage:
  1. Create or Update a User:
     node dist/scripts/manageUser.js create <mobile> <password> [role] [name] [email]
     Example:
     node dist/scripts/manageUser.js create 9999999999 admin123 Admin "Administrator" admin@pratapsons.com

  2. Reset a User Password:
     node dist/scripts/manageUser.js reset <mobile> <new_password>
     Example:
     node dist/scripts/manageUser.js reset 9999999999 admin123

  3. List All Users:
     node dist/scripts/manageUser.js list

=============================================================
`);
    process.exit(0);
  }

  const ds = await initializeDatabase();
  const userRepo = ds.getRepository(User);
  const roleRepo = ds.getRepository(Role);

  try {
    if (command === 'list') {
      const users = await userRepo.find({ relations: ['roles'], order: { created_at: 'ASC' } });
      console.log('\n📋 REGISTERED USERS IN DATABASE:');
      console.table(users.map(u => ({
        ID: u.id,
        Name: u.name,
        Mobile: u.mobile,
        Role: u.roles?.name || u.role,
        Active: u.active,
        Email: u.email || 'N/A'
      })));
    } else if (command === 'reset') {
      const mobile = args[1];
      const newPassword = args[2];

      if (!mobile || !newPassword) {
        console.error('❌ Error: Both <mobile> and <new_password> are required.');
        process.exit(1);
      }

      const user = await userRepo.findOne({ where: { mobile } });
      if (!user) {
        console.error(`❌ Error: User with mobile '${mobile}' not found.`);
        process.exit(1);
      }

      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(newPassword, salt);
      user.token_version = (user.token_version || 1) + 1;
      user.active = true;
      await userRepo.save(user);

      console.log(`\n✅ Password successfully reset for user '${user.name}' (${user.mobile})!`);
      console.log(`   New Password: ${newPassword}`);
    } else if (command === 'create') {
      const mobile = args[1];
      const password = args[2];
      const roleName = args[3] || 'Admin';
      const name = args[4] || (roleName === 'Admin' ? 'Administrator' : 'Staff User');
      const email = args[5] || `${mobile}@pratapsons.com`;

      if (!mobile || !password) {
        console.error('❌ Error: Both <mobile> and <password> are required.');
        process.exit(1);
      }

      // Find or create role
      let role = await roleRepo.findOne({ where: { name: roleName } });
      if (!role) {
        role = await roleRepo.save(roleRepo.create({
          name: roleName,
          description: `${roleName} Role`,
          can_view_cost: roleName === 'Admin',
          can_view_mrp: true,
          can_manage_purchases: roleName === 'Admin',
          can_manage_sales: true,
          can_view_reports: true,
          can_manage_inventory: true,
          can_manage_masters: roleName === 'Admin',
          can_manage_users: roleName === 'Admin',
          can_view_dashboard: true,
        }));
      }

      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      let user = await userRepo.findOne({ where: { mobile } });
      if (user) {
        user.name = name;
        user.email = email;
        user.password_hash = passwordHash;
        user.role = roleName;
        user.role_id = role.id;
        user.active = true;
        await userRepo.save(user);
        console.log(`\n✅ User '${mobile}' already existed. Updated credentials & activated:`);
      } else {
        user = await userRepo.save(userRepo.create({
          mobile,
          name,
          email,
          password_hash: passwordHash,
          role: roleName,
          role_id: role.id,
          active: true,
        }));
        console.log(`\n✅ New user successfully created:`);
      }

      console.log(`   Name:     ${user.name}`);
      console.log(`   Mobile:   ${user.mobile}`);
      console.log(`   Role:     ${user.role}`);
      console.log(`   Password: ${password}`);
    }
  } catch (err: any) {
    console.error('❌ Operation failed:', err.message);
  } finally {
    await closeDatabase();
    process.exit(0);
  }
}

main();
