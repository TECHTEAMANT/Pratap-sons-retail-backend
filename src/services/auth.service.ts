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
}

export const authService = new AuthService();
