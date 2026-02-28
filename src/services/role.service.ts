import { AppDataSource } from '../config/data-source';
import { Role } from '../entities/Role';

export class RoleService {
  private roleRepo = AppDataSource.getRepository(Role);

  async findAll() {
    return this.roleRepo.find({ order: { created_at: 'DESC' } });
  }

  async findById(id: string) {
    return this.roleRepo.findOneBy({ id });
  }

  async create(data: Partial<Role>) {
    const role = this.roleRepo.create(data);
    return this.roleRepo.save(role);
  }

  async update(id: string, data: Partial<Role>) {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) return null;

    Object.assign(role, data);
    return this.roleRepo.save(role);
  }

  async delete(id: string) {
    const role = await this.roleRepo.findOneBy({ id });
    if (!role) return null;

    // Check if any users are assigned to this role
    const userCount = await AppDataSource.getRepository('User').count({ where: { role_id: id } });
    if (userCount > 0) {
      throw new Error('Cannot delete role that is assigned to users');
    }

    await this.roleRepo.remove(role);
    return role;
  }
}

export const roleService = new RoleService();
