import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';
import { Role } from '../entities/Role';
import { generateToken } from '../middleware/auth';
import logger from '../utils/logger';

export class AuthService {
  private userRepo = AppDataSource.getRepository(User);
  private roleRepo = AppDataSource.getRepository(Role);

  async login(mobile: string, password: string) {
    const user = await this.userRepo.findOne({
      where: { mobile, active: true },
      relations: ['roles'],
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw new Error('Invalid credentials');
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
      roleId: user.role_id,
      vendorId: user.vendor_id,
      tokenVersion: user.token_version,
    });

    logger.info(`User logged in: ${user.mobile} (${user.role})`);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        mobile: user.mobile,
        role: user.role,
        role_name: user.roles?.name || user.role || 'Executor',
        vendor_id: user.vendor_id,
        permissions: user.roles ? {
          can_view_cost: user.roles.can_view_cost,
          can_view_mrp: user.roles.can_view_mrp,
          can_manage_purchases: user.roles.can_manage_purchases,
          can_manage_sales: user.roles.can_manage_sales,
          can_view_reports: user.roles.can_view_reports,
          can_manage_inventory: user.roles.can_manage_inventory,
          can_manage_masters: user.roles.can_manage_masters,
          can_manage_users: user.roles.can_manage_users,
        } : null,
      },
    };
  }

  async getProfile(userId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: ['roles'],
    });
    if (!user) throw new Error('User not found');

    const { password_hash, ...profile } = user;

    // Build the same permissions shape as login so the frontend works on refresh
    const permissions = user.roles ? {
      can_view_cost: user.roles.can_view_cost,
      can_view_mrp: user.roles.can_view_mrp,
      can_manage_purchases: user.roles.can_manage_purchases,
      can_manage_sales: user.roles.can_manage_sales,
      can_view_reports: user.roles.can_view_reports,
      can_manage_inventory: user.roles.can_manage_inventory,
      can_manage_masters: user.roles.can_manage_masters,
      can_manage_users: user.roles.can_manage_users,
    } : null;

    return { ...profile, permissions, role_name: user.roles?.name || user.role || 'Executor' };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await this.userRepo.findOneBy({ id: userId });
    if (!user) throw new Error('User not found');

    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isMatch) throw new Error('Current password is incorrect');

    const salt = await bcrypt.genSalt(10);
    user.password_hash = await bcrypt.hash(newPassword, salt);
    user.token_version++;
    await this.userRepo.save(user);

    logger.info(`Password changed for user: ${user.mobile}`);
    return true;
  }

  /**
   * Ensures default roles and the initial Administrator user exist on application startup.
   */
  async ensureDefaultAdmin() {
    try {
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
          can_view_dashboard: true,
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
          can_view_dashboard: true,
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
          can_view_dashboard: true,
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
          can_view_dashboard: true,
        },
      ];

      let adminRole = await this.roleRepo.findOne({ where: { name: 'Admin' } });
      if (!adminRole) {
        for (const roleDef of defaultRoles) {
          const r = await this.roleRepo.save(this.roleRepo.create(roleDef));
          if (r.name === 'Admin') adminRole = r;
        }
        logger.info('Default roles initialized ✓');
      }

      const adminMobile = process.env.ADMIN_MOBILE || '9999999999';
      const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
      const adminEmail = process.env.ADMIN_EMAIL || 'admin@pratapsons.com';

      let adminUser = await this.userRepo.findOne({ where: { mobile: adminMobile } });
      if (!adminUser) {
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(adminPassword, salt);
        await this.userRepo.save(this.userRepo.create({
          name: 'Administrator',
          email: adminEmail,
          mobile: adminMobile,
          password_hash: hash,
          role: 'Admin',
          role_id: adminRole?.id,
          active: true,
        }));
        logger.info(`Default Admin user created ✓ (Mobile: ${adminMobile}, Password: ${adminPassword})`);
      } else if (!adminUser.active) {
        adminUser.active = true;
        await this.userRepo.save(adminUser);
      }
    } catch (err: any) {
      logger.error('Failed to ensure default admin user/roles', { error: err.message });
    }
  }
}

export const authService = new AuthService();
