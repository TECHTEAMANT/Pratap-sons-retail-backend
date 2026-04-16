import bcrypt from 'bcryptjs';
import { AppDataSource } from '../config/data-source';
import { User } from '../entities/User';
import { Role } from '../entities/Role';

export class UserService {
  private userRepo = AppDataSource.getRepository(User);

  async findAll() {
    return this.userRepo.find({
      select: ['id', 'email', 'name', 'mobile', 'role', 'role_id', 'vendor_id', 'mapped_floor', 'mapped_salesman', 'active', 'created_at', 'updated_at'],
      relations: ['roles', 'vendor'],
      order: { created_at: 'DESC' },
    });
  }

  async findById(id: string) {
    return this.userRepo.findOne({
      where: { id },
      select: ['id', 'email', 'name', 'mobile', 'role', 'role_id', 'vendor_id', 'mapped_floor', 'mapped_salesman', 'active', 'created_at', 'updated_at'],
      relations: ['roles', 'vendor'],
    });
  }

  async create(data: Partial<User> & { password: string }) {
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(data.password, salt);

    const user = this.userRepo.create({
      email: data.email,
      name: data.name,
      mobile: data.mobile,
      password_hash,
      role: data.role || 'Executor',
      role_id: data.role_id,
      vendor_id: data.vendor_id,
      mapped_floor: data.mapped_floor,
      mapped_salesman: data.mapped_salesman,
      token_version: 1,
    });

    const saved = await this.userRepo.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async update(id: string, data: Partial<User>) {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) return null;

    // Merge provided fields
    if (data.name !== undefined) user.name = data.name;
    if (data.email !== undefined) user.email = data.email;
    if (data.role !== undefined) user.role = data.role;
    if (data.role_id !== undefined) {
      user.role_id = data.role_id;
      // Sync role string
      const roleRepo = AppDataSource.getRepository(Role);
      const roleObj = await roleRepo.findOneBy({ id: data.role_id });
      if (roleObj) {
        user.role = roleObj.name;
      }
    }
    if (data.vendor_id !== undefined) user.vendor_id = data.vendor_id;
    if (data.mapped_floor !== undefined) user.mapped_floor = data.mapped_floor;
    if (data.mapped_salesman !== undefined) user.mapped_salesman = data.mapped_salesman;
    if (data.active !== undefined) user.active = data.active;

    // Handle password update
    const anyData = data as any;
    if (anyData.password) {
      const salt = await bcrypt.genSalt(10);
      user.password_hash = await bcrypt.hash(anyData.password, salt);
      user.token_version++;
    }

    const saved = await this.userRepo.save(user);
    const { password_hash: _, ...result } = saved;
    return result;
  }

  async deactivate(id: string) {
    const user = await this.userRepo.findOneBy({ id });
    if (!user) return null;

    user.active = false;
    return this.userRepo.save(user);
  }
}

export const userService = new UserService();
