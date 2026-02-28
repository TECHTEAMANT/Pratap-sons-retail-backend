export interface UserRole {
  id: string;
  name: string;
  description: string;
  can_view_cost: boolean;
  can_view_mrp: boolean;
  can_manage_purchases: boolean;
  can_manage_sales: boolean;
  can_view_reports: boolean;
  can_manage_inventory: boolean;
  can_manage_masters: boolean;
  can_manage_users: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface User {
  id: string;
  email: string;
  name: string;
  mobile: string;
  password_hash: string;
  role: 'Admin' | 'Owner' | 'Team_Leader' | 'Executor';
  role_id: string;
  mapped_floor: string | null;
  mapped_salesman: string | null;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserDTO {
  email: string;
  name: string;
  mobile: string;
  password: string;
  role: string;
  role_id: string;
  mapped_floor?: string;
  mapped_salesman?: string;
}

export interface UpdateUserDTO {
  name?: string;
  email?: string;
  mobile?: string;
  role?: string;
  role_id?: string;
  mapped_floor?: string;
  mapped_salesman?: string;
  active?: boolean;
}

export interface LoginDTO {
  mobile: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  user: Omit<User, 'password_hash'>;
}
